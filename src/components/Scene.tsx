import React, { useEffect, useRef, Suspense, useState, useCallback } from 'react'
import { useLoader, useFrame, useThree } from '@react-three/fiber'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import * as THREE from 'three'
import GUI from 'lil-gui'
import { useMachineStore } from '../store/machineStore'
import { usePartHoverStore } from '../store/partHoverStore'
import { useSlotSnapshotStore } from '../store/slotSnapshotStore'
import { slotManager } from '../simulation/SlotManager'
import type { SlotState } from '../simulation/SlotManager'
import { findObjectByNameFlexible } from '../utils/fbxFind'
import { UMBRELLA_PART_BASE_NAMES_BY_SLOT } from '../constants/umbrellaPartNames'
import { MODEL_ASSEMBLY_PARTS, type ModelAssemblyPartId } from '../constants/modelAssemblyParts'
import { useModelAssemblyVisibilityStore } from '../store/modelAssemblyVisibilityStore'
import { SimulationRaycast } from './SimulationRaycast'

/**
 * Fallback shaft center (model/file units — Fusion often exports mm) when Shaft_Opening / Hub missing.
 * Pivot is refined from Shaft_Opening or Hub_Collar AABB center when present.
 */
const FALLBACK_SHAFT_CENTER_MODEL = new THREE.Vector3(300, 250, 0)

/** Fusion impeller pivot (hub center, mm in source file space) — refines from Impeller_Hub AABB when present */
const IMPELLER_PIVOT_FUSION_MM = new THREE.Vector3(300, 250, 45)

/** Objects that rotate with the motor (volute casing / discharge stay on static fbx tree) */
const IMPELLER_SPIN_PART_BASES = [
  'Impeller_Hub',
  'Impeller_Shroud',
  'Motor_Shaft',
  ...Array.from({ length: 12 }, (_, i) => `Impeller_Blade_${i + 1}`),
] as const

function applySlotIndicatorLeds(meshes: THREE.Mesh[], slot: SlotState | undefined) {
  let emissive = 0x080808
  let intensity = 0.25
  if (!slot?.occupied || slot.status === 'empty') {
    emissive = 0x040404
    intensity = 0.15
  } else if (slot.status === 'wet') {
    emissive = 0xff3300
    intensity = 1.3
  } else if (slot.status === 'drying') {
    emissive = 0xffcc00
    intensity = 1.1
  } else if (slot.status === 'ready') {
    emissive = 0x22ff77
    intensity = 1.2
  }
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const mat = m as THREE.MeshStandardMaterial
      if (!mat) continue
      if (!mat.emissive) mat.emissive = new THREE.Color()
      mat.emissive.setHex(emissive)
      mat.emissiveIntensity = intensity
    }
  }
}

function isDescendantOf(ancestor: THREE.Object3D, node: THREE.Object3D) {
  let p = node.parent
  while (p) {
    if (p === ancestor) return true
    p = p.parent
  }
  return false
}

function isUnderAncestor(node: THREE.Object3D | null, ancestor: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = node
  while (p) {
    if (p === ancestor) return true
    p = p.parent
  }
  return false
}

/** Resolve named umbrella bodies; duplicate UUIDs (parent/child in list) skipped. */
function collectDistinctUmbrellaRoots(fbx: THREE.Object3D, baseNames: readonly string[]) {
  const seen = new Set<string>()
  const out: THREE.Object3D[] = []
  for (const baseName of baseNames) {
    const obj = findObjectByNameFlexible(fbx, baseName)
    if (!obj || seen.has(obj.uuid)) continue
    seen.add(obj.uuid)
    out.push(obj)
  }
  return out
}

/** Fusion clearance: Ring_Flange drives swing radius past cabinet — keep static, not on spinner. */
function isRingFlangePartName(name: string) {
  return name.toLowerCase().includes('ring_flange')
}

/**
 * Reparent every top-level Ring_Flange subtree from `rotatingRoot` to `staticRoot` (e.g. FBX root).
 * Uses Object3D.attach so world transform is preserved (stays visually aligned after rack spins).
 */
function detachRingFlangesToCabinet(rotatingRoot: THREE.Object3D, staticRoot: THREE.Object3D) {
  rotatingRoot.updateMatrixWorld(true)
  const matches: THREE.Object3D[] = []
  rotatingRoot.traverse((obj) => {
    if (obj === rotatingRoot) return
    if (isRingFlangePartName(obj.name)) matches.push(obj)
  })
  const topMost = matches.filter(
    (m) => !matches.some((other) => other !== m && isDescendantOf(other, m))
  )
  topMost.forEach((node) => staticRoot.attach(node))
}

/** Fusion bodies under Safety_Systems that export with bad transforms (stray on floor). */
const STRAY_SAFETY_PART_IDS = ['intake_vent_7', 'thermal_cutoff_bracket'] as const

function isStraySafetyPartName(name: string) {
  const n = name.toLowerCase()
  return STRAY_SAFETY_PART_IDS.some((id) => n.includes(id))
}

/** Move object by world-space Y delta using parent rotation (handles tilted hierarchies). */
function applyWorldDeltaY(obj: THREE.Object3D, deltaY: number) {
  if (deltaY === 0) return
  const parent = obj.parent
  if (!parent) return
  const q = new THREE.Quaternion()
  parent.getWorldQuaternion(q)
  const localDelta = new THREE.Vector3(0, deltaY, 0).applyQuaternion(q.clone().invert())
  obj.position.add(localDelta)
}

/** Body should not ride the door pivot (wrong placement in this FBX export). */
function shouldExcludeFromDoorSwing(obj: THREE.Object3D) {
  return isStraySafetyPartName(obj.name)
}

/**
 * Fusion `Safety_Systems:1` is one component: every body listed under it (hinges,
 * handle, interlock LED, vents, etc.) should swing together with `Door_Panel`.
 * If that group exists, attach all direct children to the hinge pivot only.
 *
 * Fallback: heuristic / explicit parts when FBX nests differently (e.g. no Safety_Systems).
 */
function gatherDoorSwingParts(root: THREE.Object3D, door: THREE.Object3D) {
  const safety = findObjectByNameFlexible(root, 'Safety_Systems')
  const seen = new Set<string>()
  const out: THREE.Object3D[] = []

  const pushPart = (obj: THREE.Object3D | null | undefined) => {
    if (!obj) return
    if (seen.has(obj.uuid)) return
    if (obj.name === 'DoorPivot' || obj.name === 'DoorPivotFallback') return
    seen.add(obj.uuid)
    out.push(obj)
  }

  if (safety && safety.children.length > 0) {
    safety.children.forEach((child) => {
      if (shouldExcludeFromDoorSwing(child)) return
      pushPart(child)
    })
    // FBX hierarchy: Door_Panel is often sibling of Safety_Systems (not inside it).
    const doorWrappedBySwingSubset = !!(
      door &&
      out.some((p) => p === door || isDescendantOf(p, door))
    )
    if (door && !doorWrappedBySwingSubset) pushPart(door)
    return out
  }

  const parent = door.parent

  const consider = (obj: THREE.Object3D | null | undefined) => {
    if (!obj) return
    if (seen.has(obj.uuid)) return
    if (obj !== door && isDescendantOf(door, obj)) return
    seen.add(obj.uuid)
    out.push(obj)
  }

  consider(door)

  const explicitSwingNames = ['Door_Handle_Bar', 'Door_Safety_Interlock']
  explicitSwingNames.forEach((base) =>
    consider(findObjectByNameFlexible(root, base))
  )

  if (parent) {
    parent.children.forEach((child) => {
      if (child.name === 'DoorPivot' || child.name === 'DoorPivotFallback') return
      const n = child.name.toLowerCase()
      const isCabinetLed = n.includes('interlock_led') || n.includes('_led')
      if (
        n.includes('door_panel') ||
        n.includes('door_handle') ||
        n.includes('handle_') ||
        n.includes('door_safety') ||
        (n.includes('interlock') && !isCabinetLed)
      ) {
        consider(child)
      }
    })
  }

  return out
}

function PartHoverRaycast({ root }: { root: THREE.Object3D }) {
  const { camera, gl } = useThree()
  const raycaster = React.useMemo(() => new THREE.Raycaster(), [])
  const ndc = React.useMemo(() => new THREE.Vector2(), [])
  const setHovered = usePartHoverStore((s) => s.setHovered)

  React.useEffect(() => {
    const el = gl.domElement

    const pickName = (obj: THREE.Object3D): string => {
      let cur: THREE.Object3D | null = obj
      while (cur && cur !== root) {
        const n = cur.name?.trim()
        if (n) return n
        cur = cur.parent
      }
      return ''
    }

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)

      const hits = raycaster.intersectObject(root, true)
      const hit = hits.find(
        (h) =>
          (h.object as THREE.Mesh).isMesh &&
          h.object.visible &&
          !h.object.userData?.ignoreHover
      )

      if (hit?.object) {
        const raw = pickName(hit.object).trim()
        const label =
          raw || hit.object.parent?.name?.trim() || hit.object.type
        el.style.cursor = 'pointer'
        setHovered(label || 'Unknown', e.clientX, e.clientY)
      } else {
        el.style.cursor = ''
        setHovered(null, e.clientX, e.clientY)
      }
    }

    const onLeave = () => {
      el.style.cursor = ''
      setHovered(null, 0, 0)
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.style.cursor = ''
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [camera, gl, ndc, raycaster, root, setHovered])

  return null
}

function UmbrellaDryerModel() {
  const fbx = useLoader(FBXLoader, '/Umbrella_Dryer.fbx')
  /** Pivot at shaft center; Rotating_Rack + Umbrella_Rack_Assembly are attached here */
  const rackRotationPivotRef = useRef<THREE.Group | null>(
    null
  ) as React.MutableRefObject<THREE.Group | null>
  const animClockRef = useRef(new THREE.Clock())
  const impellerGroupRef = useRef<THREE.Group | null>(
    null
  ) as React.MutableRefObject<THREE.Group | null>
  const impellerBladeMeshesRef = useRef<THREE.Mesh[]>([])
  const fanAmbientRef = useRef<HTMLAudioElement | null>(null)
  const doorRef = useRef<THREE.Object3D | null>(null)
  const doorPartsRef = useRef<THREE.Object3D[]>([])
  const doorPivotRef = useRef<THREE.Group | null>(null)
  const doorHingeAxisRef = useRef(new THREE.Vector3(0, 1, 0))
  const doorClosedQuatRef = useRef<THREE.Quaternion | null>(null)
  const doorFallbackClosedQuatRef = useRef<THREE.Quaternion | null>(null)
  const doorFallbackOpenQuatRef = useRef<THREE.Quaternion | null>(null)
  const doorDebugLoggedRef = useRef(false)
  const coilRefs = useRef<THREE.Mesh[]>([])
  const modelRef = useRef<THREE.Group>(null)
  const interactionTargetsRef = useRef<THREE.Object3D[]>([])
  const slotLedMapRef = useRef<Map<number, THREE.Mesh[]>>(new Map())
  /** Umbrella meshes per rack slot — visibility tracks `occupied` (insert/remove). */
  const slotUmbrellaPartRootsRef = useRef<Map<number, THREE.Object3D[]>>(new Map())
  /** Major FBX assemblies — visibility driven by modelAssemblyVisibilityStore. */
  const assemblyRootsRef = useRef<Map<ModelAssemblyPartId, THREE.Object3D>>(new Map())
  const powerLedMeshRef = useRef<THREE.Mesh | null>(null)
  const ledDiscoveryLoggedRef = useRef(false)
  const snapshotAccRef = useRef(0)

  useEffect(() => {
    if (!fbx) return

    // Reset root transform first (important for CAD exports with large coordinates)
    fbx.position.set(0, 0, 0)
    // Fusion export orientation fix:
    // make current "front panel" face downward so the cabinet stands upright.
    fbx.rotation.set(-Math.PI / 2, 0, 0)
    fbx.scale.set(1, 1, 1)

    // Measure original bounds and scale to target size
    const initialBox = new THREE.Box3().setFromObject(fbx)
    const initialSize = initialBox.getSize(new THREE.Vector3())
    const maxDim = Math.max(initialSize.x, initialSize.y, initialSize.z)
    const scale = maxDim > 0 ? 3 / maxDim : 1
    fbx.scale.setScalar(scale)

    // Recompute bounds after scaling, then center and place on ground
    const scaledBox = new THREE.Box3().setFromObject(fbx)
    const center = scaledBox.getCenter(new THREE.Vector3())
    fbx.position.set(-center.x, -scaledBox.min.y - 1.5, -center.z)

    // Enable shadows and improve materials
    fbx.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        const mesh = child as THREE.Mesh
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial
          if (mat.metalness !== undefined) mat.metalness = 0.3
          if (mat.roughness !== undefined) mat.roughness = 0.6
          // Prevent CAD black meshes from disappearing against dark background
          if (mat.color && mat.color.getHex() === 0x000000) {
            mat.color.setHex(0x444444)
          }
        }
      }
    })

    const strayPartRoots = ['Intake_Vent_7', 'Thermal_Cutoff_Bracket']
    strayPartRoots.forEach((base) => {
      const node = findObjectByNameFlexible(fbx, base)
      if (node) {
        node.visible = false
        node.traverse((c) => {
          c.visible = false
        })
      }
    })

    // Rack rotation: pivot at shaft center; Rotating_Rack + Umbrella_Rack_Assembly move as one unit.
    // Ring_Flange parts stay cabinet-fixed (detach from spinning subtree).
    const rackRotationPivot = new THREE.Group()
    rackRotationPivot.name = 'RackRotationPivot'

    fbx.updateMatrixWorld(true)

    const pivotWorld = new THREE.Vector3()
    const shaftRef =
      findObjectByNameFlexible(fbx, 'Shaft_Opening') ||
      findObjectByNameFlexible(fbx, 'Hub_Collar')
    if (shaftRef) {
      shaftRef.updateMatrixWorld(true)
      const sb = new THREE.Box3().setFromObject(shaftRef)
      if (!sb.isEmpty()) sb.getCenter(pivotWorld)
      else shaftRef.getWorldPosition(pivotWorld)
    } else {
      const approx = FALLBACK_SHAFT_CENTER_MODEL.clone()
      fbx.localToWorld(pivotWorld.copy(approx))
    }

    const pivotLocal = pivotWorld.clone()
    fbx.worldToLocal(pivotLocal)
    rackRotationPivot.position.copy(pivotLocal)
    fbx.add(rackRotationPivot)
    rackRotationPivotRef.current = rackRotationPivot

    const rotatingRack = findObjectByNameFlexible(fbx, 'Rotating_Rack')
    const umbrellaAsm = findObjectByNameFlexible(fbx, 'Umbrella_Rack_Assembly')
    const umbrellasOnly = findObjectByNameFlexible(fbx, 'Umbrellas')

    const CLEARANCE_BELOW_LOADCELL = 0.022

    const adjustCanopiesUnder = (root: THREE.Object3D | null) => {
      if (!root) return
      for (let i = 1; i <= 8; i++) {
        const canopy = findObjectByNameFlexible(root, `Canopy_S${i}`)
        if (!canopy) continue
        canopy.updateMatrixWorld(true)
        const canopyBoxBefore = new THREE.Box3().setFromObject(canopy)

        const loadCell = findObjectByNameFlexible(root, `LoadCell_S${i}`)
        let deltaY = 0
        if (loadCell) {
          loadCell.updateMatrixWorld(true)
          const lcBox = new THREE.Box3().setFromObject(loadCell)
          deltaY =
            lcBox.min.y - CLEARANCE_BELOW_LOADCELL - canopyBoxBefore.max.y
        } else {
          const hookArm = findObjectByNameFlexible(root, `Hook_Arm_S${i}`)
          if (!hookArm) continue
          hookArm.updateMatrixWorld(true)
          const armBox = new THREE.Box3().setFromObject(hookArm)
          deltaY = armBox.min.y - canopyBoxBefore.min.y
        }

        applyWorldDeltaY(canopy, deltaY)
      }
    }

    adjustCanopiesUnder(umbrellaAsm)

    if (rotatingRack && umbrellaAsm) {
      if (isDescendantOf(rotatingRack, umbrellaAsm)) {
        rackRotationPivot.attach(umbrellaAsm)
      } else if (isDescendantOf(umbrellaAsm, rotatingRack)) {
        rackRotationPivot.attach(rotatingRack)
      } else {
        rackRotationPivot.attach(rotatingRack)
        rackRotationPivot.attach(umbrellaAsm)
      }
    } else if (rotatingRack) {
      rackRotationPivot.attach(rotatingRack)
    } else if (umbrellaAsm) {
      rackRotationPivot.attach(umbrellaAsm)
    }

    if (
      umbrellasOnly &&
      !isUnderAncestor(umbrellasOnly, rackRotationPivot) &&
      (!umbrellaAsm || !isDescendantOf(umbrellaAsm, umbrellasOnly))
    ) {
      rackRotationPivot.attach(umbrellasOnly)
    }

    rackRotationPivot.updateMatrixWorld(true)
    detachRingFlangesToCabinet(rackRotationPivot, fbx)

    // Centrifugal impeller: pivot at hub (Fusion XYZ); casing / ducts remain on fbx.
    const impellerGroup = new THREE.Group()
    impellerGroup.name = 'ImpellerSpinGroup'
    fbx.updateMatrixWorld(true)

    const pivotWorldFusion = IMPELLER_PIVOT_FUSION_MM.clone().applyMatrix4(fbx.matrixWorld)
    const impellerPivotLocal = new THREE.Vector3()
    fbx.worldToLocal(impellerPivotLocal.copy(pivotWorldFusion))

    const hubForPivot = findObjectByNameFlexible(fbx, 'Impeller_Hub')
    if (hubForPivot) {
      hubForPivot.updateMatrixWorld(true)
      const hb = new THREE.Box3().setFromObject(hubForPivot)
      if (!hb.isEmpty()) {
        const ctr = new THREE.Vector3()
        hb.getCenter(ctr)
        fbx.worldToLocal(impellerPivotLocal.copy(ctr))
      }
    }

    impellerGroup.position.copy(impellerPivotLocal)
    fbx.add(impellerGroup)

    impellerGroupRef.current = impellerGroup

    const impellerCandidates: THREE.Object3D[] = []
    for (const base of IMPELLER_SPIN_PART_BASES) {
      const obj = findObjectByNameFlexible(fbx, base)
      if (!obj) continue
      if (isUnderAncestor(obj, impellerGroup)) continue
      if (isUnderAncestor(obj, rackRotationPivot)) continue
      impellerCandidates.push(obj)
    }
    const topImpellerNodes = impellerCandidates.filter(
      (obj) =>
        !impellerCandidates.some((other) => other !== obj && isDescendantOf(other, obj))
    )
    topImpellerNodes.forEach((node) => impellerGroup.attach(node))

    impellerGroup.updateMatrixWorld(true)

    const bladeMeshes: THREE.Mesh[] = []
    impellerGroup.traverse((ch) => {
      if (!(ch as THREE.Mesh).isMesh) return
      const n = ch.name.toLowerCase()
      if (!n.includes('impeller_blade')) return
      bladeMeshes.push(ch as THREE.Mesh)
    })
    impellerBladeMeshesRef.current = bladeMeshes

    // Get DOOR reference
    const door = findObjectByNameFlexible(fbx, 'Door_Panel')
    if (door) {
      doorRef.current = door
      doorFallbackClosedQuatRef.current = door.quaternion.clone()
      doorFallbackOpenQuatRef.current = door.quaternion
        .clone()
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI * 0.6, 0)))
      const hingeTop = findObjectByNameFlexible(fbx, 'Door_Hinge_Z100')
      const hingeBottom = findObjectByNameFlexible(fbx, 'Door_Hinge_Z20')
      let pivotCreated = false

      if (hingeTop && hingeBottom && door.parent) {
        const parent = door.parent
        fbx.updateMatrixWorld(true)

        const topWorld = new THREE.Vector3()
        const bottomWorld = new THREE.Vector3()
        hingeTop.getWorldPosition(topWorld)
        hingeBottom.getWorldPosition(bottomWorld)

        const topLocal = parent.worldToLocal(topWorld.clone())
        const bottomLocal = parent.worldToLocal(bottomWorld.clone())
        const hingeCenter = topLocal.clone().add(bottomLocal).multiplyScalar(0.5)
        // Real hinge line from Fusion (pins bottom→top). Snap near-vertical to world Y
        // so the panel stays straight (no subtle CAD diagonal).
        const worldUp = new THREE.Vector3(0, 1, 0)
        const hingeWorldAxis = bottomWorld.clone().sub(topWorld).normalize()
        if (hingeWorldAxis.lengthSq() < 1e-8) hingeWorldAxis.copy(worldUp)
        if (Math.abs(hingeWorldAxis.dot(worldUp)) > 0.92) {
          hingeWorldAxis.copy(worldUp).multiplyScalar(Math.sign(hingeWorldAxis.y) || 1)
        }
        parent.updateMatrixWorld(true)
        const parentWorldQuat = new THREE.Quaternion()
        parent.getWorldQuaternion(parentWorldQuat)
        const hingeAxis = hingeWorldAxis
          .clone()
          .applyQuaternion(parentWorldQuat.clone().invert())
          .normalize()

        if (hingeAxis.lengthSq() > 0.0001) {
          const doorPivot = new THREE.Group()
          doorPivot.name = 'DoorPivot'
          doorPivot.position.copy(hingeCenter)
          parent.add(doorPivot)

          const doorParts = gatherDoorSwingParts(fbx, door)
          doorParts.forEach((part) => doorPivot.attach(part))
          doorPartsRef.current = doorParts

          doorPivotRef.current = doorPivot
          doorHingeAxisRef.current.copy(hingeAxis)
          doorClosedQuatRef.current = doorPivot.quaternion.clone()
          pivotCreated = true
        }
      }

      // Hard fallback for CAD/FBX cases: build hinge pivot from door bounds.
      if (!pivotCreated && door.parent) {
        const parent = door.parent
        fbx.updateMatrixWorld(true)
        const worldBox = new THREE.Box3().setFromObject(door)
        const hingeWorld = new THREE.Vector3(
          worldBox.min.x,
          (worldBox.min.y + worldBox.max.y) * 0.5,
          (worldBox.min.z + worldBox.max.z) * 0.5
        )
        const hingeLocal = parent.worldToLocal(hingeWorld.clone())

        const doorPivot = new THREE.Group()
        doorPivot.name = 'DoorPivotFallback'
        doorPivot.position.copy(hingeLocal)
        parent.add(doorPivot)
        const doorPartsFb = gatherDoorSwingParts(fbx, door)
        doorPartsFb.forEach((part) => doorPivot.attach(part))
        doorPartsRef.current = doorPartsFb

        const bottomCorner = new THREE.Vector3(
          worldBox.min.x,
          worldBox.min.y,
          worldBox.min.z
        )
        const topCorner = new THREE.Vector3(
          worldBox.min.x,
          worldBox.max.y,
          worldBox.min.z
        )
        parent.worldToLocal(bottomCorner)
        parent.worldToLocal(topCorner)
        const hingeAxisFallback = topCorner.clone().sub(bottomCorner).normalize()
        if (hingeAxisFallback.lengthSq() < 1e-8) hingeAxisFallback.set(0, 1, 0)

        doorPivotRef.current = doorPivot
        doorHingeAxisRef.current.copy(hingeAxisFallback)
        doorClosedQuatRef.current = doorPivot.quaternion.clone()
        pivotCreated = true
      }

      if (!doorDebugLoggedRef.current) {
        doorDebugLoggedRef.current = true
        console.info('[DoorDebug]', {
          doorFound: !!door,
          hingeTopFound: !!hingeTop,
          hingeBottomFound: !!hingeBottom,
          hasDoorParent: !!door.parent,
          pivotCreated: !!doorPivotRef.current,
          pivotUsingFallbackBounds: !!doorPivotRef.current && !hingeTop,
          doorName: door.name,
          hingeTopName: hingeTop?.name ?? null,
          hingeBottomName: hingeBottom?.name ?? null,
        })
      }
    }

    // Get COIL references
    coilRefs.current = []
    for (let i = 1; i <= 8; i++) {
      const coil = fbx.getObjectByName(`Coil_Turn_${i}`) as THREE.Mesh
      if (coil) coilRefs.current.push(coil)
    }
    const heaterOuter = fbx.getObjectByName('Heater_Coil_Outer') as THREE.Mesh
    const plenumGlow = fbx.getObjectByName('Plenum_Glow') as THREE.Mesh
    if (heaterOuter) coilRefs.current.push(heaterOuter)
    if (plenumGlow) coilRefs.current.push(plenumGlow)

    // —— Interaction targets (capture-phase clicks, see SimulationRaycast) ——
    interactionTargetsRef.current = []
    const interactiveBaseNames = [
      'Button_START',
      'Dome_START',
      'Button_OVERRIDE',
      'Dome_OVERRIDE',
      'EStop_MushroomCap',
      'EStop_Shaft',
      'LCD_Screen',
      ...Array.from({ length: 8 }, (_, i) => `Hook_Lip_S${i + 1}`),
    ]
    interactiveBaseNames.forEach((bn) => {
      const obj = findObjectByNameFlexible(fbx, bn)
      if (obj) interactionTargetsRef.current.push(obj)
    })

    // —— Slot status LEDs + power indicator ——
    slotLedMapRef.current = new Map()
    fbx.traverse((ch) => {
      if (!(ch as THREE.Mesh).isMesh) return
      const nm = ch.name
      const low = nm.toLowerCase()
      if (!low.includes('led')) return
      const m = nm.match(/S[_\s]?(\d+)/i)
      if (!m) return
      const si = Number(m[1])
      if (si < 1 || si > 8) return
      const arr = slotLedMapRef.current.get(si) ?? []
      arr.push(ch as THREE.Mesh)
      slotLedMapRef.current.set(si, arr)
    })
    if (slotLedMapRef.current.size === 0 && !ledDiscoveryLoggedRef.current) {
      ledDiscoveryLoggedRef.current = true
      console.info(
        '[LED] No meshes matched pattern (name includes "led" and S#. Use FBX Inspector to rename if needed.'
      )
    }

    powerLedMeshRef.current = findObjectByNameFlexible(fbx, 'Power_LED') as THREE.Mesh | null

    slotUmbrellaPartRootsRef.current = new Map()
    for (let sid = 1; sid <= 8; sid++) {
      const names = UMBRELLA_PART_BASE_NAMES_BY_SLOT[sid]
      if (!names?.length) continue
      slotUmbrellaPartRootsRef.current.set(
        sid,
        collectDistinctUmbrellaRoots(fbx, names)
      )
    }

    const snapInit = slotManager.snapshot()
    slotUmbrellaPartRootsRef.current.forEach((roots, sid) => {
      const show = snapInit.slots[sid - 1]?.occupied === true
      roots.forEach((obj) => {
        obj.visible = show
      })
    })

    assemblyRootsRef.current = new Map()
    for (const part of MODEL_ASSEMBLY_PARTS) {
      const obj = findObjectByNameFlexible(fbx, part.search)
      if (obj) assemblyRootsRef.current.set(part.id, obj)
    }
    const asmVis = useModelAssemblyVisibilityStore.getState().visible
    assemblyRootsRef.current.forEach((obj, id) => {
      obj.visible = asmVis[id] !== false
    })

    useSlotSnapshotStore.getState().setSnapshot(snapInit)
  }, [fbx])

  useEffect(() => {
    const audio = new Audio('/fan-ambient.mp3')
    audio.loop = true
    audio.preload = 'auto'
    fanAmbientRef.current = audio
    return () => {
      audio.pause()
      fanAmbientRef.current = null
    }
  }, [])

  useEffect(() => {
    const gui = new GUI({ title: 'Machine (Rack + Impeller)', width: 320 })

    const rackFolder = gui.addFolder('Rack rotation')
    const rackState = { rackRPM: useMachineStore.getState().rackRPM }
    const rackRpmCtrl = rackFolder
      .add(rackState, 'rackRPM', 0, 10, 0.05)
      .name('rack RPM')
      .onChange((v: number) => {
        useMachineStore.getState().setRackRPM(v)
      })
    rackFolder.add(
      {
        pauseResumeRack: () => useMachineStore.getState().toggleRackRotationPaused(),
      },
      'pauseResumeRack'
    ).name('Pause / Resume rack')

    const impFolder = gui.addFolder('Impeller (centrifugal fan)')
    const impState = {
      impellerRPM: useMachineStore.getState().impellerRPM,
      spin: useMachineStore.getState().impellerSpinEnabled,
    }
    const impRpmCtrl = impFolder
      .add(impState, 'impellerRPM', 0, 3000, 1)
      .name('Impeller RPM')
      .onChange((v: number) => {
        useMachineStore.getState().setImpellerRPM(v)
      })
    const impSpinCtrl = impFolder
      .add(impState, 'spin')
      .name('Fan ON')
      .onChange((v: boolean) => {
        useMachineStore.getState().setImpellerSpinEnabled(v)
      })
    const readout = { line: '' as string }
    const readoutCtrl = impFolder.add(readout, 'line').name('Status').disable()

    const syncReadout = () => {
      const s = useMachineStore.getState()
      readout.line = `${s.impellerRPM.toFixed(0)} RPM · ${s.impellerSpinEnabled ? 'spinning' : 'stopped'}`
      readoutCtrl.updateDisplay()
    }
    syncReadout()

    const unsub = useMachineStore.subscribe((s) => {
      rackState.rackRPM = s.rackRPM
      rackRpmCtrl.updateDisplay()
      impState.impellerRPM = s.impellerRPM
      impState.spin = s.impellerSpinEnabled
      impRpmCtrl.updateDisplay()
      impSpinCtrl.updateDisplay()
      syncReadout()
    })

    impFolder.open()
    rackFolder.open()

    const sceneFolder = gui.addFolder('View')
    const viewState = { cadLighting: useMachineStore.getState().cadViewLighting }
    const cadCtrl = sceneFolder
      .add(viewState, 'cadLighting')
      .name('CAD lighting')
      .onChange((v: boolean) => {
        useMachineStore.getState().setCadViewLighting(v)
      })
    const unsubCad = useMachineStore.subscribe((st) => {
      viewState.cadLighting = st.cadViewLighting
      cadCtrl.updateDisplay()
    })

    sceneFolder.open()

    // Collapsed by default (title still visible — click to expand). Parts panel stays open in UI.
    gui.close()

    return () => {
      unsubCad()
      unsub()
      gui.destroy()
    }
  }, [])

  useFrame(() => {
    const delta = animClockRef.current.getDelta()
    useMachineStore.getState().processResumeTimers()

    const sys = useMachineStore.getState()
    const chamberSealed = !sys.doorOpen && sys.doorLocked
    const allowSim =
      sys.systemActive && !sys.eStopLatched && chamberSealed
    const allowMotion =
      sys.systemActive && !sys.eStopLatched && chamberSealed

    if (allowSim) {
      slotManager.updateAllSlots(delta)
      const slots = slotManager.getSlots()
      const occupied = slots.filter((s) => s.occupied)
      const allReady =
        occupied.length > 0 &&
        occupied.every((s) => s.status === 'ready')
      if (allReady && sys.status === 'running') {
        useMachineStore.getState().pauseCycle()
        useSlotSnapshotStore.getState().setSnapshot(slotManager.snapshot())
      }
    }

    snapshotAccRef.current += delta
    if (snapshotAccRef.current >= 0.125) {
      snapshotAccRef.current = 0
      useSlotSnapshotStore.getState().setSnapshot(slotManager.snapshot())
    }

    const slotSnap = slotManager.snapshot()
    slotLedMapRef.current.forEach((meshes, sid) => {
      applySlotIndicatorLeds(meshes, slotSnap.slots[sid - 1])
    })

    slotUmbrellaPartRootsRef.current.forEach((roots, sid) => {
      const occupied = slotSnap.slots[sid - 1]?.occupied === true
      roots.forEach((obj) => {
        obj.visible = occupied
      })
    })

    const asmVisFrame = useModelAssemblyVisibilityStore.getState().visible
    assemblyRootsRef.current.forEach((obj, id) => {
      obj.visible = asmVisFrame[id] !== false
    })

    const pwLed = powerLedMeshRef.current
    if (pwLed?.material) {
      const mat = pwLed.material as THREE.MeshStandardMaterial
      if (!mat.emissive) mat.emissive = new THREE.Color()
      const powered = !sys.eStopLatched
      mat.emissive.setHex(powered ? 0x00dd44 : 0x330000)
      mat.emissiveIntensity = powered ? 1.15 : 0.25
    }

    const {
      rackRPM,
      rackRotationPaused,
      impellerRPM,
      impellerSpinEnabled,
      heatLevel,
      doorOpen,
    } = sys

    // ω = 2π·RPM/60 (rad/s); local Z matches Fusion-style “vertical Z” after root −90° X orientation fix.
    if (
      rackRotationPivotRef.current &&
      allowMotion &&
      !rackRotationPaused &&
      rackRPM !== 0
    ) {
      const omega = (2 * Math.PI * rackRPM) / 60
      rackRotationPivotRef.current.rotation.z += omega * delta
    }

    // Counter-clockwise about local +Z when viewed along +Z (Fusion blower convention).
    if (
      impellerGroupRef.current &&
      allowMotion &&
      impellerSpinEnabled &&
      impellerRPM !== 0
    ) {
      const omegaImp = (2 * Math.PI * impellerRPM) / 60
      impellerGroupRef.current.rotation.z += omegaImp * delta
    }

    const blurBlades =
      allowMotion &&
      impellerSpinEnabled &&
      impellerRPM > 500 &&
      impellerRPM > 0
    for (const mesh of impellerBladeMeshesRef.current) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial
        if (!mat || mat.opacity === undefined) continue
        mat.transparent = blurBlades
        mat.opacity = blurBlades ? 0.85 : 1
      }
    }

    const ambience = fanAmbientRef.current
    if (ambience) {
      if (allowMotion && impellerSpinEnabled && impellerRPM > 0) {
        ambience.playbackRate = THREE.MathUtils.clamp(impellerRPM / 1450, 0.2, 3)
        if (ambience.paused) void ambience.play().catch(() => {})
      } else if (!ambience.paused) {
        ambience.pause()
      }
    }

    coilRefs.current.forEach((coil) => {
      if (coil.material) {
        const mat = coil.material as THREE.MeshStandardMaterial
        if (!allowSim || heatLevel < 0.3) {
          mat.color.setHex(0x888888)
          mat.emissive?.setHex(0x000000)
          mat.emissiveIntensity = 0
        } else if (heatLevel < 0.6) {
          mat.color.setHex(0xff4400)
          mat.emissive?.setHex(0xff2200)
          mat.emissiveIntensity = heatLevel * 1.5
        } else {
          mat.color.setHex(0xff8800)
          mat.emissive?.setHex(0xff4400)
          mat.emissiveIntensity = heatLevel * 2
        }
      }
    })

    if (doorPivotRef.current && doorClosedQuatRef.current) {
      const targetAngle = doorOpen ? -Math.PI * 0.65 : 0
      const axisRotation = new THREE.Quaternion().setFromAxisAngle(
        doorHingeAxisRef.current,
        targetAngle
      )
      // Apply hinge rotation relative to the closed pose.
      const targetQuat = doorClosedQuatRef.current.clone().multiply(axisRotation).normalize()
      const damping = 1 - Math.exp(-10 * delta)
      doorPivotRef.current.quaternion.slerp(targetQuat, damping)
    } else if (doorRef.current && doorFallbackClosedQuatRef.current && doorFallbackOpenQuatRef.current) {
      // Guaranteed fallback: animate door panel locally if hinge pivot is unavailable.
      const targetQuat = doorOpen ? doorFallbackOpenQuatRef.current : doorFallbackClosedQuatRef.current
      const damping = 1 - Math.exp(-10 * delta)
      doorRef.current.quaternion.slerp(targetQuat, damping)
    }

    const interlockLED = fbx.getObjectByName('Interlock_LED') as THREE.Mesh
    if (interlockLED?.material) {
      const mat = interlockLED.material as THREE.MeshStandardMaterial
      mat.color.setHex(doorOpen ? 0xff0000 : 0x00ff00)
      mat.emissive?.setHex(doorOpen ? 0xff0000 : 0x00ff00)
      mat.emissiveIntensity = 1.5
    }
  })

  return (
    <>
      <primitive ref={modelRef} object={fbx} />
      <PartHoverRaycast root={fbx} />
      <SimulationRaycast targetsRef={interactionTargetsRef} />
    </>
  )
}

function FallbackModel() {
  const {
    rackRPM,
    rackRotationPaused,
    impellerRPM,
    impellerSpinEnabled,
    heatLevel,
    doorOpen,
    doorLocked,
    systemActive,
    eStopLatched,
  } = useMachineStore()
  const allowMotion =
    systemActive && !eStopLatched && !doorOpen && doorLocked
  const fbClockRef = useRef(new THREE.Clock())
  const rackRef = useRef<THREE.Group>(null)
  const fanRef = useRef<THREE.Group>(null)
  const doorMeshRef = useRef<THREE.Mesh>(null)
  const coilRef = useRef<THREE.Mesh>(null)
  const ledRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const delta = fbClockRef.current.getDelta()
    if (rackRef.current && allowMotion && !rackRotationPaused && rackRPM !== 0) {
      const omega = (2 * Math.PI * rackRPM) / 60
      rackRef.current.rotation.z += omega * delta
    }
    if (
      fanRef.current &&
      allowMotion &&
      impellerSpinEnabled &&
      impellerRPM !== 0
    ) {
      fanRef.current.rotation.z +=
        ((2 * Math.PI * impellerRPM) / 60) * delta
    }
    if (doorMeshRef.current) {
      const target = doorOpen ? -Math.PI / 2 : 0
      doorMeshRef.current.rotation.y = THREE.MathUtils.lerp(
        doorMeshRef.current.rotation.y,
        target,
        0.05
      )
    }
    if (coilRef.current) {
      const mat = coilRef.current.material as THREE.MeshStandardMaterial
      if (!allowMotion || heatLevel < 0.3) {
        mat.color.setHex(0x888888)
        mat.emissive?.setHex(0x000000)
        mat.emissiveIntensity = 0
      } else if (heatLevel < 0.6) {
        mat.color.setHex(0xff4400)
        mat.emissive?.setHex(0xff2200)
        mat.emissiveIntensity = heatLevel * 1.5
      } else {
        mat.color.setHex(0xff8800)
        mat.emissive?.setHex(0xff4400)
        mat.emissiveIntensity = heatLevel * 2
      }
    }
    if (ledRef.current) {
      const mat = ledRef.current.material as THREE.MeshStandardMaterial
      mat.color.setHex(doorOpen ? 0xff0000 : 0x00ff00)
      mat.emissive?.setHex(doorOpen ? 0xff0000 : 0x00ff00)
      mat.emissiveIntensity = 1.5
    }
  })

  return (
    <group>
      {/* Cabinet body */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 2.4, 1.2]} />
        <meshStandardMaterial color="#d4d4d8" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Door */}
      <mesh ref={doorMeshRef} position={[-0.76, 0, 0]} castShadow>
        <boxGeometry args={[0.04, 2.2, 1.0]} />
        <meshStandardMaterial color="#e4e4e7" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Top vent */}
      <mesh position={[0, 1.25, 0]} castShadow>
        <boxGeometry args={[1.4, 0.1, 1.0]} />
        <meshStandardMaterial color="#a1a1aa" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Central shaft */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.0, 16]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Rotating rack arms */}
      <group ref={rackRef}>
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            position={[0, 0.3, 0]}
            rotation={[0, (i * Math.PI) / 2, 0]}
          >
            <boxGeometry args={[0.5, 0.03, 0.03]} />
            <meshStandardMaterial color="#a1a1aa" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
      {/* Fan */}
      <group ref={fanRef} position={[0, 1.0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.3, 0.3, 0.1, 24]} />
          <meshStandardMaterial color="#52525b" metalness={0.7} roughness={0.2} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={i}
            rotation={[0, (i * Math.PI) / 3, 0]}
            position={[0.15, 0, 0]}
          >
            <boxGeometry args={[0.15, 0.02, 0.04]} />
            <meshStandardMaterial color="#71717a" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
      {/* Heater coils */}
      <mesh ref={coilRef} position={[0, -0.8, 0.5]}>
        <torusGeometry args={[0.25, 0.02, 8, 32]} />
        <meshStandardMaterial color="#888888" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Control panel */}
      <mesh position={[0.76, 0.8, 0]}>
        <boxGeometry args={[0.04, 0.4, 0.3]} />
        <meshStandardMaterial color="#27272a" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* LED indicator */}
      <mesh ref={ledRef} position={[0.76, 0.95, 0]}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshStandardMaterial
          color="#00ff00"
          emissive="#00ff00"
          emissiveIntensity={1.5}
        />
      </mesh>
    </group>
  )
}

function ModelWithErrorBoundary() {
  const [hasError, setHasError] = useState(false)

  const handleError = useCallback(() => {
    setHasError(true)
  }, [])

  if (hasError) {
    return <FallbackModel />
  }

  return (
    <ErrorBoundary onError={handleError} fallback={<FallbackModel />}>
      <UmbrellaDryerModel />
    </ErrorBoundary>
  )
}

class ErrorBoundaryInner extends React.Component<
  { children: React.ReactNode; onError: () => void; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: {
    children: React.ReactNode
    onError: () => void
    fallback: React.ReactNode
  }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

function ErrorBoundary({
  children,
  onError,
  fallback,
}: {
  children: React.ReactNode
  onError: () => void
  fallback: React.ReactNode
}) {
  return (
    <ErrorBoundaryInner onError={onError} fallback={fallback}>
      {children}
    </ErrorBoundaryInner>
  )
}

function SceneFog() {
  const cadViewLighting = useMachineStore((s) => s.cadViewLighting)
  return (
    <fog attach="fog" args={[cadViewLighting ? '#1a1a2e' : '#0a0a0a', 8, 25]} />
  )
}

function SceneLighting() {
  const cadViewLighting = useMachineStore((s) => s.cadViewLighting)

  return cadViewLighting ? (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        position={[5, 10, 5]}
        intensity={0.82}
      />
      <directionalLight position={[3, 5, -3]} intensity={0.38} />
    </>
  ) : (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-3, 4, -2]} intensity={0.4} />
      <pointLight position={[0, 2, 3]} intensity={0.5} color="#ffffff" />
    </>
  )
}

export function Scene() {
  return (
    <>
      <SceneFog />
      <SceneLighting />

      {/* Ground plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.5, 0]}
        receiveShadow
      >
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.9} />
      </mesh>

      <gridHelper args={[20, 40, '#e0e0e0', '#f0f0f0']} position={[0, -1.49, 0]} />

      <Suspense fallback={<FallbackModel />}>
        <ModelWithErrorBoundary />
      </Suspense>
    </>
  )
}
