// Regenerates the PWA / home-screen icons in public/ from the existing artwork.
//
//   node scripts/make-icons.mjs        (from the repo root)
//
// Why this exists: the original icon-192/512.png were exported with a flat
// #448AFF background behind the rounded green badge, so every context that
// renders the icon UNMASKED (the install prompt, the desktop PWA, the Android
// task switcher) showed blue corners on a green brand mark. It was invisible on
// Android home screens only because `purpose: maskable` crops the corners off.
//
// Rather than re-rendering the meem — the source SVG sets it in Georgia, which
// has no Arabic and resolves to whatever system face the exporting machine had,
// so a re-render would silently change the glyph — this reuses the existing
// pixels: it lifts the meem out of the old PNG and recomposites it onto a
// freshly drawn badge.
//
// Lifting the glyph rather than clipping the old image matters. Clipping to the
// badge's rounded rect leaves the antialiased boundary pixels, which are blends
// of green and the old blue, so a faint blue fringe survives along the curve.
// Rebuilding from the glyph alone means no blue pixel is ever drawn.
//
// Outputs, and why each variant exists:
//   icon-192.png, icon-512.png   `purpose: any` — rounded badge, TRANSPARENT
//                                corners, shown as-drawn.
//   icon-maskable-512.png        `purpose: maskable` — full-bleed brand green,
//                                no transparency, because the OS supplies the
//                                shape and crops to a circle/squircle. The meem
//                                already sits entirely inside the 80% safe zone.
//   apple-touch-icon.png         iOS, which applies its own mask and composites
//                                any transparency to BLACK — so this one must be
//                                full-bleed too, never the `any` variant.

import path from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const CANDIDATES = [
    'node_modules/playwright/index.mjs',
    '.claude/skills/run-app/node_modules/playwright/index.mjs',
]
const entry = CANDIDATES.map(p => path.resolve(p)).find(existsSync)
if (!entry) {
    console.error('Playwright not found. npm i -D playwright && npx playwright install chromium')
    process.exit(1)
}
const { chromium } = await import(pathToFileURL(entry).href)

const SRC = path.resolve('public/icon-512.png')
const GREEN = '#1B6B4A'
// Matches the rx on the <rect> in public/icon.svg, in that file's 512 viewBox.
const RADIUS_RATIO = 114 / 512

const TARGETS = [
    { file: 'icon-192.png', size: 192, bg: null },
    { file: 'icon-512.png', size: 512, bg: null },
    { file: 'icon-maskable-512.png', size: 512, bg: GREEN },
    { file: 'apple-touch-icon.png', size: 180, bg: GREEN },
]

const b64 = readFileSync(SRC).toString('base64')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<canvas id="c"></canvas>')

for (const { file, size, bg } of TARGETS) {
    const dataUrl = await page.evaluate(async ({ b64, size, bg, radiusRatio, green }) => {
        const img = new Image()
        img.src = 'data:image/png;base64,' + b64
        await img.decode()
        const S = img.naturalWidth

        // --- 1. Lift the meem out of the source as a white alpha mask --------
        const src = document.createElement('canvas')
        src.width = S
        src.height = S
        const sctx = src.getContext('2d')
        sctx.drawImage(img, 0, 0)
        const data = sctx.getImageData(0, 0, S, S)
        const d = data.data

        // The glyph is white over the brand green, so a pixel's coverage is how
        // far its red channel has travelled from green's 27 towards white's 255.
        // Sampled only well inside the badge: the old blue corners have a red
        // channel of 68 and would otherwise read as ~18% white and ghost.
        const inset = Math.round(S * 0.15)
        const GREEN_R = 27
        const SPAN = 255 - GREEN_R

        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const i = (y * S + x) * 4
                let a = 0
                if (x >= inset && x < S - inset && y >= inset && y < S - inset) {
                    a = Math.round(Math.min(1, Math.max(0, (d[i] - GREEN_R) / SPAN)) * 255)
                }
                d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a
            }
        }
        sctx.putImageData(data, 0, 0)

        // --- 2. Draw a clean badge and composite the glyph on top ------------
        const c = document.getElementById('c')
        c.width = size
        c.height = size
        const ctx = c.getContext('2d')
        ctx.clearRect(0, 0, size, size)

        ctx.fillStyle = green
        if (bg) {
            // Full-bleed: the OS supplies the shape, so fill the whole square.
            ctx.fillRect(0, 0, size, size)
        } else {
            // `any`: the badge is the shape, corners stay transparent.
            ctx.beginPath()
            ctx.roundRect(0, 0, size, size, size * radiusRatio)
            ctx.fill()
        }

        ctx.drawImage(src, 0, 0, size, size)
        return c.toDataURL('image/png')
    }, { b64, size, bg, radiusRatio: RADIUS_RATIO, green: GREEN })

    const out = path.resolve('public', file)
    writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log(`wrote public/${file}  (${size}px, ${bg ? 'full-bleed ' + bg : 'transparent corners'})`)
}

await browser.close()
