import { create } from 'zustand'
import type { SlotSnapshot } from '../simulation/SlotManager'

function emptySlots(): SlotSnapshot {
  const slots = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    queueNumber: null as number | null,
    occupied: false,
    umbrellaType: null as 'foldable' | 'non-foldable' | null,
    fabricType: null as 'polyester' | 'nylon' | null,
    moistureContent: 0,
    moistureLevel: null as 'Light Wet' | 'Medium Wet' | 'Heavy Wet' | null,
    waterLoad: 0,
    mass: 0,
    status: 'empty' as const,
    heaterWatts: 0,
    blowerWatts: 0,
    dryingStartTime: null as number | null,
    insertionTime: null as number | null,
  }))
  return { slots, fifoQueue: [], queueCounter: 0 }
}

interface SlotSnapshotState {
  snapshot: SlotSnapshot
  setSnapshot: (s: SlotSnapshot) => void
}

export const useSlotSnapshotStore = create<SlotSnapshotState>((set) => ({
  snapshot: emptySlots(),
  setSnapshot: (snapshot) => set({ snapshot }),
}))
