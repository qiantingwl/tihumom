import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const publicDir = new URL('../public/', import.meta.url)
const source = PNG.sync.read(readFileSync(new URL('logo.png', publicDir)))
function resize(size) {
  const output = new PNG({ width: size, height: size })
  const scaleX = source.width / size, scaleY = source.height / size
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0, weight = 0
    for (let sy = Math.floor(y * scaleY); sy < Math.ceil((y + 1) * scaleY); sy++)
      for (let sx = Math.floor(x * scaleX); sx < Math.ceil((x + 1) * scaleX); sx++) {
        const w = Math.min(sx + 1, (x + 1) * scaleX) - Math.max(sx, x * scaleX)
        const h = Math.min(sy + 1, (y + 1) * scaleY) - Math.max(sy, y * scaleY)
        const i = (sy * source.width + sx) * 4, coverage = w * h
        const alpha = source.data[i + 3] / 255
        r += source.data[i] * alpha * coverage; g += source.data[i + 1] * alpha * coverage
        b += source.data[i + 2] * alpha * coverage; a += alpha * coverage; weight += coverage
      }
    const i = (y * size + x) * 4
    output.data[i] = a ? Math.round(r / a) : 0
    output.data[i + 1] = a ? Math.round(g / a) : 0
    output.data[i + 2] = a ? Math.round(b / a) : 0
    output.data[i + 3] = Math.round(a / weight * 255)
  }
  return PNG.sync.write(output)
}
const sizes = [16, 32, 48]
const icons = sizes.map(resize)
writeFileSync(new URL('favicon-32.png', publicDir), icons[1])
writeFileSync(new URL('favicon-48.png', publicDir), icons[2])
writeFileSync(new URL('apple-touch-icon.png', publicDir), resize(180))
const header = Buffer.alloc(6 + 16 * icons.length)
header.writeUInt16LE(1, 2); header.writeUInt16LE(icons.length, 4)
let offset = header.length
icons.forEach((icon, index) => {
  const i = 6 + index * 16
  header[i] = sizes[index]; header[i + 1] = sizes[index]
  header.writeUInt16LE(1, i + 4); header.writeUInt16LE(32, i + 6)
  header.writeUInt32LE(icon.length, i + 8); header.writeUInt32LE(offset, i + 12)
  offset += icon.length
})
writeFileSync(new URL('favicon.ico', publicDir), Buffer.concat([header, ...icons]))
console.log(`Brand icons generated from ${fileURLToPath(new URL('logo.png', publicDir))}`)
