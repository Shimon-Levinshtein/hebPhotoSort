import { useMemo, useState } from 'react'
import FolderPicker from '@/components/FolderPicker'
import DuplicatesView from '@/components/DuplicatesView'
import LightboxModal from '@/components/LightboxModal'
import useApi from '@/hooks/useApi'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'

const DuplicatesPage = () => {
  const { sourcePath, setSourcePath } = useAppStore()
  const { findDuplicates, deleteFile, loading, error } = useApi()
  const { addToast } = useToastStore()

  const [duplicates, setDuplicates] = useState([])
  const [selectedDupPaths, setSelectedDupPaths] = useState(new Set())
  const [showPreview, setShowPreview] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState(null)

  const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  const relative = (p) => {
    if (!sourcePath) return p
    const norm = p.replace(/\\/g, '/')
    const base = sourcePath.replace(/\\/g, '/')
    return norm.startsWith(base) ? norm.slice(base.length + 1) : p
  }

  const allPaths = useMemo(
    () => duplicates.flatMap((g) => g.files.map((f) => f.path)),
    [duplicates],
  )

  const toggleSelect = (path) => {
    setSelectedDupPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const selectGroup = (files, checked) => {
    setSelectedDupPaths((prev) => {
      const next = new Set(prev)
      files.forEach((f) => {
        if (checked) next.add(f.path)
        else next.delete(f.path)
      })
      return next
    })
  }

  const selectAllDup = (checked) => {
    if (checked) setSelectedDupPaths(new Set(allPaths))
    else setSelectedDupPaths(new Set())
  }

  const handleFindDuplicates = async (pathOverride) => {
    const pathToScan = ((pathOverride ?? sourcePath) || '').trim()
    if (!pathToScan) {
      addToast({ title: 'בחר מקור', description: 'חסר נתיב מקור', variant: 'error' })
      return
    }
    setSourcePath(pathToScan)
    try {
      const res = await findDuplicates(pathToScan)
      setDuplicates(res.groups || [])
      setSelectedDupPaths(new Set())
      if (!res.groups?.length) {
        addToast({ title: 'אין כפילויות', description: 'לא נמצאו קבצים כפולים', variant: 'success' })
      } else {
        addToast({
          title: 'כפילויות נמצאו',
          description: `${res.groups.length} קבוצות כפולות`,
          variant: 'success',
        })
      }
    } catch (err) {
      console.error('[DuplicatesPage] find duplicates failed', err)
      addToast({ title: 'שגיאה בסריקת כפילויות', description: err.message, variant: 'error' })
    }
  }

  const handleDeleteSelected = async () => {
    if (!selectedDupPaths.size) {
      addToast({ title: 'לא נבחרו קבצים', description: 'בחר קבצים למחיקה', variant: 'error' })
      return
    }
    const ok = window.confirm(`למחוק ${selectedDupPaths.size} קבצים?`)
    if (!ok) return
    let removed = 0
    for (const p of selectedDupPaths) {
      try {
        await deleteFile(p)
        removed++
      } catch (err) {
        console.error('[DuplicatesPage] delete duplicate failed', { path: p, error: err })
        addToast({ title: 'שגיאה במחיקה', description: `${p}: ${err.message}`, variant: 'error' })
      }
    }
    addToast({ title: 'מחיקה הושלמה', description: `${removed} קבצים נמחקו`, variant: 'success' })
    await handleFindDuplicates()
  }

  const hasGroups = !!duplicates.length

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-sky-300">HebPhotoSort</p>
        <h1 className="text-3xl font-semibold text-slate-50">בדיקת כפילויות</h1>
        <p className="text-slate-300">סריקה, בחירה ומחיקה של קבצים כפולים בתיקיית המקור.</p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/40 px-4 py-3 text-sm text-rose-100">
          ⚠️ {error}
        </div>
      )}

      <FolderPicker
        label="תיקיית מקור"
        value={sourcePath}
        onSelect={async () => {
          const fromInput = (sourcePath || '').trim()
          if (fromInput) {
            setSourcePath(fromInput)
            addToast({ title: 'תיקיית מקור עודכנה', description: fromInput, variant: 'success' })
            await handleFindDuplicates(fromInput)
            return
          }
          const chosenRaw = window.prompt(
            'הכנס נתיב לתיקיית מקור (לדוגמה: C:\\Photos\\Unsorted)',
            sourcePath || '',
          )
          const chosen = (chosenRaw || '').trim()
          if (chosen) {
            setSourcePath(chosen)
            addToast({ title: 'תיקיית מקור נקבעה', description: chosen, variant: 'success' })
            await handleFindDuplicates(chosen)
          } else {
            addToast({ title: 'לא נבחר נתיב', description: 'יש להזין נתיב מקור', variant: 'error' })
          }
        }}
        onChange={setSourcePath}
        disabled={loading}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-200">
            <span className="text-sm font-semibold">כפילויות</span>
            <button
              type="button"
              className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:bg-slate-700 disabled:text-slate-400"
              onClick={handleFindDuplicates}
              disabled={loading || !sourcePath}
            >
              סרוק כפילויות
            </button>
            <button
              type="button"
              className="rounded-lg bg-rose-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-600 disabled:bg-slate-700 disabled:text-slate-300"
              onClick={handleDeleteSelected}
              disabled={loading || !selectedDupPaths.size}
            >
              מחק נבחרים ({selectedDupPaths.size})
            </button>
          </div>
          <div className="text-xs text-slate-300">
            {hasGroups ? `${duplicates.length} קבוצות כפולות` : 'טרם נסרק / לא נמצאו כפילויות'}
          </div>
        </div>

        {hasGroups && (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-200">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                onChange={(e) => selectAllDup(e.target.checked)}
                checked={!!allPaths.length && selectedDupPaths.size === allPaths.length}
              />
              בחר הכל
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showPreview}
                onChange={(e) => setShowPreview(e.target.checked)}
              />
              הצג תצוגה מקדימה (לא ברירת מחדל)
            </label>
          </div>
        )}

        <div className="mt-4">
          <DuplicatesView
            groups={duplicates}
            selectedPaths={selectedDupPaths}
            onToggle={toggleSelect}
            onSelectGroup={selectGroup}
            relative={relative}
            showPreview={showPreview}
            apiBase={apiBase}
            onOpenImage={(src) => setLightboxSrc(src)}
          />
        </div>
      </div>

      <LightboxModal
        open={!!lightboxSrc}
        src={lightboxSrc}
        alt={lightboxSrc ? relative(lightboxSrc) : ''}
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  )
}

export default DuplicatesPage

