/**
 * CRITICAL: This file MUST be imported before @vladmandic/face-api
 * 
 * The face-api library accesses this.util.TextEncoder during module initialization.
 * In Node.js 22+, util.TextEncoder was removed from the util module.
 * We need to polyfill it with the global TextEncoder before the library loads.
 */
import { createRequire } from 'node:module'

// Get the actual util module from Node.js cache and patch it directly
const require = createRequire(import.meta.url)
const nodeUtilModule = require('util')

// Patch TextEncoder/TextDecoder directly onto the util module
// This modifies the cached module that face-api will receive when it requires 'util'
if (!nodeUtilModule.TextEncoder) {
  nodeUtilModule.TextEncoder = globalThis.TextEncoder
}
if (!nodeUtilModule.TextDecoder) {
  nodeUtilModule.TextDecoder = globalThis.TextDecoder
}

// Also set up global.util for libraries that access it directly
const polyfillUtil = nodeUtilModule

globalThis.util = polyfillUtil
global.util = polyfillUtil

if (!globalThis.global) {
  globalThis.global = globalThis
}
globalThis.global.util = polyfillUtil

Object.defineProperty(globalThis, 'util', {
  value: polyfillUtil,
  writable: true,
  configurable: true,
})

export default polyfillUtil

