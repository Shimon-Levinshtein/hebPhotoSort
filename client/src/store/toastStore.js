import { create } from 'zustand'

let idCounter = 0

export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id: ++idCounter,
          title: toast.title || '',
          description: toast.description || '',
          variant: toast.variant || 'default',
          duration: toast.duration || 3500,
        },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

