import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  scanFolder: (path) => ipcRenderer.invoke('folder:scan', path),
  moveFile: (src, dest) => ipcRenderer.invoke('file:move', src, dest),
  copyFile: (src, dest) => ipcRenderer.invoke('file:copy', src, dest),
  deleteFile: (target) => ipcRenderer.invoke('file:delete', target),
  createFolder: (target) => ipcRenderer.invoke('folder:create', target),
  readExif: (target) => ipcRenderer.invoke('exif:read', target),
  dateToHebrew: (date) => ipcRenderer.invoke('date:to-hebrew', date),
  sortByDate: (payload) => ipcRenderer.invoke('file:sort-by-date', payload),
})

