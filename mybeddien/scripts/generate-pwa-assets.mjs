/**
 * Generate screenshot PWA myBeddien ke folder gambar bersama (Apache /gambar).
 * Run dari folder mybeddien: npm run generate-pwa-assets
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const gambarRoot = path.resolve(__dirname, '..', '..', 'gambar')
const icon512 = path.join(gambarRoot, 'icon', 'mybeddienicon512.png')
const ssDir = path.join(gambarRoot, 'ss')

const BG = { r: 240, g: 249, b: 255 } // #f0f9ff — selaras theme PWA

async function screenshotWithIcon(outPath, width, height, iconSize) {
  if (!fs.existsSync(icon512)) {
    throw new Error(`Ikon sumber tidak ditemukan: ${icon512}`)
  }
  const iconBuf = await sharp(icon512)
    .resize(iconSize, iconSize, { fit: 'contain', background: BG })
    .png()
    .toBuffer()

  const left = Math.round((width - iconSize) / 2)
  const top = Math.round((height - iconSize) / 2)

  await sharp({
    create: { width, height, channels: 3, background: BG },
  })
    .composite([{ input: iconBuf, left, top }])
    .png()
    .toFile(outPath)

  console.log('Created:', outPath, `${width}x${height}`)
}

async function main() {
  fs.mkdirSync(ssDir, { recursive: true })
  await screenshotWithIcon(path.join(ssDir, 'narrow.png'), 540, 720, 280)
  await screenshotWithIcon(path.join(ssDir, 'wide.png'), 1280, 720, 320)
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
