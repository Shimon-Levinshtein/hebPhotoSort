import { getSystemStats } from '../services/systemStatsService.js'
import logger from '../utils/logger.js'

// Socket.IO handler setup function for system stats
export const setupSystemStatsSocket = (io) => {
  // Track active connections for system stats
  const statsConnections = new Set()
  let statsInterval = null

  const startStatsBroadcast = () => {
    if (statsInterval) return // Already running

    logger.log('[Socket.IO] Starting system stats broadcast')
    
    statsInterval = setInterval(async () => {
      if (statsConnections.size === 0) {
        // No connections, stop broadcasting
        if (statsInterval) {
          clearInterval(statsInterval)
          statsInterval = null
          logger.log('[Socket.IO] Stopped system stats broadcast (no connections)')
        }
        return
      }

      try {
        const stats = await getSystemStats()
        // Broadcast to all connected clients
        io.emit('system-stats:update', stats)
      } catch (err) {
        logger.error('[Socket.IO] Failed to get system stats', {
          error: err?.message,
          stack: err?.stack,
        })
      }
    }, 1000) // Update every second
  }

  const stopStatsBroadcast = () => {
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
      logger.log('[Socket.IO] Stopped system stats broadcast')
    }
  }

  io.on('connection', (socket) => {
    // Handle system stats subscription
    socket.on('system-stats:subscribe', () => {
      logger.log(`[Socket.IO] System stats subscription from: ${socket.id}`)
      statsConnections.add(socket.id)
      
      // Start broadcasting if this is the first connection
      if (statsConnections.size === 1) {
        startStatsBroadcast()
      }
      
      // Send initial stats immediately
      getSystemStats()
        .then((stats) => {
          socket.emit('system-stats:update', stats)
        })
        .catch((err) => {
          logger.error('[Socket.IO] Failed to send initial system stats', {
            error: err?.message,
          })
        })
    })

    socket.on('system-stats:unsubscribe', () => {
      logger.log(`[Socket.IO] System stats unsubscription from: ${socket.id}`)
      statsConnections.delete(socket.id)
      
      // Stop broadcasting if no more connections
      if (statsConnections.size === 0) {
        stopStatsBroadcast()
      }
    })

    // Handle disconnect - remove from connections
    socket.on('disconnect', () => {
      statsConnections.delete(socket.id)
      
      // Stop broadcasting if no more connections
      if (statsConnections.size === 0) {
        stopStatsBroadcast()
      }
    })
  })
}

