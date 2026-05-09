import React from 'react'
import { useSlotSnapshotStore } from '../store/slotSnapshotStore'
import { useSimulationUiStore } from '../store/simulationUiStore'
import { useMachineStore } from '../store/machineStore'
import type { SlotState } from '../simulation/SlotManager'

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
  const snapshot = useSlotSnapshotStore((s) => s.snapshot)
  const page = useSimulationUiStore((s) => s.lcdPage)
  const listExpanded = useSimulationUiStore((s) => s.lcdListExpanded)
  const toggleList = useSimulationUiStore((s) => s.toggleLcdList)
  const nextPage = useSimulationUiStore((s) => s.nextLcdPage)
  const prevPage = useSimulationUiStore((s) => s.prevLcdPage)
  const heatLevel = useMachineStore((s) => s.heatLevel)

  const slot =
    snapshot.slots.find((s) => s.id === page) ?? snapshot.slots[0]
  const chamberTemp = (34 + heatLevel * 28).toFixed(1)
  const totalPower = slot.heaterWatts + slot.blowerWatts

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
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div>Status: {statusLabel(slot.status)}</div>
          <hr style={{ borderColor: '#00ff41', margin: '8px 0' }} />
          <div>Heater: {slot.heaterWatts.toFixed(0)} W</div>
          <div>Blower: {slot.blowerWatts.toFixed(0)} W</div>
          <div>Total: {totalPower.toFixed(0)} W</div>
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
          <div style={{ marginBottom: 6 }}>All slots ({rows.length})</div>
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
                  Water: {r.waterLoad.toFixed(0)}mL · Mass: {r.mass.toFixed(0)}g · Power:{' '}
                  {(r.heaterWatts + r.blowerWatts).toFixed(0)}W
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
  return (
    <aside className="pointer-events-none fixed left-3 top-[4.75rem] z-[70] flex w-[min(100vw-1.25rem,26rem)] max-w-md flex-col md:left-5 bottom-[13.5rem] max-md:bottom-[15rem]">
      <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto rounded-lg shadow-xl shadow-black/50">
        <LcdPanel />
      </div>
    </aside>
  )
}
