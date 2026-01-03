import { Router } from 'express'
import { scanFaces, getScanHistory } from '../services/faceService.js'
import logger from '../utils/logger.js'

const facesRouter = Router()

// Socket.IO handler setup function
export const setupFaceScanSocket = (io) => {
  io.on('connection', (socket) => {
    logger.log(`[Socket.IO] Face scan client connected: ${socket.id}`)
    
    // Log connection details
    logger.log(`[Socket.IO] Client transport: ${socket.conn.transport.name}`)
    
    let currentAbortController = null
    
    // Handle disconnect - abort any ongoing scan
    socket.on('disconnect', () => {
      if (currentAbortController) {
        currentAbortController.abort()
        currentAbortController = null
      }
      logger.log(`[Socket.IO] Client disconnected: ${socket.id}`)
    })
    
    // Handle stop request
    socket.on('face-scan:stop', () => {
      logger.log(`[Socket.IO] Stop requested by client: ${socket.id}`)
      if (currentAbortController) {
        currentAbortController.abort()
        currentAbortController = null
        socket.emit('face-scan:stopped', { message: 'Scan stopped by user' })
      }
    })
    
    // Handle face scan start
    socket.on('face-scan:start', async ({ sourcePath, concurrency }) => {
      const concurrencyNum = Math.min(100, Math.max(1, parseInt(concurrency, 10) || 10))
      
      if (!sourcePath) {
        socket.emit('face-scan:error', { error: 'sourcePath is required' })
        return
      }
      
      // Abort any existing scan
      if (currentAbortController) {
        currentAbortController.abort()
      }
      
      logger.log(`[Socket.IO] Starting face scan: ${sourcePath}, concurrency: ${concurrencyNum}`)
      
      // Create AbortController to signal cancellation to the scan service
      const abortController = new AbortController()
      currentAbortController = abortController
      
      // Send progress updates via Socket.IO
      // If faces are included, send them as a separate 'faces' event for incremental display
      const sendProgress = (data) => {
        if (!socket.connected || abortController.signal.aborted) return
        
        // Send progress data (without faces to keep it light)
        const { faces, ...progressData } = data
        socket.emit('face-scan:progress', progressData)
        
        // If faces are included, send them as incremental update
        if (faces && faces.length > 0) {
          socket.emit('face-scan:faces', { faces, total: data.total, current: data.current })
        }
      }
      
      try {
        const result = await scanFaces(sourcePath, sendProgress, { 
          concurrency: concurrencyNum,
          signal: abortController.signal 
        })
        
        // Clear the abort controller if this scan completed
        if (currentAbortController === abortController) {
          currentAbortController = null
        }
        
        if (!socket.connected || abortController.signal.aborted) {
          logger.log('[Socket.IO] Scan completed/cancelled but client already disconnected or aborted')
          return
        }
        
        // Send final result (even if cancelled, send what we have)
        socket.emit('face-scan:result', result)
        socket.emit('face-scan:done', { message: 'Scan completed' })
      } catch (err) {
        // Clear the abort controller
        if (currentAbortController === abortController) {
          currentAbortController = null
        }
        
        // Don't emit error if it was just an abort
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          logger.log('[Socket.IO] Scan aborted')
          return
        }
        
        logger.error('[Socket.IO] Face scan failed', {
          sourcePath,
          error: err?.message,
          stack: err?.stack,
        })
        
        if (!socket.connected) return
        
        // Send error via Socket.IO
        socket.emit('face-scan:error', { error: err.message, code: err.code })
      }
    })
  })
}

// Regular POST endpoint (for backwards compatibility)
facesRouter.post('/scan', async (req, res) => {
  try {
    const { sourcePath } = req.body || {}
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' })
    const result = await scanFaces(sourcePath)
    res.json(result)
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return res.status(400).json({ error: err.message })
    }
    logger.error('[ROUTE /api/faces/scan] failed', {
      body: req.body,
      error: err?.message,
      stack: err?.stack,
    })
    res.status(500).json({ error: err.message })
  }
})

// SSE endpoint for progress updates with incremental face results
facesRouter.get('/scan-stream', async (req, res) => {
  const { sourcePath, concurrency } = req.query
  const concurrencyNum = Math.min(100, Math.max(1, parseInt(concurrency, 10) || 10))
  
  if (!sourcePath) {
    return res.status(400).json({ error: 'sourcePath is required' })
  }
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  res.flushHeaders()
  
  // Create AbortController to signal cancellation to the scan service
  const abortController = new AbortController()
  
  // Track if client disconnected and abort the scan
  let clientDisconnected = false
  req.on('close', () => {
    clientDisconnected = true
    abortController.abort() // Signal the scan to stop
    logger.log('[SSE] Client disconnected, aborting scan')
  })
  
  // Send progress updates via SSE
  // If faces are included, send them as a separate 'faces' event for incremental display
  const sendProgress = (data) => {
    if (clientDisconnected) return
    
    // Send progress data (without faces to keep it light)
    const { faces, ...progressData } = data
    res.write(`data: ${JSON.stringify(progressData)}\n\n`)
    
    // If faces are included, send them as incremental update
    if (faces && faces.length > 0) {
      res.write(`event: faces\ndata: ${JSON.stringify({ faces, total: data.total, current: data.current })}\n\n`)
    }
  }
  
  try {
    const result = await scanFaces(sourcePath, sendProgress, { 
      concurrency: concurrencyNum,
      signal: abortController.signal 
    })
    
    if (clientDisconnected) {
      logger.log('[SSE] Scan completed/cancelled but client already disconnected')
      return
    }
    
    // Send final result (even if cancelled, send what we have)
    res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`)
    res.write(`event: close\ndata: {}\n\n`)
    res.end()
  } catch (err) {
    logger.error('[ROUTE /api/faces/scan-stream] failed', {
      sourcePath,
      error: err?.message,
      stack: err?.stack,
    })
    
    if (clientDisconnected) return
    
    // Send error via SSE
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message, code: err.code })}\n\n`)
    res.end()
  }
})

// Get scan history for a directory
facesRouter.get('/history', async (req, res) => {
  try {
    const { sourcePath } = req.query
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' })
    
    const history = await getScanHistory(sourcePath)
    res.json(history)
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return res.status(400).json({ error: err.message })
    }
    logger.error('[ROUTE /api/faces/history] failed', {
      query: req.query,
      error: err?.message,
      stack: err?.stack,
    })
    res.status(500).json({ error: err.message })
  }
})

export default facesRouter

