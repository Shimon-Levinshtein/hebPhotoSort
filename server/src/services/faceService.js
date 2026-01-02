import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import exif from 'exif-parser'
import { cleanPath, isImage, isVideo, isMedia } from './fileService.js'
import { initFaceApi, loadImage, imageToCanvas, canvasToTensor } from './faceModel.js'
import logger from '../utils/logger.js'

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

/**
 * Detect if file was likely sent/received via WhatsApp
 * @param {string} filePath 
 * @param {object} exifTags - EXIF tags from parser
 * @returns {object|null} WhatsApp detection info
 */
const detectWhatsApp = (filePath, exifTags) => {
  const filename = path.basename(filePath)
  const result = {
    isWhatsApp: false,
    confidence: 'none',
    indicators: []
  }
  
  // Check filename patterns
  // WhatsApp images: IMG-YYYYMMDD-WAxxxx.jpg or WhatsApp Image YYYY-MM-DD at HH.MM.SS.jpeg
  if (/IMG-\d{8}-WA\d+/i.test(filename)) {
    result.isWhatsApp = true
    result.indicators.push('שם קובץ בפורמט WhatsApp (IMG-DATE-WA)')
    result.confidence = 'high'
  } else if (/WhatsApp\s*(Image|Video)/i.test(filename)) {
    result.isWhatsApp = true
    result.indicators.push('שם קובץ מכיל "WhatsApp"')
    result.confidence = 'high'
  }
  
  // Check EXIF software tag
  if (exifTags?.Software && /whatsapp/i.test(exifTags.Software)) {
    result.isWhatsApp = true
    result.indicators.push('תוכנה: WhatsApp')
    result.confidence = 'high'
  }
  
  // Check if EXIF is mostly stripped (WhatsApp strips most EXIF)
  // If we have a filename pattern but no GPS/camera data, likely WhatsApp
  if (result.isWhatsApp && !exifTags?.GPSLatitude && !exifTags?.Make) {
    result.indicators.push('EXIF מופשט (טיפוסי ל-WhatsApp)')
  }
  
  // Check for typical WhatsApp dimensions (compressed)
  // WhatsApp often compresses to max 1600px on longest side
  
  return result.isWhatsApp ? result : null
}

/**
 * Convert GPS coordinates to decimal degrees
 * @param {number} coord - GPS coordinate from EXIF
 * @param {string} ref - N/S or E/W reference
 * @returns {number} Decimal degrees
 */
const gpsToDecimal = (coord, ref) => {
  if (coord == null) return null
  let decimal = coord
  if (ref === 'S' || ref === 'W') {
    decimal = -decimal
  }
  return decimal
}

/**
 * Convert exposure program code to Hebrew description
 */
const exposureProgramToHebrew = (code) => {
  const programs = {
    0: 'לא מוגדר',
    1: 'ידני',
    2: 'תוכנית רגילה',
    3: 'עדיפות צמצם',
    4: 'עדיפות מהירות',
    5: 'יצירתי (עומק שדה)',
    6: 'פעולה (מהירות גבוהה)',
    7: 'פורטרט',
    8: 'נוף'
  }
  return programs[code] || `קוד ${code}`
}

/**
 * Convert metering mode code to Hebrew description
 */
const meteringModeToHebrew = (code) => {
  const modes = {
    0: 'לא ידוע',
    1: 'ממוצע',
    2: 'ממוצע משוקלל למרכז',
    3: 'נקודתי',
    4: 'רב-נקודתי',
    5: 'דפוס (מטריקס)',
    6: 'חלקי',
    255: 'אחר'
  }
  return modes[code] || `קוד ${code}`
}

/**
 * Convert flash code to Hebrew description
 */
const flashToHebrew = (code) => {
  if (code == null) return null
  const fired = code & 1
  const returnMode = (code >> 1) & 3
  const mode = (code >> 3) & 3
  const redEye = (code >> 6) & 1
  
  let desc = fired ? 'הבזק הופעל' : 'הבזק לא הופעל'
  if (mode === 1) desc += ', הבזק כפוי'
  else if (mode === 2) desc += ', הבזק מבוטל'
  else if (mode === 3) desc += ', הבזק אוטומטי'
  if (redEye) desc += ', הפחתת עיניים אדומות'
  
  return desc
}

/**
 * Convert white balance code to Hebrew
 */
const whiteBalanceToHebrew = (code) => {
  const modes = {
    0: 'אוטומטי',
    1: 'ידני'
  }
  return modes[code] || `קוד ${code}`
}

/**
 * Convert scene capture type to Hebrew
 */
const sceneCaptureTypeToHebrew = (code) => {
  const types = {
    0: 'רגיל',
    1: 'נוף',
    2: 'פורטרט',
    3: 'לילה'
  }
  return types[code] || `קוד ${code}`
}

/**
 * Convert light source to Hebrew
 */
const lightSourceToHebrew = (code) => {
  const sources = {
    0: 'לא ידוע',
    1: 'אור יום',
    2: 'פלורסנט',
    3: 'טונגסטן (נורה רגילה)',
    4: 'הבזק',
    9: 'מזג אוויר נאה',
    10: 'מעונן',
    11: 'צל',
    12: 'פלורסנט אור יום',
    13: 'פלורסנט לבן יום',
    14: 'פלורסנט לבן קר',
    15: 'פלורסנט לבן',
    17: 'אור רגיל A',
    18: 'אור רגיל B',
    19: 'אור רגיל C',
    20: 'D55',
    21: 'D65',
    22: 'D75',
    23: 'D50',
    24: 'טונגסטן סטודיו ISO',
    255: 'מקור אור אחר'
  }
  return sources[code] || `קוד ${code}`
}

/**
 * Convert orientation code to Hebrew
 */
const orientationToHebrew = (code) => {
  const orientations = {
    1: 'רגיל (0°)',
    2: 'היפוך אופקי',
    3: 'סיבוב 180°',
    4: 'היפוך אנכי',
    5: 'סיבוב 90° + היפוך אופקי',
    6: 'סיבוב 90° ימינה',
    7: 'סיבוב 90° + היפוך אנכי',
    8: 'סיבוב 90° שמאלה'
  }
  return orientations[code] || `קוד ${code}`
}

/**
 * Convert color space code to name
 */
const colorSpaceToName = (code) => {
  const spaces = {
    1: 'sRGB',
    2: 'Adobe RGB',
    65535: 'Uncalibrated'
  }
  return spaces[code] || `קוד ${code}`
}

/**
 * Format exposure time as fraction
 */
const formatExposureTime = (seconds) => {
  if (seconds == null) return null
  if (seconds >= 1) return `${seconds}s`
  const fraction = Math.round(1 / seconds)
  return `1/${fraction}s`
}

/**
 * Format aperture value
 */
const formatAperture = (fNumber) => {
  if (fNumber == null) return null
  return `f/${fNumber}`
}

/**
 * Format focal length
 */
const formatFocalLength = (mm) => {
  if (mm == null) return null
  return `${mm}mm`
}

/**
 * Get detailed file metadata including size, dimensions, EXIF - ALL possible data
 * @param {string} filePath 
 * @returns {object} File metadata
 */
const getFileMetadata = async (filePath) => {
  const metadata = {
    fileSize: null,
    width: null,
    height: null,
    extension: path.extname(filePath).toLowerCase(),
    fileType: isImage(filePath) ? 'image' : isVideo(filePath) ? 'video' : 'unknown',
    exif: null,
    camera: null,
    lens: null,
    settings: null,
    image: null,
    dates: null,
    gps: null,
    author: null,
    software: null,
    whatsapp: null,
    source: null,
    raw: null // All raw EXIF tags for debugging/completeness
  }
  
  try {
    // Get file size and filesystem dates
    const stat = await fs.stat(filePath)
    metadata.fileSize = stat.size
    metadata.fileCreated = stat.birthtime?.toISOString() || null
    metadata.fileModified = stat.mtime?.toISOString() || null
    metadata.fileAccessed = stat.atime?.toISOString() || null
    
    // Get image dimensions and EXIF data
    if (isImage(filePath)) {
      try {
        // Get dimensions and format info using sharp
        const sharpMeta = await sharp(filePath).metadata()
        metadata.width = sharpMeta.width
        metadata.height = sharpMeta.height
        metadata.image = {
          width: sharpMeta.width,
          height: sharpMeta.height,
          megapixels: sharpMeta.width && sharpMeta.height 
            ? ((sharpMeta.width * sharpMeta.height) / 1000000).toFixed(1) + ' MP'
            : null,
          aspectRatio: sharpMeta.width && sharpMeta.height
            ? (sharpMeta.width / sharpMeta.height).toFixed(2)
            : null,
          format: sharpMeta.format || null,
          space: sharpMeta.space || null, // color space from sharp
          channels: sharpMeta.channels || null,
          depth: sharpMeta.depth || null, // bit depth
          density: sharpMeta.density || null, // DPI
          hasAlpha: sharpMeta.hasAlpha || false,
          hasProfile: sharpMeta.hasProfile || false,
          isProgressive: sharpMeta.isProgressive || false
        }
        
        // Try to get EXIF data
        try {
          const buf = await fs.readFile(filePath)
          const parser = exif.create(buf)
          const result = parser.parse()
          const tags = result.tags || {}
          
          // Store ALL raw tags for completeness
          metadata.raw = { ...tags }
          
          // ========== CAMERA INFO ==========
          metadata.camera = {
            make: tags.Make || null,
            model: tags.Model || null,
            serialNumber: tags.BodySerialNumber || tags.SerialNumber || null,
            ownerName: tags.CameraOwnerName || tags.OwnerName || null,
            firmware: tags.Firmware || null
          }
          
          // ========== LENS INFO ==========
          metadata.lens = {
            make: tags.LensMake || null,
            model: tags.LensModel || tags.Lens || null,
            serialNumber: tags.LensSerialNumber || null,
            focalLengthMin: tags.LensInfo?.[0] || null,
            focalLengthMax: tags.LensInfo?.[1] || null,
            apertureMin: tags.LensInfo?.[2] || null,
            apertureMax: tags.LensInfo?.[3] || null
          }
          
          // ========== CAMERA SETTINGS ==========
          metadata.settings = {
            // Exposure
            exposureTime: tags.ExposureTime || null,
            exposureTimeFormatted: formatExposureTime(tags.ExposureTime),
            aperture: tags.FNumber || null,
            apertureFormatted: formatAperture(tags.FNumber),
            iso: tags.ISO || tags.ISOSpeedRatings || null,
            exposureProgram: tags.ExposureProgram || null,
            exposureProgramDesc: exposureProgramToHebrew(tags.ExposureProgram),
            exposureMode: tags.ExposureMode || null, // 0=auto, 1=manual, 2=bracket
            exposureCompensation: tags.ExposureCompensation || tags.ExposureBiasValue || null,
            
            // Focus & Zoom
            focalLength: tags.FocalLength || null,
            focalLengthFormatted: formatFocalLength(tags.FocalLength),
            focalLength35mm: tags.FocalLengthIn35mmFormat || null,
            subjectDistance: tags.SubjectDistance || null,
            subjectDistanceRange: tags.SubjectDistanceRange || null, // 0=unknown, 1=macro, 2=close, 3=distant
            digitalZoomRatio: tags.DigitalZoomRatio || null,
            
            // Metering & Flash
            meteringMode: tags.MeteringMode || null,
            meteringModeDesc: meteringModeToHebrew(tags.MeteringMode),
            flash: tags.Flash || null,
            flashDesc: flashToHebrew(tags.Flash),
            flashEnergy: tags.FlashEnergy || null,
            
            // White Balance & Light
            whiteBalance: tags.WhiteBalance || null,
            whiteBalanceDesc: whiteBalanceToHebrew(tags.WhiteBalance),
            lightSource: tags.LightSource || null,
            lightSourceDesc: lightSourceToHebrew(tags.LightSource),
            
            // Scene
            sceneCaptureType: tags.SceneCaptureType || null,
            sceneCaptureTypeDesc: sceneCaptureTypeToHebrew(tags.SceneCaptureType),
            sceneType: tags.SceneType || null, // 1=directly photographed
            
            // Image adjustments
            contrast: tags.Contrast || null, // 0=normal, 1=soft, 2=hard
            saturation: tags.Saturation || null, // 0=normal, 1=low, 2=high
            sharpness: tags.Sharpness || null, // 0=normal, 1=soft, 2=hard
            brightness: tags.BrightnessValue || null,
            gainControl: tags.GainControl || null, // 0=none, 1=low up, 2=high up, 3=low down, 4=high down
            
            // Other
            sensingMethod: tags.SensingMethod || null, // 2=one-chip color area
            fileSource: tags.FileSource || null, // 3=digital camera
            customRendered: tags.CustomRendered || null // 0=normal, 1=custom
          }
          
          // ========== IMAGE INFO ==========
          metadata.image = {
            ...metadata.image,
            orientation: tags.Orientation || null,
            orientationDesc: orientationToHebrew(tags.Orientation),
            colorSpace: tags.ColorSpace || null,
            colorSpaceName: colorSpaceToName(tags.ColorSpace),
            
            // Resolution
            xResolution: tags.XResolution || null,
            yResolution: tags.YResolution || null,
            resolutionUnit: tags.ResolutionUnit || null, // 2=inches, 3=cm
            
            // Compression
            compression: tags.Compression || null,
            compressedBitsPerPixel: tags.CompressedBitsPerPixel || null,
            
            // Technical
            bitsPerSample: tags.BitsPerSample || null,
            samplesPerPixel: tags.SamplesPerPixel || null,
            photometricInterpretation: tags.PhotometricInterpretation || null,
            yCbCrPositioning: tags.YCbCrPositioning || null,
            
            // Versions
            exifVersion: tags.ExifVersion || null,
            flashpixVersion: tags.FlashpixVersion || null,
            
            // Unique ID
            imageUniqueId: tags.ImageUniqueID || null
          }
          
          // ========== DATES ==========
          metadata.dates = {
            taken: tags.DateTimeOriginal 
              ? new Date(tags.DateTimeOriginal * 1000).toISOString() 
              : null,
            digitized: tags.CreateDate || tags.DateTimeDigitized
              ? new Date((tags.CreateDate || tags.DateTimeDigitized) * 1000).toISOString()
              : null,
            modified: tags.ModifyDate || tags.DateTime
              ? new Date((tags.ModifyDate || tags.DateTime) * 1000).toISOString()
              : null,
            // Sub-second precision
            subSecTimeOriginal: tags.SubSecTimeOriginal || null,
            subSecTimeDigitized: tags.SubSecTimeDigitized || null,
            // Timezone offset
            offsetTime: tags.OffsetTime || null,
            offsetTimeOriginal: tags.OffsetTimeOriginal || null,
            offsetTimeDigitized: tags.OffsetTimeDigitized || null
          }
          
          // ========== GPS DATA ==========
          if (tags.GPSLatitude != null && tags.GPSLongitude != null) {
            const lat = gpsToDecimal(tags.GPSLatitude, tags.GPSLatitudeRef)
            const lng = gpsToDecimal(tags.GPSLongitude, tags.GPSLongitudeRef)
            
            if (lat != null && lng != null) {
              metadata.gps = {
                latitude: lat,
                longitude: lng,
                latitudeRef: tags.GPSLatitudeRef || null, // N or S
                longitudeRef: tags.GPSLongitudeRef || null, // E or W
                altitude: tags.GPSAltitude || null,
                altitudeRef: tags.GPSAltitudeRef || null, // 0=above sea level, 1=below
                
                // Direction
                imgDirection: tags.GPSImgDirection || null,
                imgDirectionRef: tags.GPSImgDirectionRef || null, // T=true north, M=magnetic
                destBearing: tags.GPSDestBearing || null,
                destBearingRef: tags.GPSDestBearingRef || null,
                
                // Speed (if moving while taking photo)
                speed: tags.GPSSpeed || null,
                speedRef: tags.GPSSpeedRef || null, // K=km/h, M=mph, N=knots
                
                // Date/Time
                timestamp: tags.GPSTimeStamp || null,
                datestamp: tags.GPSDateStamp || null,
                
                // Accuracy
                dop: tags.GPSDOP || null, // Dilution of Precision
                measureMode: tags.GPSMeasureMode || null, // 2=2D, 3=3D
                
                // Processing
                processingMethod: tags.GPSProcessingMethod || null,
                areaInformation: tags.GPSAreaInformation || null,
                satellites: tags.GPSSatellites || null,
                status: tags.GPSStatus || null, // A=active, V=void
                mapDatum: tags.GPSMapDatum || null,
                
                // Links
                mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
                wazeUrl: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
                osmUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=15`,
                
                // Formatted
                formatted: `${Math.abs(lat).toFixed(6)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(6)}°${lng >= 0 ? 'E' : 'W'}`
              }
            }
          }
          
          // ========== AUTHOR & COPYRIGHT ==========
          metadata.author = {
            artist: tags.Artist || null,
            copyright: tags.Copyright || null,
            ownerName: tags.CameraOwnerName || tags.OwnerName || null,
            imageDescription: tags.ImageDescription || null,
            userComment: tags.UserComment || null,
            documentName: tags.DocumentName || null,
            rating: tags.Rating || null, // 0-5 star rating
            ratingPercent: tags.RatingPercent || null
          }
          
          // ========== SOFTWARE ==========
          metadata.software = {
            software: tags.Software || null,
            processingSoftware: tags.ProcessingSoftware || null,
            hostComputer: tags.HostComputer || null
          }
          
          // ========== BACKWARD COMPATIBLE EXIF ==========
          metadata.exif = {
            make: tags.Make || null,
            model: tags.Model || null,
            dateTaken: metadata.dates?.taken,
            dateDigitized: metadata.dates?.digitized,
            orientation: tags.Orientation || null,
            focalLength: tags.FocalLength || null,
            focalLength35mm: tags.FocalLengthIn35mmFormat || null,
            iso: tags.ISO || tags.ISOSpeedRatings || null,
            aperture: tags.FNumber || null,
            exposureTime: tags.ExposureTime || null,
            exposureProgram: tags.ExposureProgram || null,
            exposureCompensation: tags.ExposureCompensation || null,
            meteringMode: tags.MeteringMode || null,
            flash: tags.Flash || null,
            whiteBalance: tags.WhiteBalance || null,
            colorSpace: tags.ColorSpace || null,
            software: tags.Software || null,
            artist: tags.Artist || null,
            copyright: tags.Copyright || null,
            imageDescription: tags.ImageDescription || null,
            userComment: tags.UserComment || null
          }
          
          // ========== WHATSAPP DETECTION ==========
          metadata.whatsapp = detectWhatsApp(filePath, tags)
          
          // ========== SOURCE DETECTION ==========
          const filename = path.basename(filePath).toLowerCase()
          const fullPath = filePath.toLowerCase()
          
          // Detect source based on various indicators
          if (/telegram/i.test(filename) || /telegram/i.test(tags.Software || '')) {
            metadata.source = { type: 'telegram', confidence: 'high', indicator: 'filename/software' }
          } else if (/screenshot/i.test(filename) || /screen\s*shot/i.test(filename)) {
            metadata.source = { type: 'screenshot', confidence: 'high', indicator: 'filename' }
          } else if (/snapseed/i.test(tags.Software || '')) {
            metadata.source = { type: 'snapseed', confidence: 'high', indicator: 'software' }
          } else if (/lightroom/i.test(tags.Software || '')) {
            metadata.source = { type: 'lightroom', confidence: 'high', indicator: 'software' }
          } else if (/photoshop/i.test(tags.Software || '')) {
            metadata.source = { type: 'photoshop', confidence: 'high', indicator: 'software' }
          } else if (/instagram/i.test(filename) || /instagram/i.test(tags.Software || '')) {
            metadata.source = { type: 'instagram', confidence: 'high', indicator: 'filename/software' }
          } else if (/facebook/i.test(filename) || /fb_img/i.test(filename)) {
            metadata.source = { type: 'facebook', confidence: 'high', indicator: 'filename' }
          } else if (/messenger/i.test(filename)) {
            metadata.source = { type: 'messenger', confidence: 'high', indicator: 'filename' }
          } else if (/dcim/i.test(fullPath)) {
            metadata.source = { type: 'camera', confidence: 'medium', indicator: 'path contains DCIM' }
          } else if (metadata.whatsapp?.isWhatsApp) {
            metadata.source = { type: 'whatsapp', confidence: metadata.whatsapp.confidence, indicator: metadata.whatsapp.indicators.join(', ') }
          } else if (tags.Make && tags.Model) {
            metadata.source = { type: 'camera', confidence: 'medium', indicator: 'has camera EXIF' }
          }
          
        } catch (exifErr) {
          // EXIF parsing failed, continue without it
          logger.log('[faceService] EXIF parsing failed for', filePath, exifErr.message)
        }
      } catch (sharpErr) {
        logger.log('[faceService] Sharp metadata failed for', filePath, sharpErr.message)
      }
    } else if (isVideo(filePath)) {
      // For videos, we could use ffprobe to get dimensions, but keeping it simple for now
      // Could add video metadata extraction later
      metadata.source = { type: 'video', confidence: 'high', indicator: 'file extension' }
    }
  } catch (err) {
    logger.error('[faceService] getFileMetadata failed:', err.message)
  }
  
  return metadata
}

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
      logger.log('[faceService] Cache version mismatch, will rescan all')
      return null
    }
    
    logger.log(`[faceService] Loaded cache with ${Object.keys(cache.files || {}).length} files`)
    return cache
  } catch (err) {
    logger.error('[faceService] Failed to load cache:', err.message)
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
    logger.log(`[faceService] Cache saved with ${Object.keys(data.files).length} files`)
  } catch (err) {
    logger.error('[faceService] Failed to save cache:', err.message)
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
    logger.error('[faceService] buildFaceThumb failed:', err.message)
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

const createLimiter = (limit = 2, signal = null) => {
  let active = 0
  const queue = []
  let cancelledLogged = false
  
  const isCancelled = () => signal?.aborted === true
  
  const clearQueue = () => {
    if (!cancelledLogged && queue.length > 0) {
      logger.log(`[faceService] Limiter cancelled, clearing ${queue.length} queued tasks`)
      cancelledLogged = true
    }
    // Clear the queue and resolve all pending with skipped flag
    while (queue.length) {
      const { resolve } = queue.shift()
      resolve({ skipped: true })
    }
  }
  
  const runNext = () => {
    // Stop processing queue if cancelled
    if (isCancelled()) {
      clearQueue()
      return
    }
    if (!queue.length || active >= limit) return
    const { task, resolve, reject } = queue.shift()
    active += 1
    task().then(resolve).catch(reject).finally(() => {
      active -= 1
      runNext()
    })
  }
  
  // Listen for abort signal to immediately clear the queue
  if (signal) {
    signal.addEventListener('abort', () => {
      logger.log('[faceService] Abort signal received, clearing queue immediately')
      clearQueue()
    }, { once: true })
  }
  
  return async (fn) =>
    new Promise((resolve, reject) => {
      // If already cancelled, skip immediately
      if (isCancelled()) {
        resolve({ skipped: true })
        return
      }
      
      const task = async () => {
        // Double-check cancellation when task actually starts
        if (isCancelled()) {
          return { skipped: true }
        }
        try {
          const res = await fn()
          return res
        } catch (err) {
          logger.error('[faceService] limiter task failed', err)
          throw err
        }
      }
      queue.push({ task, resolve, reject })
      runNext()
    })
}

const detectFacesInFile = async (filePath) => {
  logger.log('[faceService] detectFacesInFile:', filePath)
  
  let tensorInput = null
  let canvas = null
  try {
    let img = null
    if (isImage(filePath)) {
      logger.log('[faceService] Loading image...')
      img = await loadImage(filePath)
      logger.log('[faceService] Image loaded:', {
        width: img?.width,
        height: img?.height,
        type: typeof img,
        constructor: img?.constructor?.name
      })
    } else if (isVideo(filePath)) {
      logger.log('[faceService] Extracting video frame...')
      const frame = await extractVideoFrame(filePath)
      if (frame) {
        logger.log('[faceService] Frame extracted, loading as image...')
        img = await loadImage(frame)
      }
    }
    
    if (img) {
      // Convert image to canvas then to tensor - face-api accepts tf.Tensor3D
      logger.log('[faceService] Converting image to canvas...')
      canvas = imageToCanvas(img)
      logger.log('[faceService] Canvas created:', {
        width: canvas?.width,
        height: canvas?.height
      })
      
      logger.log('[faceService] Converting canvas to tensor...')
      tensorInput = canvasToTensor(canvas)
      logger.log('[faceService] Tensor created')
    }
  } catch (err) {
    logger.error('[faceService] Failed to load image:', err.message, err.stack)
    return []
  }

  if (!tensorInput) {
    logger.log('[faceService] No tensor input, skipping')
    return []
  }

  if (!faceapi) {
    logger.error('[faceService] faceapi not initialized!')
    return []
  }

  logger.log('[faceService] Running face detection...')
  logger.log('[faceService] faceapi.SsdMobilenetv1Options:', typeof faceapi.SsdMobilenetv1Options)
  
  try {
    const detections = await faceapi
      .detectAllFaces(tensorInput, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptors()

    logger.log('[faceService] Detection complete, found', detections.length, 'faces')
    
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
    logger.error('[faceService] Face detection failed:', err.message, err.stack)
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
  const { concurrency = 10, signal = null } = options
  logger.log('[faceService] scanFaces starting for:', sourcePath, 'concurrency:', concurrency)
  
  // Helper to check if scan was cancelled
  const isCancelled = () => signal?.aborted === true
  
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
  
  logger.log('[faceService] Initializing face-api...')
  const { faceapi: api } = await initFaceApi()
  faceapi = api
  logger.log('[faceService] face-api initialized, faceapi:', typeof faceapi)
  logger.log('[faceService] faceapi.nets:', Object.keys(faceapi?.nets || {}))

  // Report: collecting files
  if (onProgress) onProgress({ phase: 'collect', message: 'אוסף קבצי מדיה...' })
  
  const mediaFiles = await collectMedia(root)
  if (!mediaFiles.length) {
    if (onProgress) onProgress({ phase: 'done', current: 0, total: 0, facesFound: 0, faces: [] })
    return { faces: [], totalFiles: 0, groupCount: 0 }
  }
  
  // Check if cancelled after collecting files
  if (isCancelled()) {
    logger.log('[faceService] Scan cancelled after collecting files')
    return { faces: [], totalFiles: 0, groupCount: 0, cancelled: true }
  }

  // Load existing cache
  if (onProgress) onProgress({ phase: 'cache', message: 'בודק מטמון...' })
  const existingCache = await loadFaceCache(root)
  const { cached, toScan, removed } = await categorizeFiles(mediaFiles, existingCache)
  
  logger.log(`[faceService] Cache analysis: ${cached.length} cached, ${toScan.length} to scan, ${removed.length} removed`)
  
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

  const limiter = createLimiter(concurrency, signal)
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
      const fileStartTime = Date.now()
      
      // Track start of processing
      activeFiles.set(filename, { startTime: fileStartTime, path: file })
      sendProgressUpdate()
      
      const faces = await detectFacesInFile(file)
      
      const normalizedPath = file.replace(/\\/g, '/')
      const mtime = await getFileMtime(file)
      const processingTime = Date.now() - fileStartTime
      
      // Get additional file metadata
      const fileMeta = await getFileMetadata(file)
      
      // Store in cache (convert Float32Array to regular array for JSON)
      newCacheFiles[normalizedPath] = {
        mtime,
        scannedAt: new Date().toISOString(),
        processingTime, // Duration in ms
        facesCount: faces.length,
        // File metadata
        fileSize: fileMeta.fileSize,
        fileCreated: fileMeta.fileCreated,
        fileModified: fileMeta.fileModified,
        fileAccessed: fileMeta.fileAccessed,
        width: fileMeta.width,
        height: fileMeta.height,
        extension: fileMeta.extension,
        fileType: fileMeta.fileType,
        // Detailed metadata
        camera: fileMeta.camera,
        lens: fileMeta.lens,
        settings: fileMeta.settings,
        image: fileMeta.image,
        dates: fileMeta.dates,
        gps: fileMeta.gps,
        author: fileMeta.author,
        software: fileMeta.software,
        whatsapp: fileMeta.whatsapp,
        source: fileMeta.source,
        // Backward compatible
        exif: fileMeta.exif,
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
        logger.log(`[faceService] Cache saved at ${processed}/${totalToScan} files`)
      }
      
      // Report progress
      sendProgressUpdate()
      
      return { processed: true }
    })
  )
  
  // Wait for all scan tasks to complete (some may be skipped due to cancellation)
  await Promise.all(scanPromises)
  
  // If cancelled, save cache and return partial results
  if (isCancelled()) {
    logger.log('[faceService] Scan was cancelled, saving cache for resume...')
    await saveFaceCache(root, { files: newCacheFiles })
    
    const partialFaces = clustersToFaces(clusters)
    return {
      faces: partialFaces,
      totalFiles: mediaFiles.length,
      groupCount: partialFaces.length,
      cancelled: true,
      cacheStats: {
        cached: cached.length,
        scanned: processed,
        removed: removed.length
      }
    }
  }

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

/**
 * Get scan history from cache file
 * @param {string} sourcePath - Root directory that was scanned
 * @returns {object} Scan history data with files info
 */
const getScanHistory = async (sourcePath) => {
  const root = cleanPath(sourcePath)
  if (!root) throw new Error('sourcePath is required')
  if (!fssync.existsSync(root)) {
    const err = new Error(`Source path not found: ${root}`)
    err.code = 'ENOENT'
    throw err
  }
  
  const cache = await loadFaceCache(root)
  if (!cache) {
    return { files: [], lastScan: null, totalFiles: 0 }
  }
  
  // Convert cache files to array with more details
  const files = Object.entries(cache.files || {}).map(([filePath, data]) => ({
    path: filePath,
    filename: path.basename(filePath),
    mtime: data.mtime,
    scannedAt: data.scannedAt || null,
    processingTime: data.processingTime || null,
    facesCount: data.facesCount ?? data.faces?.length ?? 0,
    // File metadata
    fileSize: data.fileSize || null,
    fileCreated: data.fileCreated || null,
    fileModified: data.fileModified || null,
    fileAccessed: data.fileAccessed || null,
    width: data.width || null,
    height: data.height || null,
    extension: data.extension || path.extname(filePath).toLowerCase(),
    fileType: data.fileType || 'unknown',
    // Detailed metadata (ALL fields)
    camera: data.camera || null,
    lens: data.lens || null,
    settings: data.settings || null,
    image: data.image || null,
    dates: data.dates || null,
    gps: data.gps || null,
    author: data.author || null,
    software: data.software || null,
    whatsapp: data.whatsapp || null,
    source: data.source || null,
    // Backward compatible
    exif: data.exif || null,
    thumbnail: data.faces?.[0]?.thumbnail || filePath,
    faceThumb: data.faces?.[0]?.faceThumb || null
  }))
  
  // Sort by scannedAt (newest first)
  files.sort((a, b) => {
    if (!a.scannedAt && !b.scannedAt) return 0
    if (!a.scannedAt) return 1
    if (!b.scannedAt) return -1
    return new Date(b.scannedAt) - new Date(a.scannedAt)
  })
  
  // Calculate additional stats
  const totalSize = files.reduce((sum, f) => sum + (f.fileSize || 0), 0)
  const imagesCount = files.filter(f => f.fileType === 'image').length
  const videosCount = files.filter(f => f.fileType === 'video').length
  const filesWithExif = files.filter(f => f.dates?.taken || f.exif?.dateTaken).length
  const filesWithGps = files.filter(f => f.gps?.latitude).length
  const filesFromWhatsApp = files.filter(f => f.whatsapp?.isWhatsApp).length
  const filesFromTelegram = files.filter(f => f.source?.type === 'telegram').length
  const filesFromInstagram = files.filter(f => f.source?.type === 'instagram').length
  const filesFromFacebook = files.filter(f => f.source?.type === 'facebook').length
  const screenshots = files.filter(f => f.source?.type === 'screenshot').length
  const editedFiles = files.filter(f => 
    f.source?.type === 'photoshop' || 
    f.source?.type === 'lightroom' || 
    f.source?.type === 'snapseed'
  ).length
  
  // Camera stats
  const cameras = [...new Set(files.filter(f => f.camera?.model || f.exif?.model).map(f => f.camera?.model || f.exif?.model))]
  const lenses = [...new Set(files.filter(f => f.lens?.model).map(f => f.lens.model))]
  const softwareUsed = [...new Set(files.filter(f => f.software?.software || f.exif?.software).map(f => f.software?.software || f.exif?.software))]
  
  // Artists/Authors
  const artists = [...new Set(files.filter(f => f.author?.artist || f.exif?.artist).map(f => f.author?.artist || f.exif?.artist))]
  
  // Extensions breakdown
  const extensionCounts = {}
  files.forEach(f => {
    const ext = f.extension || 'unknown'
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1
  })
  
  // Resolution stats
  const resolutions = files
    .filter(f => f.width && f.height)
    .map(f => `${f.width}x${f.height}`)
  const uniqueResolutions = [...new Set(resolutions)]
  
  // ISO stats
  const isoValues = files
    .filter(f => f.settings?.iso || f.exif?.iso)
    .map(f => f.settings?.iso || f.exif?.iso)
  const avgIso = isoValues.length ? Math.round(isoValues.reduce((a, b) => a + b, 0) / isoValues.length) : null
  
  return {
    files,
    lastScan: cache.lastScan,
    totalFiles: files.length,
    stats: {
      // Processing stats
      totalProcessingTime: files.reduce((sum, f) => sum + (f.processingTime || 0), 0),
      avgProcessingTime: files.length ? Math.round(files.reduce((sum, f) => sum + (f.processingTime || 0), 0) / files.length) : 0,
      
      // Face stats
      totalFaces: files.reduce((sum, f) => sum + (f.facesCount || 0), 0),
      filesWithFaces: files.filter(f => f.facesCount > 0).length,
      
      // File stats
      totalSize,
      imagesCount,
      videosCount,
      filesWithExif,
      
      // Equipment
      cameras,
      lenses,
      softwareUsed,
      artists,
      
      // Location & source stats
      filesWithGps,
      filesFromWhatsApp,
      filesFromTelegram,
      filesFromInstagram,
      filesFromFacebook,
      screenshots,
      editedFiles,
      
      // Technical stats
      extensionCounts,
      uniqueResolutions: uniqueResolutions.slice(0, 20), // Limit to 20 most common
      avgIso
    }
  }
}

export { scanFaces, getScanHistory }

