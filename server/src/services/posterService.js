import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { isVideo } from './fileService.js'

const POSTER_DIR = path.join(os.tmpdir(), 'hebphotosort-posters')

const ensurePosterDir = async () => {
  await fs.mkdir(POSTER_DIR, { recursive: true })
  return POSTER_DIR
}

const posterName = (sourcePath) =>
  crypto.createHash('md5').update(sourcePath).digest('hex') + '.jpg'

const extractFrame = async (filePath) => {
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

const getPosterPath = async (sourcePath) => {
  if (!isVideo(sourcePath)) return null
  const dir = await ensurePosterDir()
  const target = path.join(dir, posterName(sourcePath))
  if (fssync.existsSync(target)) return target

  const frame = await extractFrame(sourcePath)
  if (!frame) return null
  await fs.writeFile(target, frame)
  return target
}

export { getPosterPath }


