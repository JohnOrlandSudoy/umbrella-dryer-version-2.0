import { create } from 'zustand'

interface SimulationUiState {
  lcdPage: number
  lcdListExpanded: boolean
  insertModalOpen: boolean
  retrieveModalOpen: boolean
}

interface SimulationUiActions {
  setLcdPage: (page: number) => void
  nextLcdPage: () => void
  prevLcdPage: () => void
  toggleLcdList: () => void
  openInsertModal: () => void
  closeInsertModal: () => void
  openRetrieveModal: () => void
  closeRetrieveModal: () => void
}

export const useSimulationUiStore = create<SimulationUiState & SimulationUiActions>((set) => ({
  lcdPage: 1,
  lcdListExpanded: false,
  insertModalOpen: false,
  retrieveModalOpen: false,

  setLcdPage: (lcdPage) => set({ lcdPage: Math.min(8, Math.max(1, Math.round(lcdPage))) }),
  nextLcdPage: () =>
    set((s) => ({ lcdPage: s.lcdPage >= 8 ? 1 : s.lcdPage + 1 })),
  prevLcdPage: () =>
    set((s) => ({ lcdPage: s.lcdPage <= 1 ? 8 : s.lcdPage - 1 })),
  toggleLcdList: () => set((s) => ({ lcdListExpanded: !s.lcdListExpanded })),
  openInsertModal: () => set({ insertModalOpen: true }),
  closeInsertModal: () => set({ insertModalOpen: false }),
  openRetrieveModal: () => set({ retrieveModalOpen: true }),
  closeRetrieveModal: () => set({ retrieveModalOpen: false }),
}))
