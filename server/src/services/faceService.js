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
const MAX_CONCURRENCY = 10
const CACHE_VERSION = 1
const CACHE_FILENAME = '.hebphotosort-faces.json'

const CACHE_DIR = path.join(os.tmpdir(), 'hebphotosort-faces')

// ============= Cache Functions =============

/**
 * Load cache file from the scanned directory
 * @param {string} rootPath - Root directory being scanned
 * @returns {object|null} Cache data or null if not exists/invalid
 */
const loadFaceCache = async (rootPath) => {
  const cachePath = path.join(rootPath, CACHE_FILENAME)
  try {
    if (!fssync.existsSync(cachePath)) return null
    const raw = await fs.readFile(cachePath, 'utf-8')
    const cache = JSON.parse(raw)
    
    // Validate cache version
    if (cache.version !== CACHE_VERSION) {
      console.log('[faceService] Cache version mismatch, will rescan all')
      return null
    }
    
    console.log(`[faceService] Loaded cache with ${Object.keys(cache.files || {}).length} files`)
    return cache
  } catch (err) {
    console.error('[faceService] Failed to load cache:', err.message)
    return null
  }
}

/**
 * Save cache file to the scanned directory
 * @param {string} rootPath - Root directory being scanned
 * @param {object} cacheData - Cache data to save
 */
const saveFaceCache = async (rootPath, cacheData) => {
  const cachePath = path.join(rootPath, CACHE_FILENAME)
  try {
    const data = {
      version: CACHE_VERSION,
      lastScan: new Date().toISOString(),
      files: cacheData.files || {}
    }
    await fs.writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8')
    console.log(`[faceService] Cache saved with ${Object.keys(data.files).length} files`)
  } catch (err) {
    console.error('[faceService] Failed to save cache:', err.message)
  }
}

/**
 * Get file modification time in milliseconds
 * @param {string} filePath 
 * @returns {number} mtime in ms
 */
const getFileMtime = async (filePath) => {
  try {
    const stat = await fs.stat(filePath)
    return stat.mtimeMs
  } catch {
    return 0
  }
}

/**
 * Categorize files into: cached (unchanged), new, modified
 * @param {string[]} mediaFiles - All media files found
 * @param {object} cache - Existing cache data
 * @returns {{cached: object[], toScan: string[], removed: string[]}}
 */
const categorizeFiles = async (mediaFiles, cache) => {
  const cached = [] // Files that are in cache and unchanged
  const toScan = [] // New or modified files
  const cachedPaths = new Set(Object.keys(cache?.files || {}))
  
  for (const file of mediaFiles) {
    const normalizedPath = file.replace(/\\/g, '/')
    const cachedEntry = cache?.files?.[normalizedPath]
    
    if (cachedEntry) {
      const currentMtime = await getFileMtime(file)
      if (currentMtime === cachedEntry.mtime) {
        // File unchanged, use cache
        cached.push({ path: file, data: cachedEntry })
      } else {
        // File modified, rescan
        toScan.push(file)
      }
      cachedPaths.delete(normalizedPath)
    } else {
      // New file
      toScan.push(file)
    }
  }
  
  // Files in cache but no longer exist
  const removed = Array.from(cachedPaths)
  
  return { cached, toScan, removed }
}

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

/**
 * Convert clusters to face groups for display
 * @param {Array} clusters - Current clusters
 * @returns {Array} Face groups sorted by count
 */
const clustersToFaces = (clusters) => {
  const faces = clusters.map((cluster, idx) => {
    const paths = Array.from(cluster.paths).slice(0, MAX_RESULTS_PER_FACE)
    const thumb = Array.from(cluster.sampleThumbnails)[0] || paths[0]
    return {
      id: `face-${idx + 1}`,
      label: `פנים #${idx + 1}`,
      count: cluster.paths.size,
      thumbnail: thumb,
      faceThumb: cluster.faceThumb || thumb,
      paths,
    }
  })
  faces.sort((a, b) => b.count - a.count)
  return faces
}

const scanFaces = async (sourcePath, onProgress = null, options = {}) => {
  const { concurrency = 10 } = options
  console.log('[faceService] scanFaces starting for:', sourcePath, 'concurrency:', concurrency)
  
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
    if (onProgress) onProgress({ phase: 'done', current: 0, total: 0, facesFound: 0, faces: [] })
    return { faces: [], totalFiles: 0, groupCount: 0 }
  }

  // Load existing cache
  if (onProgress) onProgress({ phase: 'cache', message: 'בודק מטמון...' })
  const existingCache = await loadFaceCache(root)
  const { cached, toScan, removed } = await categorizeFiles(mediaFiles, existingCache)
  
  console.log(`[faceService] Cache analysis: ${cached.length} cached, ${toScan.length} to scan, ${removed.length} removed`)
  
  // Prepare new cache object - start with existing cache data
  const newCacheFiles = existingCache?.files ? { ...existingCache.files } : {}
  
  // Process cached files - restore their face data from cache
  const clusters = []
  for (const { path: filePath, data } of cached) {
    const normalizedPath = filePath.replace(/\\/g, '/')
    newCacheFiles[normalizedPath] = data
    
    // Reconstruct face samples from cached data
    if (data.faces && data.faces.length > 0) {
      for (const cachedFace of data.faces) {
        // Convert descriptor array back to Float32Array
        const faceSample = {
          descriptor: Float32Array.from(cachedFace.descriptor),
          path: filePath,
          box: cachedFace.box,
          thumbnail: cachedFace.thumbnail,
          faceThumb: cachedFace.faceThumb
        }
        assignToClusters(clusters, faceSample)
      }
    }
  }

  const limiter = createLimiter(concurrency)
  let processed = 0
  const totalToScan = toScan.length
  const totalFiles = mediaFiles.length
  
  // Send initial faces from cache immediately
  if (onProgress && cached.length > 0) {
    const initialFaces = clustersToFaces(clusters)
    onProgress({ 
      phase: 'scan', 
      current: cached.length, 
      total: totalFiles, 
      facesFound: clusters.length,
      cached: cached.length,
      toScan: totalToScan,
      message: `נמצאו ${cached.length} קבצים במטמון, סורק ${totalToScan} חדשים...`,
      faces: initialFaces // Send faces from cache immediately
    })
  } else if (onProgress) {
    onProgress({ 
      phase: 'scan', 
      current: 0, 
      total: totalFiles, 
      facesFound: 0,
      cached: 0,
      toScan: totalToScan,
      message: 'מתחיל סריקה...',
      faces: []
    })
  }

  // Track when to save cache (save every N files for efficiency)
  const CACHE_SAVE_INTERVAL = 5
  let lastCacheSave = 0
  
  // Track currently processing files with their start times
  const activeFiles = new Map() // filename -> { startTime, path }
  
  // Helper to send progress with active files info
  const sendProgressUpdate = () => {
    if (!onProgress) return
    
    // Send startTime to client - let client calculate elapsed time for smooth updates
    const activeFilesInfo = Array.from(activeFiles.entries()).map(([filename, info]) => ({
      filename,
      path: info.path,
      startTime: info.startTime // Client will calculate elapsed time
    }))
    
    const currentFaces = clustersToFaces(clusters)
    onProgress({ 
      phase: 'scan', 
      current: cached.length + processed, 
      total: totalFiles, 
      facesFound: clusters.length,
      cached: cached.length,
      scanned: processed,
      toScan: totalToScan,
      activeFiles: activeFilesInfo,
      activeCount: activeFilesInfo.length,
      message: `סורק ${processed}/${totalToScan} קבצים חדשים...`,
      faces: currentFaces
    })
  }

  // Scan only new/modified files - queue all tasks at once for true parallelism
  const scanPromises = toScan.map(file => 
    limiter(async () => {
      const filename = path.basename(file)
      
      // Track start of processing
      activeFiles.set(filename, { startTime: Date.now(), path: file })
      sendProgressUpdate()
      
      const faces = await detectFacesInFile(file)
      const normalizedPath = file.replace(/\\/g, '/')
      const mtime = await getFileMtime(file)
      
      // Store in cache (convert Float32Array to regular array for JSON)
      newCacheFiles[normalizedPath] = {
        mtime,
        faces: faces.slice(0, MAX_SAMPLES).map(f => ({
          descriptor: Array.from(f.descriptor),
          box: f.box ? {
            x: f.box.x,
            y: f.box.y,
            width: f.box.width,
            height: f.box.height
          } : null,
          thumbnail: f.thumbnail,
          faceThumb: f.faceThumb
        }))
      }
      
      // Add to clusters
      faces.slice(0, MAX_SAMPLES).forEach((faceSample) => assignToClusters(clusters, faceSample))
      
      // Remove from active files
      activeFiles.delete(filename)
      processed += 1
      
      // Save cache periodically (every CACHE_SAVE_INTERVAL files) for resume capability
      if (processed - lastCacheSave >= CACHE_SAVE_INTERVAL) {
        await saveFaceCache(root, { files: newCacheFiles })
        lastCacheSave = processed
        console.log(`[faceService] Cache saved at ${processed}/${totalToScan} files`)
      }
      
      // Report progress
      sendProgressUpdate()
    })
  )
  
  // Wait for all scan tasks to complete
  await Promise.all(scanPromises)

  // Final cache save
  if (onProgress) onProgress({ phase: 'cache-save', message: 'שומר מטמון...' })
  await saveFaceCache(root, { files: newCacheFiles })

  // Report: processing results
  if (onProgress) onProgress({ phase: 'process', message: 'מעבד תוצאות...' })

  const finalFaces = clustersToFaces(clusters)

  const result = {
    faces: finalFaces,
    totalFiles: mediaFiles.length,
    groupCount: finalFaces.length,
    cacheStats: {
      cached: cached.length,
      scanned: toScan.length,
      removed: removed.length
    }
  }
  
  // Report: done
  if (onProgress) {
    const doneMsg = cached.length > 0 
      ? `הושלם! (${cached.length} מהמטמון, ${toScan.length} חדשים)`
      : 'הושלם!'
    onProgress({ 
      phase: 'done', 
      current: totalFiles, 
      total: totalFiles, 
      facesFound: finalFaces.length,
      cached: cached.length,
      scanned: toScan.length,
      message: doneMsg,
      faces: finalFaces
    })
  }

  return result
}

export { scanFaces }

