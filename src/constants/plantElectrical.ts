/** Centrifugal blower nameplate (~1100 CFM in design doc). */
export const PLANT_BLOWER_RATED_WATTS = 350

/** Heating coil options per insulation spec (design doc). */
export const HEATER_COIL_3MM_WATTS = 1600
export const HEATER_COIL_5MM_WATTS = 960

export type HeaterCoilPreset = '3mm-1600' | '5mm-960'

export function heaterCoilNameplateWatts(preset: HeaterCoilPreset): number {
  return preset === '3mm-1600' ? HEATER_COIL_3MM_WATTS : HEATER_COIL_5MM_WATTS
}

/**
 * Shared plant draws (single coil + single fan): same on every slot.
 * Heater scaled by heat slider; blower full nameplate when fan commanded on during a run.
 */
export function plantOperationalWatts(opts: {
  status: 'idle' | 'running' | 'paused' | 'error'
  heatLevel: number
  impellerSpinEnabled: boolean
  doorOpen: boolean
  eStopLatched: boolean
  heaterCoilPreset: HeaterCoilPreset
}): { heaterW: number; blowerW: number } {
  const running =
    opts.status === 'running' && !opts.doorOpen && !opts.eStopLatched
  if (!running) return { heaterW: 0, blowerW: 0 }

  const ratedH = heaterCoilNameplateWatts(opts.heaterCoilPreset)
  const heaterW =
    opts.heatLevel > 0 ? Math.round(ratedH * opts.heatLevel) : 0
  const blowerW = opts.impellerSpinEnabled ? PLANT_BLOWER_RATED_WATTS : 0

  return { heaterW, blowerW }
}
