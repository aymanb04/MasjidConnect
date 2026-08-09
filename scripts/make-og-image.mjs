// Generates public/og-image.png — the 1200×630 link-preview card that WhatsApp,
// iMessage, LinkedIn and the search engines show when masjidconnect.be is shared.
//
//   node scripts/make-og-image.mjs        (from the repo root)
//
// Re-run it whenever the landing-page positioning copy changes, and commit the
// resulting PNG. It is a build-time asset on purpose:
//   - Next's `next/og` (satori) route was tried first and rejected: it fails to
//     prerender on Windows (`fileURLToPath` / Invalid URL inside @vercel/og),
//     and satori ships no Arabic face, so the brand's meem came out as tofu.
//   - A committed PNG also means no edge function on the request path — a
//     scraper with a 2-second timeout just gets a static file off the CDN.
//
// Needs Playwright. Uses the repo's own copy if present, otherwise the one the
// local run-app skill installed (.claude/skills/run-app, gitignored).

import path from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const CANDIDATES = [
    'node_modules/playwright/index.mjs',
    '.claude/skills/run-app/node_modules/playwright/index.mjs',
]

const entry = CANDIDATES.map(p => path.resolve(p)).find(existsSync)
if (!entry) {
    console.error(
        'Playwright not found. Install it first:\n  npm i -D playwright && npx playwright install chromium',
    )
    process.exit(1)
}
const { chromium } = await import(pathToFileURL(entry).href)

const OUT = path.resolve('public/og-image.png')

// The same islamic geometric tile as the .pattern-bg utility in app/globals.css.
const PATTERN =
    "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.06'%3E%3Cpath d='M30 0l8.66 5v10L30 20l-8.66-5V5L30 0zm0 40l8.66 5v10L30 60l-8.66-5V45L30 40zM0 20l8.66 5v10L0 40l-8.66-5V25L0 20zm60 0l8.66 5v10L60 40l-8.66-5V25L60 20zM15 10l8.66 5v10L15 30l-8.66-5V15L15 10zm30 0l8.66 5v10L45 30l-8.66-5V15L45 10zm-30 30l8.66 5v10L15 60l-8.66-5V45L15 40zm30 0l8.66 5v10L45 60l-8.66-5V45L45 40z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"

const PILLS = ['Huiswerk', 'Puntenlijst', 'Aanwezigheden', 'Rapporten', 'Lidgeld']

const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; overflow:hidden;
         font-family:'Inter','Segoe UI',system-ui,sans-serif;
         -webkit-font-smoothing:antialiased; }
  .card { position:relative; width:1200px; height:630px; background:#1B6B4A;
          padding:72px; display:flex; flex-direction:column;
          justify-content:space-between; overflow:hidden; }
  .pattern { position:absolute; inset:0; background-image:${PATTERN}; }
  .orb { position:absolute; border-radius:9999px; }
  .orb-a { top:-190px; left:-150px; width:480px; height:480px; background:rgba(255,255,255,.05); }
  .orb-b { bottom:-220px; right:-140px; width:560px; height:560px; background:rgba(255,255,255,.06); }
  .ring { position:absolute; top:50%; right:-180px; width:620px; height:620px;
          transform:translateY(-50%); border-radius:9999px; border:1px solid rgba(255,255,255,.10); }
  .z { position:relative; z-index:1; }
  .brand { display:flex; align-items:center; gap:16px; }
  /* Mirrors components/ui/MeemMark: serif stack + the measured -0.27em optical lift. */
  .mark { width:56px; height:56px; border-radius:15px; background:#fff;
          display:flex; align-items:center; justify-content:center;
          font-family:Georgia,'Times New Roman',serif; font-size:48px; line-height:1;
          color:#1B6B4A; }
  .mark span { display:block; transform:translateY(-0.27em); }
  .wordmark { font-size:31px; font-weight:600; color:#fff; letter-spacing:-.2px; }
  h1 { font-size:66px; font-weight:700; line-height:1.1; letter-spacing:-1.8px;
       color:#fff; max-width:900px; }
  .sub { margin-top:22px; font-size:27px; line-height:1.4; color:rgba(255,255,255,.78); max-width:820px; }
  .pills { display:flex; gap:12px; align-items:center; }
  .pill { padding:11px 22px; border-radius:9999px; background:rgba(255,255,255,.15);
          font-size:23px; color:rgba(255,255,255,.92); white-space:nowrap; }
  .domain { margin-left:auto; font-size:23px; font-weight:500; color:rgba(255,255,255,.55); }
</style></head>
<body>
  <div class="card">
    <div class="pattern"></div>
    <div class="orb orb-a"></div>
    <div class="orb orb-b"></div>
    <div class="ring"></div>

    <div class="z brand">
      <div class="mark"><span>&#x645;</span></div>
      <div class="wordmark">MasjidConnect</div>
    </div>

    <div class="z">
      <h1>Alles voor uw weekendschool in &eacute;&eacute;n app.</h1>
      <p class="sub">Klassen, huiswerk, punten, aanwezigheden en tweetalige rapporten &mdash;
      voor Arabische en islamitische scholen in Belgi&euml;.</p>
    </div>

    <div class="z pills">
      ${PILLS.map(p => `<div class="pill">${p}</div>`).join('')}
      <div class="domain">masjidconnect.be</div>
    </div>
  </div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'networkidle' })
// setContent resolves before the webfont has actually swapped in; without this
// the card silently renders in Segoe UI.
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)

const interLoaded = await page.evaluate(() =>
    Array.from(document.fonts).some(f => f.family === 'Inter' && f.status === 'loaded'),
)
if (!interLoaded) {
    console.error('Inter did not load (offline?) — refusing to write a card in the fallback font.')
    await browser.close()
    process.exit(1)
}

await page.screenshot({ path: OUT, type: 'png' })
await browser.close()
console.log('wrote', OUT)
