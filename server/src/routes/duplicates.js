import { Router } from 'express'
import { findDuplicates } from '../services/duplicateService.js'
import logger from '../utils/logger.js'

const duplicatesRouter = Router()

duplicatesRouter.post('/', async (req, res) => {
  try {
    const { sourcePath } = req.body || {}
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' })
    const groups = await findDuplicates(sourcePath)
    res.json({ groups, count: groups.length })
  } catch (err) {
    logger.error('[ROUTE /api/duplicates] failed', {
      body: req.body,
      error: err?.message,
      stack: err?.stack,
    })
    res.status(500).json({ error: err.message })
  }
})

export default duplicatesRouter

