import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

const useApi = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const request = async (path, body) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const data = await res.json()
      if (!res.ok || data?.error) {
        const msg = data?.error || res.statusText
        setError(msg)
        throw new Error(msg)
      }
      return data
    } catch (err) {
      console.error('[useApi] request failed', { path, error: err })
      setError(err.message || 'Request failed')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const scanFolder = (sourcePath) => request('/api/scan', { sourcePath })
  const sortByDate = (payload) => request('/api/sort', payload)
  const sortByDateBatch = (payload) => request('/api/sort-batch', payload)
  const deleteFile = (targetPath) => request('/api/delete', { targetPath })
  const createFolder = (targetPath) => request('/api/create-folder', { targetPath })
  const readExif = (targetPath) => request('/api/exif', { targetPath })
  const findDuplicates = (sourcePath) => request('/api/duplicates', { sourcePath })
  const findFaces = (sourcePath) => request('/api/faces/scan', { sourcePath })

  return {
    scanFolder,
    sortByDate,
    sortByDateBatch,
    deleteFile,
    createFolder,
    readExif,
    findDuplicates,
    findFaces,
    loading,
    error,
  }
}

export default useApi

