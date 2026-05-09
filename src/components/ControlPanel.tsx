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
} from 'lucide-react'

export function ControlPanel() {
  const store = useMachineStore()
  const doorToggleDisabled = !store.doorOpen && store.doorLocked

  const statusColor: Record<string, string> = {
    idle: 'bg-zinc-400',
    running: 'bg-emerald-500',
    paused: 'bg-amber-500',
    error: 'bg-red-500',
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-700/50">
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Status bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className={`w-2.5 h-2.5 rounded-full ${statusColor[store.status]} ${
                store.status === 'running' ? 'animate-pulse' : ''
              }`}
            />
            <span className="text-zinc-300 text-sm font-medium uppercase tracking-wider">
              {store.status}
            </span>
            {store.doorLocked && !store.doorOpen && (
              <span className="text-amber-500 text-xs font-medium border border-amber-800/80 rounded px-2 py-0.5">
                Door locked · use START / OVERRIDE on 3D panel
              </span>
            )}
            {store.eStopLatched && (
              <span className="text-red-400 text-xs font-semibold uppercase">
                E-stop latched
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm shrink-0">
            <Timer className="w-4 h-4" />
            <span>
              {Math.floor(store.elapsed / 60)}:
              {String(Math.floor(store.elapsed % 60)).padStart(2, '0')}
            </span>
            <span className="text-zinc-600">/</span>
            <span>
              {Math.floor(store.cycleTime / 60)}:
              {String(Math.floor(store.cycleTime % 60)).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Controls grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Rack RPM */}
          <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw className="w-4 h-4 text-sky-400" />
              <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
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
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-sky-400 disabled:opacity-40"
            />
            <div className="text-right text-zinc-300 text-xs mt-1">
              {store.rackRPM.toFixed(1)} RPM
              {store.rackRotationPaused ? ' · paused' : ''}
            </div>
          </div>

          {/* Impeller (centrifugal fan) */}
          <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Fan className="w-4 h-4 text-cyan-400" />
                <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
                  Impeller RPM
                </span>
              </div>
              <button
                type="button"
                onClick={store.toggleImpellerSpin}
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  store.impellerSpinEnabled
                    ? 'bg-cyan-600 text-white'
                    : 'bg-zinc-700 text-zinc-300'
                }`}
              >
                {store.impellerSpinEnabled ? 'Fan on' : 'Fan off'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="3000"
              step="10"
              value={store.impellerRPM}
              onChange={(e) => store.setImpellerRPM(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="text-right text-zinc-300 text-xs mt-1">
              {Math.round(store.impellerRPM)} RPM
              {!store.impellerSpinEnabled ? ' · stopped' : ''}
            </div>
          </div>

          {/* Heat Level */}
          <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
            <div className="flex items-center gap-2 mb-2">
              <Thermometer className="w-4 h-4 text-orange-400" />
              <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
                Heat Level
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={store.heatLevel}
              onChange={(e) => store.setHeatLevel(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-400"
            />
            <div className="text-right text-zinc-300 text-xs mt-1">
              {Math.round(store.heatLevel * 100)}%
            </div>
          </div>

          {/* Cycle Time */}
          <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
                Cycle Time
              </span>
            </div>
            <input
              type="range"
              min={MIN_CYCLE_TIME_SEC}
              max={MAX_CYCLE_TIME_SEC}
              step="10"
              value={store.cycleTime}
              onChange={(e) => store.setCycleTime(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between gap-2 text-zinc-400 text-[10px] mt-1 uppercase tracking-wide">
              <span>Min {MIN_CYCLE_TIME_SEC}s</span>
              <span>Max 30:00</span>
            </div>
            <div className="text-right text-zinc-300 text-xs mt-1 font-mono">
              {Math.floor(store.cycleTime / 60)}:
              {String(Math.floor(store.cycleTime % 60)).padStart(2, '0')}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={store.startCycle}
            disabled={store.status === 'running'}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-emerald-900/30"
          >
            <Play className="w-4 h-4" />
            Start
          </button>
          <button
            onClick={store.pauseCycle}
            disabled={store.status !== 'running'}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all duration-200 shadow-lg shadow-amber-900/30"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
          <button
            onClick={store.resetCycle}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm font-medium transition-all duration-200"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={store.clearEStop}
            disabled={!store.eStopLatched}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-900/70 hover:bg-red-800 disabled:opacity-35 disabled:cursor-not-allowed text-red-50"
          >
            Clear E-stop
          </button>
          <div className="flex-1" />
          <button
            onClick={store.toggleRackRotationPaused}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              store.rackRotationPaused
                ? 'bg-sky-600/80 hover:bg-sky-500 text-white shadow-lg shadow-sky-900/30'
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            {store.rackRotationPaused ? 'Resume rack' : 'Pause rack'}
          </button>
          <button
            onClick={() => store.toggleDoor()}
            disabled={doorToggleDisabled}
            title={
              doorToggleDisabled ? 'Unlock with 3D START / OVERRIDE buttons first' : undefined
            }
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              store.doorOpen
                ? 'bg-red-600/80 hover:bg-red-500 text-white shadow-lg shadow-red-900/30'
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <DoorOpen className="w-4 h-4" />
            {store.doorOpen ? 'Close Door' : 'Open Door'}
          </button>
        </div>
      </div>
    </div>
  )
}
