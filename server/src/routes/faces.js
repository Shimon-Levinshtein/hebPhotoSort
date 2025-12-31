import { Router } from 'express'
import { scanFaces } from '../services/faceService.js'

const facesRouter = Router()

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
    console.error('[ROUTE /api/faces/scan] failed', {
      body: req.body,
      error: err?.message,
      stack: err?.stack,
    })
    res.status(500).json({ error: err.message })
  }
})

// SSE endpoint for progress updates
facesRouter.get('/scan-stream', async (req, res) => {
  const { sourcePath } = req.query
  
  if (!sourcePath) {
    return res.status(400).json({ error: 'sourcePath is required' })
  }
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  res.flushHeaders()
  
  // Send progress updates via SSE
  const sendProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
  
  try {
    const result = await scanFaces(sourcePath, sendProgress)
    
    // Send final result
    res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`)
    res.write(`event: close\ndata: {}\n\n`)
    res.end()
  } catch (err) {
    console.error('[ROUTE /api/faces/scan-stream] failed', {
      sourcePath,
      error: err?.message,
      stack: err?.stack,
    })
    
    // Send error via SSE
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message, code: err.code })}\n\n`)
    res.end()
  }
})

export default facesRouter

