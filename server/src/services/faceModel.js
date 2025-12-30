import path from 'node:path'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import * as tf from '@tensorflow/tfjs'
import { Canvas, Image, ImageData, loadImage } from '@napi-rs/canvas'
import fetch from 'node-fetch'
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util'

const MODEL_DIR = path.join(process.cwd(), 'models', 'face-api')
const MODEL_BASE_URL = 'https://github.com/vladmandic/face-api/raw/master/model'
const MODEL_FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1.bin',
]

let initialized = false
let faceapiInstance = null

const loadFaceApi = async () => {
  if (faceapiInstance) return faceapiInstance
  // Polyfill Web TextEncoder/Decoder and util.* for face-api on Node 25+
  if (!globalThis.TextEncoder) globalThis.TextEncoder = NodeTextEncoder
  if (!globalThis.TextDecoder) globalThis.TextDecoder = NodeTextDecoder
  if (!globalThis.util) globalThis.util = {}
  globalThis.util.TextEncoder = NodeTextEncoder
  globalThis.util.TextDecoder = NodeTextDecoder
  const mod = await import('@vladmandic/face-api/dist/face-api.esm.js')
  faceapiInstance = mod
  return mod
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
      // אם הורדה נכשלה, השאר את השגיאה כדי שהקריאה תדע לעדכן את המשתמש
      throw err
    }
  }
  return dir
}

const initFaceApi = async () => {
  if (initialized) return { modelPath: MODEL_DIR, faceapi: faceapiInstance }

  const faceapi = await loadFaceApi()
  faceapi.env.monkeyPatch({
    Canvas,
    Image,
    ImageData,
    fetch,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
  })
  faceapi.tf = tf
  await tf.setBackend('cpu')
  await tf.ready()

  const modelPath = await ensureModels()
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
    faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
    faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
  ])

  initialized = true
  return { modelPath, faceapi }
}

export { initFaceApi, faceapiInstance as faceapi, loadImage, MODEL_DIR }

