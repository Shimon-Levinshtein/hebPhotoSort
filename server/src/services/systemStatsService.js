import os from 'node:os'
import fs from 'node:fs/promises'
import { statfs } from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

// Cache for CPU usage calculation (system-wide, not just process)
let previousCpuTimes = null
let previousHrTime = Date.now()

// Cache for disk stats
let previousDiskStats = null
let previousDiskTime = Date.now()
let previousDiskActiveTime = null
let previousDiskActiveTimeTimestamp = null

/**
 * Get current system performance statistics
 * @returns {Promise<Object>} System stats including CPU, Memory, Disk, Network
 */
const getSystemStats = async () => {
  try {
    // CPU Info - Calculate system-wide CPU usage
    const cpus = os.cpus()
    const currentHrTime = Date.now()
    
    // Calculate system-wide CPU usage by comparing CPU times across all cores
    const currentCpuTimes = cpus.map((cpu) => ({
      user: cpu.times.user,
      nice: cpu.times.nice,
      sys: cpu.times.sys,
      idle: cpu.times.idle,
      irq: cpu.times.irq,
    }))
    
    let cpuPercent = 0
    
    if (previousCpuTimes && previousCpuTimes.length === currentCpuTimes.length) {
      const elapsedTime = (currentHrTime - previousHrTime) / 1000 // Convert to seconds
      
      if (elapsedTime > 0) {
        // Calculate total CPU usage across all cores
        let totalIdle = 0
        let totalTick = 0
        
        for (let i = 0; i < cpus.length; i++) {
          const prev = previousCpuTimes[i]
          const curr = currentCpuTimes[i]
          
          const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq
          const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq
          
          const total = currTotal - prevTotal
          const idle = curr.idle - prev.idle
          
          totalIdle += idle
          totalTick += total
        }
        
        // CPU percentage = (1 - idle/total) * 100
        cpuPercent = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 0
        cpuPercent = Math.min(100, Math.max(0, cpuPercent))
      }
    }
    
    // Update for next calculation
    previousCpuTimes = currentCpuTimes
    previousHrTime = currentHrTime
    
    // Memory Info
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const memPercent = (usedMem / totalMem) * 100
    
    // CPU Model and Speed
    const cpuModel = cpus[0]?.model || 'Unknown'
    const cpuSpeed = cpus[0]?.speed || 0
    
    // Disk Info - get disk usage for the root drive (C: on Windows, / on Unix)
    let diskInfo = {
      usage: 0,
      total: 0,
      free: 0,
      used: 0,
      totalGB: '0',
      freeGB: '0',
      usedGB: '0',
      percent: 0,
      label: 'C:',
      type: 'Unknown',
    }

    try {
      const platform = os.platform()
      const rootPath = platform === 'win32' ? 'C:\\' : '/'
      
      // Try to use statfs if available (Unix-like systems)
      if (platform !== 'win32' && statfs) {
        const stats = await new Promise((resolve, reject) => {
          statfs(rootPath, (err, stats) => {
            if (err) reject(err)
            else resolve(stats)
          })
        })
        
        const total = stats.blocks * stats.bsize
        const free = stats.bavail * stats.bsize
        const used = total - free
        const percent = (used / total) * 100
        
        diskInfo = {
          usage: Math.min(100, Math.max(0, percent)),
          total,
          free,
          used,
          totalGB: (total / (1024 ** 3)).toFixed(2),
          freeGB: (free / (1024 ** 3)).toFixed(2),
          usedGB: (used / (1024 ** 3)).toFixed(2),
          percent: Math.min(100, Math.max(0, percent)),
          label: rootPath,
          type: 'SSD',
        }
      } else if (platform === 'win32') {
        // For Windows, use wmic (more reliable than PowerShell)
        try {
          // Get disk space info
          const { stdout: spaceStdout } = await execAsync(
            `wmic logicaldisk where "DeviceID='C:'" get Size,FreeSpace,MediaType /format:list`,
            { timeout: 5000, maxBuffer: 1024 * 1024 }
          )
          
          // Parse wmic output (format: Key=Value)
          // Handle Windows line endings (\r\r\n) - wmic uses \r\r\n, not \n
          // First normalize line endings, then split
          const normalized = spaceStdout.replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          const lines = normalized.split('\n').filter(line => line.trim())
          const sizeInfo = {}
          
          for (const line of lines) {
            // Match Key=Value pattern, handling potential whitespace
            const match = line.match(/^(\w+)\s*=\s*(.+)$/)
            if (match) {
              const key = match[1].trim()
              const value = match[2].trim()
              if (key === 'Size' || key === 'FreeSpace' || key === 'MediaType') {
                const parsed = parseInt(value)
                if (!isNaN(parsed)) {
                  sizeInfo[key] = parsed
                }
              }
            }
          }
          
          const free = sizeInfo.FreeSpace || 0
          const total = sizeInfo.Size || 0
          
          if (total <= 0 || isNaN(total) || isNaN(free)) {
            console.error('[systemStatsService] Invalid disk values from wmic:', { 
              total, 
              free, 
              sizeInfo, 
              stdout: spaceStdout.substring(0, 200),
              linesCount: lines.length,
              lines: lines.slice(0, 10)
            })
            throw new Error('Invalid disk size from wmic')
          }
          
          const used = total - free
          const spacePercent = (used / total) * 100
          
          // Get disk active time (I/O activity percentage)
          let activeTimePercent = 0
          try {
            const { stdout: perfStdout } = await execAsync(
              `wmic path Win32_PerfRawData_PerfDisk_PhysicalDisk where "Name='0 C:'" get PercentDiskTime /format:list`,
              { timeout: 5000, maxBuffer: 1024 * 1024 }
            )
            
            const perfNormalized = perfStdout.replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            const perfLines = perfNormalized.split('\n').filter(line => line.trim())
            
            let currentPercentDiskTime = null
            for (const line of perfLines) {
              const match = line.match(/^PercentDiskTime\s*=\s*(.+)$/)
              if (match) {
                currentPercentDiskTime = parseInt(match[1].trim())
                if (!isNaN(currentPercentDiskTime)) {
                  break
                }
              }
            }
            
            if (currentPercentDiskTime !== null && previousDiskActiveTime !== null && previousDiskActiveTimeTimestamp !== null) {
              // Calculate active time percentage
              // PercentDiskTime is cumulative, so we need to calculate the difference
              const elapsedTime = (Date.now() - previousDiskActiveTimeTimestamp) / 1000 // seconds
              const timeDiff = currentPercentDiskTime - previousDiskActiveTime
              
              // Active time = (time difference / elapsed time) * 100
              // But PercentDiskTime is in 100-nanosecond intervals, so divide by 10,000,000 to get seconds
              if (elapsedTime > 0) {
                activeTimePercent = ((timeDiff / 10000000) / elapsedTime) * 100
                activeTimePercent = Math.min(100, Math.max(0, activeTimePercent))
              }
            }
            
            previousDiskActiveTime = currentPercentDiskTime
            previousDiskActiveTimeTimestamp = Date.now()
          } catch (perfErr) {
            // If we can't get active time, use space usage as fallback
            console.error('[systemStatsService] Error getting disk active time:', perfErr.message)
            activeTimePercent = spacePercent
          }
          
          // Determine disk type based on MediaType
          // MediaType values: 0=Unknown, 3=HDD, 4=SSD, 5=SCM, 11=NVMe, 12=NVMe, 15=SSD, 17=NVMe
          const mediaType = sizeInfo.MediaType || 0
          let diskType = 'HDD'
          if (mediaType === 4 || mediaType === 15) {
            diskType = 'SSD'
          } else if (mediaType === 11 || mediaType === 12 || mediaType === 17) {
            diskType = 'SSD (NVMe)'
          } else if (mediaType === 0) {
            // If MediaType is 0, assume SSD/NVMe for modern systems
            diskType = 'SSD (NVMe)'
          }
          
          diskInfo = {
            usage: Math.min(100, Math.max(0, activeTimePercent)), // Active time (like Task Manager)
            total,
            free,
            used,
            totalGB: (total / (1024 ** 3)).toFixed(2),
            freeGB: (free / (1024 ** 3)).toFixed(2),
            usedGB: (used / (1024 ** 3)).toFixed(2),
            percent: Math.min(100, Math.max(0, activeTimePercent)), // Active time percentage
            spacePercent: Math.min(100, Math.max(0, spacePercent)), // Space usage percentage
            label: 'Disk 0 (C:)',
            type: diskType,
          }
        } catch (winErr) {
          console.error('[systemStatsService] Error getting Windows disk stats:', {
            message: winErr.message,
            stdout: winErr.stdout,
            stderr: winErr.stderr,
          })
          // Keep default diskInfo (will show 0%)
        }
      } else {
        // For other platforms, try to use fs.stat as fallback
        diskInfo = {
          usage: 0,
          total: 0,
          free: 0,
          used: 0,
          totalGB: '0',
          freeGB: '0',
          usedGB: '0',
          percent: 0,
          label: rootPath,
          type: 'Unknown',
        }
      }
    } catch (diskErr) {
      console.error('[systemStatsService] Error getting disk stats', diskErr)
      // Keep default diskInfo
    }
    
    return {
      cpu: {
        usage: Math.min(100, Math.max(0, cpuPercent)), // Clamp between 0-100
        cores: cpus.length,
        model: cpuModel,
        speed: cpuSpeed, // MHz
        speedGHz: (cpuSpeed / 1000).toFixed(2),
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: Math.min(100, Math.max(0, memPercent)),
        totalGB: (totalMem / (1024 ** 3)).toFixed(2),
        usedGB: (usedMem / (1024 ** 3)).toFixed(2),
        freeGB: (freeMem / (1024 ** 3)).toFixed(2),
      },
      disk: diskInfo,
      timestamp: Date.now(),
    }
  } catch (err) {
    console.error('[systemStatsService] Error getting system stats', err)
    return {
      cpu: { usage: 0, cores: 0, model: 'Unknown', speed: 0, speedGHz: '0.00' },
      memory: { total: 0, used: 0, free: 0, percent: 0, totalGB: '0', usedGB: '0', freeGB: '0' },
      disk: { usage: 0, total: 0, free: 0, used: 0, totalGB: '0', freeGB: '0', usedGB: '0', percent: 0, label: 'C:', type: 'Unknown' },
      timestamp: Date.now(),
      error: err.message,
    }
  }
}

export { getSystemStats }

