// Renders 1000x1500 list-poster pins: eyebrow, big number + title, year badge, numbered item grid, save line.
// Usage: node render-list.mjs <posters.json> <outDir>
// posters.json: [{ id, eyebrow, number, title, year, items: [...], cols, cta, theme: {bg, ink, accent, chip, chipInk} }]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const [specPath, outDir] = process.argv.slice(2);
if (!specPath || !outDir) throw new Error('usage: node render-list.mjs <posters.json> <outDir>');
const posters = JSON.parse(await fs.readFile(specPath, 'utf8'));
const font = async f => (await fs.readFile(require.resolve(f))).toString('base64');
const serif = await font('@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2');
const sans = await font('@fontsource/inter/files/inter-latin-600-normal.woff2');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const html = p => {
  const t = p.theme;
  const rows = Math.ceil(p.items.length / p.cols);
  // Shrink item text as the list gets denser so every item stays on one line.
  const itemSize = rows > 12 ? 24 : rows > 8 ? 28 : 32;
  const dense = rows > 12;
  const items = p.items.map((it, i) => `<li><b>${i + 1}</b><span>${esc(it)}</span></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:PinSerif;font-weight:700;src:url(data:font/woff2;base64,${serif}) format('woff2')}
@font-face{font-family:PinSans;font-weight:600;src:url(data:font/woff2;base64,${sans}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1000px;height:1500px;background:${t.bg};color:${t.ink};overflow:hidden;padding:64px 64px 0;display:flex;flex-direction:column}
.eyebrow{font:600 24px/1 PinSans;letter-spacing:.2em;text-transform:uppercase;color:${t.accent}}
.head{display:flex;align-items:flex-end;gap:28px;margin-top:22px}
.num{font:700 190px/.8 PinSerif;color:${t.accent}}
h1{font:700 62px/1.05 PinSerif;padding-bottom:6px}
.year{display:inline-block;margin-top:44px;font:600 24px/1 PinSans;letter-spacing:.12em;background:${t.accent};color:${t.bg};padding:10px 18px;border-radius:999px;align-self:flex-start}
ul{list-style:none;display:grid;grid-template-columns:repeat(${p.cols},1fr);gap:${dense ? '8px 14px' : '12px 16px'};margin-top:${dense ? 30 : 40}px}
li{display:flex;align-items:center;gap:14px;background:${t.chip};color:${t.chipInk};border-radius:14px;padding:${dense ? '9px 14px' : '12px 16px'};font:600 ${itemSize}px/1.15 PinSans;white-space:nowrap;overflow:hidden}
li b{flex:none;width:${itemSize + 16}px;height:${itemSize + 16}px;border-radius:50%;background:${t.accent};color:${t.chip};display:grid;place-items:center;font-size:${itemSize - 6}px}
li span{overflow:hidden;text-overflow:clip}
.cta{margin-top:auto;margin-bottom:56px;font:600 24px/1 PinSans;letter-spacing:.14em;text-transform:uppercase;color:${t.accent};border-bottom:3px solid ${t.accent};align-self:flex-start;padding-bottom:8px}
</style></head><body>
<div class="eyebrow">${esc(p.eyebrow)}</div>
<div class="head"><div class="num">${esc(p.number)}</div><h1>${esc(p.title)}</h1></div>
<div class="year">${esc(p.year)}</div>
<ul>${items}</ul>
<div class="cta">${esc(p.cta)}</div></body></html>`;
};

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 1 });
  for (const p of posters) {
    await page.setContent(html(p), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Fail loudly if anything is clipped: page taller than the pin, or an item's text cut off.
    const problems = await page.evaluate(() => {
      const out = [];
      if (document.body.scrollHeight > 1500) out.push(`page height ${document.body.scrollHeight}`);
      document.querySelectorAll('li span').forEach(s => { if (s.scrollWidth > s.clientWidth) out.push(`clipped item: ${s.textContent}`); });
      const h = document.querySelector('.head');
      if (h.scrollWidth > h.clientWidth) out.push('headline overflows');
      return out;
    });
    if (problems.length) throw new Error(`${p.id}: ${problems.join('; ')}`);
    const out = path.join(outDir, `${p.id}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1000, height: 1500 } });
    console.log(p.id, out);
  }
} finally {
  await browser.close();
}
