import { Router } from 'express'
import fssync from 'node:fs'
import path from 'node:path'
import { scanFolder, deleteFile, createFolder, readExif, sortFile, cleanPath } from '../services/fileService.js'
import { getPosterPath } from '../services/posterService.js'
import mime from 'mime-types'
import duplicatesRouter from './duplicates.js'
import facesRouter from './faces.js'
import logger from '../utils/logger.js'

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
    logger.error('[ROUTE /api/scan] failed', {
      body: req.body,
      error: err?.message,
      stack: err?.stack,
    })
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
    logger.error('[ROUTE /api/delete] failed', {
      body: req.body,
      error: err?.message,
      stack: err?.stack,
    })
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
    logger.error('[ROUTE /api/create-folder] failed', {
      body: req.body,
      error: err?.message,
      stack: err?.stack,
    })
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
    logger.error('[ROUTE /api/exif] failed', {
      body: req.body,
      error: err?.message,
      stack: err?.stack,
    })
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
    logger.error('[ROUTE /api/sort] failed', {
      body: req.body,
      error: err?.message,
      stack: err?.stack,
    })
    res.status(500).json({ error: err.message })
  }
})

router.use('/duplicates', duplicatesRouter)
router.use('/faces', facesRouter)

router.get('/file', async (req, res) => {
  try {
    const target = cleanPath(req.query.path)
    if (!target) return res.status(400).json({ error: 'path is required' })
    if (!fssync.existsSync(target)) return res.status(404).json({ error: 'File not found' })
    const stat = await fssync.promises.stat(target)
    if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' })

    const range = req.headers.range
    const mimeType = mime.lookup(target) || 'application/octet-stream'

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
      const start = Number(startStr) || 0
      const end = endStr ? Number(endStr) : stat.size - 1
      if (start >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`)
        return res.end()
      }
      const chunkSize = end - start + 1

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      })
      const stream = fssync.createReadStream(target, { start, end })
      stream.pipe(res)
      stream.on('error', (err) => {
        res.status(500).end(err.message)
      })
      return
    }

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Length', stat.size)
    const stream = fssync.createReadStream(target)
    stream.pipe(res)
    stream.on('error', (err) => {
      res.status(500).end(err.message)
    })
  } catch (err) {
    logger.error('[ROUTE /api/file] failed', {
      query: req.query,
      error: err?.message,
      stack: err?.stack,
    })
    res.status(500).json({ error: err.message })
  }
})

router.get('/poster', async (req, res) => {
  try {
    const target = cleanPath(req.query.path)
    if (!target) return res.status(400).json({ error: 'path is required' })
    if (!fssync.existsSync(target)) return res.status(404).json({ error: 'File not found' })
    const stat = await fssync.promises.stat(target)
    if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' })

    const posterPath = await getPosterPath(target)
    if (!posterPath || !fssync.existsSync(posterPath)) {
      return res.status(404).json({ error: 'Poster not available' })
    }
    return res.sendFile(path.resolve(posterPath))
  } catch (err) {
    logger.error('[ROUTE /api/poster] failed', {
      query: req.query,
      error: err?.message,
      stack: err?.stack,
    })
    res.status(500).json({ error: err.message })
  }
})

export default router

