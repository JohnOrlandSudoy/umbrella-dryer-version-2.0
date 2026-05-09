import { create } from 'zustand'

interface PartHoverState {
  label: string | null
  x: number
  y: number
  setHovered: (label: string | null, x: number, y: number) => void
}

export const usePartHoverStore = create<PartHoverState>((set) => ({
  label: null,
  x: 0,
  y: 0,
  setHovered: (label, x, y) => set({ label, x, y }),
}))
