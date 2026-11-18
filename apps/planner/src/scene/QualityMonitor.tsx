import { useFrame, useThree } from "@react-three/fiber"
import { useRef } from "react"
import type { QualityTier } from "@/types"

export type QualitySample = { tier: QualityTier; fps: number }

/**
 * Mesure les FPS réels pendant les périodes de rendu continu et ajuste la
 * résolution en conséquence.
 *
 * Les scènes en `frameloop="demand"` ne rendent qu'une image lors d'une
 * interaction : on ignore donc les écarts > 200 ms entre deux images, sinon
 * une simple pause serait interprétée comme un effondrement des performances.
 */
const GAP_MS = 200
const MIN_FRAMES = 24
const MIN_SPAN_MS = 600
/** 3 échantillons ignorés : compilation des shaders, textures, herbe instanciée. */
const WARMUP_SAMPLES = 3
/** 2 échantillons ignorés après un changement : recompilation induite. */
const COOLDOWN_SAMPLES = 2

const RANK: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 }

function tierForFps(fps: number): QualityTier {
  if (fps < 35) return "low"
  if (fps < 50) return "medium"
  return "high"
}

export function dprForTier(tier: QualityTier, max: number): number {
  if (tier === "low") return 1
  if (tier === "medium") return Math.min(1.25, max)
  return max
}

export function initialDpr(max: number): number {
  if (typeof window === "undefined") return 1
  return Math.min(window.devicePixelRatio || 1, max)
}

export function QualityMonitor({
  maxDpr,
  onSample,
}: {
  maxDpr: number
  onSample: (sample: QualitySample) => void
}) {
  const setDpr = useThree((state) => state.setDpr)
  const invalidate = useThree((state) => state.invalidate)
  const last = useRef(0)
  const start = useRef(0)
  const count = useRef(0)
  const samples = useRef(0)
  const cooldown = useRef(0)
  const current = useRef<QualityTier>("high")
  const worse = useRef(0)
  const better = useRef(0)

  function applyTier(next: QualityTier) {
    current.current = next
    worse.current = 0
    better.current = 0
    cooldown.current = COOLDOWN_SAMPLES
    setDpr(dprForTier(next, maxDpr))
    invalidate()
  }

  useFrame(() => {
    const now = performance.now()
    if (start.current === 0 || now - last.current > GAP_MS) {
      start.current = now
      count.current = 0
      worse.current = 0
      better.current = 0
    }
    last.current = now
    count.current += 1

    const span = now - start.current
    if (count.current < MIN_FRAMES || span < MIN_SPAN_MS) return

    const fps = (count.current / span) * 1000
    start.current = now
    count.current = 0
    samples.current += 1

    if (cooldown.current > 0) {
      cooldown.current -= 1
      return
    }

    const next = tierForFps(fps)
    if (samples.current > WARMUP_SAMPLES && next !== current.current) {
      // Hystérésis : 3 mesures consécutives dans le même sens avant d'agir.
      if (RANK[next] < RANK[current.current]) {
        worse.current += 1
        better.current = 0
        if (worse.current >= 3) applyTier(next)
      } else {
        better.current += 1
        worse.current = 0
        if (better.current >= 3) applyTier(next)
      }
    } else {
      worse.current = 0
      better.current = 0
    }

    onSample({ tier: current.current, fps })
  })

  return null
}
