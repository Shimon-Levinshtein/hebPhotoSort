import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

const MAX_DATA_POINTS = 60 // 60 seconds of data (1 point per second)
const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || 'http://localhost:4000'

const PerformanceMonitor = ({ enabled = true }) => {
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState({
    cpu: [],
    memory: [],
    disk: [],
  })
  const socketRef = useRef(null)

  useEffect(() => {
    if (!enabled) return

    // Connect to Socket.IO
    const socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[PerformanceMonitor] Socket.IO connected')
      // Subscribe to system stats updates
      socket.emit('system-stats:subscribe')
    })

    socket.on('system-stats:update', (data) => {
      setStats(data)

      // Update history
      setHistory((prev) => {
        const newCpu = [...prev.cpu, data.cpu.usage].slice(-MAX_DATA_POINTS)
        const newMemory = [...prev.memory, data.memory.percent].slice(-MAX_DATA_POINTS)
        const newDisk = [...prev.disk, data.disk?.percent || 0].slice(-MAX_DATA_POINTS)
        return { cpu: newCpu, memory: newMemory, disk: newDisk }
      })
    })

    socket.on('disconnect', () => {
      console.log('[PerformanceMonitor] Socket.IO disconnected')
    })

    socket.on('connect_error', (err) => {
      console.error('[PerformanceMonitor] Socket.IO connection error:', err)
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('system-stats:unsubscribe')
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [enabled])

  if (!enabled || !stats) return null

  const cpuHistory = history.cpu.length > 0 ? history.cpu : [stats.cpu.usage]
  const memoryHistory = history.memory.length > 0 ? history.memory : [stats.memory.percent]
  const diskHistory = history.disk.length > 0 ? history.disk : [stats.disk?.percent || 0]

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-4 text-lg font-semibold text-slate-50">ביצועי מערכת</h3>

      <div className="grid gap-4 md:grid-cols-3">
        {/* CPU */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">CPU</span>
            <span className="text-sm font-semibold text-slate-100">
              {stats.cpu.usage.toFixed(1)}%
            </span>
          </div>
          <div className="mb-1 text-xs text-slate-400">
            {stats.cpu.cores} ליבות @ {stats.cpu.speedGHz} GHz
          </div>
          <div className="h-24 w-full">
            <MiniChart data={cpuHistory} color="rgb(59, 130, 246)" max={100} />
          </div>
        </div>

        {/* Memory */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">זיכרון</span>
            <span className="text-sm font-semibold text-slate-100">
              {stats.memory.percent.toFixed(1)}%
            </span>
          </div>
          <div className="mb-1 text-xs text-slate-400">
            {stats.memory.usedGB} GB / {stats.memory.totalGB} GB
          </div>
          <div className="h-24 w-full">
            <MiniChart data={memoryHistory} color="rgb(34, 197, 94)" max={100} />
          </div>
        </div>

        {/* Disk */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">דיסק</span>
            <span className="text-sm font-semibold text-slate-100">
              {stats.disk?.percent?.toFixed(1) || stats.disk?.usage?.toFixed(1) || '0.0'}%
            </span>
          </div>
          <div className="mb-1 text-xs text-slate-400">
            {stats.disk?.label || 'Disk 0 (C:)'} • {stats.disk?.type || 'Unknown'}
          </div>
          <div className="mb-1 text-xs text-slate-400">
            {stats.disk?.usedGB || '0'} GB / {stats.disk?.totalGB || '0'} GB
          </div>
          <div className="h-24 w-full">
            <MiniChart 
              data={diskHistory} 
              color="rgb(168, 85, 247)" 
              max={100} 
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Mini chart component for displaying time-series data
const MiniChart = ({ data, color, max = 100 }) => {
  if (!data || data.length === 0) return null

  const width = 200
  const height = 80
  const padding = 4

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1 || 1)) * (width - padding * 2) + padding
    const y = height - (value / max) * (height - padding * 2) - padding
    return { x, y, value }
  })

  const pathData = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  // Create area fill
  const areaPath = `${pathData} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Background grid */}
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((percent) => {
        const y = height - (percent / 100) * (height - padding * 2) - padding
        return (
          <line
            key={percent}
            x1={padding}
            y1={y}
            x2={width - padding}
            y2={y}
            stroke="rgba(148, 163, 184, 0.1)"
            strokeWidth="1"
          />
        )
      })}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#gradient-${color})`} />

      {/* Line */}
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Current value indicator */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="3"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      )}
    </svg>
  )
}

export default PerformanceMonitor

