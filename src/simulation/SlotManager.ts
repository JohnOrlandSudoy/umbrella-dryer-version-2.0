export type UmbrellaType = 'foldable' | 'non-foldable'

export type FabricType = 'polyester' | 'nylon'

export type MoistureLevel = 'Light Wet' | 'Medium Wet' | 'Heavy Wet'

export type SlotStatus = 'empty' | 'wet' | 'drying' | 'ready'

/** Doc bands: spray volume → moisture class; moisture % randomized inside band. */
export type WetnessTier = 'light' | 'medium' | 'heavy'

/** Target residual moisture when slot becomes READY (%). */
export const MOISTURE_READY_PCT = 3

/** Drying speed: approx. seconds per 1% moisture removed (doc: polyester ~2s, nylon ~4s). */
const SEC_PER_PCT_POLYESTER = 2
const SEC_PER_PCT_NYLON = 4

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Random physics for one insert: water mL, moisture % within tier band, dry mass (water mass ≈ mL adds to scale).
 */
export function sampleInsertPhysics(tier: WetnessTier): {
  moisturePercent: number
  waterLoadMl: number
  dryMassGrams: number
} {
  const dryMassGrams = Math.round(randRange(250, 400))
  if (tier === 'light') {
    return {
      waterLoadMl: randRange(20, 50),
      moisturePercent: randRange(5.5, 9.75),
      dryMassGrams,
    }
  }
  if (tier === 'medium') {
    return {
      waterLoadMl: randRange(60, 100),
      moisturePercent: randRange(11, 15),
      dryMassGrams,
    }
  }
  return {
    waterLoadMl: randRange(101, 150),
    moisturePercent: randRange(16, 32),
    dryMassGrams,
  }
}

export interface UmbrellaInsertData {
  type: UmbrellaType
  fabric: FabricType
  moistureContent: number
  waterLoad: number
  dryMass: number
}

export interface SlotState {
  id: number
  queueNumber: number | null
  occupied: boolean
  umbrellaType: UmbrellaType | null
  fabricType: FabricType | null
  moistureContent: number
  moistureLevel: MoistureLevel | null
  waterLoad: number
  mass: number
  /** Dry umbrella mass (g); wet mass = dryMass + waterLoad while drying. */
  dryMass: number
  initialMoistureContent: number
  initialWaterLoad: number
  /** Total drying time when status became ready (seconds). */
  dryingDurationSec: number | null
  status: SlotStatus
  heaterWatts: number
  blowerWatts: number
  dryingStartTime: number | null
  insertionTime: number | null
}

export interface SlotSnapshot {
  slots: SlotState[]
  fifoQueue: number[]
  queueCounter: number
}

function moistureLevelLabel(moisture: number): MoistureLevel {
  if (moisture <= 10) return 'Light Wet'
  if (moisture <= 15) return 'Medium Wet'
  return 'Heavy Wet'
}

function refreshMoistureLabel(slot: SlotState) {
  if (!slot.occupied || slot.status === 'ready') return
  slot.moistureLevel = moistureLevelLabel(slot.moistureContent)
}

function emptySlot(id: number): SlotState {
  return {
    id,
    queueNumber: null,
    occupied: false,
    umbrellaType: null,
    fabricType: null,
    moistureContent: 0,
    moistureLevel: null,
    waterLoad: 0,
    mass: 0,
    dryMass: 0,
    initialMoistureContent: 0,
    initialWaterLoad: 0,
    dryingDurationSec: null,
    status: 'empty',
    heaterWatts: 0,
    blowerWatts: 0,
    dryingStartTime: null,
    insertionTime: null,
  }
}

function dryingRatePercentPerSecond(fabric: FabricType): number {
  const secPerPct =
    fabric === 'polyester' ? SEC_PER_PCT_POLYESTER : SEC_PER_PCT_NYLON
  return 1 / secPerPct
}

export class SlotManager {
  private slots: Record<number, SlotState>
  queueCounter = 0
  fifoQueue: number[] = []

  constructor() {
    this.slots = {}
    for (let i = 1; i <= 8; i++) this.slots[i] = emptySlot(i)
  }

  getSlots(): SlotState[] {
    return Array.from({ length: 8 }, (_, idx) => this.slots[idx + 1])
  }

  getSlot(slotId: number): SlotState | undefined {
    return this.slots[slotId]
  }

  snapshot(): SlotSnapshot {
    return {
      slots: this.getSlots(),
      fifoQueue: [...this.fifoQueue],
      queueCounter: this.queueCounter,
    }
  }

  insertUmbrella(slotId: number, data: UmbrellaInsertData): boolean {
    const slot = this.slots[slotId]
    if (!slot || slot.occupied) return false

    this.queueCounter++
    slot.occupied = true
    slot.queueNumber = this.queueCounter
    slot.umbrellaType = data.type
    slot.fabricType = data.fabric

    slot.initialMoistureContent = data.moistureContent
    slot.initialWaterLoad = data.waterLoad
    slot.dryMass = data.dryMass
    slot.moistureContent = data.moistureContent
    slot.waterLoad = data.waterLoad
    slot.mass = data.dryMass + data.waterLoad
    slot.dryingDurationSec = null

    const now = Date.now()
    slot.insertionTime = now
    slot.dryingStartTime = now

    slot.moistureLevel = moistureLevelLabel(data.moistureContent)
    slot.status = data.moistureContent > 15 ? 'wet' : 'drying'

    /** Plant heater/blower are global; slot fields stay zero (see plantElectrical + UI). */
    slot.heaterWatts = 0
    slot.blowerWatts = 0

    this.fifoQueue.push(slotId)
    return true
  }

  removeUmbrella(slotId: number): void {
    const slot = this.slots[slotId]
    if (!slot) return

    slot.occupied = false
    slot.queueNumber = null
    slot.status = 'empty'
    slot.moistureContent = 0
    slot.umbrellaType = null
    slot.fabricType = null
    slot.waterLoad = 0
    slot.mass = 0
    slot.dryMass = 0
    slot.initialMoistureContent = 0
    slot.initialWaterLoad = 0
    slot.dryingDurationSec = null
    slot.moistureLevel = null
    slot.heaterWatts = 0
    slot.blowerWatts = 0
    slot.dryingStartTime = null
    slot.insertionTime = null

    this.fifoQueue = this.fifoQueue.filter((id) => id !== slotId)
  }

  resetAllSlots(): void {
    for (let i = 1; i <= 8; i++) {
      this.slots[i] = emptySlot(i)
    }
    this.queueCounter = 0
    this.fifoQueue = []
  }

  updateAllSlots(delta: number, timeMultiplier = 1): void {
    for (let i = 1; i <= 8; i++) {
      const slot = this.slots[i]
      if (!slot.occupied || slot.status === 'ready') continue

      const fabric = slot.fabricType ?? 'nylon'
      const rate = dryingRatePercentPerSecond(fabric) * timeMultiplier
      slot.moistureContent -= rate * delta

      if (slot.moistureContent <= MOISTURE_READY_PCT) {
        const t0 = slot.dryingStartTime ?? slot.insertionTime
        slot.moistureContent = MOISTURE_READY_PCT
        slot.waterLoad = 0
        slot.mass = slot.dryMass
        slot.status = 'ready'
        slot.heaterWatts = 0
        slot.blowerWatts = 0
        slot.moistureLevel = 'Light Wet'
        if (t0 != null && slot.dryingDurationSec == null) {
          slot.dryingDurationSec = (Date.now() - t0) / 1000
        }
        continue
      }

      const span = slot.initialMoistureContent - MOISTURE_READY_PCT
      if (span > 0.001) {
        slot.waterLoad =
          slot.initialWaterLoad *
          Math.max(
            0,
            (slot.moistureContent - MOISTURE_READY_PCT) / span
          )
      } else {
        slot.waterLoad = 0
      }
      slot.mass = slot.dryMass + slot.waterLoad

      if (slot.moistureContent > 15) slot.status = 'wet'
      else slot.status = 'drying'

      refreshMoistureLabel(slot)
    }
  }
}

export const slotManager = new SlotManager()
