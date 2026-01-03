import { useEffect, useMemo, useState } from 'react'
import FolderPicker from '@/components/FolderPicker'
import ImagePreview from '@/components/ImagePreview'
import ImageGrid from '@/components/ImageGrid'
import LightboxModal from '@/components/LightboxModal'
import SortingControls from '@/components/SortingControls'
import ProgressBar from '@/components/ProgressBar'
import PerformanceMonitor from '@/components/PerformanceMonitor'
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

  const { scanFolder, deleteFile, sortByDate, sortByDateBatch, createFolder, loading, error } = useApi()
  const { addToast } = useToastStore()
  const [format, setFormat] = useState('month-year')
  const [mode, setMode] = useState('copy')
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [isSorting, setIsSorting] = useState(false)
  const [sortProgress, setSortProgress] = useState({ current: 0, total: 0 })

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
    if (!total) return 'אין קבצי מדיה להצגה'
    return `קבצי מדיה: ${total} | נותרו: ${total - sortedCount}`
  }, [sourcePath, destPath, total, sortedCount])

  const handleSelectImage = (idx) => setCurrentIndex(idx)

  const handleSelectSource = async () => {
    // Try Electron folder dialog first
    try {
      if (window.electronAPI?.openFolderDialog) {
        const picked = await window.electronAPI.openFolderDialog()
        if (picked) {
          setSourcePath(picked)
          try {
            const res = await scanFolder(picked)
            setImages(res.files || [])
            if (res.error) {
              addToast({ title: 'שגיאה בסריקה', description: res.error, variant: 'error' })
            } else {
              addToast({
                title: 'תיקיית מקור נבחרה',
                description: `${picked} (${res.count || 0} קבצי מדיה נתמכים)`,
                variant: 'success',
              })
              if (!res.count) {
                addToast({
                  title: 'אין קבצי מדיה',
                  description: 'התיקייה שנבחרה ריקה או ללא תמונות/וידאו נתמכים',
                  variant: 'error',
                })
              }
            }
          } catch (err) {
            addToast({ title: 'שגיאה בסריקה', description: err.message, variant: 'error' })
          }
          return
        }
      }
    } catch (err) {
      console.error('[SortPage] electron folder dialog failed', err)
    }

    // Fallback to manual input
    const chosenRaw =
      sourcePath ||
      window.prompt('הכנס נתיב מלא לתיקיית מקור (לדוגמה: C:\\Photos\\Unsorted)') ||
      ''
    const chosen = chosenRaw.trim()
    
    // Validate that it's an absolute path
    if (chosen && !chosen.match(/^[A-Za-z]:[\\/]/) && !chosen.startsWith('/')) {
      addToast({
        title: 'נתיב לא תקין',
        description: 'אנא הזן נתיב מלא (לדוגמה: C:\\Photos\\למיון - Copy - Copy)',
        variant: 'error',
      })
      return
    }
    
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
            description: `${chosen} (${res.count || 0} קבצי מדיה נתמכים)`,
            variant: 'success',
          })
          if (!res.count) {
            addToast({
              title: 'אין קבצי מדיה',
              description: 'התיקייה שנבחרה ריקה או ללא תמונות/וידאו נתמכים',
              variant: 'error',
            })
          }
        }
      }
    } catch (err) {
      console.error('[SortPage] select source failed', err)
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
      console.error('[SortPage] select destination failed', err)
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
    const ok = window.confirm('למחוק את הקובץ? הפעולה בלתי הפיכה.')
    if (!ok) return
    try {
      await deleteFile(currentImage.replace('file://', ''))
      incrementSorted()
      removeCurrent()
      addToast({ title: 'נמחק', description: 'הקובץ הוסר', variant: 'success' })
    } catch (err) {
      console.error('[SortPage] delete failed', err)
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
    setIsSorting(true)
    setSortProgress({ current: 0, total: images.length })

    try {
      // Prepare file paths (remove file:// prefix)
      const filePaths = images.map((img) => img.replace('file://', ''))
      const batchSize = 20 // Process 20 files per batch
      let totalSuccess = 0
      let totalErrors = 0
      const allErrors = []

      // Process files in smaller batches for better progress reporting
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize)
        setSortProgress({ current: i, total: filePaths.length })

        try {
          const result = await sortByDateBatch({
            files: batch,
            destRoot: destPath,
            format,
            mode: opMode,
            concurrency: 5, // Process 5 files in parallel within each batch
          })

          const successCount = result.success || 0
          const errorCount = result.errors || 0
          totalSuccess += successCount
          totalErrors += errorCount

          // Update sorted count
          for (let j = 0; j < successCount; j++) {
            incrementSorted()
          }

          // Collect errors
          if (result.results) {
            result.results.forEach((r) => {
              if (!r.success && r.error) {
                allErrors.push({ src: r.src, error: r.error })
              }
            })
          }
        } catch (err) {
          console.error('Batch sorting failed', err)
          totalErrors += batch.length
          batch.forEach((src) => {
            allErrors.push({ src, error: err.message })
          })
        }
      }

      setSortProgress({ current: filePaths.length, total: filePaths.length })

      // Show results
      if (totalErrors > 0) {
        addToast({
          title: 'מיון הושלם עם שגיאות',
          description: `${totalSuccess} קבצים הועברו בהצלחה, ${totalErrors} שגיאות`,
          variant: 'warning',
        })
      } else {
        addToast({
          title: 'מיון הסתיים',
          description: `${totalSuccess} קבצים הועברו בהצלחה`,
          variant: 'success',
        })
      }

      // Show individual errors (limit to first 5 to avoid spam)
      allErrors.slice(0, 5).forEach((err) => {
        const fileName = err.src.split(/[/\\]/).pop() || err.src
        addToast({
          title: 'שגיאה במיון',
          description: `${fileName} - ${err.error}`,
          variant: 'error',
        })
      })

      if (allErrors.length > 5) {
        addToast({
          title: 'עוד שגיאות',
          description: `ועוד ${allErrors.length - 5} שגיאות נוספות`,
          variant: 'error',
        })
      }

      setImages([])
      setCurrentIndex(0)
    } catch (err) {
      addToast({
        title: 'שגיאה במיון אוטומטי',
        description: err.message,
        variant: 'error',
      })
      console.error('auto-sort failed', err)
    } finally {
      setIsSorting(false)
      setSortProgress({ current: 0, total: 0 })
    }
  }

  const disableActions = loading || isSorting || !sourcePath || !destPath || !images.length

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
          <h1 className="text-3xl font-semibold text-slate-50">מיון תמונות/וידאו לפי תאריך עברי</h1>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            מצב: {mode === 'copy' ? 'העתקה' : 'העברה'}
          </span>
          <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200">
            פורמט: {format === 'month-year' ? 'חודש-שנה' : 'יום-חודש-שנה'}
          </span>
        </div>
        <p className="text-slate-300">
          בחר תיקיות מקור/יעד (נתיב ידני), ראה גריד ותצוגה מקדימה, ונהל מיון אוטומטי/ידני לתמונות או
          סרטונים מול API של השרת.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/40 px-4 py-3 text-sm text-rose-100">
          ⚠️ {error}
        </div>
      )}

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
              <span>סה״כ קבצי מדיה: {total + sortedCount}</span>
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
          alt="מדיה נוכחית"
          onNext={nextImage}
          onPrevious={prevImage}
          currentIndex={currentIndex}
          totalCount={total}
          onOpen={() => setLightboxSrc(currentImage)}
        />
        <ImageGrid
          images={images}
          selectedIndex={currentIndex}
          onSelect={handleSelectImage}
          onImageClick={(src, idx) => {
            setCurrentIndex(idx)
            setLightboxSrc(src)
          }}
        />
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

      <ProgressBar 
        current={isSorting ? sortProgress.current : sortedCount} 
        total={isSorting ? sortProgress.total : total} 
      />

      {/* System Performance Monitor - shown during sorting */}
      {isSorting && <PerformanceMonitor enabled={isSorting} interval={1000} />}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
        {statusText}
      </div>

      <LightboxModal
        open={!!lightboxSrc}
        src={lightboxSrc}
        alt={lightboxSrc || ''}
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  )
}

export default SortPage

