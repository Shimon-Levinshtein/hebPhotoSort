import { useState } from 'react'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const VIDEO_EXT = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']

const toSrc = (val) => {
  if (!val) return ''
  if (val.startsWith('http') || val.startsWith('data:') || val.startsWith('blob:')) return val
  return `${API_BASE}/api/file?path=${encodeURIComponent(val)}`
}

const isVideoSrc = (val) => {
  if (!val) return false
  const hasExt = (candidate = '') => {
    const lower = candidate.toLowerCase()
    return VIDEO_EXT.some((ext) => lower.endsWith(ext))
  }

  if (hasExt(val)) return true
  try {
    const urlObj = new URL(val, window.location.origin)
    if (hasExt(urlObj.pathname)) return true
    const pathParam = urlObj.searchParams.get('path') || urlObj.searchParams.get('file')
    if (pathParam && hasExt(decodeURIComponent(pathParam))) return true
  } catch {
    // ignore parsing errors
  }
  return false
}

const LazyImage = ({
  src,
  alt,
  className,
  imgClassName,
  placeholderClassName,
  onClick,
  onLoad,
  videoControls = false,
  videoMuted = true,
  videoLoop = true,
  ...props
}) => {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const [posterSrc, setPosterSrc] = useState(null)

  const baseSrc = toSrc(src)
  const displaySrc = posterSrc || baseSrc
  const isVideo = !posterSrc && isVideoSrc(baseSrc)

  const commonClassName = cn(
    'h-full w-full object-cover transition duration-200',
    loaded ? 'opacity-100' : 'opacity-0',
    imgClassName,
  )

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-slate-900/70',
        !loaded && 'animate-pulse',
        placeholderClassName,
        className,
      )}
    >
      {!errored && displaySrc ? (
        isVideo ? (
          <video
            src={displaySrc}
            className={commonClassName}
            muted={videoMuted}
            loop={videoLoop}
            playsInline
            controls={videoControls}
            onLoadedData={() => setLoaded(true)}
            onError={() => {
              // נסיון שני: אם וידאו נכשל, בקש פוסטר מהשרת
              if (!posterSrc) {
                setPosterSrc(`${API_BASE}/api/poster?path=${encodeURIComponent(src)}`)
                setErrored(false)
                setLoaded(false)
              } else {
                setErrored(true)
              }
            }}
            onClick={onClick}
            {...props}
          />
        ) : (
          <img
            src={displaySrc}
            alt={alt}
            className={commonClassName}
            loading="lazy"
            onLoad={(e) => {
              setLoaded(true)
              onLoad?.(e)
            }}
            onError={() => setErrored(true)}
            onClick={onClick}
            {...props}
          />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
          לא נטען
        </div>
      )}
      {!loaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800/80 via-slate-700/60 to-slate-900/80" />
      )}
    </div>
  )
}

export default LazyImage

