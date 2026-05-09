import { useEffect, useReducer } from 'react'
import { slotManager } from '../simulation/SlotManager'
import { useSimulationUiStore } from '../store/simulationUiStore'
import { useSlotSnapshotStore } from '../store/slotSnapshotStore'

export function RetrieveModal() {
  const [, refresh] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const id = window.setInterval(() => refresh(), 500)
    return () => window.clearInterval(id)
  }, [])

  const open = useSimulationUiStore((s) => s.retrieveModalOpen)
  const close = useSimulationUiStore((s) => s.closeRetrieveModal)

  const pushSnapshot = () =>
    useSlotSnapshotStore.getState().setSnapshot(slotManager.snapshot())

  if (!open) return null

  const occupied = slotManager
    .getSlots()
    .filter((s) => s.occupied)
    .sort((a, b) => {
      const qa = a.queueNumber ?? 9999
      const qb = b.queueNumber ?? 9999
      return qa - qb
    })

  const retrieve = (id: number) => {
    slotManager.removeUmbrella(id)
    pushSnapshot()
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-zinc-600 bg-zinc-900 shadow-2xl">
        <div className="border-b border-zinc-700 px-4 py-3 sticky top-0 bg-zinc-900">
          <h2 className="text-zinc-100 text-base font-semibold">Retrieve umbrella</h2>
          <p className="text-zinc-500 text-xs mt-1">
            Removing a slot resets it immediately. READY items stay until retrieved.
          </p>
        </div>
        <div className="p-4 space-y-2">
          {occupied.length === 0 ? (
            <p className="text-zinc-500 text-sm">No umbrellas loaded.</p>
          ) : (
            occupied.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  s.status === 'ready'
                    ? 'border-emerald-600/70 bg-emerald-950/30 text-emerald-100'
                    : 'border-zinc-700 bg-zinc-800/50 text-zinc-200'
                }`}
              >
                <div>
                  <span className="font-mono">S{s.id}</span>
                  {' · '}Q{s.queueNumber}
                  {' · '}
                  <span className="uppercase">{s.status}</span>
                  {' · '}
                  {s.moistureContent.toFixed(1)}%
                </div>
                <button
                  type="button"
                  onClick={() => retrieve(s.id)}
                  className="rounded-md bg-red-900/70 px-3 py-1 text-xs text-red-50 hover:bg-red-800"
                >
                  Retrieve
                </button>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-zinc-700 px-4 py-3 flex justify-end">
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-4 py-2 text-sm bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
