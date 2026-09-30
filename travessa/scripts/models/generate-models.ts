// Builds the Casa do Mar demo 3D dishes as real GLB files (metres, Y-up).
// In production these come from photogrammetry scans; the viewer pipeline is identical.
// Run: node scripts/models/generate-models.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { exportUsdz } from './usdz.ts'

// --- Node shims for GLTFExporter (binary path uses FileReader) --------------
class FileReaderShim {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = b
      this.onloadend?.()
    })
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`
      this.onloadend?.()
    })
  }
}
;(globalThis as unknown as { FileReader: unknown }).FileReader = FileReaderShim

// --- noise ------------------------------------------------------------------
function hash(x: number, y: number, z: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453
  return s - Math.floor(s)
}
const smooth = (t: number) => t * t * (3 - 2 * t)
function valueNoise(x: number, y: number, z: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi)
  let out = 0
  for (let dx = 0; dx <= 1; dx++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dz = 0; dz <= 1; dz++) {
        const w = (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf)
        out += w * hash(xi + dx, yi + dy, zi + dz, seed)
      }
  return out
}
function fbm(x: number, y: number, z: number, seed = 0, octaves = 4) {
  let a = 0.5, f = 1, sum = 0
  for (let i = 0; i < octaves; i++) {
    sum += a * valueNoise(x * f, y * f, z * f, seed + i * 7)
    a *= 0.5
    f *= 2.03
  }
  return sum
}

const C = (hex: string) => new THREE.Color(hex)
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.min(1, Math.max(0, t)))

function paint(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color) {
  const pos = geo.attributes.position
  geo.computeVertexNormals()
  const nor = geo.attributes.normal
  const colors = new Float32Array(pos.count * 3)
  const p = new THREE.Vector3(), n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nor, i)
    // THREE.Color parses hex into linear working space already; glTF vertex colours are linear.
    const c = fn(p, n)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function displace(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3) => THREE.Vector3) {
  const pos = geo.attributes.position
  const p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const q = fn(p)
    pos.setXYZ(i, q.x, q.y, q.z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

// Mesh density. 1 = full detail (GLB for the web viewer); lower builds the light
// iPhone AR copy. UVs are parametric, so textures line up across detail levels.
let DETAIL = 1
const seg = (n: number) => Math.max(8, Math.round(n * DETAIL))

const lathe = (pts: [number, number][], segments = 160) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg(segments))

function plate(radius = 0.12, color = '#f4f1ea') {
  const r = radius
  const geo = lathe([
    [0, 0.004], [r * 0.55, 0.004], [r * 0.6, 0.0], [r * 0.64, 0.0], [r * 0.7, 0.006],
    [r * 0.93, 0.014], [r, 0.017], [r * 0.995, 0.019], [r * 0.93, 0.0165], [r * 0.7, 0.0085],
    [r * 0.62, 0.0065], [0, 0.0065],
  ])
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.15 }))
  mesh.name = 'plate'
  return mesh
}

// --- Pastel de nata ---------------------------------------------------------
function pastelDeNata() {
  const group = new THREE.Group()
  const R = 0.034
  // Fluted, flaky pastry shell.
  const shell = lathe(
    [
      [0.0, 0.0], [R * 0.72, 0.0], [R * 0.8, 0.002], [R * 0.9, 0.012], [R * 0.99, 0.02], [R * 1.02, 0.0225],
      [R * 1.0, 0.0245], [R * 0.95, 0.0242], [R * 0.9, 0.021], [R * 0.86, 0.018], [0, 0.018],
    ],
    192,
  )
  displace(shell, (p) => {
    const a = Math.atan2(p.z, p.x)
    const h = p.y / 0.024
    const flute = 1 + 0.035 * Math.sin(a * 22) * Math.min(1, h * 1.4) + 0.012 * (fbm(p.x * 300, p.y * 900, p.z * 300, 3) - 0.5)
    // Spiral lamination ridges on the outer wall.
    const lam = 0.0006 * Math.sin(p.y * 2400 + a * 3)
    return new THREE.Vector3(p.x * flute + Math.cos(a) * lam, p.y, p.z * flute + Math.sin(a) * lam)
  })
  paint(shell, (p) => {
    const h = p.y / 0.0245
    const n = fbm(p.x * 400, p.y * 400, p.z * 400, 11)
    const base = mix(C('#e8b86a'), C('#c7843a'), h * 0.8 + n * 0.5)
    return mix(base, C('#6b3a16'), Math.max(0, h - 0.75) * 3 * n)
  })
  const shellMesh = new THREE.Mesh(shell, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }))
  shellMesh.name = 'massa-folhada'
  group.add(shellMesh)

  // Custard top with caramelised blisters: a dense polar grid carries the colour detail.
  const rings = seg(60), segs = seg(192)
  const verts: number[] = [], uvs: number[] = [], idx: number[] = []
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j <= segs; j++) {
      const r = (i / rings) * R * 0.9
      const a = (j / segs) * Math.PI * 2
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      const dome = 0.0068 * (1 - (r / (R * 0.9)) ** 2)
      const blister = 0.0014 * Math.max(0, fbm(x * 260, 0, z * 260, 5) - 0.45)
      verts.push(x, 0.0192 + dome + blister, z)
      // Planar UVs (top view) so the colour can be baked to a texture for iOS.
      uvs.push(0.5 + x / (2 * R * 0.9), 0.5 - z / (2 * R * 0.9))
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1
      // Counter-clockwise seen from above, so the custard faces up.
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const custard = new THREE.BufferGeometry()
  custard.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  custard.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  custard.setIndex(idx)
  paint(custard, (p) => {
    const r = Math.hypot(p.x, p.z) / (R * 0.9)
    const burn = fbm(p.x * 220, 0, p.z * 220, 5)
    const speck = fbm(p.x * 900, 0, p.z * 900, 9)
    let c = mix(C('#f7da82'), C('#e8b24a'), r * 0.8)
    c = mix(c, C('#b0621e'), (burn - 0.39) * 3.2)
    c = mix(c, C('#3a1f0c'), (burn - 0.52) * 6 + (speck - 0.66) * 4)
    return c
  })
  const custardMesh = new THREE.Mesh(custard, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48 }))
  custardMesh.name = 'creme'
  group.add(custardMesh)
  return group
}

// --- Pudim Abade de Priscos -------------------------------------------------
function pudim() {
  const group = new THREE.Group()
  group.add(plate(0.1))
  const base = 0.0065
  const flan = lathe(
    [
      [0, base], [0.043, base], [0.0445, base + 0.003], [0.041, base + 0.03], [0.038, base + 0.037],
      [0.034, base + 0.0395], [0.02, base + 0.041], [0, base + 0.041],
    ],
    160,
  )
  displace(flan, (p) => {
    const w = 1 + 0.01 * (fbm(p.x * 120, p.y * 120, p.z * 120, 2) - 0.5)
    return new THREE.Vector3(p.x * w, p.y, p.z * w)
  })
  paint(flan, (p) => {
    const h = (p.y - base) / 0.041
    const n = fbm(p.x * 200, p.y * 200, p.z * 200, 4)
    return mix(mix(C('#c97a24'), C('#8e4410'), h * 0.9), C('#5a260a'), (n - 0.55) * 2 + h * 0.3)
  })
  const flanMesh = new THREE.Mesh(
    flan,
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
  )
  flanMesh.name = 'pudim'
  group.add(flanMesh)

  // Irregular pool of caramel on the plate.
  const pool = new THREE.CircleGeometry(0.058, seg(160))
  pool.rotateX(-Math.PI / 2)
  displace(pool, (p) => {
    const a = Math.atan2(p.z, p.x)
    const r = Math.hypot(p.x, p.z)
    const edge = 1 + 0.18 * (valueNoise(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, 0, 8) - 0.5)
    return new THREE.Vector3(p.x * edge, base + 0.0006 + 0.0012 * (1 - r / 0.058), p.z * edge)
  })
  paint(pool, () => C('#6a2c09'))
  const poolMesh = new THREE.Mesh(pool, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 }))
  poolMesh.name = 'caramelo'
  group.add(poolMesh)
  return group
}

// --- Pastéis de bacalhau ----------------------------------------------------
function pastelDeBacalhau(seed: number) {
  const geo = new THREE.SphereGeometry(0.018, seg(64), seg(40))
  displace(geo, (p) => {
    // Quenelle: long, pointed ends, flat underside.
    const q = p.clone()
    q.x *= 1.75
    const t = Math.abs(q.x) / (0.018 * 1.75)
    const taper = 1 - 0.35 * t * t
    q.y *= 0.8 * taper
    q.z *= 0.92 * taper
    const bump = 1 + 0.06 * (fbm(p.x * 380, p.y * 380, p.z * 380, seed) - 0.5)
    q.multiplyScalar(bump)
    if (q.y < -0.009) q.y = -0.009 - (q.y + 0.009) * 0.15
    return q
  })
  paint(geo, (p, n) => {
    const k = fbm(p.x * 500, p.y * 500, p.z * 500, seed + 3)
    const crisp = fbm(p.x * 1400, p.y * 1400, p.z * 1400, seed + 5)
    let c = mix(C('#d99b45'), C('#9a5a1f'), k * 1.2 - 0.1 + (1 - n.y) * 0.15)
    c = mix(c, C('#5b3212'), (crisp - 0.7) * 3)
    return c
  })
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }))
  mesh.name = 'pastel'
  return mesh
}

function mayoRamekin() {
  const group = new THREE.Group()
  const bowl = lathe([[0, 0], [0.013, 0], [0.015, 0.002], [0.018, 0.016], [0.0185, 0.0175], [0.0172, 0.0175], [0.0158, 0.004], [0, 0.004]], 96)
  const bowlMesh = new THREE.Mesh(bowl, new THREE.MeshPhysicalMaterial({ color: '#f7f5ef', roughness: 0.2, clearcoat: 0.7 }))
  bowlMesh.name = 'taca'
  group.add(bowlMesh)
  const sauce = lathe([[0, 0.0125], [0.012, 0.0122], [0.0166, 0.0132], [0.0168, 0.0124], [0, 0.0118]], 96)
  displace(sauce, (p) => new THREE.Vector3(p.x, p.y + 0.0012 * (fbm(p.x * 300, 0, p.z * 300, 31) - 0.5), p.z))
  paint(sauce, (p) => mix(C('#f6ecbf'), C('#efd98a'), fbm(p.x * 500, 0, p.z * 500, 33)))
  const sauceMesh = new THREE.Mesh(sauce, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }))
  sauceMesh.name = 'maionese-de-limao'
  group.add(sauceMesh)
  return group
}

function pasteisDeBacalhau() {
  const group = new THREE.Group()
  group.add(plate(0.12))
  const spots: [number, number, number][] = [[-0.04, 0.014, 0.4], [-0.01, 0.03, -0.3], [0.002, -0.01, 0.9], [-0.034, -0.024, 0.1]]
  spots.forEach(([x, z, rot], i) => {
    const m = pastelDeBacalhau(40 + i * 3)
    m.position.set(x, 0.0065 + 0.0095, z)
    m.rotation.y = rot
    group.add(m)
  })
  const ramekin = mayoRamekin()
  ramekin.position.set(0.045, 0.0065, 0.02)
  group.add(ramekin)
  return group
}

// --- export -----------------------------------------------------------------
// GLB: web viewer + Android Scene Viewer (vertex colours).
// USDZ: iPhone AR Quick Look (colours baked to textures). Both in metres = real size.
async function exportModel(name: string, build: () => THREE.Object3D) {
  DETAIL = 1
  const object = build()
  DETAIL = 0.4
  const light = build()
  DETAIL = 1
  const usdz = await exportUsdz(object, light, (mesh) => (mesh.name === 'creme' ? 640 : 512))
  writeFileSync(new URL(`../../public/models/${name}.usdz`, import.meta.url), usdz)

  const scene = new THREE.Scene()
  scene.name = name
  scene.add(object)
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer
  writeFileSync(new URL(`../../public/models/${name}.glb`, import.meta.url), Buffer.from(glb))
  console.log(`${name}  glb ${(glb.byteLength / 1024).toFixed(0)} kB · usdz ${(usdz.byteLength / 1024).toFixed(0)} kB`)
}

mkdirSync(new URL('../../public/models/', import.meta.url), { recursive: true })
await exportModel('pastel-de-nata', pastelDeNata)
await exportModel('pudim-abade-de-priscos', pudim)
await exportModel('pasteis-de-bacalhau', pasteisDeBacalhau)
