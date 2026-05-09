import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { Suspense, useEffect } from 'react'
import { Scene } from './components/Scene'
import { usePartHoverStore } from './store/partHoverStore'
import { ControlPanel } from './components/ControlPanel'
import { InsertModal } from './components/InsertModal'
import { RetrieveModal } from './components/RetrieveModal'
import { FixedLcdSidebar } from './components/LcdHud'
import { AssemblyVisibilityPanel } from './components/AssemblyVisibilityPanel'
import { useMachineStore } from './store/machineStore'

function ElapsedTimer() {
  const { status, setElapsed, cycleTime, pauseCycle } =
    useMachineStore()

  useEffect(() => {
    if (status !== 'running') return
    const interval = setInterval(() => {
      const store = useMachineStore.getState()
      const next = store.elapsed + 0.1
      if (next >= store.cycleTime) {
        pauseCycle()
        return
      }
      setElapsed(next)
    }, 100)
    return () => clearInterval(interval)
  }, [status, setElapsed, cycleTime, pauseCycle])

  return null
}

function PartNameTooltip() {
  const label = usePartHoverStore((s) => s.label)
  const x = usePartHoverStore((s) => s.x)
  const y = usePartHoverStore((s) => s.y)

  if (!label) return null

  return (
    <div
      className="pointer-events-none fixed z-[100] max-w-sm rounded-lg border border-zinc-600/80 bg-zinc-900/95 px-3 py-2 font-mono text-xs text-zinc-100 shadow-xl backdrop-blur-sm"
      style={{ left: Math.min(x + 14, typeof window !== 'undefined' ? window.innerWidth - 280 : x), top: y + 14 }}
    >
      {label}
    </div>
  )
}

function CadBackgroundWatcher() {
  const cadViewLighting = useMachineStore((s) => s.cadViewLighting)
  return (
    <color
      attach="background"
      args={[cadViewLighting ? '#1a1a2e' : '#0a0a0a']}
    />
  )
}

function App() {
  return (
    <div className="h-screen w-screen bg-zinc-950 relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-6 py-4 bg-gradient-to-b from-zinc-950/90 to-transparent pointer-events-none">
        <h1 className="text-zinc-100 text-lg font-semibold tracking-tight">
          Smart Umbrella Dryer
        </h1>
        <p className="text-zinc-500 text-xs mt-0.5">
          3D Interactive Visualization
        </p>
      </div>

      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ position: [4, 3, 5], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false }}
        className="!absolute inset-0"
      >
        <CadBackgroundWatcher />
        <Suspense fallback={null}>
          <Environment preset="warehouse" environmentIntensity={0.3} />
          <Scene />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={12}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>

      <PartNameTooltip />

      <FixedLcdSidebar />

      <AssemblyVisibilityPanel />

      {/* Control Panel */}
      <ControlPanel />

      <InsertModal />
      <RetrieveModal />

      {/* Elapsed timer logic */}
      <ElapsedTimer />
    </div>
  )
}

export default App
