// Generates the PWA icons from the brand colours, with no image dependency.
//
// Run with: node scripts/generate-icons.mjs
// Output:   public/icons/*.png
//
// A flat forest-green tile with an off-white "T", drawn as rectangles and encoded as
// a PNG by hand (zlib is in Node). Full bleed with a generous margin, so the
// same file works as a maskable Android icon and as an iOS home screen icon.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'icons')

const BRAND = [0x18, 0x3c, 0x37]
const CREAM = [0xfc, 0xfc, 0xfa]

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  // 10..12: compression, filter, interlace, all zero

  // One filter byte (0 = none) per scanline, then RGB triplets.
  const raw = Buffer.alloc(size * (1 + size * 3))
  let at = 0
  for (let y = 0; y < size; y++) {
    raw[at++] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixels(x, y)
      raw[at++] = r
      raw[at++] = g
      raw[at++] = b
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// The letter T, in units of the icon size, kept inside the 80% safe zone that
// Android may crop to a circle.
function isMark(x, y, size) {
  const u = (v) => v * size
  const barTop = u(0.3)
  const barBottom = u(0.385)
  const barLeft = u(0.255)
  const barRight = u(0.745)
  const stemLeft = u(0.457)
  const stemRight = u(0.543)
  const stemBottom = u(0.72)

  const inBar = y >= barTop && y < barBottom && x >= barLeft && x < barRight
  const inStem = y >= barTop && y < stemBottom && x >= stemLeft && x < stemRight
  return inBar || inStem
}

function build(size) {
  return png(size, (x, y) => (isMark(x, y, size) ? CREAM : BRAND))
}

mkdirSync(OUT, { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), build(size))
}
writeFileSync(join(OUT, 'apple-touch-icon.png'), build(180))
console.log('Icons written to public/icons')
