export type UmbrellaType = 'foldable' | 'non-foldable'

export type FabricType = 'polyester' | 'nylon'

export type MoistureLevel = 'Light Wet' | 'Medium Wet' | 'Heavy Wet'

export type SlotStatus = 'empty' | 'wet' | 'drying' | 'ready'

export interface UmbrellaInsertData {
  type: UmbrellaType
  fabric: FabricType
  moisture: number
  waterLoad: number
  mass: number
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
    status: 'empty',
    heaterWatts: 0,
    blowerWatts: 0,
    dryingStartTime: null,
    insertionTime: null,
  }
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
    slot.moistureContent = data.moisture
    slot.waterLoad = data.waterLoad
    slot.mass = data.mass
    slot.insertionTime = Date.now()
    slot.dryingStartTime = Date.now()

    if (data.moisture <= 10) slot.moistureLevel = 'Light Wet'
    else if (data.moisture <= 15) slot.moistureLevel = 'Medium Wet'
    else slot.moistureLevel = 'Heavy Wet'

    slot.status = data.moisture > 15 ? 'wet' : 'drying'

    slot.heaterWatts = 120 + Math.random() * 30
    slot.blowerWatts = 25 + Math.random() * 10

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

      let rate = 0
      if (slot.moistureLevel === 'Light Wet') rate = 0.05
      else if (slot.moistureLevel === 'Medium Wet') rate = 0.08
      else if (slot.moistureLevel === 'Heavy Wet') rate = 0.12

      slot.moistureContent = Math.max(
        0,
        slot.moistureContent - rate * delta * timeMultiplier
      )

      slot.waterLoad = (slot.moistureContent / 32) * 150

      if (slot.moistureContent > 15) {
        slot.status = 'wet'
        slot.moistureLevel = 'Heavy Wet'
      } else if (slot.moistureContent > 3) {
        slot.status = 'drying'
        if (slot.moistureContent <= 10) slot.moistureLevel = 'Light Wet'
        else slot.moistureLevel = 'Medium Wet'
      } else {
        slot.status = 'ready'
        slot.heaterWatts = 0
        slot.moistureContent = Math.max(0, slot.moistureContent)
      }
    }
  }
}

export const slotManager = new SlotManager()
