import { cn } from '@/lib/utils'
import LazyImage from './LazyImage'

const ImageGrid = ({ images = [], selectedIndex = 0, onSelect, onImageClick }) => {
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
            onClick={() => {
              onSelect?.(idx)
              onImageClick?.(img, idx)
            }}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-md border transition',
              idx === selectedIndex
                ? 'border-sky-500 ring-2 ring-sky-500/30'
                : 'border-slate-800 hover:border-slate-600',
            )}
          >
            <LazyImage
              src={img}
              alt={`thumb-${idx}`}
              className="h-full w-full"
              imgClassName="object-cover"
              placeholderClassName="min-h-[72px]"
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

