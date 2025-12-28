import { useState } from 'react'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const toSrc = (val) => {
  if (!val) return ''
  if (val.startsWith('http') || val.startsWith('data:') || val.startsWith('blob:')) return val
  return `${API_BASE}/api/file?path=${encodeURIComponent(val)}`
}

const LazyImage = ({
  src,
  alt,
  className,
  imgClassName,
  placeholderClassName,
  onClick,
  onLoad,
  ...props
}) => {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const displaySrc = toSrc(src)

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
        <img
          src={displaySrc}
          alt={alt}
          className={cn(
            'h-full w-full object-cover transition duration-200',
            loaded ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
          loading="lazy"
          onLoad={(e) => {
            setLoaded(true)
            onLoad?.(e)
          }}
          onError={() => setErrored(true)}
          onClick={onClick}
          {...props}
        />
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

