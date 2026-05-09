import { create } from 'zustand'
import {
  MODEL_ASSEMBLY_PARTS,
  type ModelAssemblyPartId,
  defaultAssemblyVisibility,
} from '../constants/modelAssemblyParts'

interface ModelAssemblyVisibilityState {
  visible: Record<ModelAssemblyPartId, boolean>
  togglePart: (id: ModelAssemblyPartId) => void
  setPartVisible: (id: ModelAssemblyPartId, value: boolean) => void
  showAllParts: () => void
  hideAllParts: () => void
}

export const useModelAssemblyVisibilityStore = create<ModelAssemblyVisibilityState>((set) => ({
  visible: defaultAssemblyVisibility(),
  togglePart: (id) =>
    set((s) => ({
      visible: { ...s.visible, [id]: !s.visible[id] },
    })),
  setPartVisible: (id, value) =>
    set((s) => ({
      visible: { ...s.visible, [id]: value },
    })),
  showAllParts: () =>
    set({
      visible: defaultAssemblyVisibility(),
    }),
  hideAllParts: () =>
    set({
      visible: Object.fromEntries(MODEL_ASSEMBLY_PARTS.map((p) => [p.id, false])) as Record<
        ModelAssemblyPartId,
        boolean
      >,
    }),
}))
