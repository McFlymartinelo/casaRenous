import { useEffect, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js"
import { usePlanner } from "@/store/planner"

export function Effects() {
  const { gl, scene, camera, size } = useThree()
  const ssao = usePlanner((state) => state.ambience.ambientOcclusion)
  const view = usePlanner((state) => state.view)
  const quality = usePlanner((state) => state.quality)
  // Le post-traitement SSAO est le poste le plus coûteux : réservé aux machines
  // qui tiennent le rythme, même si l'utilisateur l'a activé dans l'ambiance.
  const enabled = ssao && view === "3d" && quality === "high"

  const composer = useMemo(() => {
    if (!enabled) return null
    const next = new EffectComposer(gl)
    next.addPass(new RenderPass(scene, camera))
    const pass = new SSAOPass(scene, camera, size.width, size.height)
    pass.kernelRadius = 0.32
    pass.minDistance = 0.001
    pass.maxDistance = 0.14
    pass.output = SSAOPass.OUTPUT.Default
    next.addPass(pass)
    next.addPass(new OutputPass())
    next.setSize(size.width, size.height)
    return next
  }, [camera, enabled, gl, scene, size.height, size.width])

  useEffect(() => {
    return () => {
      composer?.dispose()
    }
  }, [composer])

  useEffect(() => {
    composer?.setSize(size.width, size.height)
  }, [composer, size.height, size.width])

  useFrame((_, delta) => {
    if (composer) composer.render(delta)
    else gl.render(scene, camera)
  }, 1)

  return null
}
