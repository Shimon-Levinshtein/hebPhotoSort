import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import { cleanPath, isImage, isVideo, isMedia } from './fileService.js'
import { initFaceApi, faceapi, loadImage } from './faceModel.js'

const THUMB_SIZE = 220
const MAX_SAMPLES = 96
const MAX_RESULTS_PER_FACE = 96
const FACE_DISTANCE_THRESHOLD = 0.52
const MAX_CONCURRENCY = 2

const CACHE_DIR = path.join(os.tmpdir(), 'hebphotosort-faces')

const ensureCacheDir = async () => {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  return CACHE_DIR
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
      else resolve(null)
    })
  })
}

const saveBufferThumb = async (buffer, sourcePath) => {
  const dir = await ensureCacheDir()
  const hash = crypto.createHash('md5').update(sourcePath).digest('hex')
  const target = path.join(dir, `${hash}.jpg`)
  await sharp(buffer).rotate().resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' }).toFile(target)
  return target
}

const buildThumbFromImage = async (filePath) => {
  const dir = await ensureCacheDir()
  const hash = crypto.createHash('md5').update(filePath).digest('hex')
  const target = path.join(dir, `${hash}.jpg`)
  await sharp(filePath, { failOn: 'error' })
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
    .toFile(target)
  return target
}

const buildThumb = async (filePath) => {
  try {
    if (isImage(filePath)) return await buildThumbFromImage(filePath)
    if (isVideo(filePath)) {
      const frame = await extractVideoFrame(filePath)
      if (frame) return await saveBufferThumb(frame, filePath)
    }
  } catch {
    // ignore and fallback
  }
  return null
}

const collectMedia = async (rootPath) => {
  const files = []
  const stack = [rootPath]

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
        files.push(fullPath)
      }
    }
  }

  return files
}

const createLimiter = (limit = 2) => {
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

const detectFacesInFile = async (filePath) => {
  let imageInput = null
  try {
    if (isImage(filePath)) {
      imageInput = await loadImage(filePath)
    } else if (isVideo(filePath)) {
      const frame = await extractVideoFrame(filePath)
      if (frame) imageInput = await loadImage(frame)
    }
  } catch {
    return []
  }

  if (!imageInput) return []

  const detections = await faceapi
    .detectAllFaces(imageInput, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors()

  if (!detections.length) return []

  const thumb = await buildThumb(filePath)

  return detections.map((det) => ({
    descriptor: det.descriptor,
    path: filePath,
    box: det.detection?.box,
    thumbnail: thumb || filePath,
  }))
}

const assignToClusters = (clusters, faceSample) => {
  const descriptor = faceSample.descriptor
  let bestIdx = -1
  let bestDist = Number.POSITIVE_INFINITY

  for (let i = 0; i < clusters.length; i += 1) {
    const dist = faceapi.euclideanDistance(descriptor, clusters[i].centroid)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  if (bestIdx !== -1 && bestDist <= FACE_DISTANCE_THRESHOLD) {
    const cluster = clusters[bestIdx]
    cluster.descriptors.push(descriptor)
    cluster.paths.add(faceSample.path)
    cluster.sampleThumbnails.add(faceSample.thumbnail)
    // עדכון צנטרואיד ממוצע
    const length = descriptor.length
    const sum = new Float32Array(length).map(() => 0)
    cluster.descriptors.forEach((d) => {
      for (let i = 0; i < length; i += 1) sum[i] += d[i]
    })
    for (let i = 0; i < length; i += 1) {
      cluster.centroid[i] = sum[i] / cluster.descriptors.length
    }
    return
  }

  // יצירת קלאסטר חדש
  clusters.push({
    centroid: Float32Array.from(descriptor),
    descriptors: [descriptor],
    paths: new Set([faceSample.path]),
    sampleThumbnails: new Set([faceSample.thumbnail]),
  })
}

const scanFaces = async (sourcePath) => {
  const root = cleanPath(sourcePath)
  await fs.access(root, fssync.constants.R_OK)
  await initFaceApi()

  const mediaFiles = await collectMedia(root)
  if (!mediaFiles.length) return { faces: [], totalFiles: 0, groupCount: 0 }

  const limiter = createLimiter(MAX_CONCURRENCY)
  const clusters = []

  for (const file of mediaFiles) {
    await limiter(async () => {
      const faces = await detectFacesInFile(file)
      faces.slice(0, MAX_SAMPLES).forEach((faceSample) => assignToClusters(clusters, faceSample))
    })
  }

  const faces = clusters.map((cluster, idx) => {
    const paths = Array.from(cluster.paths).slice(0, MAX_RESULTS_PER_FACE)
    const thumb = Array.from(cluster.sampleThumbnails)[0] || paths[0]
    return {
      id: `face-${idx + 1}`,
      label: `פנים #${idx + 1}`,
      count: cluster.paths.size,
      thumbnail: thumb,
      paths,
    }
  })

  faces.sort((a, b) => b.count - a.count)

  return {
    faces,
    totalFiles: mediaFiles.length,
    groupCount: faces.length,
  }
}

export { scanFaces }

