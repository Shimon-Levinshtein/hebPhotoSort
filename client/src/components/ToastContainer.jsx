import { useEffect } from 'react'
import { useToastStore } from '@/store/toastStore'
import { cn } from '@/lib/utils'

const Toast = ({ id, title, description, variant, onClose, duration = 3500 }) => {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration)
    return () => clearTimeout(timer)
  }, [id, onClose, duration])

  return (
    <div
      className={cn(
        'w-80 rounded-lg border px-4 py-3 shadow-lg',
        'bg-slate-900/90 border-slate-800 text-slate-100',
        variant === 'success' && 'border-emerald-700 bg-emerald-900/70 text-emerald-50',
        variant === 'error' && 'border-rose-700 bg-rose-900/70 text-rose-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          {description ? (
            <p className="text-xs text-slate-200/90 leading-relaxed">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onClose(id)}
          className="text-xs text-slate-300 hover:text-slate-100"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore()
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-end gap-3 p-4">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onClose={removeToast} />
        </div>
      ))}
    </div>
  )
}

export default ToastContainer

