/**
 * Simple logger utility with timestamp
 * Format: DD/MM/YYYY - HH:MM:SS
 */

const getTimestamp = () => {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds}`
}

const log = (...args) => {
  console.log(`[${getTimestamp()}]`, ...args)
}

const error = (...args) => {
  console.error(`[${getTimestamp()}]`, ...args)
}

const warn = (...args) => {
  console.warn(`[${getTimestamp()}]`, ...args)
}

export default { log, error, warn }
export { log, error, warn, getTimestamp }

