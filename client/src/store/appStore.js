import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  sourcePath: '',
  destPath: '',
  images: [],
  currentIndex: 0,
  sortedCount: 0,
  loading: false,
  error: null,

  // Face search state
  faceSearchFaces: [],
  faceSearchSelectedId: null,
  faceSearchLoading: false,
  faceSearchError: null,
  faceSearchProgress: null,
  faceSearchConcurrency: 10,

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

  // Face search actions
  setFaceSearchFaces: (faces) => set({ faceSearchFaces: faces }),
  setFaceSearchSelectedId: (id) => set({ faceSearchSelectedId: id }),
  setFaceSearchLoading: (loading) => set({ faceSearchLoading: loading }),
  setFaceSearchError: (error) => set({ faceSearchError: error }),
  setFaceSearchProgress: (progress) => set({ faceSearchProgress: progress }),
  setFaceSearchConcurrency: (concurrency) => set({ faceSearchConcurrency: concurrency }),
  resetFaceSearch: () =>
    set({
      faceSearchFaces: [],
      faceSearchSelectedId: null,
      faceSearchLoading: false,
      faceSearchError: null,
      faceSearchProgress: null,
    }),
}))

