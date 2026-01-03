import path from 'node:path'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import exif from 'exif-parser'
import { HDate, HebrewCalendar } from '@hebcal/core'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'])

const isImage = (filePath) => IMAGE_EXT.has(path.extname(filePath).toLowerCase())
const isVideo = (filePath) => VIDEO_EXT.has(path.extname(filePath).toLowerCase())
const isMedia = (filePath) => isImage(filePath) || isVideo(filePath)

const getMediaDate = async (filePath) => {
  // For images, try EXIF first; for videos fall back to FS metadata.
  if (isImage(filePath)) {
    try {
      const buf = await fs.readFile(filePath)
      const parser = exif.create(buf)
      const result = parser.parse()
      const exifDate =
        result.tags.DateTimeOriginal ||
        result.tags.CreateDate ||
        result.tags.ModifyDate ||
        null
      if (exifDate) return new Date(exifDate * 1000)
    } catch {
      // ignore and fallback to filesystem timestamps
    }
  }
  const stat = await fs.stat(filePath)
  // Prefer mtime over birthtime because birthtime can be the copy/move date, not the original file date
  // mtime (modification date) usually reflects the actual file date better
  return stat.mtime || stat.birthtime
}

const HEB_MONTHS = {
  1: 'ניסן',
  2: 'אייר',
  3: 'סיון',
  4: 'תמוז',
  5: 'אב',
  6: 'אלול',
  7: 'תשרי',
  8: 'חשוון',
  9: 'כסלו',
  10: 'טבת',
  11: 'שבט',
  12: 'אדר',
  13: 'אדר ב׳',
}

// מפת חגים עיקריים - שמות בעברית
const HOLIDAY_NAMES = {
  'Pesach': 'פסח',
  'Shavuot': 'שבועות',
  'Rosh Hashana': 'ראש השנה',
  'Yom Kippur': 'יום כיפור',
  'Sukkot': 'סוכות',
  'Shmini Atzeret': 'שמיני עצרת',
  'Simchat Torah': 'שמחת תורה',
  'Chanukah': 'חנוכה',
  'Purim': 'פורים',
  'Lag BaOmer': 'ל״ג בעומר',
  'Tu B\'Av': 'ט״ו באב',
  'Tu Bishvat': 'ט״ו בשבט',
  'Tisha B\'Av': 'תשעה באב',
  'Yom HaAtzmaut': 'יום העצמאות',
  'Yom HaZikaron': 'יום הזיכרון',
  'Yom HaShoah': 'יום השואה',
}

/**
 * מקבל את שם החג עבור תאריך עברי נתון
 * @param {Date} date - תאריך לועזי
 * @returns {string|null} שם החג בעברית או null אם אין חג
 */
const getHolidayName = (date) => {
  try {
    const hd = new HDate(date)
    const year = hd.getFullYear()
    
    // מקבל את כל החגים לשנה העברית
    const holidays = HebrewCalendar.getHolidaysForYear(year)
    
    // מחפש חגים בתאריך הספציפי
    for (const event of holidays) {
      try {
        // Get the Hebrew date from the event - try different methods
        let eventDate = null
        if (typeof event.getDate === 'function') {
          eventDate = event.getDate()
        } else if (event.hdate) {
          eventDate = event.hdate
        } else if (event.date) {
          // If it's a Date object, convert to HDate
          eventDate = new HDate(event.date)
        } else {
          // Skip events without a valid date
          continue
        }

        // בדיקה אם התאריך תואם
        if (eventDate && eventDate.getAbs && eventDate.getAbs() === hd.getAbs()) {
          const eventId = event.getDesc ? event.getDesc() : null
          // בדיקה לפי ID במיפוי
          if (eventId && HOLIDAY_NAMES[eventId]) {
            return HOLIDAY_NAMES[eventId]
          }
          
          // בדיקה לפי שם האירוע בעברית
          const eventName = event.render ? event.render('he') : null
          if (eventName) {
            // בדיקה אם זה חג (לא שבת או ראש חודש)
            if (eventId && !eventId.includes('Shabbat') && !eventId.includes('Rosh Chodesh')) {
              // אם יש במיפוי, נחזיר את השם מהמיפוי
              if (HOLIDAY_NAMES[eventName]) {
                return HOLIDAY_NAMES[eventName]
              }
              // אחרת נחזיר את השם בעברית
              return eventName
            }
          }
        }
      } catch (eventErr) {
        // Skip this event if there's an error processing it
        continue
      }
    }
    
    return null
  } catch (err) {
    console.error('[fileService] Error getting holiday name', { date, error: err.message })
    return null
  }
}

const toHebrewDate = (date) => {
  const hd = new HDate(date)
  const full = hd.renderGematriya() // למשל: כ״ד ניסן תשפ״ה
  const parts = full.split(' ')
  const monthNum = hd.getMonth()
  const month = HEB_MONTHS[monthNum] || hd.getMonthName() // עברית
  const yearRaw = parts[parts.length - 1] || hd.getFullYear() // תשפ״ה (עם גרשיים)
  const yearPath = String(yearRaw).replace(/[״"]/g, "''") // נתיב בטוח: תשפ''ה
  const day = hd.getDate()
  const dayGematriya = parts[0] || String(day) // כ״ד - היום בגימטריה
  const dayGematriyaPath = dayGematriya.replace(/[״"]/g, "''") // נתיב בטוח: כ''ד
  const gregorianYear = date.getFullYear() // השנה הלועזית
  const gregorianMonth = date.getMonth() + 1 // החודש הלועזי (1-12)
  const gregorianMonthStr = String(gregorianMonth).padStart(2, '0') // 02, 03, וכו'
  const gregorianDay = date.getDate() // היום הלועזי (1-31)
  const gregorianDayStr = String(gregorianDay).padStart(2, '0') // 01, 02, וכו'
  const holidayName = getHolidayName(date)
  return {
    full,
    year: yearRaw,
    yearPath,
    gregorianYear,
    gregorianMonth,
    gregorianDay,
    month,
    day,
    dayGematriya: dayGematriyaPath,
    folderName: `${month}- ${yearPath} - (${gregorianMonthStr}-${gregorianYear})`,
    holidayName,
  }
}

const buildTargetPath = (destRoot, hebrew, format) => {
  const yearDirName = `${hebrew.yearPath} - (${hebrew.gregorianYear})`
  const yearDir = path.join(destRoot, yearDirName)
  
  // אם יש חג ופורמט הוא month-year, יוצרים תיקיית חג בין החודשים
  if (format === 'month-year' && hebrew.holidayName) {
    const holidayDir = path.join(yearDir, hebrew.holidayName)
    return holidayDir
  }
  
  const base = path.join(yearDir, hebrew.folderName)
  if (format === 'day-month-year') {
    const dayGematriya = hebrew.dayGematriya || String(hebrew.day)
    const gregorianDayStr = String(hebrew.gregorianDay || hebrew.day).padStart(2, '0')
    const gregorianMonthStr = String(hebrew.gregorianMonth).padStart(2, '0')
    const gregorianDateStr = `${gregorianDayStr}-${gregorianMonthStr}-${hebrew.gregorianYear}`
    const dayName = typeof hebrew.day === 'number' ? `יום ${dayGematriya} (${gregorianDateStr})` : hebrew.day
    return path.join(base, dayName)
  }
  return base
}

const ensureUniquePath = async (targetPath) => {
  if (!fssync.existsSync(targetPath)) return targetPath
  const { name, ext, dir } = path.parse(targetPath)
  let counter = 1
  let candidate = path.join(dir, `${name} (${counter})${ext}`)
  while (fssync.existsSync(candidate)) {
    counter += 1
    candidate = path.join(dir, `${name} (${counter})${ext}`)
  }
  return candidate
}

const cleanPath = (p) => {
  if (!p) return ''
  const trimmed = p.trim().replace(/^"(.*)"$/, '$1')
  // If it's already an absolute path (starts with drive letter on Windows or / on Unix), use it as is
  // Otherwise, resolve it relative to current working directory
  if (path.isAbsolute(trimmed)) {
    return trimmed
  }
  return path.resolve(trimmed)
}

const scanFolder = async (sourcePath) => {
  if (!sourcePath || !sourcePath.trim()) {
    throw new Error('sourcePath is required and cannot be empty')
  }
  
  const root = cleanPath(sourcePath)
  
  // Check if path exists before trying to access it
  if (!fssync.existsSync(root)) {
    throw new Error(`הנתיב לא נמצא: ${root}\nאנא ודא שהנתיב תקין וקיים.`)
  }
  
  // Check if it's a directory
  const stat = await fs.stat(root)
  if (!stat.isDirectory()) {
    throw new Error(`הנתיב אינו תיקייה: ${root}`)
  }
  
  await fs.access(root, fssync.constants.R_OK)

  const results = []
  const stack = [root]

  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      // אם אין הרשאה/שגיאה, דלג על התיקייה הזו
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile() && isMedia(fullPath)) {
        results.push(fullPath)
      }
    }
  }

  return { files: results, count: results.length }
}

const deleteFile = async (targetPath) => {
  await fs.rm(targetPath, { force: true })
}

const createFolder = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true })
}

const readExif = async (targetPath) => {
  const date = await getMediaDate(targetPath)
  const hebrew = toHebrewDate(date)
  return { date: date?.toISOString(), hebrew }
}

const sortFile = async ({ src, destRoot, format = 'month-year', mode = 'move' }) => {
  if (!isMedia(src)) throw new Error('Not an image or video')
  const date = await getMediaDate(src)
  const hebrew = toHebrewDate(date)
  const targetDir = buildTargetPath(destRoot, hebrew, format)
  await fs.mkdir(targetDir, { recursive: true })
  const targetPath = await ensureUniquePath(path.join(targetDir, path.basename(src)))

  if (mode === 'copy') {
    await fs.copyFile(src, targetPath)
  } else {
    await fs.rename(src, targetPath)
  }

  return {
    success: true,
    hebrew,
    newPath: targetPath,
    date: date.toISOString(),
  }
}

/**
 * Calculate optimal concurrency based on system stats
 * Takes into account CPU cores, memory, and current usage to maximize performance up to 90%
 * @param {Object} stats - System statistics
 * @param {number} currentConcurrency - Current concurrency level
 * @param {number} minConcurrency - Minimum concurrency (default: 1)
 * @param {number} maxConcurrency - Maximum concurrency (default: 100)
 * @returns {number} Optimal concurrency level
 */
const calculateOptimalConcurrency = (stats, currentConcurrency = 5, minConcurrency = 1, maxConcurrency = 100) => {
  if (!stats) return currentConcurrency

  const cpuUsage = stats.cpu?.usage || 0
  const memoryUsage = stats.memory?.percent || 0
  const diskUsage = stats.disk?.percent || stats.disk?.usage || 0
  const cpuCores = stats.cpu?.cores || 4
  const totalMemoryGB = parseFloat(stats.memory?.totalGB || 8)

  // Calculate base concurrency based on system resources
  // Use CPU cores as base (more cores = more parallel operations possible)
  // Also consider available memory (each operation might use some memory)
  const baseConcurrency = Math.max(5, Math.min(50, cpuCores * 5))
  const memoryBasedConcurrency = Math.max(5, Math.min(50, Math.floor(totalMemoryGB / 0.5))) // ~0.5GB per operation
  const systemMaxConcurrency = Math.min(maxConcurrency, Math.max(baseConcurrency, memoryBasedConcurrency))

  // If any resource is above 90%, reduce concurrency significantly
  if (cpuUsage > 90 || memoryUsage > 90 || diskUsage > 90) {
    return Math.max(minConcurrency, Math.floor(currentConcurrency * 0.6))
  }

  // If any resource is above 80%, reduce concurrency moderately
  if (cpuUsage > 80 || memoryUsage > 80 || diskUsage > 80) {
    return Math.max(minConcurrency, Math.floor(currentConcurrency * 0.8))
  }

  // If all resources are below 70%, we can increase concurrency
  // But don't exceed system capabilities
  if (cpuUsage < 70 && memoryUsage < 70 && diskUsage < 70) {
    const increased = Math.floor(currentConcurrency * 1.2)
    return Math.min(systemMaxConcurrency, increased)
  }

  // If resources are between 70-80%, keep current concurrency
  return Math.min(systemMaxConcurrency, currentConcurrency)
}

/**
 * Sort multiple files in parallel for better performance with dynamic concurrency
 * @param {Object} params - Sorting parameters
 * @param {string[]} params.files - Array of file paths to sort
 * @param {string} params.destRoot - Destination root directory
 * @param {string} params.format - Date format ('month-year' or 'day-month-year')
 * @param {string} params.mode - Operation mode ('copy' or 'move')
 * @param {number} params.concurrency - Initial number of files to process in parallel (default: 5)
 * @param {Function} params.getSystemStats - Function to get system stats for dynamic adjustment
 * @param {Function} params.onProgress - Callback for progress updates (current, total, active)
 * @returns {Promise<Object>} Results with success/error for each file
 */
const sortFilesBatch = async ({ 
  files, 
  destRoot, 
  format = 'month-year', 
  mode = 'move', 
  concurrency = 5,
  getSystemStats = null,
  onProgress = null
}) => {
  if (!Array.isArray(files) || !files.length) {
    return { results: [], total: 0, success: 0, errors: 0 }
  }

  const results = []
  const errors = []
  let processed = 0
  let currentConcurrency = concurrency
  const activeOperations = new Map() // Track active file operations
  let lastReportedConcurrency = concurrency // Track last reported concurrency

  // Process files in batches with dynamic concurrency adjustment
  let fileIndex = 0

  while (fileIndex < files.length) {
    // Check system stats and adjust concurrency before each batch (but not too frequently)
    if (getSystemStats && (processed === 0 || processed % 3 === 0)) {
      try {
        const stats = await getSystemStats()
        const newConcurrency = calculateOptimalConcurrency(stats, currentConcurrency, 1, 100)
        if (newConcurrency !== currentConcurrency) {
          currentConcurrency = Math.max(1, Math.min(100, newConcurrency))
          lastReportedConcurrency = currentConcurrency
        }
      } catch (statsErr) {
        // Ignore stats errors, continue with current concurrency
        console.error('[sortFilesBatch] Error getting system stats:', statsErr.message)
      }
    }

    // Get next batch based on current concurrency
    const batch = []
    while (batch.length < currentConcurrency && fileIndex < files.length) {
      batch.push(files[fileIndex++])
    }

    // Track active operations - add files to tracking as they start
    const batchFileIds = batch.map((src) => {
      const fileId = `${src}-${Date.now()}-${Math.random()}`
      activeOperations.set(fileId, { src, startTime: Date.now() })
      return { src, fileId }
    })

    // Report progress before processing batch (include current concurrency)
    if (onProgress) {
      onProgress({
        current: processed,
        total: files.length,
        active: activeOperations.size,
        concurrency: currentConcurrency
      })
    }

    // Process batch in parallel
    const batchPromises = batchFileIds.map(async ({ src, fileId }) => {
      try {
        const result = await sortFile({ src, destRoot, format, mode })
        processed++
        return { src, success: true, ...result }
      } catch (err) {
        processed++
        errors.push({ src, error: err.message })
        return { src, success: false, error: err.message }
      } finally {
        // Remove from active operations when done
        activeOperations.delete(fileId)
        
        // Report progress after each file completes (include current concurrency)
        if (onProgress) {
          onProgress({
            current: processed,
            total: files.length,
            active: activeOperations.size,
            concurrency: currentConcurrency
          })
        }
      }
    })

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)
  }

  return {
    results,
    total: files.length,
    success: results.filter((r) => r.success).length,
    errors: errors.length,
    finalConcurrency: lastReportedConcurrency, // Return final concurrency used
  }
}

export {
  cleanPath,
  scanFolder,
  deleteFile,
  createFolder,
  readExif,
  sortFile,
  sortFilesBatch,
  isImage,
  isVideo,
  isMedia,
}

