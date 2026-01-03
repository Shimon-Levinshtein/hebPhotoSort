import { Router } from 'express'
import fssync from 'node:fs'
import path from 'node:path'
import { scanFolder, deleteFile, createFolder, readExif, sortFile, sortFilesBatch, cleanPath } from '../services/fileService.js'
import { getPosterPath } from '../services/posterService.js'
import { getSystemStats } from '../services/systemStatsService.js'
import mime from 'mime-types'
import duplicatesRouter from './duplicates.js'
import facesRouter from './faces.js'
import logger from '../utils/logger.js'

// Socket.IO handler setup function for file sorting
export const setupSortSocket = (io) => {
  io.on('connection', (socket) => {
    logger.log(`[Socket.IO] Sort client connected: ${socket.id}`)
    
    let currentAbortController = null
    
    // Handle disconnect
    socket.on('disconnect', () => {
      if (currentAbortController) {
        currentAbortController.abort()
        currentAbortController = null
      }
      logger.log(`[Socket.IO] Sort client disconnected: ${socket.id}`)
    })
    
    // Handle stop request
    socket.on('sort:stop', () => {
      logger.log(`[Socket.IO] Stop requested by client: ${socket.id}`)
      if (currentAbortController) {
        currentAbortController.abort()
        currentAbortController = null
        socket.emit('sort:stopped', { message: 'Sort stopped by user' })
      }
    })
    
    // Handle sort batch start
    socket.on('sort:start', async ({ files, destRoot, format = 'month-year', mode = 'move', concurrency = 5 }) => {
      if (!Array.isArray(files) || !files.length) {
        socket.emit('sort:error', { error: 'files array is required' })
        return
      }
      if (!destRoot) {
        socket.emit('sort:error', { error: 'destRoot is required' })
        return
      }
      
      // Abort any existing sort
      if (currentAbortController) {
        currentAbortController.abort()
      }
      
      logger.log(`[Socket.IO] Starting sort: ${files.length} files, concurrency: ${concurrency}`)
      
      // Create AbortController
      const abortController = new AbortController()
      currentAbortController = abortController
      
      // Send progress updates via Socket.IO
      const sendProgress = (progress) => {
        if (!socket.connected || abortController.signal.aborted) return
        socket.emit('sort:progress', progress)
      }
      
      try {
        const result = await sortFilesBatch({
          files,
          destRoot,
          format,
          mode,
          concurrency,
          getSystemStats,
          onProgress: sendProgress
        })
        
        // Clear the abort controller if this sort completed
        if (currentAbortController === abortController) {
          currentAbortController = null
        }
        
        if (!socket.connected || abortController.signal.aborted) {
          logger.log('[Socket.IO] Sort completed/cancelled but client already disconnected or aborted')
          return
        }
        
        // Send final result
        socket.emit('sort:result', result)
        socket.emit('sort:done', { message: 'Sort completed' })
      } catch (err) {
        // Clear the abort controller
        if (currentAbortController === abortController) {
          currentAbortController = null
        }
        
        // Don't emit error if it was just an abort
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          logger.log('[Socket.IO] Sort aborted')
          return
        }
        
        logger.error('[Socket.IO] Sort failed', {
          error: err?.message,
          stack: err?.stack,
        })
        
        if (!socket.connected) return
        
        // Send error via Socket.IO
        socket.emit('sort:error', { error: err.message })
      }
    })
  })
}

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ ok: true, message: 'HebPhotoSort API is up' })
})

router.get('/system-stats', async (_req, res) => {
  try {
    const stats = await getSystemStats()
    res.json(stats)
  } catch (err) {
    logger.error('[ROUTE /api/system-stats] failed', {
      error: err?.message,
      stack: err?.stack,
    })
    res.status(500).json({ error: err.message })
  }
})

router.post('/scan', async (req, res) => {
  try {
    const { sourcePath } = req.body || {}
    if (!sourcePath) {
      return res.status(400).json({ error: 'sourcePath is required' })
    }
    
    // Validate that sourcePath is not just a folder name
    if (!path.isAbsolute(sourcePath) && !sourcePath.includes(path.sep) && !sourcePath.includes('/') && !sourcePath.includes('\\')) {
      return res.status(400).json({ 
        error: `נתיב לא תקין: "${sourcePath}"\nאנא הזן נתיב מלא (לדוגמה: C:\\Photos\\למיון - Copy - Copy)` 
      })
    }
    
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

router.post('/sort-batch', async (req, res) => {
  try {
    const { files, destRoot, format = 'month-year', mode = 'move', concurrency = 5 } = req.body || {}
    if (!Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: 'files array is required' })
    }
    if (!destRoot) return res.status(400).json({ error: 'destRoot is required' })

    // Track progress
    let lastProgress = { current: 0, total: files.length, active: 0, concurrency: concurrency }
    const onProgress = (progress) => {
      lastProgress = progress
    }

    const result = await sortFilesBatch({ 
      files, 
      destRoot, 
      format, 
      mode, 
      concurrency,
      getSystemStats,
      onProgress
    })
    
    // Include final progress and concurrency in response
    res.json({ 
      ...result, 
      progress: lastProgress,
      concurrency: result.finalConcurrency || lastProgress.concurrency || concurrency
    })
  } catch (err) {
    logger.error('[ROUTE /api/sort-batch] failed', {
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

