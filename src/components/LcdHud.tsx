import React, { useEffect, useState } from 'react'
import { useSlotSnapshotStore } from '../store/slotSnapshotStore'
import { useSimulationUiStore } from '../store/simulationUiStore'
import {
  heaterCoilNameplateWatts,
  plantOperationalWatts,
  PLANT_BLOWER_RATED_WATTS,
} from '../constants/plantElectrical'
import { useMachineStore } from '../store/machineStore'
import type { SlotState } from '../simulation/SlotManager'

/** Chamber display: base 34°C → 80°C max at full heat. */
function chamberTempC(heatLevel: number): string {
  return (34 + heatLevel * 46).toFixed(1)
}

const lcdMono: React.CSSProperties = {
  fontFamily: '"Courier New", monospace',
  fontSize: '15px',
  lineHeight: 1.38,
  color: '#00ff41',
  backgroundColor: '#001a00',
  border: '2px solid #00ff41',
  borderRadius: '6px',
  padding: '12px 14px',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  textShadow: '0 0 1px rgba(0,255,65,0.35)',
  wordBreak: 'break-word',
}

function statusLabel(s: SlotState['status']): string {
  if (s === 'wet') return '🔴 WET'
  if (s === 'drying') return '🟡 DRYING'
  if (s === 'ready') return '🟢 READY'
  return '⚪ EMPTY'
}

function lcdButtonStyle(): React.CSSProperties {
  return {
    background: '#002200',
    color: '#00ff41',
    border: '1px solid #00ff41',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '6px 10px',
  }
}

export function LcdPanel() {
  /** Periodic refresh so elapsed drying timers advance on screen */
  const [, setUiTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setUiTick((x) => x + 1), 500)
    return () => window.clearInterval(id)
  }, [])

  const snapshot = useSlotSnapshotStore((s) => s.snapshot)
  const page = useSimulationUiStore((s) => s.lcdPage)
  const listExpanded = useSimulationUiStore((s) => s.lcdListExpanded)
  const toggleList = useSimulationUiStore((s) => s.toggleLcdList)
  const nextPage = useSimulationUiStore((s) => s.nextLcdPage)
  const prevPage = useSimulationUiStore((s) => s.prevLcdPage)
  const status = useMachineStore((s) => s.status)
  const heatLevel = useMachineStore((s) => s.heatLevel)
  const impellerSpinEnabled = useMachineStore((s) => s.impellerSpinEnabled)
  const doorOpen = useMachineStore((s) => s.doorOpen)
  const eStopLatched = useMachineStore((s) => s.eStopLatched)
  const heaterCoilPreset = useMachineStore((s) => s.heaterCoilPreset)

  const plantW = plantOperationalWatts({
    status,
    heatLevel,
    impellerSpinEnabled,
    doorOpen,
    eStopLatched,
    heaterCoilPreset,
  })

  const slot =
    snapshot.slots.find((s) => s.id === page) ?? snapshot.slots[0]
  const chamberTemp = chamberTempC(heatLevel)
  const coilRated = heaterCoilNameplateWatts(sys.heaterCoilPreset)
  const totalPower = plantW.heaterW + plantW.blowerW

  const dryingElapsedSec =
    slot.occupied &&
    slot.status !== 'ready' &&
    slot.dryingStartTime != null
      ? (Date.now() - slot.dryingStartTime) / 1000
      : 0

  const rows = [...snapshot.slots].sort((a, b) => a.id - b.id)

  return (
    <div style={lcdMono}>
      {!listExpanded ? (
        <>
          <div style={{ marginBottom: 4 }}>
            SLOT [{slot.id}]
            {'  '}
            Queue #{slot.queueNumber ?? '–'}
          </div>
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div>Type: {slot.occupied ? slot.umbrellaType ?? '–' : '—'}</div>
          <div>Fabric: {slot.occupied ? slot.fabricType ?? '–' : '—'}</div>
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div>Water Load: {slot.occupied ? `${slot.waterLoad.toFixed(0)} mL` : '—'}</div>
          <div>Moisture: {slot.occupied ? slot.moistureLevel ?? '—' : '—'}</div>
          <div>Content: {slot.occupied ? `${slot.moistureContent.toFixed(1)}%` : '—'}</div>
          <div>Mass: {slot.occupied ? `${slot.mass.toFixed(0)} g` : '—'}</div>
          <div>Dry mass: {slot.occupied ? `${slot.dryMass.toFixed(0)} g` : '—'}</div>
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div>
            Drying time:{' '}
            {slot.occupied && slot.status !== 'ready' && slot.dryingStartTime != null
              ? `${dryingElapsedSec.toFixed(1)} s · running`
              : slot.occupied && slot.status === 'ready' &&
                  slot.dryingDurationSec != null
                ? `${slot.dryingDurationSec.toFixed(1)} s (complete)`
                : '—'}
          </div>
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div>Status: {statusLabel(slot.status)}</div>
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div>
            Heater (plant): {plantW.heaterW.toFixed(0)} W
            <span style={{ opacity: 0.85, fontSize: 12 }}>
              {' '}
              (coil ≤{coilRated} W)
            </span>
          </div>
          <div>
            Blower (plant): {plantW.blower.toFixed(0)} W
            <span style={{ opacity: 0.85, fontSize: 12 }}>
              {' '}
              (rated {PLANT_BLOWER_RATED_WATTS} W ~1100 CFM)
            </span>
          </div>
          <div>Plant total: {totalPower.toFixed(0)} W</div>
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div>Chamber Temp: {chamberTemp}°C</div>
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 6,
              gap: 4,
            }}
          >
            <button type="button" style={lcdButtonStyle()} onClick={() => prevPage()}>
              ◀ PREV
            </button>
            <span>Slot [{page}] / 8</span>
            <button type="button" style={lcdButtonStyle()} onClick={() => nextPage()}>
              NEXT ▶
            </button>
          </div>
          <button
            type="button"
            style={{ ...lcdButtonStyle(), marginTop: 8, width: '100%' }}
            onClick={() => toggleList()}
          >
            ☰ ALL SLOTS
          </button>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 6 }}>
            All slots ({rows.length}) · Plant power same all slots
          </div>
          <div style={{ marginBottom: 8, opacity: 0.9, fontSize: 13 }}>
            Heater {plantW.heaterW} W · Blower {plantW.blowerW} W · Total{' '}
            {totalPower} W
          </div>
          {rows.map((r) => (
            <details
              key={r.id}
              style={{
                marginBottom: 4,
                borderBottom: '1px solid rgba(0,255,65,0.25)',
                paddingBottom: 4,
              }}
            >
              <summary style={{ cursor: 'pointer' }}>
                Slot {r.id}
                {' — '}
                {r.queueNumber != null ? `Queue #${r.queueNumber}` : '—'}{' '}
                {statusLabel(r.status)}{' '}
                {r.occupied ? `${r.moistureContent.toFixed(1)}%` : ''}
              </summary>
              {r.occupied && (
                <div style={{ marginTop: 4, opacity: 0.9 }}>
                  Type: {r.umbrellaType ?? '–'} · Fabric: {r.fabricType ?? '–'}
                  <br />
                  Water: {r.waterLoad.toFixed(0)}mL · Mass: {r.mass.toFixed(0)}g · Dry:{' '}
                  {r.dryMass.toFixed(0)}g
                  <br />
                  {r.status === 'ready' && r.dryingDurationSec != null ? (
                    `Dry time: ${r.dryingDurationSec.toFixed(1)} s`
                  ) : r.dryingStartTime != null && r.status !== 'ready' ? (
                    `Elapsed: ${((Date.now() - r.dryingStartTime) / 1000).toFixed(1)} s`
                  ) : (
                    ''
                  )}
                </div>
              )}
            </details>
          ))}
          <button
            type="button"
            style={{ ...lcdButtonStyle(), marginTop: 8, width: '100%' }}
            onClick={() => toggleList()}
          >
            ← Single slot view
          </button>
        </>
      )}
    </div>
  )
}

/**
 * Fixed LCD on the left side of the viewport (not attached to the 3D FBX). Above the bottom control bar.
 */
export function FixedLcdSidebar() {
  const panelExpanded = useMachineStore((s) => s.controlPanelExpanded)
  const bottomClass = panelExpanded
    ? 'bottom-[10.75rem] max-md:bottom-[11.75rem]'
    : 'bottom-[5rem] max-md:bottom-[5.5rem]'

  return (
    <aside
      className={`pointer-events-none fixed left-3 top-[4.75rem] z-[70] flex w-[min(100vw-1.25rem,26rem)] max-w-md flex-col md:left-5 transition-[bottom] duration-200 ${bottomClass}`}
    >
      <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto rounded-lg shadow-xl shadow-black/50">
        <LcdPanel />
      </div>
    </aside>
  )
}
