import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const toSrc = (val) => {
  if (!val) return ''
  if (
    val.startsWith('http') ||
    val.startsWith('data:') ||
    val.startsWith('blob:')
  ) {
    return val
  }
  return `${API_BASE}/api/file?path=${encodeURIComponent(val)}`
}

const ImageGrid = ({ images = [], selectedIndex = 0, onSelect }) => {
  if (!images.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-slate-500">
        אין תמונות להצגה
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="mb-3 text-sm font-medium text-slate-200">גריד תמונות</p>
      <div className="grid max-h-[220px] grid-cols-6 gap-2 overflow-auto p-1 sm:grid-cols-8">
        {images.map((img, idx) => (
          <button
            key={img}
            type="button"
            onClick={() => onSelect?.(idx)}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-md border transition',
              idx === selectedIndex
                ? 'border-sky-500 ring-2 ring-sky-500/30'
                : 'border-slate-800 hover:border-slate-600',
            )}
          >
            <img
              src={toSrc(img)}
              alt={`thumb-${idx}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {idx === selectedIndex && (
              <span className="absolute inset-0 border-2 border-sky-500/70"></span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ImageGrid

