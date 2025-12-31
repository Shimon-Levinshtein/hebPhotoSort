// CRITICAL: Import polyfill FIRST before anything else
import './faceApiPolyfill.js'

import path from 'node:path'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import { createRequire } from 'node:module'
import { Image as NativeImage, ImageData, loadImage as nativeLoadImage, createCanvas } from '@napi-rs/canvas'

// face-api expects Canvas to be a class that can be instantiated with new Canvas(w, h)
// We need to create a proper class that wraps createCanvas
const Canvas = class Canvas {
  constructor(width, height) {
    const w = typeof width === 'number' && width > 0 ? Math.floor(width) : 300
    const h = typeof height === 'number' && height > 0 ? Math.floor(height) : 150
    if (width !== w || height !== h) {
      console.log('[faceModel] Canvas constructor fixed dimensions:', { width, height, fixed: { w, h } })
    }
    const canvas = createCanvas(w, h)
    // Copy all properties from the native canvas to this instance
    Object.assign(this, canvas)
    this._canvas = canvas
    this.width = w
    this.height = h
  }
  
  getContext(type) {
    return this._canvas.getContext(type)
  }
  
  toBuffer(...args) {
    return this._canvas.toBuffer(...args)
  }
  
  toDataURL(...args) {
    return this._canvas.toDataURL(...args)
  }
}

// Image wrapper
const Image = NativeImage

// Custom loadImage that ensures width/height are accessible
const loadImage = async (input) => {
  const img = await nativeLoadImage(input)
  console.log('[faceModel] loadImage result:', { 
    width: img.width, 
    height: img.height,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight 
  })
  return img
}

// Convert an Image to a Canvas for face-api processing
// face-api has trouble reading dimensions from @napi-rs/canvas Image objects
const imageToCanvas = (img) => {
  const width = img.width || img.naturalWidth
  const height = img.height || img.naturalHeight
  
  if (!width || !height) {
    throw new Error(`Cannot get image dimensions: width=${width}, height=${height}`)
  }
  
  console.log('[faceModel] imageToCanvas creating canvas:', { width, height })
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, width, height)
  
  return canvas
}

// Convert canvas to TensorFlow tensor for face-api input
// face-api accepts tf.Tensor3D as input which bypasses the instanceof checks
const canvasToTensor = (canvas) => {
  if (!faceapiInstance) {
    throw new Error('face-api not initialized')
  }
  
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  
  console.log('[faceModel] canvasToTensor:', { 
    width: canvas.width, 
    height: canvas.height,
    dataLength: imageData.data.length 
  })
  
  // Create a tensor from the image data
  // Shape is [height, width, 4] for RGBA, we need [height, width, 3] for RGB
  const tf = faceapiInstance.tf
  const tensor = tf.tensor3d(
    new Uint8Array(imageData.data),
    [canvas.height, canvas.width, 4]
  )
  
  // Remove alpha channel: take only first 3 channels (RGB)
  const rgbTensor = tensor.slice([0, 0, 0], [-1, -1, 3])
  tensor.dispose()
  
  return rgbTensor
}
import fetch from 'node-fetch'

// Use createRequire to load CommonJS modules
const require = createRequire(import.meta.url)

const MODEL_DIR = path.join(process.cwd(), 'models', 'face-api')
const MODEL_BASE_URL = 'https://github.com/vladmandic/face-api/raw/master/model'
const MODEL_FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
]

let initialized = false
let faceapiInstance = null

const loadFaceApi = async () => {
  if (faceapiInstance) return faceapiInstance

  // Use CommonJS build to avoid ESM compatibility issues with Node.js 25
  faceapiInstance = require('@vladmandic/face-api/dist/face-api.js')
  return faceapiInstance
}

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true })
  return dir
}

const downloadIfMissing = async (dir, fileName) => {
  const target = path.join(dir, fileName)
  if (fssync.existsSync(target)) return

  const url = `${MODEL_BASE_URL}/${fileName}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download model ${fileName}: ${res.status} ${res.statusText}`)

  const arrayBuffer = await res.arrayBuffer()
  await fs.writeFile(target, Buffer.from(arrayBuffer))
}

const ensureModels = async (dir = MODEL_DIR) => {
  await ensureDir(dir)
  for (const file of MODEL_FILES) {
    // הורדה אחת, בשקט, אם חסר
    try {
      await downloadIfMissing(dir, file)
    } catch (err) {
      console.error('[faceModel] failed to download model file', { file, error: err?.message })
      // אם הורדה נכשלה, השאר את השגיאה כדי שהקריאה תדע לעדכן את המשתמש
      throw err
    }
  }
  return dir
}

const initFaceApi = async () => {
  if (initialized) {
    console.log('[faceModel] Already initialized, returning cached instance')
    return { modelPath: MODEL_DIR, faceapi: faceapiInstance }
  }

  console.log('[faceModel] Loading face-api...')
  const faceapi = await loadFaceApi()
  console.log('[faceModel] face-api loaded, patching environment...')
  
  console.log('[faceModel] Canvas:', typeof Canvas, Canvas?.name)
  console.log('[faceModel] Image:', typeof Image, Image?.name)
  console.log('[faceModel] ImageData:', typeof ImageData, ImageData?.name)
  
  faceapi.env.monkeyPatch({
    Canvas,
    Image,
    ImageData,
    fetch,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
  })
  
  console.log('[faceModel] Environment patched, setting up TensorFlow backend...')
  // Use face-api's bundled TensorFlow, just set the backend
  await faceapi.tf.setBackend('cpu')
  await faceapi.tf.ready()
  console.log('[faceModel] TensorFlow backend ready')

  console.log('[faceModel] Downloading/loading models...')
  const modelPath = await ensureModels()
  console.log('[faceModel] Models path:', modelPath)
  
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
    faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
    faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
  ])
  console.log('[faceModel] Models loaded successfully')

  initialized = true
  return { modelPath, faceapi }
}

export { initFaceApi, faceapiInstance as faceapi, loadImage, imageToCanvas, canvasToTensor, MODEL_DIR }

