import path from 'node:path'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import { createHash } from 'node:crypto'
import { cleanPath, isImage } from './fileService.js'

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash('md5')
    const stream = fssync.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })

const findDuplicates = async (sourcePath) => {
  const root = cleanPath(sourcePath)
  await fs.access(root, fssync.constants.R_OK)

  const stack = [root]
  const byKey = new Map()

  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile() && isImage(fullPath)) {
        try {
          const stat = await fs.stat(fullPath)
          const hash = await hashFile(fullPath)
          // קבצים ייחשבו כפולים לפי גודל+Hash כדי ללכוד כפילויות גם כששמות שונים
          const key = `${stat.size}::${hash}`
          if (!byKey.has(key)) byKey.set(key, [])
          byKey.get(key).push({ path: fullPath, size: stat.size })
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  const groups = []
  for (const [key, files] of byKey.entries()) {
    if (files.length > 1) {
      const [size] = key.split('::')
      const name = `גודל ${size} bytes`
      groups.push({ name, files })
    }
  }
  return groups
}

export { findDuplicates }

