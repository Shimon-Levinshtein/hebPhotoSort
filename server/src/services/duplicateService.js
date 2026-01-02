import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import { cleanPath, isImage, isVideo, isMedia } from './fileService.js'
import logger from '../utils/logger.js'

// פרמטרים להגדרת איכות / דיוק
const HASH_WIDTH = 9
const HASH_HEIGHT = 8
const HAMMING_THRESHOLD = 10 // ככל שקטן יותר – דרישה לדמיון גבוה יותר
const SIZE_TOLERANCE_BYTES = 32_000
const SIZE_TOLERANCE_RATIO = 0.12
const DIM_TOLERANCE = 0.25
const MAX_CONCURRENCY = 4

const BYTE_POPCOUNT = (() => {
  const arr = new Uint8Array(256)
  for (let i = 0; i < 256; i += 1) {
    let v = i
    let c = 0
    while (v) {
      c += v & 1
      v >>= 1
    }
    arr[i] = c
  }
  return arr
})()

const popcountBuffer = (buf) => {
  let count = 0
  for (let i = 0; i < buf.length; i += 1) {
    count += BYTE_POPCOUNT[buf[i]]
  }
  return count
}

const hammingDistance = (aHex, bHex) => {
  if (!aHex || !bHex) return Number.POSITIVE_INFINITY
  const a = Buffer.from(aHex, 'hex')
  const b = Buffer.from(bHex, 'hex')
  if (a.length !== b.length) return Number.POSITIVE_INFINITY
  const len = a.length
  const xor = Buffer.allocUnsafe(len)
  for (let i = 0; i < len; i += 1) xor[i] = a[i] ^ b[i]
  return popcountBuffer(xor)
}

const createLimiter = (limit = 4) => {
  let active = 0
  const queue = []
  const runNext = () => {
    if (!queue.length || active >= limit) return
    const next = queue.shift()
    active += 1
    next()
  }
  return async (fn) =>
    new Promise((resolve, reject) => {
      const task = async () => {
        try {
          const res = await fn()
          resolve(res)
        } catch (err) {
          logger.error('[duplicateService] limiter task failed', err)
          reject(err)
        } finally {
          active -= 1
          runNext()
        }
      }
      queue.push(task)
      runNext()
    })
}

const bitsToHex = (bits) => {
  const hex = []
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = bits.slice(i, i + 4).join('')
    hex.push(parseInt(nibble, 2).toString(16))
  }
  return hex.join('')
}

// dHash: רגיש לשינויים חזותיים אבל מתעלם משם/קומפרסיה
const computeDHashFromSource = async (sharpSource) => {
  const base = sharpSource.rotate()
  const metadata = await base.metadata()

  const { data } = await base
    .clone()
    .grayscale()
    .resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill', fastShrinkOnLoad: true })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const bits = []
  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
      const left = data[y * HASH_WIDTH + x]
      const right = data[y * HASH_WIDTH + x + 1]
      bits.push(left < right ? 1 : 0)
    }
  }

  return {
    hash: bitsToHex(bits),
    width: metadata.width || 0,
    height: metadata.height || 0,
  }
}

const computeDHash = async (filePath) => {
  const sharpSource = sharp(filePath, { failOn: 'error' })
  return computeDHashFromSource(sharpSource)
}

const computeDHashFromBuffer = async (buffer) => {
  const sharpSource = sharp(buffer, { failOn: 'error' })
  return computeDHashFromSource(sharpSource)
}

const similarSize = (a, b) => {
  const diff = Math.abs(a.size - b.size)
  const tolerance = Math.max(SIZE_TOLERANCE_BYTES, Math.min(a.size, b.size) * SIZE_TOLERANCE_RATIO)
  return diff <= tolerance
}

const similarDimensions = (a, b) => {
  if (!a.width || !a.height || !b.width || !b.height) return true
  const widthGap = Math.abs(a.width - b.width) / Math.max(a.width, b.width)
  const heightGap = Math.abs(a.height - b.height) / Math.max(a.height, b.height)
  return widthGap <= DIM_TOLERANCE && heightGap <= DIM_TOLERANCE
}

const POSTER_DIR = path.join(os.tmpdir(), 'hebphotosort-posters')

const ensurePosterDir = async () => {
  await fs.mkdir(POSTER_DIR, { recursive: true })
  return POSTER_DIR
}

const extractVideoFrame = async (filePath) => {
  if (!ffmpegPath) return null
  return new Promise((resolve, reject) => {
    const args = ['-ss', '00:00:01', '-i', filePath, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-']
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks = []
    proc.stdout.on('data', (d) => chunks.push(d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks))
      else resolve(null) // fallback: no poster
    })
  })
}

const savePoster = async (buffer, sourcePath) => {
  const dir = await ensurePosterDir()
  const hash = crypto.createHash('md5').update(sourcePath).digest('hex')
  const target = path.join(dir, `${hash}.jpg`)
  await fs.writeFile(target, buffer)
  return target
}

const findDuplicates = async (sourcePath) => {
  const root = cleanPath(sourcePath)
  await fs.access(root, fssync.constants.R_OK)

  const limiter = createLimiter(MAX_CONCURRENCY)
  const fingerprints = []
  const stack = [root]

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
      } else if (entry.isFile() && isMedia(fullPath)) {
        try {
          const fp = await limiter(async () => {
            const stat = await fs.stat(fullPath)

            if (isImage(fullPath)) {
              const dhash = await computeDHash(fullPath)
              return { path: fullPath, size: stat.size, type: 'image', ...dhash }
            }

            if (isVideo(fullPath)) {
              const frame = await extractVideoFrame(fullPath)
              const dhash = frame ? await computeDHashFromBuffer(frame) : null
              const posterPath = frame ? await savePoster(frame, fullPath) : null
              return {
                path: fullPath,
                size: stat.size,
                type: 'video',
                poster: posterPath,
                ...(dhash || {}),
              }
            }

            return null
          })
          if (fp) fingerprints.push(fp)
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  if (fingerprints.length < 2) return []

  // סידור לפי גודל מקל על סינון מהיר
  fingerprints.sort((a, b) => a.size - b.size)

  const parent = new Array(fingerprints.length).fill(0).map((_, i) => i)
  const find = (i) => {
    if (parent[i] !== i) parent[i] = find(parent[i])
    return parent[i]
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < fingerprints.length; i += 1) {
    const a = fingerprints[i]
    for (let j = i + 1; j < fingerprints.length; j += 1) {
      const b = fingerprints[j]
      // אם הפער בגודל חורג מעבר לטולרנס, שאר האיברים גדולים יותר ולכן אפשר לעצור
      if (!similarSize(a, b)) {
        if (b.size - a.size > SIZE_TOLERANCE_BYTES && b.size - a.size > a.size * SIZE_TOLERANCE_RATIO) {
          break
        }
        continue
      }
      if (!similarDimensions(a, b)) continue

      const dist = hammingDistance(a.hash, b.hash)
      if (dist <= HAMMING_THRESHOLD) union(i, j)
    }
  }

  const groupsMap = new Map()
  fingerprints.forEach((fp, idx) => {
    const rootIdx = find(idx)
    if (!groupsMap.has(rootIdx)) groupsMap.set(rootIdx, [])
    groupsMap.get(rootIdx).push(idx)
  })

  let groupCounter = 1
  const groups = []
  for (const indexes of groupsMap.values()) {
    if (indexes.length < 2) continue
    const files = indexes.map((i) => fingerprints[i])
    const pivot = files[0]
    const distances = files.slice(1).map((f) => hammingDistance(pivot.hash, f.hash))
    const avgDist = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : 0
    const similarity = Math.max(0, 100 - (avgDist / 64) * 100)
    groups.push({
      name: `קבוצה ${groupCounter} · דמיון חזותי ~${similarity.toFixed(0)}%`,
      files,
    })
    groupCounter += 1
  }

  return groups
}

export { findDuplicates }

