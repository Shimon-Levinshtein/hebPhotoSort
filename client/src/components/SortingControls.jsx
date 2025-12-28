import {
  Archive,
  Copy,
  FolderPlus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ActionButton = ({ icon: Icon, label, onClick, variant = 'default' }) => {
  const styles =
    variant === 'danger'
      ? 'bg-rose-600 text-white hover:bg-rose-500'
      : 'bg-slate-800 text-slate-100 hover:bg-slate-700'

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
        styles,
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

const SortingControls = ({
  onMove,
  onCopy,
  onDelete,
  onCreateFolder,
  onAutoSort,
  disabled = false,
  mode,
  format,
  onModeChange,
  onFormatChange,
}) => {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton icon={Archive} label="העבר" onClick={onMove} />
        <ActionButton icon={Copy} label="העתק" onClick={onCopy} />
        <ActionButton
          icon={Trash2}
          label="מחק"
          onClick={onDelete}
          variant="danger"
        />
        <ActionButton icon={FolderPlus} label="תיקייה חדשה" onClick={onCreateFolder} />
        <ActionButton icon={Sparkles} label="מיון אוטומטי" onClick={onAutoSort} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
          <p className="mb-2 font-semibold text-slate-100">מצב פעולה</p>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="move"
                checked={mode === 'move'}
                onChange={() => onModeChange?.('move')}
              />
              העברה (מוחק מהמקור)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="copy"
                checked={mode === 'copy'}
                onChange={() => onModeChange?.('copy')}
              />
              העתקה (משאיר במקור)
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
          <p className="mb-2 font-semibold text-slate-100">פורמט תאריך</p>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="format"
                value="month-year"
                checked={format === 'month-year'}
                onChange={() => onFormatChange?.('month-year')}
              />
              חודש-שנה (לדוגמה: ניסן- תשפ״ה)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="format"
                value="day-month-year"
                checked={format === 'day-month-year'}
                onChange={() => onFormatChange?.('day-month-year')}
              />
              יום-חודש-שנה (לדוגמה: כ״ד ניסן- תשפ״ה)
            </label>
          </div>
        </div>
      </div>

      {disabled && (
        <span className="text-sm text-slate-400">טוען... הפעולות זמינות בקרוב</span>
      )}
    </div>
  )
}

export default SortingControls

