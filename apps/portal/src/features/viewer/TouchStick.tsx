import { useRef } from "react"
import type { WalkInput } from "./walk"

/** Rayon utile du stick, en pixels. */
const RADIUS = 38

/**
 * Stick virtuel pour la visite sur mobile : glisser dans le cercle pour avancer
 * (haut), reculer, et se déplacer latéralement. Écrit directement dans l'état
 * partagé avec la scène 3D, sans re-render React.
 */
export function TouchStick({ input }: { input: WalkInput }) {
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLSpanElement>(null)

  function update(event: React.PointerEvent<HTMLDivElement>) {
    const base = baseRef.current
    const knob = knobRef.current
    if (!base || !knob) return
    const rect = base.getBoundingClientRect()
    let dx = event.clientX - (rect.left + rect.width / 2)
    let dy = event.clientY - (rect.top + rect.height / 2)
    const distance = Math.hypot(dx, dy)
    if (distance > RADIUS) {
      dx = (dx / distance) * RADIUS
      dy = (dy / distance) * RADIUS
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`
    input.strafe = dx / RADIUS
    input.forward = -dy / RADIUS
  }

  function reset() {
    input.strafe = 0
    input.forward = 0
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)"
  }

  return (
    <div
      ref={baseRef}
      className="app-viewer__stick"
      role="presentation"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        update(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event)
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <span ref={knobRef} className="app-viewer__stick-knob" />
    </div>
  )
}
