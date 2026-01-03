import { ipcMain, dialog } from 'electron'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import exif from 'exif-parser'
import { HDate, HebrewCalendar } from '@hebcal/core'

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
      const eventDate = event.getDate()
      // בדיקה אם התאריך תואם
      if (eventDate.getAbs() === hd.getAbs()) {
        const eventId = event.getDesc()
        // בדיקה לפי ID במיפוי
        if (HOLIDAY_NAMES[eventId]) {
          return HOLIDAY_NAMES[eventId]
        }
        
        // בדיקה לפי שם האירוע בעברית
        const eventName = event.render('he')
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
    }
    
    return null
  } catch (err) {
    console.error('[ipc-handlers] Error getting holiday name', { date, error: err.message })
    return null
  }
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])

const isImage = (filePath) => IMAGE_EXT.has(path.extname(filePath).toLowerCase())

const getImageDate = async (filePath) => {
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
  } catch (err) {
    console.error('[ipc] getImageDate failed, fallback to file stats', { filePath, error: err?.message })
    // ignore and fallback to file stats
  }
  const stat = await fs.stat(filePath)
  return stat.birthtime || stat.mtime
}

const toHebrewDate = (date) => {
  const hd = new HDate(date)
  const hebrew = hd.renderGematriya() // e.g., כ״ד כסלו תשפ״ה
  const parts = hebrew.split(' ')
  const month = hd.getMonthName()
  const year = hd.getFullYear()
  const yearRaw = parts[parts.length - 1] || year // תשפ״ה (עם גרשיים)
  const yearPath = String(yearRaw).replace(/[״"]/g, "''") // נתיב בטוח: תשפ''ה
  const day = hd.getDate()
  const dayGematriya = parts[0] || String(day) // כ״ד - היום בגימטריה
  const sanitize = (str) => str.replace(/["״']/g, '')
  const dayGematriyaPath = dayGematriya.replace(/[״"]/g, "''") // נתיב בטוח: כ''ד
  const gregorianYear = date.getFullYear() // השנה הלועזית
  const gregorianMonth = date.getMonth() + 1 // החודש הלועזי (1-12)
  const gregorianMonthStr = String(gregorianMonth).padStart(2, '0') // 02, 03, וכו'
  const gregorianDay = date.getDate() // היום הלועזי (1-31)
  const gregorianDayStr = String(gregorianDay).padStart(2, '0') // 01, 02, וכו'
  const holidayName = getHolidayName(date)
  return {
    full: hebrew,
    year,
    yearPath,
    gregorianYear,
    gregorianMonth,
    gregorianDay,
    month,
    day,
    dayGematriya: dayGematriyaPath,
    folderName: `${sanitize(month)}- ${yearPath} - (${gregorianMonthStr}-${gregorianYear})`,
    holidayName,
  }
}

const buildTargetPath = (destRoot, gregorianYear, hebrew, format) => {
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

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths?.length) return null
  return result.filePaths[0]
})

ipcMain.handle('folder:scan', async (_event, folderPath) => {
  try {
    if (!folderPath) return { files: [], count: 0 }
    const entries = await fs.readdir(folderPath, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => path.join(folderPath, e.name))
      .filter((f) => isImage(f))
    return { files, count: files.length }
  } catch (err) {
    console.error('[ipc] folder:scan failed', { folderPath, error: err?.message })
    return { files: [], count: 0, error: err.message }
  }
})

ipcMain.handle('file:move', async (_event, src, dest) => {
  try {
    if (!src || !dest) return { success: false, error: 'Invalid path' }
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.rename(src, dest)
    return { success: true, dest }
  } catch (err) {
    console.error('[ipc] file:move failed', { src, dest, error: err?.message })
    return { success: false, error: err.message }
  }
})

ipcMain.handle('file:copy', async (_event, src, dest) => {
  try {
    if (!src || !dest) return { success: false, error: 'Invalid path' }
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.copyFile(src, dest)
    return { success: true, dest }
  } catch (err) {
    console.error('[ipc] file:copy failed', { src, dest, error: err?.message })
    return { success: false, error: err.message }
  }
})

ipcMain.handle('file:delete', async (_event, target) => {
  try {
    if (!target) return { success: false, error: 'Invalid path' }
    await fs.rm(target, { force: true })
    return { success: true }
  } catch (err) {
    console.error('[ipc] file:delete failed', { target, error: err?.message })
    return { success: false, error: err.message }
  }
})

ipcMain.handle('folder:create', async (_event, target) => {
  try {
    if (!target) return { success: false, error: 'Invalid path' }
    await fs.mkdir(target, { recursive: true })
    return { success: true }
  } catch (err) {
    console.error('[ipc] folder:create failed', { target, error: err?.message })
    return { success: false, error: err.message }
  }
})

ipcMain.handle('exif:read', async (_event, target) => {
  try {
    if (!target || !fssync.existsSync(target)) {
      return { error: 'Invalid path' }
    }
    const date = await getImageDate(target)
    return { date: date?.toISOString() }
  } catch (err) {
    console.error('[ipc] exif:read failed', { target, error: err?.message })
    return { error: err.message }
  }
})

ipcMain.handle('date:to-hebrew', async (_event, isoDate) => {
  try {
    if (!isoDate) return { error: 'Invalid date' }
    const date = new Date(isoDate)
    const hebrew = toHebrewDate(date)
    return { hebrew }
  } catch (err) {
    console.error('[ipc] date:to-hebrew failed', { isoDate, error: err?.message })
    return { error: err.message }
  }
})

ipcMain.handle('file:sort-by-date', async (_event, payload) => {
  try {
    const { src, destRoot, format = 'month-year', mode = 'move' } = payload || {}
    if (!src || !destRoot) return { success: false, error: 'Invalid paths' }
    if (!isImage(src)) return { success: false, error: 'Not an image' }

    const date = await getImageDate(src)
    const hebrew = toHebrewDate(date)
    const gYear = date.getFullYear()
    const targetDir = buildTargetPath(destRoot, gYear, hebrew, format)
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
  } catch (err) {
    console.error('[ipc] file:sort-by-date failed', { payload, error: err?.message })
    return { success: false, error: err.message }
  }
})

