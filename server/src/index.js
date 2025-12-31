import express from 'express'
import cors from 'cors'
import router from './routes/index.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

// Simple request logger for all routes
app.use((req, res, next) => {
  const start = Date.now()
  const { method, url, body } = req
  res.on('finish', () => {
    const ms = Date.now() - start
    console.log(
      `[HTTP] ${method} ${url} -> ${res.statusCode} (${ms}ms) body=${JSON.stringify(body || {})}`,
    )
  })
  next()
})

app.use('/api', router)

// Global error logger & handler
app.use((err, req, res, _next) => {
  console.error('[SERVER ERROR]', {
    method: req.method,
    url: req.originalUrl,
    message: err?.message,
    stack: err?.stack,
    body: req.body,
  })
  const status = err?.status || 500
  res.status(status).json({ error: err?.message || 'Server error' })
})

// Catch unhandled async errors
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason)
})

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err)
})

app.listen(PORT, () => {
  console.log(`HebPhotoSort API running on http://localhost:${PORT}`)
})


