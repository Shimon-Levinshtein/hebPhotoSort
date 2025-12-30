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

const guessMime = (src) => {
  if (!src) return undefined
  const clean = src.split('?')[0].toLowerCase()
  if (clean.endsWith('.mp4')) return 'video/mp4'
  if (clean.endsWith('.webm')) return 'video/webm'
  if (clean.endsWith('.mov')) return 'video/quicktime'
  if (clean.endsWith('.avi')) return 'video/x-msvideo'
  if (clean.endsWith('.mkv')) return 'video/x-matroska'
  if (clean.endsWith('.m4v')) return 'video/x-m4v'
  return undefined
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
  const [triedPoster, setTriedPoster] = useState(false)

  const baseSrc = toSrc(src)
  const isVideo = isVideoSrc(baseSrc)
  const displaySrc = baseSrc

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
      {isVideo && errored ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-slate-400">
          <div>לא ניתן לנגן בדפדפן</div>
          {posterSrc ? (
            <img
              src={posterSrc}
              alt={alt || 'poster'}
              className="h-24 w-24 rounded border border-slate-800 object-cover"
            />
          ) : null}
          <a
            href={baseSrc}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-slate-800 px-3 py-1 text-slate-100 hover:bg-slate-700"
          >
            פתח / הורד וידאו
          </a>
        </div>
      ) : !errored && displaySrc ? (
        isVideo ? (
          <video
            className={commonClassName}
            muted={videoMuted}
            loop={videoLoop}
            playsInline
            controls={videoControls}
            poster={posterSrc || undefined}
            onLoadedData={() => setLoaded(true)}
            onError={() => {
              if (!triedPoster) {
                setTriedPoster(true)
                setPosterSrc(`${API_BASE}/api/poster?path=${encodeURIComponent(src)}`)
                setErrored(false)
                setLoaded(false)
              } else {
                setErrored(true)
              }
            }}
            onClick={onClick}
            {...props}
          >
            <source src={displaySrc} type={guessMime(displaySrc)} />
          </video>
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

