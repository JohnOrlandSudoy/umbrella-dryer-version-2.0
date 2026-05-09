import { useState } from 'react'
import { ChevronLeft, Eye, EyeOff, Layers } from 'lucide-react'
import { MODEL_ASSEMBLY_PARTS } from '../constants/modelAssemblyParts'
import { useModelAssemblyVisibilityStore } from '../store/modelAssemblyVisibilityStore'

export function AssemblyVisibilityPanel() {
  const [open, setOpen] = useState(true)
  const visible = useModelAssemblyVisibilityStore((s) => s.visible)
  const togglePart = useModelAssemblyVisibilityStore((s) => s.togglePart)
  const showAllParts = useModelAssemblyVisibilityStore((s) => s.showAllParts)
  const hideAllParts = useModelAssemblyVisibilityStore((s) => s.hideAllParts)

  if (!open) {
    return (
      <button
        type="button"
        className="pointer-events-auto absolute top-24 right-0 z-20 flex items-center gap-1.5 rounded-l-xl border border-r-0 border-zinc-700/60 bg-zinc-900/94 py-3 pl-2.5 pr-3 shadow-xl backdrop-blur-md hover:bg-zinc-800/90 md:right-0"
        aria-label="Show parts visibility"
        aria-expanded={false}
        onClick={() => setOpen(true)}
      >
        <Layers className="h-4 w-4 shrink-0 text-sky-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-200">
          Parts
        </span>
      </button>
    )
  }

  return (
    <aside
      className="pointer-events-auto absolute top-24 right-3 z-20 flex w-[min(17rem,calc(100vw-1.5rem))] flex-col rounded-xl border border-zinc-700/60 bg-zinc-900/94 shadow-xl backdrop-blur-md md:right-5"
      aria-label="Model assembly visibility"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-700/50 px-2 py-2.5 pl-1">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            className="shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Hide parts panel"
            title="Collapse"
            onClick={() => setOpen(false)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 items-center gap-2 text-zinc-200">
            <Layers className="h-4 w-4 shrink-0 text-sky-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Parts
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-400/90 hover:bg-zinc-800"
            onClick={showAllParts}
          >
            All
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            onClick={hideAllParts}
          >
            None
          </button>
        </div>
      </div>
      <div className="max-h-[min(60vh,calc(100vh-14rem))] overflow-y-auto overscroll-contain px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {MODEL_ASSEMBLY_PARTS.map(({ id, label }) => {
            const on = visible[id] !== false
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => togglePart(id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/80"
                >
                  {on ? (
                    <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  )}
                  <span className="min-w-0 flex-1 leading-snug">{label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
