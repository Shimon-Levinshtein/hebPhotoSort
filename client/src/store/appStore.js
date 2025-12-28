import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  sourcePath: '',
  destPath: '',
  images: [],
  currentIndex: 0,
  sortedCount: 0,
  loading: false,
  error: null,

  setSourcePath: (path) => set({ sourcePath: path }),
  setDestPath: (path) => set({ destPath: path }),
  setImages: (images) => set({ images, currentIndex: 0 }),
  setCurrentIndex: (idx) => set({ currentIndex: idx }),
  nextImage: () => {
    const { currentIndex, images } = get()
    if (!images.length) return
    set({ currentIndex: (currentIndex + 1) % images.length })
  },
  prevImage: () => {
    const { currentIndex, images } = get()
    if (!images.length) return
    set({ currentIndex: (currentIndex - 1 + images.length) % images.length })
  },
  incrementSorted: () =>
    set((state) => ({ sortedCount: state.sortedCount + 1 })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      sourcePath: '',
      destPath: '',
      images: [],
      currentIndex: 0,
      sortedCount: 0,
      loading: false,
      error: null,
    }),
}))

