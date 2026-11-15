// Lens layer: Kannada OCR helpers, Google Vision / Translation, block layout and patch fitting.
// Ported from lens-pdf (src/main/google.ts, src/renderer/layout.ts, fitText.ts, exportLayout.ts, pipeline.ts,
// exportPdf.ts) with the same thresholds. Boxes here are fractions of the page (0..1) unless noted.

// ---------------------------------------------------------------- text-layer quality
// NUL/control characters, U+FFFD and private-use code points: what pdf.js returns for glyphs
// that have no Unicode mapping in the PDF.
const UNMAPPED = /[\u0000-\u0008\u000e-\u001f�-]/g;
/** True when more than 3% of the characters are unmapped glyphs. */
export function isUnreadableText(text) {
  if (!text) return false;
  return (text.match(UNMAPPED)?.length ?? 0) / text.length > 0.03;
}

// Tesseract `kan` reads the anusvara U+0C82 'ಂ' as the Kannada digit zero U+0CE6 '೦' inside words.
// Replace '೦' with 'ಂ' when it directly follows a Kannada letter / vowel sign (not a digit) and is not
// followed by another Kannada digit (a run of digits stays a number).
export const fixKannadaZero = s => s.replace(/([ಀ-೥೰-೿])೦(?![೦-೯])/g, '$1ಂ');

// ---------------------------------------------------------------- layout (groupLines + groupBlocks)
const NO_SPACE = /[　-ヿ㐀-䶿一-鿿豈-﫿＀-￯฀-๿]/;
function joinText(a, b, gapped) {
  if (!a) return b;
  if (!b) return a;
  if (/\s$/.test(a) || /^\s/.test(b)) return a + b;
  if (NO_SPACE.test(a.at(-1)) && NO_SPACE.test(b[0])) return a + b;
  return gapped ? `${a} ${b}` : a + b;
}
function joinLines(a, b) {
  if (/[A-Za-zÀ-ÿ]-$/.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return joinText(a.trimEnd(), b.trimStart(), true);
}
function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
const similarSize = (a, b, tol) => Math.max(a, b) / Math.min(a, b) <= tol;

/** Merge text runs that sit on the same baseline and are close together (isotropic units, e.g. PDF points). */
export function groupLines(items) {
  const sorted = items.filter(i => i.text.trim() && i.h > 0).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const cy = item.y + item.h / 2;
    const line = lines.find(l => {
      const gap = item.x - (l.x + l.w);
      return Math.abs(l.y + l.h / 2 - cy) < Math.min(l.h, item.h) * 0.5 && similarSize(l.h, item.h, 1.5) &&
        gap > -Math.min(l.h, item.h) * 0.5 && gap < Math.max(l.h, item.h) * 1.5;
    });
    if (line) {
      const gapped = item.x - (line.x + line.w) > Math.min(line.h, item.h) * 0.15;
      line.text = joinText(line.text, item.text, gapped);
      Object.assign(line, union(line, item));
    } else lines.push({ text: item.text, x: item.x, y: item.y, w: item.w, h: item.h });
  }
  return lines;
}
/** Merge consecutive lines with matching size and alignment into paragraph blocks. */
export function groupBlocks(lines) {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const blocks = [];
  for (const line of sorted) {
    const block = blocks.find(b => {
      const { last } = b;
      const vgap = line.y - (last.y + last.h);
      const overlap = Math.min(last.x + last.w, line.x + line.w) - Math.max(last.x, line.x);
      const leftAligned = Math.abs(last.x - line.x) < last.h * 1.5;
      return vgap > -last.h * 0.3 && vgap < Math.max(last.h, line.h) * 0.8 && similarSize(last.h, line.h, 1.3) &&
        overlap > 0 && (leftAligned || overlap > Math.min(last.w, line.w) * 0.6);
    });
    if (block) {
      block.text = joinLines(block.text, line.text);
      block.box = union(block.box, line);
      block.last = line; block.lineCount++; block.sizeSum += line.h; block.fontSize = block.sizeSum / block.lineCount;
    } else {
      const { text, ...box } = line;
      blocks.push({ text, box, fontSize: line.h, lineCount: 1, last: line, sizeSum: line.h });
    }
  }
  return blocks.map(({ text, box, fontSize, lineCount }) => ({ text: text.trim(), box, fontSize, lineCount }));
}
/** Words in page fractions → paragraph blocks in page fractions (fontSize = fraction of page height). */
export function layoutBlocks(words, pageW, pageH) {
  const items = words.map(w => ({ text: w.text, x: w.x * pageW, y: w.y * pageH, w: w.w * pageW, h: w.h * pageH }));
  return groupBlocks(groupLines(items)).map(b => ({
    text: b.text, lineCount: b.lineCount, fontSize: b.fontSize / pageH,
    box: { x: b.box.x / pageW, y: b.box.y / pageH, w: b.box.w / pageW, h: b.box.h / pageH },
  }));
}

// ---------------------------------------------------------------- fitting + colours
/** Largest font size in [min, max] for which fits(size) holds, by binary search. */
export function fitFontSize(fits, min, max, precision = 0.25) {
  if (max <= min || !fits(min)) return min;
  if (fits(max)) return max;
  let lo = min, hi = max;
  while (hi - lo > precision) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  return lo;
}
const luminance = ([r, g, b]) => {
  const ch = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
export function contrast(a, b) { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); }
const median = values => { const s = [...values].sort((a, b) => a - b); return s[s.length >> 1] ?? 255; };
/** Background = median of the ring just outside the box; text = median of inside pixels that differ from it. Pixel coords. */
export function sampleColors(ctx, x, y, w, h) {
  const cw = ctx.canvas.width, chh = ctx.canvas.height, pad = 3;
  const x0 = Math.max(0, Math.floor(x - pad)), y0 = Math.max(0, Math.floor(y - pad));
  const x1 = Math.min(cw, Math.ceil(x + w + pad)), y1 = Math.min(chh, Math.ceil(y + h + pad));
  if (x1 <= x0 || y1 <= y0) return { bg: [255, 255, 255], fg: [0, 0, 0] };
  const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const W = x1 - x0, ring = [], inner = [];
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  for (let py = 0; py < y1 - y0; py += step) for (let px = 0; px < W; px += step) {
    const i = (py * W + px) * 4, rgb = [data[i], data[i + 1], data[i + 2]];
    const edge = px < pad || py < pad || px >= W - pad || py >= y1 - y0 - pad;
    (edge ? ring : inner).push(rgb);
  }
  const pool = ring.length ? ring : inner;
  const bg = [median(pool.map(p => p[0])), median(pool.map(p => p[1])), median(pool.map(p => p[2]))];
  const ink = inner.filter(p => contrast(p, bg) > 2.5);
  let fg = ink.length ? [median(ink.map(p => p[0])), median(ink.map(p => p[1])), median(ink.map(p => p[2]))] : [0, 0, 0];
  if (contrast(fg, bg) < 3) fg = luminance(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  return { bg, fg };
}
/** Colours for every block, sampled from a rendered page canvas (boxes in page fractions). */
export function sampleBlockColors(canvas, blocks) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  return blocks.map(b => sampleColors(ctx, b.box.x * W, b.box.y * H, b.box.w * W, b.box.h * H));
}

export const LINE_HEIGHT = 1.15;
/** Greedy word wrap; over-long words break between characters (CSS overflow-wrap: anywhere). */
export function wrapText(text, maxWidth, measure) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) { line = candidate; continue; }
      if (line) lines.push(line);
      line = '';
      let piece = '';
      for (const ch of word) { if (piece && measure(piece + ch) > maxWidth) { lines.push(piece); piece = ''; } piece += ch; }
      line = piece;
    }
    if (line) lines.push(line);
  }
  return lines;
}
/** Largest size that fits text in a w×h box; single-line blocks are never wrapped. */
export function fitTextToBox(text, w, h, singleLine, min, max, measureAt) {
  const layout = size => singleLine ? [text.replace(/\s+/g, ' ').trim()] : wrapText(text, w, s => measureAt(s, size));
  const fits = size => { const lines = layout(size); return lines.length * size * LINE_HEIGHT <= h + 0.5 && lines.every(l => measureAt(l, size) <= w + 0.5); };
  const size = fitFontSize(fits, Math.min(min, max), max);
  return { size, lines: layout(size) };
}

const FONT = `'Segoe UI', Arial, sans-serif`;
/** Draw Lens-style patches onto a transparent canvas the size of the page render (export fallback for non-Latin text). */
// `s` = canvas pixels per PDF point (same PAD 1.5 pt and minimum font 4.5 pt as lens-pdf).
export function drawOverlay(pageCanvas, blocks, colors, s) {
  const out = document.createElement('canvas'); out.width = pageCanvas.width; out.height = pageCanvas.height;
  const ctx = out.getContext('2d');
  const W = out.width, H = out.height;
  const measureAt = (t, size) => { ctx.font = `${size}px ${FONT}`; return ctx.measureText(t).width; };
  const pad = 1.5 * s, MIN = 4.5 * s;
  blocks.forEach((b, i) => {
    const x = b.box.x * W, y = b.box.y * H, w = b.box.w * W, h = b.box.h * H;
    const { bg, fg } = colors[i];
    const max = Math.max(MIN, b.fontSize * H * 1.1), single = b.lineCount === 1;
    const { size, lines } = fitTextToBox(b.translated, w, h, single, MIN, max, measureAt);
    const lineH = size * LINE_HEIGHT, textH = lines.length * lineH, patchH = Math.max(h, textH);
    ctx.fillStyle = `rgb(${bg.join(',')})`;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - pad, y - pad, w + pad * 2, patchH + pad * 2, 2 * s) : ctx.rect(x - pad, y - pad, w + pad * 2, patchH + pad * 2); ctx.fill();
    ctx.fillStyle = `rgb(${fg.join(',')})`; ctx.font = `${size}px ${FONT}`; ctx.textBaseline = 'middle';
    const top = single && textH < h ? y + (h - textH) / 2 : y;
    lines.forEach((line, j) => ctx.fillText(line, x, top + (j + 0.5) * lineH));
  });
  return out;
}

// ---------------------------------------------------------------- Google APIs
export const TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
export const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const MAX_SEGMENTS = 128, MAX_CHARS = 25000;

export class GoogleError extends Error {}
async function post(url, key, body) {
  let res;
  try {
    res = await fetch(`${url}?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) { throw new GoogleError(`Network error: ${err.message}`); }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleError(json?.error?.message ?? `Google API error ${res.status}`);
  return json;
}
function chunk(texts) {
  const chunks = []; let cur = [], chars = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= MAX_SEGMENTS || chars + t.length > MAX_CHARS)) { chunks.push(cur); cur = []; chars = 0; }
    cur.push(t); chars += t.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
/** Translation v2, ≤128 segments / 25k chars per request. → [{ text, detectedLang }] */
export async function translateBatch(texts, source, target, key) {
  const out = [];
  for (const q of chunk(texts)) {
    const res = await post(TRANSLATE_URL, key, { q, target, format: 'text', ...(source && { source }) });
    const tr = res?.data?.translations;
    if (!Array.isArray(tr) || tr.length !== q.length) throw new GoogleError('Unexpected response from Google Translation');
    for (const t of tr) out.push({ text: t.translatedText, detectedLang: t.detectedSourceLanguage ?? (source || target) });
  }
  return out;
}

export const baseLang = code => String(code || '').toLowerCase().split('-')[0];
const normalize = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
function dominantLang(blocks) {
  const weight = new Map();
  for (const b of blocks) weight.set(b.detectedLang, (weight.get(b.detectedLang) ?? 0) + b.text.length);
  return [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}
/** Translate a page's blocks; drops blocks already in the target language or unchanged by translation. */
export async function translateBlocks(blocks, { source, target, key }) {
  blocks = blocks.filter(b => b.text && b.text.trim());
  if (!blocks.length) return { detectedLang: '', blocks: [] };
  if (source && baseLang(source) === baseLang(target)) return { detectedLang: source, blocks: [] };
  const tr = await translateBatch(blocks.map(b => b.text), source, target, key);
  const all = blocks.map((b, i) => ({ text: b.text, translated: tr[i].text, detectedLang: tr[i].detectedLang, box: { ...b.box }, fontSize: b.fontSize, lineCount: b.lineCount }));
  return {
    detectedLang: dominantLang(all),
    blocks: all.filter(b => baseLang(b.detectedLang) !== baseLang(target) && normalize(b.translated) !== normalize(b.text)),
  };
}

function paragraphText(p) {
  let text = '', lines = 0, endedLine = false;
  for (const word of p.words || []) for (const s of word.symbols || []) {
    text += s.text; endedLine = false;
    switch (s.property?.detectedBreak?.type) {
      case 'SPACE': case 'SURE_SPACE': text += ' '; break;
      case 'EOL_SURE_SPACE': case 'LINE_BREAK': text += ' '; lines++; endedLine = true; break;
      case 'HYPHEN': lines++; endedLine = true; break;
    }
  }
  return { text: text.trim(), lineCount: lines + (endedLine ? 0 : 1) };
}
function bounds(vertices = []) {
  const xs = vertices.map(v => v.x ?? 0), ys = vertices.map(v => v.y ?? 0);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
/** Vision DOCUMENT_TEXT_DETECTION of a JPEG (base64) of imgW×imgH px → words + paragraph blocks in page fractions. */
export async function visionOcr(imageBase64, languageHints, key, imgW, imgH) {
  const request = { image: { content: imageBase64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], ...(languageHints.length && { imageContext: { languageHints } }) };
  const res = await post(VISION_URL, key, { requests: [request] });
  const r = res?.responses?.[0];
  if (r?.error) throw new GoogleError(r.error.message);
  const words = [], paragraphs = [];
  const norm = b => ({ x: b.x / imgW, y: b.y / imgH, w: b.w / imgW, h: b.h / imgH });
  for (const page of r?.fullTextAnnotation?.pages ?? []) for (const block of page.blocks || []) for (const p of block.paragraphs || []) {
    const { text, lineCount } = paragraphText(p);
    if (text) { const box = norm(bounds(p.boundingBox?.vertices)); paragraphs.push({ text, lineCount, box, fontSize: box.h / lineCount }); }
    for (const word of p.words || []) {
      const t = (word.symbols || []).map(s => s.text).join('');
      if (t.trim()) words.push({ text: t, ...norm(bounds(word.boundingBox?.vertices)) });
    }
  }
  return { words, paragraphs };
}
