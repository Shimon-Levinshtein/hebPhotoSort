import { useState } from 'react'

const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null

const useFileSystem = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const safeCall = async (fn) => {
    if (!electronAPI || !fn) {
      setError('Electron API לא זמינה בדפדפן. הרץ דרך Electron.')
      throw new Error('Electron API unavailable')
    }
    setError(null)
    setLoading(true)
    try {
      const result = await fn()
      return result
    } catch (err) {
      console.error('[useFileSystem] electron call failed', err)
      setError(err.message || 'שגיאה לא ידועה')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const selectFolder = () => safeCall(() => electronAPI.openFolderDialog())
  const scanFolder = (path) => safeCall(() => electronAPI.scanFolder(path))
  const moveFile = (src, dest) => safeCall(() => electronAPI.moveFile(src, dest))
  const copyFile = (src, dest) => safeCall(() => electronAPI.copyFile(src, dest))
  const deleteFile = (target) => safeCall(() => electronAPI.deleteFile(target))
  const createFolder = (target) => safeCall(() => electronAPI.createFolder(target))
  const readExif = (target) => safeCall(() => electronAPI.readExif(target))
  const dateToHebrew = (date) => safeCall(() => electronAPI.dateToHebrew(date))
  const sortByDate = (payload) => safeCall(() => electronAPI.sortByDate(payload))

  return {
    selectFolder,
    scanFolder,
    moveFile,
    copyFile,
    deleteFile,
    createFolder,
    readExif,
    dateToHebrew,
    sortByDate,
    loading,
    error,
  }
}

export default useFileSystem

