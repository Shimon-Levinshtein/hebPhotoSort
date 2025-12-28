import { useEffect, useMemo, useState } from 'react'
import FolderPicker from '@/components/FolderPicker'
import ImagePreview from '@/components/ImagePreview'
import ImageGrid from '@/components/ImageGrid'
import SortingControls from '@/components/SortingControls'
import ProgressBar from '@/components/ProgressBar'
import useApi from '@/hooks/useApi'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'

const fallbackImages = [
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80',
]

const SortPage = () => {
  const {
    sourcePath,
    destPath,
    images,
    currentIndex,
    sortedCount,
    setSourcePath,
    setDestPath,
    setImages,
    setCurrentIndex,
    nextImage,
    prevImage,
    incrementSorted,
  } = useAppStore()

  const { scanFolder, deleteFile, sortByDate, createFolder, loading, error } = useApi()
  const { addToast } = useToastStore()
  const [format, setFormat] = useState('month-year')
  const [mode, setMode] = useState('copy')

  const currentImage = images[currentIndex]
  const total = images.length

  useEffect(() => {
    // Fallback for browser dev (no Electron)
    if (!images.length && !window.electronAPI) {
      setImages(fallbackImages)
    }
  }, [images.length, setImages])

  const statusText = useMemo(() => {
    if (!sourcePath || !destPath) return 'בחר תיקיות מקור ויעד כדי להתחיל'
    if (!total) return 'אין תמונות להצגה'
    return `תמונות: ${total} | נותרו: ${total - sortedCount}`
  }, [sourcePath, destPath, total, sortedCount])

  const handleSelectImage = (idx) => setCurrentIndex(idx)

  const handleSelectSource = async () => {
    const chosenRaw =
      sourcePath ||
      window.prompt('הכנס נתיב לתיקיית מקור (לדוגמה: C:\\Photos\\Unsorted)') ||
      ''
    const chosen = chosenRaw.trim()
    try {
      if (chosen) {
        setSourcePath(chosen)
        const res = await scanFolder(chosen)
        setImages(res.files || [])
        if (res.error) {
          addToast({ title: 'שגיאה בסריקה', description: res.error, variant: 'error' })
        } else {
          addToast({
            title: 'תיקיית מקור נבחרה',
            description: `${chosen} (${res.count || 0} קבצים)`,
            variant: 'success',
          })
          if (!res.count) {
            addToast({
              title: 'אין קבצי תמונה',
              description: 'התיקייה שנבחרה ריקה או ללא תמונות נתמכות',
              variant: 'error',
            })
          }
        }
      }
    } catch (err) {
      addToast({ title: 'שגיאה בבחירת מקור', description: err.message, variant: 'error' })
    }
  }

  const handleSelectDest = async () => {
    const chosenRaw =
      destPath ||
      window.prompt('הכנס נתיב לתיקיית יעד (לדוגמה: C:\\Photos\\Sorted)') ||
      ''
    const chosen = chosenRaw.trim()
    try {
      if (chosen) {
        setDestPath(chosen)
        addToast({ title: 'תיקיית יעד נבחרה', description: chosen, variant: 'success' })
      }
    } catch (err) {
      addToast({ title: 'שגיאה בבחירת יעד', description: err.message, variant: 'error' })
    }
  }

  const removeCurrent = () => {
    const updated = images.filter((_, idx) => idx !== currentIndex)
    setImages(updated)
    setCurrentIndex((idx) => (updated.length ? Math.min(idx, updated.length - 1) : 0))
  }

  const handleDelete = async () => {
    if (!currentImage) return
    const ok = window.confirm('למחוק את התמונה? הפעולה בלתי הפיכה.')
    if (!ok) return
    try {
      await deleteFile(currentImage.replace('file://', ''))
      incrementSorted()
      removeCurrent()
      addToast({ title: 'נמחק', description: 'התמונה הוסרה', variant: 'success' })
    } catch (err) {
      addToast({ title: 'שגיאה במחיקה', description: err.message, variant: 'error' })
    }
  }

  const askMode = () => {
    const confirmMove = window.confirm(
      'ברירת מחדל: העתקה.\nאישור = העתקה, ביטול = העברה (מחיקה מהמקור)?',
    )
    return confirmMove ? 'copy' : 'move'
  }

  const handleSortByDate = async (modeInput = 'move') => {
    if (!currentImage || !destPath) {
      addToast({
        title: 'חסרים נתיבים',
        description: 'בחר מקור ויעד לפני מיון',
        variant: 'error',
      })
      return
    }
    const opMode = modeInput || askMode()
    try {
      const res = await sortByDate({
        src: currentImage.replace('file://', ''),
        destRoot: destPath,
        format,
        mode: opMode,
      })
      if (res?.success) {
        incrementSorted()
        removeCurrent()
        addToast({
          title: opMode === 'copy' ? 'הועתק' : 'הועבר',
          description: res.newPath,
          variant: 'success',
        })
      } else if (res?.error) {
        addToast({ title: 'שגיאה במיון', description: res.error, variant: 'error' })
      }
    } catch (err) {
      addToast({ title: 'שגיאה במיון', description: err.message, variant: 'error' })
      console.error('sortByDate failed', err)
    }
  }

  const handleCopy = async () => {
    if (!currentImage || !destPath) {
      addToast({ title: 'בחר תיקיית יעד', description: 'חסר נתיב יעד', variant: 'error' })
      return
    }
    await handleSortByDate('copy')
  }

  const handleCreateFolder = async () => {
    if (!destPath) return
    const folderName = `תיקיה חדשה ${Date.now()}`
    const target = `${destPath}\\${folderName}`
    try {
      await createFolder(target)
      addToast({ title: 'תיקייה נוצרה', description: target, variant: 'success' })
    } catch (err) {
      addToast({ title: 'שגיאה ביצירת תיקייה', description: err.message, variant: 'error' })
      console.error('createFolder failed', err)
    }
  }

  const handleAutoSortAll = async () => {
    if (!destPath || !images.length) return
    const opMode = askMode()
    for (const img of images) {
      try {
        await sortByDate({
          src: img.replace('file://', ''),
          destRoot: destPath,
          format,
          mode: opMode,
        })
        incrementSorted()
      } catch (err) {
        addToast({
          title: 'שגיאה במיון אוטומטי',
          description: `${img} - ${err.message}`,
          variant: 'error',
        })
        console.error('auto-sort failed for', img, err)
      }
    }
    setImages([])
    setCurrentIndex(0)
    addToast({ title: 'מיון הסתיים', description: 'כל התמונות עובדו', variant: 'success' })
  }

  const disableActions = loading || !sourcePath || !destPath || !images.length

  const stats = useMemo(() => {
    if (!total) return null
    const remaining = total - sortedCount
    const pct = Math.min(100, Math.round((sortedCount / (total + sortedCount || 1)) * 100))
    return { remaining, pct }
  }, [total, sortedCount])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-sky-300">HebPhotoSort</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-slate-50">מיון תמונות לפי תאריך עברי</h1>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            מצב: {mode === 'copy' ? 'העתקה' : 'העברה'}
          </span>
          <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200">
            פורמט: {format === 'month-year' ? 'חודש-שנה' : 'יום-חודש-שנה'}
          </span>
        </div>
        <p className="text-slate-300">
          בחר תיקיות מקור/יעד (נתיב ידני), ראה גריד ותצוגה מקדימה, ונהל מיון אוטומטי/ידני מול API של
          השרת.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/40 px-4 py-3 text-sm text-rose-100">
          ⚠️ {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm text-slate-300">מצב פעולה</p>
          <div className="mt-2 flex gap-3 text-sm">
            {[
              { value: 'move', label: 'העבר (ברירת מחדל)' },
              { value: 'copy', label: 'העתק' },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value={opt.value}
                  checked={mode === opt.value}
                  onChange={() => setMode(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm text-slate-300">פורמט תאריך עברי</p>
          <div className="mt-2 flex gap-3 text-sm">
            {[
              { value: 'month-year', label: 'חודש-שנה (כסלו תשפה)' },
              { value: 'day-month-year', label: 'יום-חודש-שנה (כ״ד כסלו תשפה)' },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="format"
                  value={opt.value}
                  checked={format === opt.value}
                  onChange={() => setFormat(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <FolderPicker
          label="תיקיית מקור"
          value={sourcePath}
          onSelect={handleSelectSource}
          onChange={setSourcePath}
          disabled={loading}
        />
        <FolderPicker
          label="תיקיית יעד"
          value={destPath}
          onSelect={handleSelectDest}
          onChange={setDestPath}
          disabled={loading}
        />
      </section>

      {stats && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
          <div className="flex flex-wrap gap-4">
            <span>סה״כ תמונות: {total + sortedCount}</span>
            <span>עוד לעיבוד: {stats.remaining}</span>
            <span>הושלמו: {sortedCount}</span>
            <span>אחוז התקדמות: {stats.pct}%</span>
            <span>מצב פעולה: {mode === 'copy' ? 'העתקה' : 'העברה'}</span>
            <span>פורמט תאריך: {format === 'month-year' ? 'חודש-שנה' : 'יום-חודש-שנה'}</span>
          </div>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.9fr]">
        <ImagePreview
          src={currentImage}
          alt="תמונה נוכחית"
          onNext={nextImage}
          onPrevious={prevImage}
          currentIndex={currentIndex}
          totalCount={total}
        />
        <ImageGrid images={images} selectedIndex={currentIndex} onSelect={handleSelectImage} />
      </section>

      <SortingControls
        onMove={() => handleSortByDate('move')}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onCreateFolder={handleCreateFolder}
        onAutoSort={handleAutoSortAll}
        disabled={disableActions}
        mode={mode}
        format={format}
        onModeChange={setMode}
        onFormatChange={setFormat}
      />

      <ProgressBar current={sortedCount} total={total} />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
        {statusText}
      </div>
    </div>
  )
}

export default SortPage

