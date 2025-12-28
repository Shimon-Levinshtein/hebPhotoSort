import { FolderOpen, FolderSearch } from 'lucide-react'
import { cn } from '@/lib/utils'

const FolderPicker = ({
  label,
  value,
  onSelect,
  onChange,
  disabled = false,
  placeholder = 'הקלד נתיב מלא (לדוגמה: C:\\Photos\\Unsorted)',
}) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-slate-300">
        <FolderSearch className="h-5 w-5 text-sky-400" />
        <span className="text-sm font-medium">{label}</span>
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none ring-0 focus:border-sky-500"
        placeholder={placeholder}
        disabled={disabled}
      />

      <button
        type="button"
        className={cn(
          'mt-3 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold',
          'bg-sky-600 text-white shadow-sm transition hover:bg-sky-500',
          'disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300',
        )}
        onClick={onSelect}
        disabled={disabled}
      >
        <FolderOpen className="h-4 w-4" />
        קבע נתיב
      </button>
    </div>
  )
}

export default FolderPicker

