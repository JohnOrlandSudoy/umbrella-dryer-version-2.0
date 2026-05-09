import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useMachineStore } from '../store/machineStore'
import { useSimulationUiStore } from '../store/simulationUiStore'

/** Walk up hierarchy for FBX-qualified names like "Body:S1". */
function pickInteractionName(hit: THREE.Object3D): string {
  let cur: THREE.Object3D | null = hit
  while (cur) {
    const n = cur.name?.trim()
    if (n && n !== 'Scene') return n
    cur = cur.parent
  }
  return hit.name || ''
}

function parseHookSlot(raw: string): number | null {
  const m = raw.match(/S\s*[_]?\s*(\d+)/i)
  return m ? Math.min(8, Math.max(1, parseInt(m[1], 10))) : null
}

interface SimulationRaycastProps {
  targetsRef: React.MutableRefObject<THREE.Object3D[]>
}

/**
 * Capture-phase pointer picks on meshes (buttons, hooks, LCD) so orbit controls don't eat the gesture.
 */
export function SimulationRaycast({ targetsRef }: SimulationRaycastProps) {
  const { camera, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const ndc = useRef(new THREE.Vector2())

  useEffect(() => {
    const el = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      if ((e.pointerType === 'mouse' || e.pointerType === 'pen') && e.button !== 0)
        return

      const picks = targetsRef.current
      if (!picks.length) return

      const r = el.getBoundingClientRect()
      ndc.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ndc.current.y = -((e.clientY - r.top) / r.height) * 2 + 1
      raycaster.current.setFromCamera(ndc.current, camera)

      const hits = raycaster.current.intersectObjects(picks, true).filter((h) => {
        let o: THREE.Object3D | null = h.object
        while (o) {
          if (o.userData?.ignoreClick) return false
          if ((o as THREE.Mesh).isMesh && !o.visible) return false
          o = o.parent
        }
        return (h.object as THREE.Mesh).isMesh && h.object.visible
      })

      const hit = hits[0]?.object as THREE.Mesh | undefined
      if (!hit) return

      e.preventDefault()
      e.stopPropagation()

      const name = pickInteractionName(hit).toUpperCase()

      const { toggleEStop, beginInsertFromPanel, beginRetrieveFromPanel } =
        useMachineStore.getState()

      if (name.includes('ESTOP') || name.includes('E-STOP') || name.includes('EMERGENCY')) {
        toggleEStop()
        return
      }

      if (name.includes('OVERRIDE') || name.includes('DOME_OVERRIDE')) {
        beginRetrieveFromPanel()
        return
      }

      if (
        name.includes('START') ||
        name.includes('DOME_START') ||
        name === 'BUTTON_START' ||
        name.includes('BUTTON_START')
      ) {
        beginInsertFromPanel()
        return
      }

      if (name.includes('HOOK') && name.includes('LIP')) {
        const slot = parseHookSlot(name)
        if (slot) useSimulationUiStore.getState().setLcdPage(slot)
        return
      }

      if (
        name.includes('LCD_SCREEN') ||
        name.includes('LCD SCREEN') ||
        name.includes('LCDSCREEN') ||
        name === 'LCD'
      ) {
        useSimulationUiStore.getState().toggleLcdList()
      }
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    return () => el.removeEventListener('pointerdown', onPointerDown, true)
  }, [camera, gl, targetsRef])

  return null
}
