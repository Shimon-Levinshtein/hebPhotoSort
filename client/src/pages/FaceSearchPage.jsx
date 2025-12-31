import { useMemo, useState, useCallback, useRef } from 'react'
import FolderPicker from '@/components/FolderPicker'
import LazyImage from '@/components/LazyImage'
import LightboxModal from '@/components/LightboxModal'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'

const FaceSearchPage = () => {
  const { sourcePath, setSourcePath } = useAppStore()
  const { addToast } = useToastStore()

  const [faces, setFaces] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [filter, setFilter] = useState('')
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Progress state
  const [progress, setProgress] = useState(null)
  const eventSourceRef = useRef(null)

  const filteredFaces = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return faces
    return faces.filter((f) => f.label.toLowerCase().includes(term))
  }, [faces, filter])

  const selectedFace = useMemo(
    () => faces.find((f) => f.id === selectedId) || null,
    [faces, selectedId],
  )

  const isAbsolutePath = (p) => {
    if (!p) return false
    const t = p.trim()
    // Windows drive (C:\) or UNC (\\server\share) or POSIX-style absolute
    return /^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('\\\\') || t.startsWith('/')
  }

  const handleScan = useCallback(async (pathOverride) => {
    const pathToScan = (pathOverride ?? sourcePath ?? '').trim()
    if (!pathToScan) {
      addToast({ title: 'בחר מקור', description: 'חסר נתיב מקור לסריקה', variant: 'error' })
      return
    }
    if (!isAbsolutePath(pathToScan)) {
      addToast({
        title: 'נתיב לא תקין',
        description: 'יש להזין נתיב מלא (לדוגמה: C:\\Photos\\People או \\\\server\\share)',
        variant: 'error',
      })
      return
    }
    
    setSourcePath(pathToScan)
    setLoading(true)
    setError(null)
    setProgress({ phase: 'init', message: 'מתחבר...' })
    
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    
    return new Promise((resolve) => {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const url = `${apiBase}/api/faces/scan-stream?sourcePath=${encodeURIComponent(pathToScan)}`
      
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setProgress(data)
        } catch (e) {
          console.error('[FaceSearchPage] Failed to parse progress:', e)
        }
      }
      
      eventSource.addEventListener('result', (event) => {
        try {
          const res = JSON.parse(event.data)
          const nextFaces = res.faces || []
          setFaces(nextFaces)
          setSelectedId(nextFaces[0]?.id ?? null)
          
          if (!nextFaces.length) {
            addToast({ title: 'לא נמצאו פנים', description: 'לא נמצאו קבצי מדיה זמינים', variant: 'error' })
          } else {
            addToast({
              title: 'סריקת פנים הושלמה',
              description: `${nextFaces.length} קבוצות · ${res.totalFiles || 0} קבצים`,
              variant: 'success',
            })
          }
        } catch (e) {
          console.error('[FaceSearchPage] Failed to parse result:', e)
        }
      })
      
      eventSource.addEventListener('error', (event) => {
        try {
          if (event.data) {
            const data = JSON.parse(event.data)
            setError(data.error || 'שגיאה לא ידועה')
            addToast({ title: 'שגיאת סריקה', description: data.error, variant: 'error' })
          }
        } catch (e) {
          console.error('[FaceSearchPage] SSE error:', e)
          setError('שגיאת חיבור')
        }
      })
      
      eventSource.addEventListener('close', () => {
        eventSource.close()
        eventSourceRef.current = null
        setLoading(false)
        setProgress(null)
        resolve()
      })
      
      eventSource.onerror = (err) => {
        console.error('[FaceSearchPage] EventSource error:', err)
        eventSource.close()
        eventSourceRef.current = null
        setLoading(false)
        setProgress(null)
        
        // Only show error if we haven't received results yet
        if (!faces.length) {
          setError('שגיאת חיבור לשרת')
          addToast({ title: 'שגיאת חיבור', description: 'לא ניתן להתחבר לשרת', variant: 'error' })
        }
        resolve()
      }
    })
  }, [sourcePath, setSourcePath, addToast, faces.length])

  const handlePickSource = async () => {
    // העדפה: דיאלוג של Electron אם זמין
    try {
      if (window.electronAPI?.openFolderDialog) {
        const picked = await window.electronAPI.openFolderDialog()
        if (picked) {
          setSourcePath(picked)
          await handleScan(picked)
          return
        }
      }
    } catch (err) {
      console.error('[FaceSearchPage] electron folder dialog failed', err)
    }

    const fromInput = (sourcePath || '').trim()
    if (fromInput) {
      await handleScan(fromInput)
      return
    }

    const chosenRaw = window.prompt('הכנס נתיב לתיקיית מקור (לדוגמה: C:\\Photos\\People)', sourcePath || '')
    const chosen = (chosenRaw || '').trim()
    if (chosen) {
      await handleScan(chosen)
    } else {
      addToast({ title: 'לא נבחר נתיב', description: 'יש להזין נתיב מקור', variant: 'error' })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-sky-300">HebPhotoSort</p>
        <h1 className="text-3xl font-semibold text-slate-50">חיפוש לפי פנים</h1>
        <p className="text-slate-300">
          דומה לגוגל תמונות: סריקת תיקייה, הצגת "פרצופים" מקבוצות, בחירת פרצוף להצגת כל
          התמונות/הסרטונים שלו.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/40 px-4 py-3 text-sm text-rose-100">
          ⚠️ {error}
        </div>
      )}

      <FolderPicker
        label="תיקיית מקור לפנים"
        value={sourcePath}
        onSelect={handlePickSource}
        onChange={setSourcePath}
        disabled={loading}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            onClick={() => handleScan()}
            disabled={loading || !sourcePath}
          >
            {loading ? 'סורק...' : 'סרוק פנים'}
          </button>
          <div className="text-sm text-slate-300">
            {faces.length ? `${faces.length} קבוצות · ${selectedFace?.count || 0} תמונות לקבוצה הנבחרת` : 'טרם נסרק'}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <span>חיפוש:</span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="סינון לפי שם קבוצה"
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-sm text-slate-100 outline-none ring-0 focus:border-sky-500"
              disabled={loading || !faces.length}
            />
          </div>
        </div>
        
        {/* Progress indicator */}
        {loading && progress && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{progress.message || 'מעבד...'}</span>
              {progress.current !== undefined && progress.total !== undefined && (
                <span className="text-slate-400">
                  {progress.current} / {progress.total} קבצים
                  {progress.facesFound > 0 && ` · ${progress.facesFound} קבוצות פנים`}
                </span>
              )}
            </div>
            {progress.total > 0 && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
                  style={{ width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%` }}
                />
              </div>
            )}
            {progress.currentFile && (
              <div className="truncate text-xs text-slate-500" title={progress.currentFile}>
                📄 {progress.currentFile}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">פרצופים</p>
            <span className="text-xs text-slate-400">{filteredFaces.length} מוצגים</span>
          </div>
          {filteredFaces.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filteredFaces.map((face) => (
                <button
                  key={face.id}
                  type="button"
                  onClick={() => setSelectedId(face.id)}
                  className={`flex flex-col items-center rounded-lg border p-2 text-slate-100 transition ${
                    face.id === selectedId
                      ? 'border-sky-500 bg-sky-500/10 shadow-inner'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border border-slate-800">
                    <LazyImage
                      src={face.thumbnail || face.paths[0]}
                      alt={face.label}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                      placeholderClassName="h-24 w-24"
                      onClick={() => setSelectedId(face.id)}
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-sm font-semibold">{face.label}</div>
                    <div className="text-xs text-slate-400">{face.count} פריטים</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-3 text-center text-sm text-slate-400">
              אין פרצופים להצגה. סרוק תיקייה כדי להתחיל.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-200">תמונות לפי הפרצוף הנבחר</p>
              <p className="text-xs text-slate-400">
                {selectedFace ? `${selectedFace.count} פריטים · ${selectedFace.label}` : 'בחר פרצוף משמאל'}
              </p>
            </div>
          </div>

          {selectedFace ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {selectedFace.paths.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-800 transition hover:border-sky-500"
                  onClick={() => setLightboxSrc(p)}
                  title={p}
                >
                  <LazyImage
                    src={p}
                    alt={p}
                    className="h-full w-full"
                    imgClassName="h-full w-full object-cover"
                    placeholderClassName="h-32 w-full"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-4 text-center text-sm text-slate-400">
              בחר פרצוף כדי לראות את כל התמונות שלו.
            </div>
          )}
        </div>
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

export default FaceSearchPage

