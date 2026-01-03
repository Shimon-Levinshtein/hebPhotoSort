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
  return path.resolve(trimmed)
}

const scanFolder = async (sourcePath) => {
  const root = cleanPath(sourcePath)
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
 * Sort multiple files in parallel for better performance
 * @param {Object} params - Sorting parameters
 * @param {string[]} params.files - Array of file paths to sort
 * @param {string} params.destRoot - Destination root directory
 * @param {string} params.format - Date format ('month-year' or 'day-month-year')
 * @param {string} params.mode - Operation mode ('copy' or 'move')
 * @param {number} params.concurrency - Number of files to process in parallel (default: 5)
 * @returns {Promise<Object>} Results with success/error for each file
 */
const sortFilesBatch = async ({ files, destRoot, format = 'month-year', mode = 'move', concurrency = 5 }) => {
  if (!Array.isArray(files) || !files.length) {
    return { results: [], total: 0, success: 0, errors: 0 }
  }

  const results = []
  const errors = []
  let processed = 0

  // Process files in batches to avoid overwhelming the system
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    const batchPromises = batch.map(async (src) => {
      try {
        const result = await sortFile({ src, destRoot, format, mode })
        processed++
        return { src, success: true, ...result }
      } catch (err) {
        processed++
        errors.push({ src, error: err.message })
        return { src, success: false, error: err.message }
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

