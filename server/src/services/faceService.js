import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import { cleanPath, isImage, isVideo, isMedia } from './fileService.js'
import { initFaceApi, loadImage, imageToCanvas, canvasToTensor } from './faceModel.js'

// Will be set after initFaceApi
let faceapi = null

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

// Create a cropped face thumbnail from the image based on bounding box
const FACE_THUMB_SIZE = 150
const buildFaceThumb = async (filePath, box) => {
  if (!box) return null
  
  try {
    const dir = await ensureCacheDir()
    // Create unique hash from file path and box coordinates
    const boxId = `${Math.round(box.x)}_${Math.round(box.y)}_${Math.round(box.width)}_${Math.round(box.height)}`
    const hash = crypto.createHash('md5').update(`${filePath}_face_${boxId}`).digest('hex')
    const target = path.join(dir, `face_${hash}.jpg`)
    
    // Check if already exists
    if (fssync.existsSync(target)) return target
    
    // Add padding around the face (20% on each side)
    const padding = 0.3
    const paddingX = box.width * padding
    const paddingY = box.height * padding
    
    // Calculate crop region with padding
    let left = Math.max(0, Math.round(box.x - paddingX))
    let top = Math.max(0, Math.round(box.y - paddingY))
    let width = Math.round(box.width + paddingX * 2)
    let height = Math.round(box.height + paddingY * 2)
    
    // Get image metadata to ensure we don't go out of bounds
    const metadata = await sharp(filePath).metadata()
    
    // Adjust for image rotation
    const imgWidth = metadata.orientation >= 5 ? metadata.height : metadata.width
    const imgHeight = metadata.orientation >= 5 ? metadata.width : metadata.height
    
    // Clamp to image bounds
    if (left + width > imgWidth) width = imgWidth - left
    if (top + height > imgHeight) height = imgHeight - top
    
    // Ensure minimum size
    if (width < 10 || height < 10) return null
    
    await sharp(filePath)
      .rotate() // Auto-rotate based on EXIF
      .extract({ left, top, width, height })
      .resize(FACE_THUMB_SIZE, FACE_THUMB_SIZE, { fit: 'cover' })
      .toFile(target)
    
    return target
  } catch (err) {
    console.error('[faceService] buildFaceThumb failed:', err.message)
    return null
  }
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
          console.error('[faceService] limiter task failed', err)
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
  console.log('[faceService] detectFacesInFile:', filePath)
  
  let tensorInput = null
  let canvas = null
  try {
    let img = null
    if (isImage(filePath)) {
      console.log('[faceService] Loading image...')
      img = await loadImage(filePath)
      console.log('[faceService] Image loaded:', {
        width: img?.width,
        height: img?.height,
        type: typeof img,
        constructor: img?.constructor?.name
      })
    } else if (isVideo(filePath)) {
      console.log('[faceService] Extracting video frame...')
      const frame = await extractVideoFrame(filePath)
      if (frame) {
        console.log('[faceService] Frame extracted, loading as image...')
        img = await loadImage(frame)
      }
    }
    
    if (img) {
      // Convert image to canvas then to tensor - face-api accepts tf.Tensor3D
      console.log('[faceService] Converting image to canvas...')
      canvas = imageToCanvas(img)
      console.log('[faceService] Canvas created:', {
        width: canvas?.width,
        height: canvas?.height
      })
      
      console.log('[faceService] Converting canvas to tensor...')
      tensorInput = canvasToTensor(canvas)
      console.log('[faceService] Tensor created')
    }
  } catch (err) {
    console.error('[faceService] Failed to load image:', err.message, err.stack)
    return []
  }

  if (!tensorInput) {
    console.log('[faceService] No tensor input, skipping')
    return []
  }

  if (!faceapi) {
    console.error('[faceService] faceapi not initialized!')
    return []
  }

  console.log('[faceService] Running face detection...')
  console.log('[faceService] faceapi.SsdMobilenetv1Options:', typeof faceapi.SsdMobilenetv1Options)
  
  try {
    const detections = await faceapi
      .detectAllFaces(tensorInput, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptors()

    console.log('[faceService] Detection complete, found', detections.length, 'faces')
    
    // Clean up tensor to prevent memory leak
    tensorInput.dispose()
    
    if (!detections.length) return []

    const thumb = await buildThumb(filePath)
    
    // Create face thumbnails for each detected face
    const results = []
    for (const det of detections) {
      const box = det.detection?.box
      const faceThumb = await buildFaceThumb(filePath, box)
      
      results.push({
        descriptor: det.descriptor,
        path: filePath,
        box,
        thumbnail: thumb || filePath,
        faceThumb: faceThumb || thumb || filePath, // Cropped face thumbnail
      })
    }
    
    return results
  } catch (err) {
    console.error('[faceService] Face detection failed:', err.message, err.stack)
    return []
  }
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
    // Keep first face thumbnail as the group avatar
    if (!cluster.faceThumb && faceSample.faceThumb) {
      cluster.faceThumb = faceSample.faceThumb
    }
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
    faceThumb: faceSample.faceThumb, // Cropped face for group avatar
  })
}

const scanFaces = async (sourcePath, onProgress = null) => {
  console.log('[faceService] scanFaces starting for:', sourcePath)
  
  const root = cleanPath(sourcePath)
  if (!root) throw new Error('sourcePath is required')
  if (!fssync.existsSync(root)) {
    const err = new Error(`Source path not found: ${root}`)
    err.code = 'ENOENT'
    throw err
  }
  await fs.access(root, fssync.constants.R_OK)
  
  // Report: initializing
  if (onProgress) onProgress({ phase: 'init', message: 'מאתחל זיהוי פנים...' })
  
  console.log('[faceService] Initializing face-api...')
  const { faceapi: api } = await initFaceApi()
  faceapi = api
  console.log('[faceService] face-api initialized, faceapi:', typeof faceapi)
  console.log('[faceService] faceapi.nets:', Object.keys(faceapi?.nets || {}))

  // Report: collecting files
  if (onProgress) onProgress({ phase: 'collect', message: 'אוסף קבצי מדיה...' })
  
  const mediaFiles = await collectMedia(root)
  if (!mediaFiles.length) {
    if (onProgress) onProgress({ phase: 'done', current: 0, total: 0, facesFound: 0 })
    return { faces: [], totalFiles: 0, groupCount: 0 }
  }

  const limiter = createLimiter(MAX_CONCURRENCY)
  const clusters = []
  let processed = 0
  const total = mediaFiles.length
  
  // Report: starting scan
  if (onProgress) onProgress({ phase: 'scan', current: 0, total, facesFound: 0, message: 'מתחיל סריקה...' })

  for (const file of mediaFiles) {
    await limiter(async () => {
      const faces = await detectFacesInFile(file)
      faces.slice(0, MAX_SAMPLES).forEach((faceSample) => assignToClusters(clusters, faceSample))
      
      processed += 1
      // Report progress every file
      if (onProgress) {
        onProgress({ 
          phase: 'scan', 
          current: processed, 
          total, 
          facesFound: clusters.length,
          currentFile: path.basename(file),
          message: `סורק ${processed}/${total}...`
        })
      }
    })
  }

  // Report: processing results
  if (onProgress) onProgress({ phase: 'process', message: 'מעבד תוצאות...' })

  const faces = clusters.map((cluster, idx) => {
    const paths = Array.from(cluster.paths).slice(0, MAX_RESULTS_PER_FACE)
    const thumb = Array.from(cluster.sampleThumbnails)[0] || paths[0]
    return {
      id: `face-${idx + 1}`,
      label: `פנים #${idx + 1}`,
      count: cluster.paths.size,
      thumbnail: thumb,
      faceThumb: cluster.faceThumb || thumb, // Cropped face for avatar
      paths,
    }
  })

  faces.sort((a, b) => b.count - a.count)

  const result = {
    faces,
    totalFiles: mediaFiles.length,
    groupCount: faces.length,
  }
  
  // Report: done
  if (onProgress) {
    onProgress({ 
      phase: 'done', 
      current: total, 
      total, 
      facesFound: faces.length,
      message: 'הושלם!'
    })
  }

  return result
}

export { scanFaces }

