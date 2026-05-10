import {
  type HeaterCoilPreset,
  heaterCoilNameplateWatts,
  PLANT_BLOWER_RATED_WATTS,
} from '../constants/plantElectrical'
import {
  useMachineStore,
  MAX_CYCLE_TIME_SEC,
  MIN_CYCLE_TIME_SEC,
} from '../store/machineStore'
import {
  Play,
  Pause,
  RotateCcw,
  DoorOpen,
  Fan,
  Thermometer,
  Timer,
  Zap,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'

export function ControlPanel() {
  const store = useMachineStore()
  const doorToggleDisabled = !store.doorOpen && store.doorLocked
  const expanded = store.controlPanelExpanded

  const statusColor: Record<string, string> = {
    idle: 'bg-zinc-400',
    running: 'bg-emerald-500',
    paused: 'bg-amber-500',
    error: 'bg-red-500',
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-700/50">
      <div className="max-w-6xl mx-auto px-3 py-1.5">
        {/* Status bar + collapse */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${statusColor[store.status]} ${
                store.status === 'running' ? 'animate-pulse' : ''
              }`}
            />
            <span className="text-zinc-300 text-[11px] font-semibold uppercase tracking-wider">
              {store.status}
            </span>
            {store.doorLocked && !store.doorOpen && (
              <span className="text-amber-500 text-[10px] font-medium border border-amber-800/80 rounded px-1.5 py-0 leading-snug">
                Door locked · START / OVERRIDE on 3D panel
              </span>
            )}
            {store.eStopLatched && (
              <span className="text-red-400 text-[10px] font-semibold uppercase">
                E-stop latched
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
              <Timer className="w-3.5 h-3.5 shrink-0 opacity-90" />
              <span className="font-mono tabular-nums">
                {Math.floor(store.elapsed / 60)}:
                {String(Math.floor(store.elapsed % 60)).padStart(2, '0')}
              </span>
              <span className="text-zinc-600">/</span>
              <span className="font-mono tabular-nums">
                {Math.floor(store.cycleTime / 60)}:
                {String(Math.floor(store.cycleTime % 60)).padStart(2, '0')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => store.toggleControlPanel()}
              className="flex items-center gap-0.5 rounded-md border border-zinc-600 bg-zinc-800/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-700"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  Hide <ChevronDown className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Expand <ChevronUp className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {expanded && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-zinc-800/60 rounded-lg px-2 py-1.5 border border-zinc-700/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <RotateCcw className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide">
                    Rack RPM
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={store.rackRPM}
                  onChange={(e) => store.setRackRPM(parseFloat(e.target.value))}
                  disabled={store.rackRotationPaused}
                  className="w-full h-1 bg-zinc-700 rounded-md appearance-none cursor-pointer accent-sky-400 disabled:opacity-40"
                />
                <div className="text-right text-zinc-400 text-[10px] mt-0.5 leading-none">
                  {store.rackRPM.toFixed(1)} RPM
                  {store.rackRotationPaused ? ' · paused' : ''}
                </div>
              </div>

              <div className="bg-zinc-800/60 rounded-lg px-2 py-1.5 border border-zinc-700/40">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <Fan className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide truncate">
                      Impeller
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={store.toggleImpellerSpin}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                      store.impellerSpinEnabled
                        ? 'bg-cyan-600 text-white'
                        : 'bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    {store.impellerSpinEnabled ? 'On' : 'Off'}
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3000"
                  step="10"
                  value={store.impellerRPM}
                  onChange={(e) => store.setImpellerRPM(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded-md appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="text-right text-zinc-400 text-[10px] mt-0.5 leading-none">
                  {Math.round(store.impellerRPM)} RPM
                  {!store.impellerSpinEnabled ? ' · stopped' : ''}
                </div>
              </div>

              <div className="bg-zinc-800/60 rounded-lg px-2 py-1.5 border border-zinc-700/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <Thermometer className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide">
                    Heat
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={store.heatLevel}
                  onChange={(e) => store.setHeatLevel(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded-md appearance-none cursor-pointer accent-orange-400"
                />
                <div className="flex justify-between gap-1 text-zinc-400 text-[10px] mt-0.5 leading-none">
                  <span>{Math.round(store.heatLevel * 100)}%</span>
                  <span className="text-zinc-500 truncate">max 80°C</span>
                </div>
                <select
                  value={store.heaterCoilPreset}
                  onChange={(e) =>
                    store.setHeaterCoilPreset(e.target.value as HeaterCoilPreset)
                  }
                  className="mt-1 w-full rounded border border-zinc-600 bg-zinc-900/80 px-1 py-0.5 text-[9px] text-zinc-300"
                  title="Shared heating coil nameplate (whole machine)"
                >
                  <option value="3mm-1600">
                    Coil {heaterCoilNameplateWatts('3mm-1600')} W · 3 mm insulation
                  </option>
                  <option value="5mm-960">
                    Coil {heaterCoilNameplateWatts('5mm-960')} W · 5 mm insulation
                  </option>
                </select>
                <p className="text-[9px] text-zinc-500 mt-0.5 leading-tight">
                  Blower rated {PLANT_BLOWER_RATED_WATTS} W (~1100 CFM) — shared, not per slot
                </p>
              </div>

              <div className="bg-zinc-800/60 rounded-lg px-2 py-1.5 border border-zinc-700/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide">
                    Cycle
                  </span>
                </div>
                <input
                  type="range"
                  min={MIN_CYCLE_TIME_SEC}
                  max={MAX_CYCLE_TIME_SEC}
                  step="10"
                  value={store.cycleTime}
                  onChange={(e) =>
                    store.setCycleTime(parseInt(e.target.value, 10))
                  }
                  className="w-full h-1 bg-zinc-700 rounded-md appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between items-baseline gap-1 text-zinc-400 text-[10px] mt-0.5 leading-none">
                  <span className="text-zinc-500 uppercase">
                    {MIN_CYCLE_TIME_SEC}s–30:00
                  </span>
                  <span className="font-mono text-zinc-300">
                    {Math.floor(store.cycleTime / 60)}:
                    {String(Math.floor(store.cycleTime % 60)).padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <button
                onClick={store.startCycle}
                disabled={store.status === 'running'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium shadow-sm shadow-emerald-900/20"
              >
                <Play className="w-3.5 h-3.5" />
                Start
              </button>
              <button
                onClick={store.pauseCycle}
                disabled={store.status !== 'running'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium shadow-sm shadow-amber-900/20"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
              <button
                onClick={store.resetCycle}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-md text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                type="button"
                onClick={store.clearEStop}
                disabled={!store.eStopLatched}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-red-900/70 hover:bg-red-800 disabled:opacity-35 disabled:cursor-not-allowed text-red-50"
              >
                Clear E-stop
              </button>
              <div className="flex-1 min-w-[0.5rem]" />
              <button
                onClick={store.toggleRackRotationPaused}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                  store.rackRotationPaused
                    ? 'bg-sky-600/80 hover:bg-sky-500 text-white shadow-sm shadow-sky-900/20'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {store.rackRotationPaused ? 'Resume rack' : 'Pause rack'}
              </button>
              <button
                onClick={() => store.toggleDoor()}
                disabled={doorToggleDisabled}
                title={
                  doorToggleDisabled ? 'Unlock with 3D START / OVERRIDE buttons first' : undefined
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                  store.doorOpen
                    ? 'bg-red-600/80 hover:bg-red-500 text-white shadow-sm shadow-red-900/20'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <DoorOpen className="w-3.5 h-3.5" />
                {store.doorOpen ? 'Close Door' : 'Open Door'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
