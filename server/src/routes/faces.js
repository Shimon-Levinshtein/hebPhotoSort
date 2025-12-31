import { Router } from 'express'
import { scanFaces } from '../services/faceService.js'

const facesRouter = Router()

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

export default facesRouter

