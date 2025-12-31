import { useMemo, useState } from 'react'
import FolderPicker from '@/components/FolderPicker'
import LazyImage from '@/components/LazyImage'
import LightboxModal from '@/components/LightboxModal'
import useApi from '@/hooks/useApi'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'

const FaceSearchPage = () => {
  const { sourcePath, setSourcePath } = useAppStore()
  const { findFaces, loading, error } = useApi()
  const { addToast } = useToastStore()

  const [faces, setFaces] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [filter, setFilter] = useState('')
  const [lightboxSrc, setLightboxSrc] = useState(null)

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

  const handleScan = async (pathOverride) => {
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
    try {
      const res = await findFaces(pathToScan)
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
    } catch (err) {
      console.error('[FaceSearchPage] face scan failed', err)
      addToast({ title: 'שגיאת סריקה', description: err.message, variant: 'error' })
    }
  }

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

