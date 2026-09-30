// USDZ export for iOS AR Quick Look, running in Node.
// Quick Look ignores vertex colours, so each vertex-coloured mesh is baked into a
// PNG texture (software rasteriser in UV space) before three's USDZExporter runs.
// USDZExporter expects a DOM canvas; a minimal pixel-buffer canvas stands in for it.
import { deflateSync } from 'node:zlib'
import * as THREE from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'

// --- PNG encoding -------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Uint8Array) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ])
}

// --- Minimal canvas stand-in for USDZExporter -------------------------------
class PixelCanvas {
  width: number
  height: number
  data: Uint8ClampedArray
  constructor(width = 0, height = 0, data?: Uint8ClampedArray) {
    this.width = width
    this.height = height
    this.data = data ?? new Uint8ClampedArray(width * height * 4)
  }
  getContext() {
    let flip = false
    return {
      translate: () => {},
      scale: (_x: number, y: number) => {
        if (y < 0) flip = true
      },
      drawImage: (img: PixelCanvas) => {
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
        for (let y = 0; y < this.height; y++) {
          const src = flip ? img.height - 1 - y : y
          this.data.set(img.data.subarray(src * img.width * 4, (src + 1) * img.width * 4), y * this.width * 4)
        }
      },
    }
  }
  toBlob(cb: (b: Blob) => void) {
    cb(new Blob([encodePng(this.width, this.height, this.data)], { type: 'image/png' }))
  }
}
const g = globalThis as unknown as { HTMLCanvasElement: unknown; document: unknown }
g.HTMLCanvasElement = PixelCanvas
g.document = { createElement: () => new PixelCanvas() }

// --- Vertex colours → texture -------------------------------------------------
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

/**
 * Rasterise a geometry's vertex colours into its UV layout. Row 0 is v = 1,
 * matching three's flipY convention. Empty texels are dilated from neighbours
 * so bilinear filtering never pulls black in at chart edges.
 */
export function bakeVertexColors(geo: THREE.BufferGeometry, size: number): PixelCanvas {
  const uv = geo.attributes.uv
  const col = geo.attributes.color
  if (!uv || !col) throw new Error('bakeVertexColors needs uv and color attributes')
  const acc = new Float32Array(size * size * 3)
  const filled = new Uint8Array(size * size)
  const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: uv.count }, (_, i) => i)

  for (let t = 0; t < index.length; t += 3) {
    const ids = [index[t], index[t + 1], index[t + 2]]
    const px = ids.map((i) => uv.getX(i) * size)
    const py = ids.map((i) => (1 - uv.getY(i)) * size)
    const minX = Math.max(0, Math.floor(Math.min(...px)) - 1), maxX = Math.min(size - 1, Math.ceil(Math.max(...px)) + 1)
    const minY = Math.max(0, Math.floor(Math.min(...py)) - 1), maxY = Math.min(size - 1, Math.ceil(Math.max(...py)) + 1)
    const d = (py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2])
    if (Math.abs(d) < 1e-12) continue
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const cx = x + 0.5, cy = y + 0.5
        const w0 = ((py[1] - py[2]) * (cx - px[2]) + (px[2] - px[1]) * (cy - py[2])) / d
        const w1 = ((py[2] - py[0]) * (cx - px[2]) + (px[0] - px[2]) * (cy - py[2])) / d
        const w2 = 1 - w0 - w1
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue
        const o = y * size + x
        for (let c = 0; c < 3; c++) {
          const get = c === 0 ? 'getX' : c === 1 ? 'getY' : 'getZ'
          acc[o * 3 + c] = w0 * col[get](ids[0]) + w1 * col[get](ids[1]) + w2 * col[get](ids[2])
        }
        filled[o] = 1
      }
  }

  for (let pass = 0; pass < 6; pass++) {
    const next = filled.slice()
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const o = y * size + x
        if (filled[o]) continue
        let n = 0, r = 0, gg = 0, b = 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
          const q = ny * size + nx
          if (!filled[q]) continue
          r += acc[q * 3]; gg += acc[q * 3 + 1]; b += acc[q * 3 + 2]; n++
        }
        if (n) {
          acc[o * 3] = r / n; acc[o * 3 + 1] = gg / n; acc[o * 3 + 2] = b / n
          next[o] = 1
        }
      }
    filled.set(next)
  }

  const rgba = new Uint8ClampedArray(size * size * 4)
  for (let o = 0; o < size * size; o++) {
    for (let c = 0; c < 3; c++) rgba[o * 4 + c] = Math.round(toSrgb(Math.min(1, Math.max(0, acc[o * 3 + c]))) * 255)
    rgba[o * 4 + 3] = 255
  }
  return new PixelCanvas(size, size, rgba)
}

const meshesOf = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = []
  o.traverse((x) => (x as THREE.Mesh).isMesh && out.push(x as THREE.Mesh))
  return out
}

/**
 * Quick Look copy of a dish: geometry from `light` (fewer vertices → a small
 * USDZ that downloads fast), colour baked from the matching full-detail mesh
 * in `detailed`. Both are built from the same parametric UVs, so the texture
 * from one lines up on the other.
 */
function texturedClone(detailed: THREE.Object3D, light: THREE.Object3D, textureSize: (mesh: THREE.Mesh) => number): THREE.Object3D {
  const copy = light.clone(true)
  const sources = meshesOf(detailed)
  const targets = meshesOf(copy)
  if (sources.length !== targets.length) throw new Error('detailed and light models must have the same meshes')
  targets.forEach((mesh, i) => {
    const src = sources[i]
    const mat = src.material as THREE.MeshStandardMaterial
    if (!mat.vertexColors) {
      mesh.material = new THREE.MeshStandardMaterial({ color: mat.color, roughness: mat.roughness, metalness: 0 })
      return
    }
    const texture = new THREE.Texture(bakeVertexColors(src.geometry, textureSize(src)) as unknown as HTMLCanvasElement)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = true
    // The colour lives in the texture now; per-vertex colours would only add size.
    mesh.geometry = mesh.geometry.clone()
    mesh.geometry.deleteAttribute('color')
    mesh.material = new THREE.MeshStandardMaterial({ map: texture, roughness: mat.roughness, metalness: 0 })
  })
  return copy
}

export async function exportUsdz(
  detailed: THREE.Object3D,
  light: THREE.Object3D,
  textureSize: (mesh: THREE.Mesh) => number = () => 512,
): Promise<Uint8Array> {
  const scene = new THREE.Scene()
  scene.add(texturedClone(detailed, light, textureSize))
  // Nothing has rendered in Node, so local/world matrices were never computed.
  scene.updateMatrixWorld(true)
  const exporter = new USDZExporter()
  return exporter.parseAsync(scene, { quickLookCompatible: true, maxTextureSize: 2048 })
}
