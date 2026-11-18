// Renders 1000x1500 editorial pins: photo on top, accent rule, keyword eyebrow, serif headline, save line.
// Usage: node render.mjs <pins.json> <outDir>
// pins.json: [{ id, keyword, headline, cta, photo (path), focusY?, theme: {bg, ink, accent} }]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const [specPath, outDir] = process.argv.slice(2);
if (!specPath || !outDir) throw new Error('usage: node render.mjs <pins.json> <outDir>');
const specDir = path.dirname(path.resolve(specPath));
const pins = JSON.parse(await fs.readFile(specPath, 'utf8'));
const font = async f => (await fs.readFile(require.resolve(f))).toString('base64');
const serif = await font('@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2');
const sans = await font('@fontsource/inter/files/inter-latin-600-normal.woff2');
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const size = n => (n <= 30 ? 100 : n <= 42 ? 90 : n <= 54 ? 76 : 64);

const html = async p => {
  const img = (await fs.readFile(path.resolve(specDir, p.photo))).toString('base64');
  const t = p.theme;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:PinSerif;font-weight:700;src:url(data:font/woff2;base64,${serif}) format('woff2')}
@font-face{font-family:PinSans;font-weight:600;src:url(data:font/woff2;base64,${sans}) format('woff2')}
*{margin:0;box-sizing:border-box}
body{width:1000px;height:1500px;background:${t.bg};color:${t.ink};overflow:hidden}
.photo{height:940px;background:url(data:image/jpeg;base64,${img}) center ${p.focusY ?? 40}%/cover}
.rule{height:10px;background:${t.accent}}
.text{padding:46px 70px 0;height:550px;display:flex;flex-direction:column}
.eyebrow{font:600 24px/1 PinSans;letter-spacing:.18em;text-transform:uppercase;color:${t.accent}}
h1{font:700 ${size(p.headline.length)}px/1.08 PinSerif;margin-top:26px;letter-spacing:-.01em}
.cta{margin-top:auto;margin-bottom:56px;font:600 24px/1 PinSans;letter-spacing:.14em;text-transform:uppercase;color:${t.accent};border-bottom:3px solid ${t.accent};align-self:flex-start;padding-bottom:8px}
</style></head><body><div class="photo"></div><div class="rule"></div><div class="text">
<div class="eyebrow">${esc(p.keyword)}</div><h1>${esc(p.headline)}</h1><div class="cta">${esc(p.cta)}</div></div></body></html>`;
};

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 1 });
  for (const p of pins) {
    await page.setContent(await html(p), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => { const t = document.querySelector('.text'); return t.scrollHeight > t.clientHeight; });
    if (overflow) throw new Error(`${p.id}: headline overflows the text panel`);
    const out = path.join(outDir, `${p.id}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1000, height: 1500 } });
    console.log(p.id, out);
  }
} finally {
  await browser.close();
}
