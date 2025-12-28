import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import LazyImage from './LazyImage'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const toSrc = (val) => {
  if (!val) return ''
  if (val.startsWith('http') || val.startsWith('data:') || val.startsWith('blob:')) return val
  return `${API_BASE}/api/file?path=${encodeURIComponent(val)}`
}

const LightboxModal = ({ open, src, alt, onClose }) => {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const displaySrc = toSrc(src)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="relative max-h-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={cn(
            'absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-100 shadow-lg',
            'hover:border-sky-500 hover:text-sky-100',
          )}
          onClick={onClose}
          aria-label="סגור תצוגה"
        >
          <X className="h-5 w-5" />
        </button>

        {displaySrc ? (
          <LazyImage
            src={displaySrc}
            alt={alt || 'preview'}
            className="flex max-h-[80vh] max-w-full items-center justify-center bg-slate-950"
            imgClassName="max-h-[80vh] max-w-full object-contain"
            placeholderClassName="min-h-[320px] min-w-[320px]"
          />
        ) : (
          <div className="p-10 text-center text-slate-300">אין תמונה להצגה</div>
        )}

        {alt && (
          <div className="border-t border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
            {alt}
          </div>
        )}
      </div>
    </div>
  )
}

export default LightboxModal

