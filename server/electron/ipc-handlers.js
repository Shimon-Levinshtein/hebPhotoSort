import { ipcMain, dialog } from 'electron'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import exif from 'exif-parser'
import { HDate, HebrewCalendar } from '@hebcal/core'

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
    // ignore and fallback to file stats
  }
  const stat = await fs.stat(filePath)
  return stat.birthtime || stat.mtime
}

const toHebrewDate = (date) => {
  const hd = new HDate(date)
  const hebrew = hd.renderGematriya() // e.g., כ״ד כסלו תשפ״ה
  const month = hd.getMonthName()
  const year = hd.getFullYear()
  const day = hd.getDate()
  const sanitize = (str) => str.replace(/["״']/g, '')
  return {
    full: hebrew,
    year,
    month,
    day,
    folderName: `${sanitize(month)} ${sanitize(String(year))}`,
  }
}

const buildTargetPath = (destRoot, gregorianYear, hebrew, format) => {
  const yearDir = path.join(destRoot, String(gregorianYear))
  const base = path.join(yearDir, hebrew.folderName)
  if (format === 'day-month-year') {
    const dayName = typeof hebrew.day === 'number' ? `יום ${hebrew.day}` : hebrew.day
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
    return { success: false, error: err.message }
  }
})

ipcMain.handle('file:delete', async (_event, target) => {
  try {
    if (!target) return { success: false, error: 'Invalid path' }
    await fs.rm(target, { force: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('folder:create', async (_event, target) => {
  try {
    if (!target) return { success: false, error: 'Invalid path' }
    await fs.mkdir(target, { recursive: true })
    return { success: true }
  } catch (err) {
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
    return { success: false, error: err.message }
  }
})

