import { create } from 'zustand'
import { slotManager } from '../simulation/SlotManager'
import { useSimulationUiStore } from './simulationUiStore'
import { useSlotSnapshotStore } from './slotSnapshotStore'

/** Cycle timer slider / validation (seconds). */
export const MIN_CYCLE_TIME_SEC = 10
export const MAX_CYCLE_TIME_SEC = 30 * 60

export type MachineStatus = 'idle' | 'running' | 'paused' | 'error'

interface MachineState {
  status: MachineStatus
  /** Revolutions per minute (0–10 typical); frame updates use Δt for smooth motion */
  rackRPM: number
  /** When true, rack angle is frozen even if rackRPM > 0 */
  rackRotationPaused: boolean
  /** Centrifugal impeller speed (0–3000 RPM typical) */
  impellerRPM: number
  /** When false, impeller holds angle (RPM slider still sets target when spinning is allowed) */
  impellerSpinEnabled: boolean
  heatLevel: number
  doorOpen: boolean
  /** When true, OPEN door attempts are blocked unless START/OVERRIDE/unlock completes */
  doorLocked: boolean
  /** Dryer simulation + motion allowed only when door closed, not e-stop, etc. */
  systemActive: boolean
  /** Latched emergency stop stops motion/sim until cleared */
  eStopLatched: boolean
  /** After door closes, system becomes active once this deadline passes */
  resumeActiveAtMs: number | null
  /** Optional CAD-style lighting/background preset (Scene decides how to interpret) */
  cadViewLighting: boolean
  cycleTime: number
  elapsed: number
}

interface MachineActions {
  setStatus: (status: MachineStatus) => void
  setRackRPM: (rpm: number) => void
  setRackRotationPaused: (paused: boolean) => void
  toggleRackRotationPaused: () => void
  setImpellerRPM: (rpm: number) => void
  setImpellerSpinEnabled: (on: boolean) => void
  toggleImpellerSpin: () => void
  setHeatLevel: (level: number) => void
  setDoorLocked: (locked: boolean) => void
  setDoorOpen: (open: boolean) => void
  toggleDoor: () => void
  beginInsertFromPanel: () => void
  beginRetrieveFromPanel: () => void
  toggleEStop: () => void
  clearEStop: () => void
  setCadViewLighting: (on: boolean) => void
  toggleCadViewLighting: () => void
  processResumeTimers: () => void
  setCycleTime: (time: number) => void
  setElapsed: (time: number) => void
  startCycle: () => void
  pauseCycle: () => void
  resetCycle: () => void
}

export const useMachineStore = create<MachineState & MachineActions>((set) => ({
  status: 'idle',
  rackRPM: 0,
  rackRotationPaused: false,
  impellerRPM: 1450,
  impellerSpinEnabled: false,
  heatLevel: 0,
  doorOpen: false,
  doorLocked: true,
  systemActive: true,
  eStopLatched: false,
  resumeActiveAtMs: null,
  cadViewLighting: false,
  cycleTime: 30,
  elapsed: 0,

  setStatus: (status) => set({ status }),
  setRackRPM: (rackRPM) => set({ rackRPM }),
  setRackRotationPaused: (rackRotationPaused) => set({ rackRotationPaused }),
  toggleRackRotationPaused: () =>
    set((s) => ({ rackRotationPaused: !s.rackRotationPaused })),
  setImpellerRPM: (impellerRPM) => set({ impellerRPM }),
  setImpellerSpinEnabled: (impellerSpinEnabled) => set({ impellerSpinEnabled }),
  toggleImpellerSpin: () =>
    set((s) => ({ impellerSpinEnabled: !s.impellerSpinEnabled })),
  setHeatLevel: (heatLevel) => set({ heatLevel }),

  setDoorLocked: (doorLocked) => set({ doorLocked }),

  setDoorOpen: (open) =>
    set((s) => {
      if (open && s.doorLocked) return {}
      if (open) {
        return {
          doorOpen: true,
          systemActive: false,
          resumeActiveAtMs: null,
          impellerSpinEnabled: false,
        }
      }
      const now = typeof performance !== 'undefined' ? performance.now() : 0
      return {
        doorOpen: false,
        doorLocked: true,
        resumeActiveAtMs: now ? now + 500 : null,
      }
    }),

  toggleDoor: () =>
    set((s) => {
      if (!s.doorOpen && s.doorLocked) return {}
      if (!s.doorOpen) {
        return {
          doorOpen: true,
          systemActive: false,
          resumeActiveAtMs: null,
          impellerSpinEnabled: false,
        }
      }
      const now = typeof performance !== 'undefined' ? performance.now() : 0
      return {
        doorOpen: false,
        doorLocked: true,
        resumeActiveAtMs: now ? now + 500 : null,
      }
    }),

  beginInsertFromPanel: () => {
    useSimulationUiStore.getState().openInsertModal()
    set({
      doorLocked: false,
      doorOpen: true,
      systemActive: false,
      resumeActiveAtMs: null,
      impellerSpinEnabled: false,
    })
  },

  beginRetrieveFromPanel: () => {
    useSimulationUiStore.getState().openRetrieveModal()
    set({
      doorLocked: false,
      doorOpen: true,
      systemActive: false,
      resumeActiveAtMs: null,
      impellerSpinEnabled: false,
    })
  },

  toggleEStop: () =>
    set((s) => {
      const next = !s.eStopLatched
      if (next)
        return { eStopLatched: true, impellerSpinEnabled: false }
      return { eStopLatched: false }
    }),

  clearEStop: () => set({ eStopLatched: false }),

  setCadViewLighting: (cadViewLighting) => set({ cadViewLighting }),

  toggleCadViewLighting: () =>
    set((s) => ({ cadViewLighting: !s.cadViewLighting })),

  processResumeTimers: () =>
    set((s) => {
      if (
        s.resumeActiveAtMs != null &&
        typeof performance !== 'undefined' &&
        performance.now() >= s.resumeActiveAtMs &&
        !s.doorOpen &&
        !s.eStopLatched
      ) {
        return { systemActive: true, resumeActiveAtMs: null }
      }
      return {}
    }),

  setCycleTime: (cycleTime) =>
    set({
      cycleTime: Math.min(
        MAX_CYCLE_TIME_SEC,
        Math.max(MIN_CYCLE_TIME_SEC, Math.round(cycleTime))
      ),
    }),
  setElapsed: (elapsed) => set({ elapsed }),
  startCycle: () =>
    set((s) => ({
      status: 'running',
      rackRPM: s.rackRPM || 1,
      rackRotationPaused: false,
      impellerSpinEnabled: true,
      impellerRPM: s.impellerRPM > 0 ? s.impellerRPM : 1450,
      heatLevel: s.heatLevel || 0.7,
      systemActive: !s.doorOpen && !s.eStopLatched,
    })),
  pauseCycle: () =>
    set({
      status: 'paused',
      rackRPM: 0,
      rackRotationPaused: true,
      impellerSpinEnabled: false,
      heatLevel: 0,
      systemActive: false,
    }),
  resetCycle: () => {
    slotManager.resetAllSlots()
    useSlotSnapshotStore.getState().setSnapshot(slotManager.snapshot())
    useSimulationUiStore.getState().closeInsertModal()
    useSimulationUiStore.getState().closeRetrieveModal()
    set({
      status: 'idle',
      rackRPM: 0,
      rackRotationPaused: false,
      impellerSpinEnabled: false,
      impellerRPM: 1450,
      heatLevel: 0,
      elapsed: 0,
      doorOpen: false,
      doorLocked: true,
      systemActive: true,
      eStopLatched: false,
      resumeActiveAtMs: null,
    })
  },
}))
