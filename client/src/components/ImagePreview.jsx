import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import LazyImage from './LazyImage'

const ImagePreview = ({
  src,
  alt,
  onNext,
  onPrevious,
  currentIndex = 0,
  totalCount = 0,
  onOpen,
}) => {
  const hasImage = Boolean(src)

  return (
    <div className="relative flex h-[360px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>תצוגה מקדימה</span>
        <span className="flex items-center gap-2">
          <ZoomIn className="h-4 w-4 text-sky-400" />
          {totalCount ? `${currentIndex + 1}/${totalCount}` : '0/0'}
        </span>
      </div>

      <div className="relative mt-4 flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/60">
        {hasImage ? (
          <LazyImage
            src={src}
            alt={alt || 'preview'}
            className="flex max-h-full max-w-full items-center justify-center rounded-lg"
            imgClassName="max-h-full max-w-full object-contain cursor-zoom-in"
            placeholderClassName="w-full h-full min-h-[240px]"
            onClick={onOpen}
            role={onOpen ? 'button' : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onKeyDown={(e) => {
              if (!onOpen) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen()
              }
            }}
          />
        ) : (
          <div className="text-center text-slate-500">אין תמונה להצגה</div>
        )}

        <button
          type="button"
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900/80 p-2 text-slate-100 shadow-lg',
            'hover:border-sky-500 hover:text-sky-200',
          )}
          onClick={onPrevious}
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <button
          type="button"
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900/80 p-2 text-slate-100 shadow-lg',
            'hover:border-sky-500 hover:text-sky-200',
          )}
          onClick={onNext}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

export default ImagePreview

