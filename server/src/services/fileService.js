import path from 'node:path'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import exif from 'exif-parser'
import { HDate } from '@hebcal/core'

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
  return stat.birthtime || stat.mtime
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
  return {
    full,
    year: yearRaw,
    yearPath,
    gregorianYear,
    gregorianMonth,
    month,
    day,
    dayGematriya: dayGematriyaPath,
    folderName: `${month}- ${yearPath} - (${gregorianMonthStr}-${gregorianYear})`,
  }
}

const buildTargetPath = (destRoot, hebrew, format) => {
  const yearDirName = `${hebrew.yearPath} - (${hebrew.gregorianYear})`
  const yearDir = path.join(destRoot, yearDirName)
  const base = path.join(yearDir, hebrew.folderName)
  if (format === 'day-month-year') {
    const dayGematriya = hebrew.dayGematriya || String(hebrew.day)
    const dayName = typeof hebrew.day === 'number' ? `יום ${dayGematriya} (${hebrew.day})` : hebrew.day
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

export {
  cleanPath,
  scanFolder,
  deleteFile,
  createFolder,
  readExif,
  sortFile,
  isImage,
  isVideo,
  isMedia,
}

