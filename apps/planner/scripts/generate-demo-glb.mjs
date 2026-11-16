import fs from "node:fs"
import path from "node:path"
import * as THREE from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"

// GLTFExporter utilise FileReader pour assembler le GLB binaire.
globalThis.FileReader = class FileReaderPolyfill {
  constructor() {
    this.result = null
    this.onloadend = null
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.()
    })
  }
}

const scene = new THREE.Scene()
const vase = new THREE.Group()
vase.name = "Vase_sculptural"

const profile = [
  new THREE.Vector2(0.09, 0),
  new THREE.Vector2(0.12, 0.02),
  new THREE.Vector2(0.14, 0.12),
  new THREE.Vector2(0.1, 0.25),
  new THREE.Vector2(0.075, 0.34),
  new THREE.Vector2(0.085, 0.42),
  new THREE.Vector2(0.11, 0.5),
  new THREE.Vector2(0.105, 0.55),
]
const geometry = new THREE.LatheGeometry(profile, 48)
geometry.computeVertexNormals()
const ceramic = new THREE.MeshStandardMaterial({
  name: "Gres_sable",
  color: "#c7b59a",
  roughness: 0.62,
  metalness: 0.02,
})
const body = new THREE.Mesh(geometry, ceramic)
body.name = "Corps"
body.castShadow = true
body.receiveShadow = true
vase.add(body)

const stemMaterial = new THREE.MeshStandardMaterial({
  name: "Tiges_sechees",
  color: "#5a4732",
  roughness: 0.9,
  metalness: 0,
})
for (const [angle, height, lean] of [
  [0.2, 0.38, 0.12],
  [2.2, 0.31, -0.1],
  [4.1, 0.26, 0.06],
]) {
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, height, 8), stemMaterial)
  stem.name = "Tige"
  stem.position.set(Math.cos(angle) * 0.03, 0.53 + height / 2, Math.sin(angle) * 0.03)
  stem.rotation.z = lean
  stem.rotation.x = Math.cos(angle) * 0.08
  stem.castShadow = true
  vase.add(stem)
}

const leafMaterial = new THREE.MeshStandardMaterial({
  name: "Feuilles",
  color: "#7e8b63",
  roughness: 0.95,
  metalness: 0,
  side: THREE.DoubleSide,
})
for (const [x, y, z, rotation] of [
  [0.08, 0.78, 0.01, 0.7],
  [-0.05, 0.73, 0.05, -0.9],
  [0.02, 0.84, -0.06, 0.2],
]) {
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), leafMaterial)
  leaf.name = "Feuille"
  leaf.scale.set(0.75, 0.12, 0.3)
  leaf.position.set(x, y, z)
  leaf.rotation.set(0.4, rotation, 0.5)
  leaf.castShadow = true
  vase.add(leaf)
}

scene.add(vase)

const exporter = new GLTFExporter()
const output = path.resolve("apps/planner/public/models/vase-sculptural.glb")
fs.mkdirSync(path.dirname(output), { recursive: true })

exporter.parse(
  scene,
  (result) => {
    const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result)
    fs.writeFileSync(output, buffer)
    console.log(`GLB écrit : ${output} (${buffer.byteLength} octets)`)
  },
  (error) => {
    console.error("Export GLB impossible", error)
    process.exitCode = 1
  },
  { binary: true, trs: true },
)
