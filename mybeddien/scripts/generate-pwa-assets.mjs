/**
 * Generate PWA icon & screenshot PNGs with correct dimensions.
 * Run: node scripts/generate-pwa-assets.mjs
 * Requires: npm install sharp (dev)
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

// Theme color #0d9488 (teal)
const theme = { r: 13, g: 148, b: 136 }

async function createPng(filePath, width, height, bg = theme) {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: bg,
    },
  })
    .png()
    .toFile(filePath)
  console.log('Created:', filePath, `${width}x${height}`)
}

async function main() {
  const iconDir = path.join(publicDir, 'icon')
  const ssDir = path.join(publicDir, 'ss')
  fs.mkdirSync(iconDir, { recursive: true })
  fs.mkdirSync(ssDir, { recursive: true })

  await createPng(path.join(iconDir, 'icon-192.png'), 192, 192)
  await createPng(path.join(iconDir, 'icon-512.png'), 512, 512)
  await createPng(path.join(ssDir, 'narrow.png'), 540, 720, { r: 240, g: 244, b: 245 })
  await createPng(path.join(ssDir, 'wide.png'), 1280, 720, { r: 240, g: 244, b: 245 })

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
