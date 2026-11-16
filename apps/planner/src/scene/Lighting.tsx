import { useEffect, useMemo } from "react"
import { Environment, Lightformer, Sky, SoftShadows } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { HOUSE_CENTER, getLevel, getRooms } from "@/config/house"
import { sunState } from "@/lib/sun"
import { usePlanner } from "@/store/planner"

function Exposure() {
  const gl = useThree((state) => state.gl)
  const exposure = usePlanner((state) => state.ambience.exposure)
  useEffect(() => {
    gl.toneMappingExposure = exposure
  }, [exposure, gl])
  return null
}

export function Lighting() {
  const ambience = usePlanner((state) => state.ambience)
  const level = usePlanner((state) => state.level)
  const view = usePlanner((state) => state.view)
  const sun = useMemo(
    () => sunState(ambience.hour, ambience.latitude, ambience.dayOfYear),
    [ambience.hour, ambience.latitude, ambience.dayOfYear],
  )
  const target = useMemo(() => {
    const object = new THREE.Object3D()
    object.position.set(HOUSE_CENTER[0], 0, -HOUSE_CENTER[1])
    return object
  }, [])
  const levelConfig = getLevel(level)
  const rooms = getRooms(level).filter(
    (room) => (room.rect[2] - room.rect[0]) * (room.rect[3] - room.rect[1]) > 4,
  )
  const lampRooms = rooms.slice(0, 5)
  const hemiSky = useMemo(() => sun.skyTint.clone().lerp(new THREE.Color("#f7e7cf"), 0.42), [sun.skyTint])
  const hemiGround = useMemo(() => sun.horizonTint.clone().lerp(new THREE.Color("#b08a61"), 0.5), [sun.horizonTint])
  const centerZ = -HOUSE_CENTER[1]
  const sunDirection: [number, number, number] = [
    sun.direction[0],
    sun.direction[1],
    -sun.direction[2],
  ]
  const sunPosition: [number, number, number] = [
    HOUSE_CENTER[0] + sunDirection[0] * 42,
    Math.max(0.5, sunDirection[1] * 42),
    centerZ + sunDirection[2] * 42,
  ]
  const paper = "#f1ece3"
  const nightSky = "#1e2833"
  const [r, g, b] = [sun.skyTint.r, sun.skyTint.g, sun.skyTint.b]
  const skyColor = sun.isNight ? nightSky : `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`

  return (
    <>
      <color attach="background" args={[view === "plan" ? paper : skyColor]} />
      <fog attach="fog" args={[skyColor, 42, 110]} />
      {ambience.softShadows && view !== "walk" ? <SoftShadows size={10} samples={16} focus={0.4} /> : null}
      <hemisphereLight
        args={[hemiSky, hemiGround, 0.17 + sun.daylight * 0.22]}
      />
      <ambientLight color="#ffd8ab" intensity={0.08 + sun.daylight * 0.16} />
      <directionalLight
        target={target}
        position={[HOUSE_CENTER[0], 18, centerZ]}
        intensity={0.55 + sun.daylight * 0.35}
        color="#ffe0bd"
      />
      <primitive object={target} />
      <directionalLight
        target={target}
        position={sunPosition}
        intensity={Math.max(0.015, sun.intensity)}
        color={sun.color}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.00035}
        shadow-normalBias={0.022}
      />
      <directionalLight
        position={[
          HOUSE_CENTER[0] - sunDirection[0] * 25,
          16,
          centerZ - sunDirection[2] * 25,
        ]}
        intensity={(1 - sun.daylight) * 0.42}
        color="#9db7d6"
      />
      {view !== "plan" && !sun.isNight ? (
        <Sky
          distance={450000}
          sunPosition={[sunDirection[0] * 120, Math.max(0.01, sunDirection[1]) * 120, sunDirection[2] * 120]}
          turbidity={7 - sun.daylight * 2.2}
          rayleigh={sun.elevation < 12 ? 3.4 : 1.7}
          mieCoefficient={0.006}
          mieDirectionalG={0.86}
        />
      ) : null}
      {ambience.environmentHdri ? (
        <Environment
          files={`${import.meta.env.BASE_URL}${ambience.environmentHdri.replace(/^\//, "")}`}
          background={false}
          environmentIntensity={sun.environmentIntensity}
        />
      ) : (
        <Environment key={Math.round(ambience.hour * 4)} resolution={128} frames={1} background={false} environmentIntensity={sun.environmentIntensity}>
          <Lightformer
            form="rect"
            intensity={2.2 * sun.daylight + 0.15}
            color={sun.skyTint.clone().lerp(sun.horizonTint, 0.45)}
            position={[0, 16, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[30, 30, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.7 * sun.daylight + 0.08}
            color={sun.horizonTint}
            position={[0, -6, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[24, 24, 1]}
          />
          <Lightformer
            form="circle"
            intensity={sun.intensity * 0.55 + 0.2}
            color={sun.color}
            position={[sunDirection[0] * 20, Math.max(2, sunDirection[1] * 20), sunDirection[2] * 20]}
            scale={5}
          />
          <Lightformer
            form="rect"
            intensity={0.45 * sun.daylight + 0.06}
            color="#d9cbb8"
            position={[-12, 4, -8]}
            rotation={[0, Math.PI / 3, 0]}
            scale={[12, 6, 1]}
          />
        </Environment>
      )}
      {lampRooms.map((room) => {
        const x = (room.rect[0] + room.rect[2]) / 2
        const z = -(room.rect[1] + room.rect[3]) / 2
        return (
          <pointLight
            key={room.id}
            position={[x, levelConfig.elevation + levelConfig.ceilingHeight - 0.18, z]}
            intensity={Math.min(5.5, 1.15 + sun.lampIntensity * 0.55)}
            distance={6.2}
            decay={2}
            color="#ffc997"
          />
        )
      })}
      <Exposure />
    </>
  )
}
