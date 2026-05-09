import * as THREE from 'three'

export function findObjectByNameFlexible(root: THREE.Object3D, baseName: string) {
  const exact = root.getObjectByName(baseName)
  if (exact) return exact

  const lower = baseName.toLowerCase()
  let match: THREE.Object3D | null = null
  root.traverse((obj) => {
    if (match) return
    const n = obj.name.toLowerCase()
    if (n === lower || n.startsWith(`${lower}:`) || n.startsWith(`${lower}_`) || n.includes(lower)) {
      match = obj
    }
  })
  return match
}
