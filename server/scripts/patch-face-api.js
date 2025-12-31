/**
 * Patches @vladmandic/face-api to fix issues in Node.js 22+:
 * 1. TextEncoder issue - the bundled util module is empty
 * 2. CommonJS exports - the file doesn't export for CommonJS
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const faceApiPath = path.join(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'dist', 'face-api.js')

console.log('Patching face-api.js for Node.js compatibility...')

let content = fs.readFileSync(faceApiPath, 'utf8')

// Check if already patched
if (content.includes('/* PATCHED_FOR_NODEJS */')) {
  console.log('Already patched, skipping.')
  process.exit(0)
}

let patchCount = 0

// Patch 1: Fix TextEncoder - replace empty util factory
// Original: jF=Bt(()=>{})
// Patched: jF=Bt((e,t)=>{t.exports={TextEncoder:globalThis.TextEncoder,TextDecoder:globalThis.TextDecoder}})
const utilOriginal = 'jF=Bt(()=>{})'
const utilPatched = 'jF=Bt((e,t)=>{t.exports={TextEncoder:globalThis.TextEncoder,TextDecoder:globalThis.TextDecoder}})'

if (content.includes(utilOriginal)) {
  content = content.replace(utilOriginal, utilPatched)
  console.log('  - Patched TextEncoder util factory')
  patchCount++
}

// Patch 2: Add CommonJS exports at the end of the file
// The file ends with: return OF(Hce);})();
// We add module.exports = faceapi after it
if (!content.includes('module.exports')) {
  content = content + '\n/* PATCHED_FOR_NODEJS */\nif(typeof module!=="undefined"&&module.exports){module.exports=faceapi;}'
  console.log('  - Added CommonJS exports')
  patchCount++
}

if (patchCount === 0) {
  console.log('No patches needed or patterns not found.')
} else {
  fs.writeFileSync(faceApiPath, content)
  console.log(`Successfully applied ${patchCount} patch(es) to face-api.js!`)
}

