import { useState } from 'react'
import { Plus } from 'lucide-react'
import { slotManager } from '../simulation/SlotManager'
import type { FabricType, UmbrellaType } from '../simulation/SlotManager'
import { useSimulationUiStore } from '../store/simulationUiStore'
import { useMachineStore } from '../store/machineStore'
import { useSlotSnapshotStore } from '../store/slotSnapshotStore'

/** Matches rack geometry in `umbrellaPartNames`: long S1–S4, folding S5–S8. */
function slotMatchesUmbrellaType(slotId: number, type: UmbrellaType): boolean {
  if (type === 'foldable') return slotId >= 5 && slotId <= 8
  return slotId >= 1 && slotId <= 4
}

export function InsertModal() {
  const open = useSimulationUiStore((s) => s.insertModalOpen)
  const close = useSimulationUiStore((s) => s.closeInsertModal)
  const doorOpen = useMachineStore((s) => s.doorOpen)
  const snapshot = useSlotSnapshotStore((s) => s.snapshot)

  const [umbrellaType, setUmbrellaType] = useState<UmbrellaType>('foldable')
  const [fabric, setFabric] = useState<FabricType>('nylon')
  const [moisture, setMoisture] = useState(18)
  const [mass, setMass] = useState(320)

  const pushSnapshot = () =>
    useSlotSnapshotStore.getState().setSnapshot(slotManager.snapshot())

  const insertIntoSlot = (slotId: number) => {
    if (!doorOpen) return
    if (snapshot.slots[slotId - 1]?.occupied) return
    if (!slotMatchesUmbrellaType(slotId, umbrellaType)) return

    const waterLoad = (moisture / 32) * 150
    const ok = slotManager.insertUmbrella(slotId, {
      type: umbrellaType,
      fabric,
      moisture,
      waterLoad,
      mass,
    })
    if (ok) pushSnapshot()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-600 bg-zinc-900 shadow-2xl">
        <div className="border-b border-zinc-700 px-4 py-3">
          <h2 className="text-zinc-100 text-base font-semibold">Insert umbrella</h2>
          <p className="text-zinc-500 text-xs mt-1">
            Set type and moisture once, then tap <strong className="text-zinc-400">Add</strong> on each
            empty slot. You can fill several slots before closing.
          </p>
          {!doorOpen && (
            <p className="text-amber-400 text-xs mt-2">
              Door is closed — open the cabinet first from this flow or Unlock + Open Door.
            </p>
          )}
        </div>
        <div className="p-4 space-y-4 max-h-[min(85vh,40rem)] overflow-y-auto">
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide">Umbrella type</label>
            <select
              value={umbrellaType}
              onChange={(e) => setUmbrellaType(e.target.value as UmbrellaType)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="foldable">Foldable</option>
              <option value="non-foldable">Non-foldable (long)</option>
            </select>
            <p className="text-[11px] text-sky-400/90 mt-1.5 leading-snug">
              {umbrellaType === 'foldable'
                ? 'Active slots: 5–8 (folding hooks). Slots 1–4 are dimmed.'
                : 'Active slots: 1–4 (long umbrella). Slots 5–8 are dimmed.'}
            </p>
          </div>
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide">Fabric</label>
            <select
              value={fabric}
              onChange={(e) => setFabric(e.target.value as FabricType)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="polyester">Polyester</option>
              <option value="nylon">Nylon</option>
            </select>
          </div>
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide">
              Initial moisture %
            </label>
            <input
              type="range"
              min={1}
              max={32}
              step={0.5}
              value={moisture}
              onChange={(e) => setMoisture(parseFloat(e.target.value))}
              className="mt-2 w-full accent-emerald-500"
            />
            <div className="text-zinc-300 text-xs text-right">{moisture.toFixed(1)}%</div>
          </div>
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide">Mass (g)</label>
            <input
              type="number"
              min={50}
              max={800}
              value={mass}
              onChange={(e) => setMass(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wide block mb-2">
              Slots (1–8)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 8 }, (_, i) => i + 1).map((id) => {
                const occupied = snapshot.slots[id - 1]?.occupied === true
                const forType = slotMatchesUmbrellaType(id, umbrellaType)
                const canAdd = doorOpen && !occupied && forType
                return (
                  <div
                    key={id}
                    className={
                      forType
                        ? 'flex items-center justify-between gap-2 rounded-lg border border-emerald-500/35 bg-emerald-950/25 px-3 py-2.5 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]'
                        : 'flex items-center justify-between gap-2 rounded-lg border border-zinc-800/70 bg-zinc-900/35 px-3 py-2.5 opacity-[0.48]'
                    }
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200">Slot {id}</div>
                      {!forType && (
                        <div className="text-[10px] text-zinc-600 leading-tight mt-0.5">
                          {umbrellaType === 'foldable' ? 'Long-rack only (1–4)' : 'Foldable-rack only (5–8)'}
                        </div>
                      )}
                      <div
                        className={
                          occupied ? 'text-[11px] text-amber-500/95' : 'text-[11px] text-zinc-500'
                        }
                      >
                        {occupied ? 'Occupied' : 'Empty'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!canAdd}
                      onClick={() => insertIntoSlot(id)}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-emerald-600"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      Add
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-4 py-2 text-sm bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
