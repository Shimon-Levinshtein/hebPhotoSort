import { useState, useCallback, useMemo } from 'react'
import FolderPicker from '@/components/FolderPicker'
import LazyImage from '@/components/LazyImage'
import LightboxModal from '@/components/LightboxModal'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'

// Modal for showing all file details
const FileDetailsModal = ({ file, onClose }) => {
  if (!file) return null

  const Section = ({ title, children }) => (
    <div className="mb-4">
      <h4 className="mb-2 text-sm font-semibold text-sky-400">{title}</h4>
      <div className="space-y-1 text-xs">{children}</div>
    </div>
  )

  const Row = ({ label, value, link }) => {
    if (value == null || value === '') return null
    return (
      <div className="flex justify-between gap-2">
        <span className="text-slate-400">{label}:</span>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline truncate">
            {value}
          </a>
        ) : (
          <span className="text-slate-200 truncate text-left" dir="ltr">{String(value)}</span>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div 
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">{file.filename}</h3>
            <p className="text-xs text-slate-500 truncate" dir="ltr">{file.path}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* File Info */}
          <Section title="📁 מידע על הקובץ">
            <Row label="גודל" value={file.fileSize ? `${(file.fileSize / 1024 / 1024).toFixed(2)} MB` : null} />
            <Row label="מימדים" value={file.width && file.height ? `${file.width} × ${file.height}` : null} />
            <Row label="מגה-פיקסל" value={file.image?.megapixels} />
            <Row label="יחס גובה-רוחב" value={file.image?.aspectRatio} />
            <Row label="פורמט" value={file.image?.format} />
            <Row label="ערוצי צבע" value={file.image?.channels} />
            <Row label="עומק סיביות" value={file.image?.depth} />
            <Row label="DPI" value={file.image?.density} />
            <Row label="מרחב צבע" value={file.image?.colorSpaceName || file.image?.space} />
            <Row label="שקיפות (Alpha)" value={file.image?.hasAlpha ? 'כן' : 'לא'} />
            <Row label="Progressive" value={file.image?.isProgressive ? 'כן' : 'לא'} />
            <Row label="פרופיל צבע" value={file.image?.hasProfile ? 'כן' : 'לא'} />
            <Row label="כיוון" value={file.image?.orientationDesc} />
          </Section>

          {/* Camera */}
          <Section title="📷 מצלמה">
            <Row label="יצרן" value={file.camera?.make || file.exif?.make} />
            <Row label="דגם" value={file.camera?.model || file.exif?.model} />
            <Row label="מספר סידורי" value={file.camera?.serialNumber} />
            <Row label="בעלים" value={file.camera?.ownerName} />
            <Row label="קושחה" value={file.camera?.firmware} />
          </Section>

          {/* Lens */}
          {file.lens && (file.lens.model || file.lens.make) && (
            <Section title="🔭 עדשה">
              <Row label="יצרן" value={file.lens?.make} />
              <Row label="דגם" value={file.lens?.model} />
              <Row label="מספר סידורי" value={file.lens?.serialNumber} />
              <Row label="טווח פוקוס" value={file.lens?.focalLengthMin && file.lens?.focalLengthMax ? `${file.lens.focalLengthMin}-${file.lens.focalLengthMax}mm` : null} />
            </Section>
          )}

          {/* Settings */}
          <Section title="⚙️ הגדרות צילום">
            <Row label="זמן חשיפה" value={file.settings?.exposureTimeFormatted || file.exif?.exposureTime} />
            <Row label="צמצם" value={file.settings?.apertureFormatted || (file.exif?.aperture ? `f/${file.exif.aperture}` : null)} />
            <Row label="ISO" value={file.settings?.iso || file.exif?.iso} />
            <Row label="אורך מוקד" value={file.settings?.focalLengthFormatted || (file.exif?.focalLength ? `${file.exif.focalLength}mm` : null)} />
            <Row label="אורך מוקד (35mm)" value={file.settings?.focalLength35mm ? `${file.settings.focalLength35mm}mm` : null} />
            <Row label="תוכנית חשיפה" value={file.settings?.exposureProgramDesc} />
            <Row label="מצב חשיפה" value={file.settings?.exposureMode != null ? ['אוטומטי', 'ידני', 'סוגריים'][file.settings.exposureMode] : null} />
            <Row label="פיצוי חשיפה" value={file.settings?.exposureCompensation != null ? `${file.settings.exposureCompensation > 0 ? '+' : ''}${file.settings.exposureCompensation} EV` : null} />
            <Row label="מדידת אור" value={file.settings?.meteringModeDesc} />
            <Row label="הבזק" value={file.settings?.flashDesc} />
            <Row label="איזון לבן" value={file.settings?.whiteBalanceDesc} />
            <Row label="מקור אור" value={file.settings?.lightSourceDesc} />
            <Row label="סוג סצנה" value={file.settings?.sceneCaptureTypeDesc} />
            <Row label="מרחק נושא" value={file.settings?.subjectDistance ? `${file.settings.subjectDistance}m` : null} />
            <Row label="זום דיגיטלי" value={file.settings?.digitalZoomRatio ? `${file.settings.digitalZoomRatio}x` : null} />
            <Row label="קונטרסט" value={file.settings?.contrast != null ? ['רגיל', 'רך', 'חד'][file.settings.contrast] : null} />
            <Row label="רוויה" value={file.settings?.saturation != null ? ['רגיל', 'נמוך', 'גבוה'][file.settings.saturation] : null} />
            <Row label="חדות" value={file.settings?.sharpness != null ? ['רגיל', 'רך', 'חד'][file.settings.sharpness] : null} />
          </Section>

          {/* Dates */}
          <Section title="📅 תאריכים">
            <Row label="תאריך צילום" value={file.dates?.taken ? new Date(file.dates.taken).toLocaleString('he-IL') : null} />
            <Row label="תאריך דיגיטציה" value={file.dates?.digitized ? new Date(file.dates.digitized).toLocaleString('he-IL') : null} />
            <Row label="תאריך עריכה" value={file.dates?.modified ? new Date(file.dates.modified).toLocaleString('he-IL') : null} />
            <Row label="יצירת קובץ" value={file.fileCreated ? new Date(file.fileCreated).toLocaleString('he-IL') : null} />
            <Row label="שינוי קובץ" value={file.fileModified ? new Date(file.fileModified).toLocaleString('he-IL') : null} />
            <Row label="אזור זמן" value={file.dates?.offsetTimeOriginal} />
          </Section>

          {/* GPS */}
          {file.gps && (
            <Section title="📍 מיקום GPS">
              <Row label="קואורדינטות" value={file.gps.formatted} />
              <Row label="קו רוחב" value={file.gps.latitude?.toFixed(6)} />
              <Row label="קו אורך" value={file.gps.longitude?.toFixed(6)} />
              <Row label="גובה" value={file.gps.altitude ? `${file.gps.altitude}m` : null} />
              <Row label="כיוון" value={file.gps.imgDirection ? `${file.gps.imgDirection}°` : null} />
              <Row label="מהירות" value={file.gps.speed ? `${file.gps.speed} ${file.gps.speedRef || ''}` : null} />
              <Row label="דיוק (DOP)" value={file.gps.dop} />
              <Row label="לוויינים" value={file.gps.satellites} />
              <Row label="Google Maps" value="פתח במפות" link={file.gps.mapsUrl} />
              <Row label="Waze" value="נווט עם Waze" link={file.gps.wazeUrl} />
              <Row label="OpenStreetMap" value="פתח ב-OSM" link={file.gps.osmUrl} />
            </Section>
          )}

          {/* Author */}
          <Section title="👤 יוצר וזכויות">
            <Row label="אמן/צלם" value={file.author?.artist || file.exif?.artist} />
            <Row label="זכויות יוצרים" value={file.author?.copyright || file.exif?.copyright} />
            <Row label="בעלים" value={file.author?.ownerName} />
            <Row label="תיאור" value={file.author?.imageDescription || file.exif?.imageDescription} />
            <Row label="הערת משתמש" value={file.author?.userComment} />
            <Row label="דירוג" value={file.author?.rating ? `${'⭐'.repeat(file.author.rating)}` : null} />
          </Section>

          {/* Software */}
          <Section title="💻 תוכנה">
            <Row label="תוכנה" value={file.software?.software || file.exif?.software} />
            <Row label="עיבוד" value={file.software?.processingSoftware} />
            <Row label="מחשב" value={file.software?.hostComputer} />
          </Section>

          {/* Source Detection */}
          <Section title="🔍 זיהוי מקור">
            <Row label="מקור" value={file.source?.type} />
            <Row label="ודאות" value={file.source?.confidence} />
            <Row label="סיבה" value={file.source?.indicator} />
            {file.whatsapp?.isWhatsApp && (
              <>
                <Row label="WhatsApp" value="כן ✓" />
                <Row label="סימנים" value={file.whatsapp.indicators?.join(', ')} />
              </>
            )}
          </Section>

          {/* Scan Info */}
          <Section title="🔬 סריקה">
            <Row label="נסרק בתאריך" value={file.scannedAt ? new Date(file.scannedAt).toLocaleString('he-IL') : null} />
            <Row label="זמן עיבוד" value={file.processingTime ? `${file.processingTime}ms` : null} />
            <Row label="פנים שזוהו" value={file.facesCount} />
          </Section>
        </div>
      </div>
    </div>
  )
}

const ScanHistoryPage = () => {
  const { sourcePath, setSourcePath } = useAppStore()
  const { addToast } = useToastStore()

  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [selectedFileDetails, setSelectedFileDetails] = useState(null)
  const [sortBy, setSortBy] = useState('scannedAt') // scannedAt, processingTime, facesCount, filename, fileSize
  const [sortDir, setSortDir] = useState('desc') // asc, desc
  const [filterFaces, setFilterFaces] = useState('all') // all, withFaces, withoutFaces
  const [filterType, setFilterType] = useState('all') // all, image, video
  const [filterSource, setFilterSource] = useState('all') // all, whatsapp, telegram, screenshot, withGps

  const isAbsolutePath = (p) => {
    if (!p) return false
    const t = p.trim()
    return /^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('\\\\') || t.startsWith('/')
  }

  const handleLoad = useCallback(async (pathOverride) => {
    const pathToLoad = (pathOverride ?? sourcePath ?? '').trim()
    if (!pathToLoad) {
      addToast({ title: 'בחר מקור', description: 'חסר נתיב מקור', variant: 'error' })
      return
    }
    if (!isAbsolutePath(pathToLoad)) {
      addToast({
        title: 'נתיב לא תקין',
        description: 'יש להזין נתיב מלא (לדוגמה: C:\\Photos)',
        variant: 'error',
      })
      return
    }

    setSourcePath(pathToLoad)
    setLoading(true)
    setError(null)

    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const res = await fetch(`${apiBase}/api/faces/history?sourcePath=${encodeURIComponent(pathToLoad)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load history')
      }

      setHistory(data)
      if (data.files?.length) {
        addToast({
          title: 'נטען בהצלחה',
          description: `${data.totalFiles} קבצים נסרקו`,
          variant: 'success',
        })
      } else {
        addToast({
          title: 'אין היסטוריה',
          description: 'לא נמצאו קבצים שנסרקו בתיקייה זו',
          variant: 'default',
        })
      }
    } catch (err) {
      setError(err.message)
      addToast({ title: 'שגיאה', description: err.message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [sourcePath, setSourcePath, addToast])

  const handlePickSource = async () => {
    try {
      if (window.electronAPI?.openFolderDialog) {
        const picked = await window.electronAPI.openFolderDialog()
        if (picked) {
          setSourcePath(picked)
          await handleLoad(picked)
          return
        }
      }
    } catch (err) {
      console.error('[ScanHistoryPage] electron folder dialog failed', err)
    }

    const fromInput = (sourcePath || '').trim()
    if (fromInput) {
      await handleLoad(fromInput)
      return
    }

    const chosenRaw = window.prompt('הכנס נתיב לתיקייה', sourcePath || '')
    const chosen = (chosenRaw || '').trim()
    if (chosen) {
      await handleLoad(chosen)
    }
  }

  // Sort and filter files
  const sortedFiles = useMemo(() => {
    if (!history?.files) return []

    let filtered = [...history.files]

    // Filter by faces
    if (filterFaces === 'withFaces') {
      filtered = filtered.filter((f) => f.facesCount > 0)
    } else if (filterFaces === 'withoutFaces') {
      filtered = filtered.filter((f) => f.facesCount === 0)
    }

    // Filter by type
    if (filterType === 'image') {
      filtered = filtered.filter((f) => f.fileType === 'image')
    } else if (filterType === 'video') {
      filtered = filtered.filter((f) => f.fileType === 'video')
    }

    // Filter by source
    if (filterSource === 'whatsapp') {
      filtered = filtered.filter((f) => f.whatsapp?.isWhatsApp)
    } else if (filterSource === 'telegram') {
      filtered = filtered.filter((f) => f.source?.type === 'telegram')
    } else if (filterSource === 'screenshot') {
      filtered = filtered.filter((f) => f.source?.type === 'screenshot')
    } else if (filterSource === 'withGps') {
      filtered = filtered.filter((f) => f.gps?.latitude)
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case 'processingTime':
          aVal = a.processingTime || 0
          bVal = b.processingTime || 0
          break
        case 'facesCount':
          aVal = a.facesCount || 0
          bVal = b.facesCount || 0
          break
        case 'fileSize':
          aVal = a.fileSize || 0
          bVal = b.fileSize || 0
          break
        case 'filename':
          aVal = a.filename?.toLowerCase() || ''
          bVal = b.filename?.toLowerCase() || ''
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        case 'scannedAt':
        default:
          aVal = a.scannedAt ? new Date(a.scannedAt).getTime() : 0
          bVal = b.scannedAt ? new Date(b.scannedAt).getTime() : 0
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })

    return filtered
  }, [history?.files, sortBy, sortDir, filterFaces, filterType, filterSource])

  const formatDuration = (ms) => {
    if (ms == null) return '—'
    if (ms < 1000) return `${ms}ms`
    const sec = (ms / 1000).toFixed(1)
    return `${sec}s`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      return new Date(isoStr).toLocaleString('he-IL')
    } catch {
      return isoStr
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes == null) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-sky-300">HebPhotoSort</p>
        <h1 className="text-3xl font-semibold text-slate-50">היסטוריית סריקה</h1>
        <p className="text-slate-300">
          צפייה בכל הקבצים שנסרקו, זמני עיבוד, ומספר פנים שזוהו בכל קובץ.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/40 px-4 py-3 text-sm text-rose-100">
          ⚠️ {error}
        </div>
      )}

      <FolderPicker
        label="תיקייה שנסרקה"
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
            onClick={() => handleLoad()}
            disabled={!sourcePath || loading}
          >
            {loading ? 'טוען...' : 'טען היסטוריה'}
          </button>

          {history && (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <span>מיון:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                >
                  <option value="scannedAt">זמן סריקה</option>
                  <option value="processingTime">זמן עיבוד</option>
                  <option value="facesCount">מספר פנים</option>
                  <option value="fileSize">גודל קובץ</option>
                  <option value="filename">שם קובץ</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-200">
                <span>פנים:</span>
                <select
                  value={filterFaces}
                  onChange={(e) => setFilterFaces(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                >
                  <option value="all">הכל</option>
                  <option value="withFaces">עם פנים</option>
                  <option value="withoutFaces">בלי פנים</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-200">
                <span>סוג:</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                >
                  <option value="all">הכל</option>
                  <option value="image">📷 תמונות</option>
                  <option value="video">🎬 סרטונים</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-200">
                <span>מקור:</span>
                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                >
                  <option value="all">הכל</option>
                  <option value="withGps">📍 עם מיקום</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="telegram">✈️ Telegram</option>
                  <option value="screenshot">📱 צילום מסך</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Stats */}
        {history?.stats && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-sky-400">{history.totalFiles}</div>
                <div className="text-xs text-slate-400">קבצים נסרקו</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{history.stats.totalFaces}</div>
                <div className="text-xs text-slate-400">פנים זוהו</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">
                  {formatDuration(history.stats.avgProcessingTime)}
                </div>
                <div className="text-xs text-slate-400">זמן עיבוד ממוצע</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {formatFileSize(history.stats.totalSize)}
                </div>
                <div className="text-xs text-slate-400">גודל כולל</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-pink-400">
                  {history.stats.imagesCount} 📷
                </div>
                <div className="text-xs text-slate-400">תמונות</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-orange-400">
                  {history.stats.videosCount} 🎬
                </div>
                <div className="text-xs text-slate-400">סרטונים</div>
              </div>
            </div>
            
            {/* Second row of stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-cyan-400">
                  {history.stats.filesWithGps || 0} 📍
                </div>
                <div className="text-xs text-slate-400">עם מיקום GPS</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-green-400">
                  {history.stats.filesFromWhatsApp || 0} 💬
                </div>
                <div className="text-xs text-slate-400">מ-WhatsApp</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {history.stats.filesFromTelegram || 0} ✈️
                </div>
                <div className="text-xs text-slate-400">מ-Telegram</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                <div className="text-2xl font-bold text-rose-400">
                  {history.stats.screenshots || 0} 📱
                </div>
                <div className="text-xs text-slate-400">צילומי מסך</div>
              </div>
            </div>

            {/* Third row: More sources */}
            {(history.stats.filesFromInstagram > 0 || history.stats.filesFromFacebook > 0 || history.stats.editedFiles > 0) && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {history.stats.filesFromInstagram > 0 && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                    <div className="text-2xl font-bold text-fuchsia-400">
                      {history.stats.filesFromInstagram} 📸
                    </div>
                    <div className="text-xs text-slate-400">מ-Instagram</div>
                  </div>
                )}
                {history.stats.filesFromFacebook > 0 && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                    <div className="text-2xl font-bold text-blue-500">
                      {history.stats.filesFromFacebook} 👤
                    </div>
                    <div className="text-xs text-slate-400">מ-Facebook</div>
                  </div>
                )}
                {history.stats.editedFiles > 0 && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-400">
                      {history.stats.editedFiles} 🎨
                    </div>
                    <div className="text-xs text-slate-400">נערכו בתוכנה</div>
                  </div>
                )}
              </div>
            )}

            {/* Camera info */}
            {history.stats.cameras?.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-400">📸 מצלמות שזוהו ({history.stats.cameras.length}):</div>
                <div className="flex flex-wrap gap-2">
                  {history.stats.cameras.map((camera) => (
                    <span
                      key={camera}
                      className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                    >
                      {camera}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Lenses */}
            {history.stats.lenses?.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-400">🔭 עדשות שזוהו ({history.stats.lenses.length}):</div>
                <div className="flex flex-wrap gap-2">
                  {history.stats.lenses.map((lens) => (
                    <span
                      key={lens}
                      className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                    >
                      {lens}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Software used */}
            {history.stats.softwareUsed?.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-400">💻 תוכנות שזוהו ({history.stats.softwareUsed.length}):</div>
                <div className="flex flex-wrap gap-2">
                  {history.stats.softwareUsed.map((sw) => (
                    <span
                      key={sw}
                      className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                    >
                      {sw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* File extensions */}
            {history.stats.extensionCounts && Object.keys(history.stats.extensionCounts).length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-400">📁 סוגי קבצים:</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(history.stats.extensionCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([ext, count]) => (
                      <span
                        key={ext}
                        className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                      >
                        {ext}: {count}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Technical stats */}
            {(history.stats.avgIso || history.stats.uniqueResolutions?.length > 0) && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-400">📊 סטטיסטיקות טכניות:</div>
                <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                  {history.stats.avgIso && (
                    <span>ISO ממוצע: <strong>{history.stats.avgIso}</strong></span>
                  )}
                  {history.stats.uniqueResolutions?.length > 0 && (
                    <span>רזולוציות: <strong>{history.stats.uniqueResolutions.length}</strong> שונות</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {history?.lastScan && (
          <div className="mt-3 text-xs text-slate-500">
            סריקה אחרונה: {formatDate(history.lastScan)}
          </div>
        )}
      </div>

      {/* Files Grid */}
      {sortedFiles.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">קבצים שנסרקו</p>
            <span className="text-xs text-slate-400">{sortedFiles.length} מוצגים</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {sortedFiles.map((file) => (
              <div
                key={file.path}
                className="group overflow-hidden rounded-lg border border-slate-700/50 bg-slate-950/50 transition hover:border-slate-600"
              >
                {/* Image Preview */}
                <button
                  type="button"
                  className="relative aspect-video w-full overflow-hidden bg-slate-800"
                  onClick={() => setLightboxSrc(file.path)}
                >
                  <LazyImage
                    src={file.thumbnail || file.path}
                    alt={file.filename}
                    className="h-full w-full"
                    imgClassName="h-full w-full object-cover"
                    placeholderClassName="h-full w-full"
                  />
                  {file.facesCount > 0 && (
                    <div className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white shadow">
                      {file.facesCount} 👤
                    </div>
                  )}
                </button>

                {/* File Info */}
                <div className="p-3 space-y-2">
                  <p className="truncate text-sm font-medium text-slate-200" title={file.path}>
                    {file.filename}
                  </p>

                  {/* Badges row 1: Processing & faces */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {file.processingTime != null && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                          file.processingTime > 5000
                            ? 'bg-rose-900/50 text-rose-300'
                            : file.processingTime > 2000
                            ? 'bg-amber-900/50 text-amber-300'
                            : 'bg-emerald-900/50 text-emerald-300'
                        }`}
                      >
                        ⏱️ {formatDuration(file.processingTime)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-900/50 px-2 py-0.5 text-sky-300">
                      👤 {file.facesCount || 0}
                    </span>
                    {file.fileType && (
                      <span className="inline-flex items-center rounded-full bg-slate-700/50 px-2 py-0.5 text-slate-300">
                        {file.fileType === 'image' ? '📷' : '🎬'} {file.extension}
                      </span>
                    )}
                  </div>

                  {/* Badges row 2: Size & dimensions */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {file.fileSize && (
                      <span className="inline-flex items-center rounded-full bg-purple-900/50 px-2 py-0.5 text-purple-300">
                        💾 {formatFileSize(file.fileSize)}
                      </span>
                    )}
                    {file.width && file.height && (
                      <span className="inline-flex items-center rounded-full bg-indigo-900/50 px-2 py-0.5 text-indigo-300">
                        📐 {file.width}×{file.height}
                      </span>
                    )}
                  </div>

                  {/* EXIF info */}
                  {file.exif && (
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {file.exif.model && (
                        <span className="inline-flex items-center rounded-full bg-pink-900/50 px-2 py-0.5 text-pink-300">
                          📸 {file.exif.model}
                        </span>
                      )}
                      {file.exif.dateTaken && (
                        <span className="inline-flex items-center rounded-full bg-cyan-900/50 px-2 py-0.5 text-cyan-300">
                          📅 {formatDate(file.exif.dateTaken)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* GPS & Source info */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {file.gps && (
                      <a
                        href={file.gps.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-full bg-cyan-900/50 px-2 py-0.5 text-cyan-300 hover:bg-cyan-800/50"
                        onClick={(e) => e.stopPropagation()}
                        title={`${file.gps.latitude?.toFixed(6)}, ${file.gps.longitude?.toFixed(6)}`}
                      >
                        📍 מיקום
                      </a>
                    )}
                    {file.whatsapp?.isWhatsApp && (
                      <span className="inline-flex items-center rounded-full bg-green-900/50 px-2 py-0.5 text-green-300">
                        💬 WhatsApp
                      </span>
                    )}
                    {file.source?.type === 'telegram' && (
                      <span className="inline-flex items-center rounded-full bg-blue-900/50 px-2 py-0.5 text-blue-300">
                        ✈️ Telegram
                      </span>
                    )}
                    {file.source?.type === 'screenshot' && (
                      <span className="inline-flex items-center rounded-full bg-rose-900/50 px-2 py-0.5 text-rose-300">
                        📱 צילום מסך
                      </span>
                    )}
                  </div>

                  {file.scannedAt && (
                    <p className="text-xs text-slate-500">נסרק: {formatDate(file.scannedAt)}</p>
                  )}

                  {/* Details button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFileDetails(file)
                    }}
                    className="mt-1 w-full rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700"
                  >
                    📋 כל הפרטים
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history && sortedFiles.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-400">
            {filterFaces !== 'all'
              ? 'אין קבצים התואמים את הסינון'
              : 'לא נמצאו קבצים שנסרקו בתיקייה זו'}
          </p>
        </div>
      )}

      <LightboxModal
        open={!!lightboxSrc}
        src={lightboxSrc}
        alt={lightboxSrc || ''}
        onClose={() => setLightboxSrc(null)}
      />

      {selectedFileDetails && (
        <FileDetailsModal
          file={selectedFileDetails}
          onClose={() => setSelectedFileDetails(null)}
        />
      )}
    </div>
  )
}

export default ScanHistoryPage

