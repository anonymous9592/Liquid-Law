// Generates build/icon.png (256x256) and build/icon.ico. Run: node build/make-icon.js (needs png-to-ico)
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const N = 256, px = Buffer.alloc(N * N * 4);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const i = (y * N + x) * 4, cx = x - 127.5, cy = y - 127.5, r = 52;
  const dx = Math.max(Math.abs(cx) - (128 - r), 0), dy = Math.max(Math.abs(cy) - (128 - r), 0);
  if (Math.hypot(dx, dy) > r) { px[i + 3] = 0; continue; }
  const t = y / N; let c = [30 + 20 * t, 58 + 40 * t, 110 + 60 * t];
  if (x > 80 && x < 176 && y > 52 && y < 204) {
    c = [245, 245, 250];
    if (y > 84 && y < 94 && x > 100 && x < 156) c = [60, 100, 180];
    if (y > 112 && y < 120 && x > 100 && x < 156) c = [150, 165, 200];
    if (y > 136 && y < 144 && x > 100 && x < 156) c = [150, 165, 200];
    if (y > 160 && y < 168 && x > 100 && x < 132) c = [150, 165, 200];
  }
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
}
const stride = N * 4 + 1, raw = Buffer.alloc(stride * N);
for (let y = 0; y < N; y++) px.copy(raw, y * stride + 1, y * N * 4, (y + 1) * N * 4);
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
(require('png-to-ico').default||require('png-to-ico'))(path.join(__dirname, 'icon.png')).then(b => { fs.writeFileSync(path.join(__dirname, 'icon.ico'), b); console.log('icon ok'); });
