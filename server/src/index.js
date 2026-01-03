import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import router from './routes/index.js'
import { setupFaceScanSocket } from './routes/faces.js'
import logger from './utils/logger.js'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
})

const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

// Simple request logger for all routes
app.use((req, res, next) => {
  const start = Date.now()
  const { method, url, body } = req
  res.on('finish', () => {
    const ms = Date.now() - start
    logger.log(
      `[HTTP] ${method} ${url} -> ${res.statusCode} (${ms}ms) body=${JSON.stringify(body || {})}`,
    )
  })
  next()
})

app.use('/api', router)

// Global error logger & handler
app.use((err, req, res, _next) => {
  logger.error('[SERVER ERROR]', {
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
  logger.error('[UNHANDLED REJECTION]', reason)
})

process.on('uncaughtException', (err) => {
  logger.error('[UNCAUGHT EXCEPTION]', err)
})

// Setup Socket.IO handlers
setupFaceScanSocket(io)

httpServer.listen(PORT, () => {
  logger.log(`HebPhotoSort API running on http://localhost:${PORT}`)
  logger.log(`Socket.IO server ready`)
})


