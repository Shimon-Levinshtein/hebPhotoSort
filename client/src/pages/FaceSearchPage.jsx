import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { io } from 'socket.io-client'
import FolderPicker from '@/components/FolderPicker'
import LazyImage from '@/components/LazyImage'
import LightboxModal from '@/components/LightboxModal'
import PerformanceMonitor from '@/components/PerformanceMonitor'
import useApi from '@/hooks/useApi'
import { useAppStore } from '@/store/appStore'
import { useToastStore } from '@/store/toastStore'

const FaceSearchPage = () => {
  const {
    sourcePath,
    setSourcePath,
    faceSearchFaces,
    faceSearchSelectedId,
    faceSearchLoading,
    faceSearchError,
    faceSearchProgress,
    faceSearchConcurrency,
    setFaceSearchFaces,
    setFaceSearchSelectedId,
    setFaceSearchLoading,
    setFaceSearchError,
    setFaceSearchProgress,
    setFaceSearchConcurrency,
  } = useAppStore()
  const getStore = useAppStore.getState
  const { addToast } = useToastStore()
  const { getSystemStats } = useApi()

  const [filter, setFilter] = useState('')
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const socketRef = useRef(null)
  const [monitorSocket, setMonitorSocket] = useState(null)
  
  // Current time for elapsed calculation (updates every second when loading)
  const [now, setNow] = useState(Date.now())
  
  useEffect(() => {
    if (!faceSearchLoading || !faceSearchProgress?.activeFiles?.length) return
    
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [faceSearchLoading, faceSearchProgress?.activeFiles?.length])

  // Cleanup Socket.IO when component unmounts (e.g., navigating away)
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setMonitorSocket(null)
        // Reset loading state when unmounting (but keep the data in store)
        setFaceSearchLoading(false)
        setFaceSearchProgress(null)
      }
    }
  }, [setFaceSearchLoading, setFaceSearchProgress])

  const filteredFaces = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return faceSearchFaces
    return faceSearchFaces.filter((f) => f.label.toLowerCase().includes(term))
  }, [faceSearchFaces, filter])

  const selectedFace = useMemo(
    () => faceSearchFaces.find((f) => f.id === faceSearchSelectedId) || null,
    [faceSearchFaces, faceSearchSelectedId],
  )

  const isAbsolutePath = (p) => {
    if (!p) return false
    const t = p.trim()
    // Windows drive (C:\) or UNC (\\server\share) or POSIX-style absolute
    return /^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('\\\\') || t.startsWith('/')
  }

  // Stop the current scan
  const handleStop = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('face-scan:stop')
      socketRef.current.disconnect()
      socketRef.current = null
      setMonitorSocket(null) // Clear monitor socket
      setFaceSearchLoading(false)
      setFaceSearchProgress(null)
      addToast({ 
        title: 'סריקה נעצרה', 
        description: 'ניתן להמשיך מאותה נקודה בהפעלה הבאה',
        variant: 'default' 
      })
    }
  }, [addToast, setFaceSearchLoading, setFaceSearchProgress])

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
    setFaceSearchLoading(true)
    setFaceSearchError(null)
    setFaceSearchProgress({ phase: 'init', message: 'מתחבר...' })
    
    // Close any existing connection
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    
    return new Promise(async (resolve) => {
      const apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || 'http://localhost:4000'
      
      // First, check if server is reachable
      try {
        setFaceSearchProgress({ phase: 'init', message: 'בודק חיבור לשרת...' })
        const healthCheck = await fetch(`${apiBase}/api/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5 second timeout for health check
        })
        if (!healthCheck.ok) {
          throw new Error('Server health check failed')
        }
      } catch (err) {
        console.error('[FaceSearchPage] Server health check failed:', err)
        setFaceSearchLoading(false)
        setFaceSearchProgress(null)
        setFaceSearchError('לא ניתן להתחבר לשרת')
        addToast({ 
          title: 'שגיאת חיבור', 
          description: `השרת לא זמין ב-${apiBase}. ודא שהשרת רץ.`, 
          variant: 'error' 
        })
        resolve()
        return
      }
      
      // Calculate optimal concurrency based on system capabilities (max 20 for face search)
      let initialConcurrency = 5
      try {
        setFaceSearchProgress({ phase: 'init', message: 'בודק ביצועי מערכת...' })
        const initialStats = await getSystemStats()
        const cpuCores = initialStats.cpu?.cores || 4
        const totalMemoryGB = parseFloat(initialStats.memory?.totalGB || 8)
        
        // Calculate base concurrency based on CPU cores (up to 90% utilization)
        const baseConcurrency = Math.max(5, Math.min(20, Math.floor(cpuCores * 5 * 0.9)))
        
        // Calculate memory-based concurrency (assuming ~0.5GB per operation, up to 90% of available)
        const memoryBasedConcurrency = Math.max(5, Math.min(20, Math.floor(totalMemoryGB * 0.9 / 0.5)))
        
        // Use the maximum of both, but cap at 20 for face search
        initialConcurrency = Math.min(20, Math.max(5, Math.max(baseConcurrency, memoryBasedConcurrency)))
        
        console.log('[FaceSearchPage] Calculated concurrency:', initialConcurrency, {
          cpuCores,
          totalMemoryGB,
          baseConcurrency,
          memoryBasedConcurrency
        })
      } catch (err) {
        console.error('[FaceSearchPage] Error getting initial system stats:', err)
        // Use default if stats fetch fails
        initialConcurrency = 5
      }
      
      setFaceSearchProgress({ phase: 'init', message: 'יוצר חיבור Socket.IO...' })
      
      const socket = io(apiBase, {
        transports: ['websocket', 'polling'],
        timeout: 20000, // 20 seconds timeout
        reconnection: false, // Disable auto-reconnection, we'll handle it manually
        forceNew: true,
        autoConnect: true
      })
      socketRef.current = socket
      setMonitorSocket(socket) // Update state so PerformanceMonitor can use it
      
      // Add timeout handler - if connection doesn't establish within timeout
      const connectionTimeout = setTimeout(() => {
        if (!socket.connected) {
          console.error('[FaceSearchPage] Socket.IO connection timeout')
          socket.disconnect()
          socketRef.current = null
          setMonitorSocket(null)
          setFaceSearchLoading(false)
          setFaceSearchProgress(null)
          setFaceSearchError('תם הזמן המתנה לחיבור לשרת')
          addToast({ 
            title: 'שגיאת חיבור', 
            description: `לא ניתן להתחבר לשרת בזמן סביר. ודא שהשרת רץ על ${apiBase}`, 
            variant: 'error' 
          })
          resolve()
        }
      }, 20000) // 20 seconds
      
      // Handle connection - check if already connected first
      const handleConnect = () => {
        clearTimeout(connectionTimeout)
        console.log('[FaceSearchPage] Socket.IO connected')
        setFaceSearchProgress({ phase: 'init', message: 'מתחיל סריקה...' })
        // Start the scan with calculated concurrency
        socket.emit('face-scan:start', {
          sourcePath: pathToScan,
          concurrency: initialConcurrency
        })
      }
      
      // Check if socket is already connected (shouldn't happen with forceNew, but just in case)
      if (socket.connected) {
        handleConnect()
      } else {
        socket.on('connect', handleConnect)
      }
      
      // Handle progress updates
      socket.on('face-scan:progress', (data) => {
        try {
          setFaceSearchProgress(data)
        } catch (e) {
          console.error('[FaceSearchPage] Failed to parse progress:', e)
        }
      })
      
      // Handle incremental face updates - display faces as they are found
      socket.on('face-scan:faces', (event) => {
        try {
          const { faces: newFaces } = event
          if (newFaces && newFaces.length > 0) {
            setFaceSearchFaces(newFaces)
            // Auto-select first face if none selected
            const currentId = getStore().faceSearchSelectedId
            if (!currentId) {
              setFaceSearchSelectedId(newFaces[0]?.id)
            }
          }
        } catch (e) {
          console.error('[FaceSearchPage] Failed to parse faces:', e)
        }
      })
      
      // Handle final result
      socket.on('face-scan:result', (res) => {
        try {
          const nextFaces = res.faces || []
          setFaceSearchFaces(nextFaces)
          const currentId = getStore().faceSearchSelectedId
          if (!currentId && nextFaces.length > 0) {
            setFaceSearchSelectedId(nextFaces[0]?.id)
          }
          
          if (!nextFaces.length) {
            addToast({ title: 'לא נמצאו פנים', description: 'לא נמצאו קבצי מדיה זמינים', variant: 'error' })
          } else {
            // Show cache stats in toast if available
            const cacheInfo = res.cacheStats?.cached > 0 
              ? ` (${res.cacheStats.cached} מהמטמון)` 
              : ''
            addToast({
              title: 'סריקת פנים הושלמה',
              description: `${nextFaces.length} קבוצות · ${res.totalFiles || 0} קבצים${cacheInfo}`,
              variant: 'success',
            })
          }
        } catch (e) {
          console.error('[FaceSearchPage] Failed to parse result:', e)
        }
      })
      
      // Handle scan completion
      socket.on('face-scan:done', () => {
        socket.disconnect()
        socketRef.current = null
        setMonitorSocket(null)
        setFaceSearchLoading(false)
        setFaceSearchProgress(null)
        resolve()
      })
      
      // Handle stop confirmation
      socket.on('face-scan:stopped', () => {
        socket.disconnect()
        socketRef.current = null
        setMonitorSocket(null)
        setFaceSearchLoading(false)
        setFaceSearchProgress(null)
        resolve()
      })
      
      // Handle errors
      socket.on('face-scan:error', (data) => {
        try {
          setFaceSearchError(data.error || 'שגיאה לא ידועה')
          addToast({ title: 'שגיאת סריקה', description: data.error, variant: 'error' })
          socket.disconnect()
          socketRef.current = null
          setMonitorSocket(null)
          setFaceSearchLoading(false)
          setFaceSearchProgress(null)
          resolve()
        } catch (e) {
          console.error('[FaceSearchPage] Socket.IO error:', e)
          setFaceSearchError('שגיאת חיבור')
        }
      })
      
      socket.on('connect_error', (err) => {
        clearTimeout(connectionTimeout)
        console.error('[FaceSearchPage] Socket.IO connection error:', err)
        const errorMessage = err.message || 'שגיאת חיבור לשרת'
        socket.disconnect()
        socketRef.current = null
        setMonitorSocket(null)
        setFaceSearchLoading(false)
        setFaceSearchProgress(null)
        
        // Only show error if we haven't received results yet
        if (!faceSearchFaces.length) {
          setFaceSearchError(errorMessage)
          addToast({ 
            title: 'שגיאת חיבור', 
            description: `לא ניתן להתחבר לשרת: ${errorMessage}. ודא שהשרת רץ על ${apiBase}`, 
            variant: 'error' 
          })
        }
        resolve()
      })
      
      socket.on('disconnect', (reason) => {
        clearTimeout(connectionTimeout)
        console.log('[FaceSearchPage] Socket.IO disconnected:', reason)
        // If disconnected unexpectedly during scan, show error
        if (faceSearchLoading && reason !== 'io client disconnect') {
          setFaceSearchError('החיבור נותק מהשרת')
          setFaceSearchLoading(false)
          setFaceSearchProgress(null)
        }
      })
    })
  }, [sourcePath, setSourcePath, addToast, faceSearchFaces.length, getSystemStats, setFaceSearchFaces, setFaceSearchSelectedId, setFaceSearchLoading, setFaceSearchError, setFaceSearchProgress, getStore])

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

      {faceSearchError && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/40 px-4 py-3 text-sm text-rose-100">
          ⚠️ {faceSearchError}
        </div>
      )}

      <FolderPicker
        label="תיקיית מקור לפנים"
        value={sourcePath}
        onSelect={handlePickSource}
        onChange={setSourcePath}
        disabled={faceSearchLoading}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {faceSearchLoading ? (
            <button
              type="button"
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500"
              onClick={handleStop}
            >
              ⏹ עצור סריקה
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              onClick={() => handleScan()}
              disabled={!sourcePath}
            >
              {faceSearchFaces.length > 0 ? 'סרוק שוב (ימשיך מהנקודה שעצר)' : 'סרוק פנים'}
            </button>
          )}
          <div className="text-sm text-slate-300">
            {faceSearchFaces.length ? `${faceSearchFaces.length} קבוצות · ${selectedFace?.count || 0} תמונות לקבוצה הנבחרת` : 'טרם נסרק'}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <span>חיפוש:</span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="סינון לפי שם קבוצה"
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-sm text-slate-100 outline-none ring-0 focus:border-sky-500"
              disabled={faceSearchLoading || !faceSearchFaces.length}
            />
          </div>
        </div>
        
        {/* Progress indicator */}
        {faceSearchLoading && faceSearchProgress && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{faceSearchProgress.message || 'מעבד...'}</span>
              {faceSearchProgress.current !== undefined && faceSearchProgress.total !== undefined && (
                <span className="text-slate-400">
                  {faceSearchProgress.current} / {faceSearchProgress.total} קבצים
                  {faceSearchProgress.facesFound > 0 && ` · ${faceSearchProgress.facesFound} קבוצות פנים`}
                </span>
              )}
            </div>
            {/* Cache status badges */}
            {(faceSearchProgress.cached > 0 || faceSearchProgress.toScan > 0) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {faceSearchProgress.cached > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/50 px-2 py-0.5 text-emerald-300">
                    ⚡ {faceSearchProgress.cached} מהמטמון (כבר נסרקו)
                  </span>
                )}
                {faceSearchProgress.toScan > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/50 px-2 py-0.5 text-amber-300">
                    🔍 {faceSearchProgress.scanned || 0}/{faceSearchProgress.toScan} חדשים
                  </span>
                )}
              </div>
            )}
            {faceSearchProgress.total > 0 && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
                  style={{ width: `${Math.min(100, Math.round((faceSearchProgress.current / faceSearchProgress.total) * 100))}%` }}
                />
              </div>
            )}
            {/* Active files being processed in parallel */}
            {faceSearchProgress.activeFiles && faceSearchProgress.activeFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
                  <span>מעבד כעת {faceSearchProgress.activeCount} קבצים במקביל:</span>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
                  {faceSearchProgress.activeFiles.map((file) => {
                    const elapsedSec = Math.round((now - file.startTime) / 1000)
                    return (
                      <div 
                        key={file.filename}
                        className="group relative overflow-hidden rounded border border-slate-700/50 bg-slate-950/50"
                      >
                        {/* Image Preview */}
                        <div className="relative aspect-square overflow-hidden bg-slate-800">
                          <LazyImage
                            src={file.path}
                            alt={file.filename}
                            className="h-full w-full"
                            imgClassName="h-full w-full object-cover"
                            placeholderClassName="h-full w-full"
                          />
                          {/* Processing overlay */}
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent"></div>
                          </div>
                        </div>
                        {/* File info - smaller text */}
                        <div className="p-1">
                          <p className="truncate text-[10px] text-slate-300" title={file.path}>
                            {file.filename}
                          </p>
                          <span className={`text-[10px] font-mono ${
                            elapsedSec >= 10 ? 'text-amber-400' : 
                            elapsedSec >= 5 ? 'text-yellow-400' : 
                            'text-slate-500'
                          }`}>
                            {elapsedSec}s
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {/* Resume hint */}
            <div className="text-xs text-slate-500">
              💡 ניתן לעצור בכל רגע - הסריקה תמשיך מאותה נקודה בהפעלה הבאה
            </div>
          </div>
        )}
      </div>

      {/* System Performance Monitor - shown during face scanning */}
      {faceSearchLoading && <PerformanceMonitor enabled={faceSearchLoading} socket={monitorSocket} />}

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
                  onClick={() => setFaceSearchSelectedId(face.id)}
                  className={`flex flex-col items-center rounded-lg border p-2 text-slate-100 transition ${
                    face.id === faceSearchSelectedId
                      ? 'border-sky-500 bg-sky-500/10 shadow-inner'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-slate-700 bg-slate-800">
                    <LazyImage
                      src={face.faceThumb || face.thumbnail || face.paths[0]}
                      alt={face.label}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                      placeholderClassName="h-24 w-24"
                      onClick={() => setFaceSearchSelectedId(face.id)}
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

