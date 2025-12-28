import { Router } from 'express'
import fssync from 'node:fs'
import path from 'node:path'
import { scanFolder, deleteFile, createFolder, readExif, sortFile, cleanPath } from '../services/fileService.js'
import duplicatesRouter from './duplicates.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ ok: true, message: 'HebPhotoSort API is up' })
})

router.post('/scan', async (req, res) => {
  try {
    const { sourcePath } = req.body || {}
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' })
    const result = await scanFolder(sourcePath)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/delete', async (req, res) => {
  try {
    const { targetPath } = req.body || {}
    if (!targetPath) return res.status(400).json({ error: 'targetPath is required' })
    await deleteFile(targetPath)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/create-folder', async (req, res) => {
  try {
    const { targetPath } = req.body || {}
    if (!targetPath) return res.status(400).json({ error: 'targetPath is required' })
    await createFolder(targetPath)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/exif', async (req, res) => {
  try {
    const { targetPath } = req.body || {}
    if (!targetPath || !fssync.existsSync(targetPath)) {
      return res.status(400).json({ error: 'Invalid path' })
    }
    const data = await readExif(targetPath)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/sort', async (req, res) => {
  try {
    const { src, destRoot, format = 'month-year', mode = 'move' } = req.body || {}
    if (!src || !destRoot) return res.status(400).json({ error: 'Invalid paths' })
    const result = await sortFile({ src, destRoot, format, mode })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.use('/duplicates', duplicatesRouter)

router.get('/file', async (req, res) => {
  try {
    const target = cleanPath(req.query.path)
    if (!target) return res.status(400).json({ error: 'path is required' })
    if (!fssync.existsSync(target)) return res.status(404).json({ error: 'File not found' })
    const stat = await fssync.promises.stat(target)
    if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' })
    return res.sendFile(path.resolve(target))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router

