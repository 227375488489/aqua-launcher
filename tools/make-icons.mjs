// Generates the Aqua Launcher icon set without external dependencies.
// Usage: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'src-tauri', 'icons');
const SS = 4; // supersampling factor

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;

// --- squircle -------------------------------------------------------------
const RADIUS = 0.238;
function squircle(u, v) {
  // signed distance, negative inside (u, v in 0..1)
  const q = 0.5 - RADIUS;
  const dx = Math.abs(u - 0.5) - q;
  const dy = Math.abs(v - 0.5) - q;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - RADIUS;
  return outside;
}

// --- mark -----------------------------------------------------------------
const DROP_X = 0.5;
const DROP_Y = 0.5;
const DROP_R = 0.178; // radius of the round belly, in tile units
const TIP = 2.0; // tip distance above the belly, in belly radii
const CONE_P = 0.86;

function sample(u, v) {
  // background
  const t = clamp(u * 0.42 + v * 0.9, 0, 1);
  let r = mix(14, 3, t);
  let g = mix(72, 17, t);
  let b = mix(92, 26, t);

  const glow = clamp(1 - Math.hypot(u - 0.26, v - 0.18) / 0.8, 0, 1);
  r += glow * glow * 22;
  g += glow * glow * 58;
  b += glow * glow * 55;

  // light pooling beneath the drop, so the mark sits in the tile
  const pool = 1 - Math.hypot((u - DROP_X) / 0.34, (v - 0.84) / 0.13);
  if (pool > 0) {
    const k = Math.pow(pool, 1.6) * 0.16;
    r = mix(r, 92, k);
    g = mix(g, 224, k);
    b = mix(b, 224, k);
  }

  // two still water lines behind the drop
  for (const [base, amp, alpha, width] of [
    [0.825, 0.03, 0.28, 0.008],
    [0.9, 0.024, 0.13, 0.006],
  ]) {
    const wave = base + Math.sin((u - 0.5) * Math.PI * 2.6 + 0.4) * amp;
    const d = Math.abs(v - wave);
    if (d < width) {
      const k = (1 - d / width) * alpha;
      r = mix(r, 130, k);
      g = mix(g, 248, k);
      b = mix(b, 242, k);
    }
  }

  // droplet geometry
  const du = (u - DROP_X) / DROP_R;
  const dv = (v - DROP_Y) / DROP_R;
  let inside = 0;
  if (dv <= 0) {
    const hw = Math.pow(clamp(1 + dv / TIP, 0, 1), CONE_P);
    inside = Math.max(inside, hw - Math.abs(du));
  }
  inside = Math.max(inside, 1 - Math.hypot(du, dv));

  if (inside > 0) {
    const ft = clamp((dv + TIP) / (TIP + 1), 0, 1);
    let dr;
    let dg;
    let db;
    if (ft < 0.4) {
      const k = ft / 0.4;
      dr = mix(214, 104, k);
      dg = mix(255, 242, k);
      db = mix(250, 233, k);
    } else {
      const k = (ft - 0.4) / 0.6;
      dr = mix(104, 26, k);
      dg = mix(242, 164, k);
      db = mix(233, 202, k);
    }

    // soft light pooling at the bottom of the drop
    if (dv > 0.4) {
      const k = clamp((dv - 0.4) / 0.8, 0, 1) * 0.2;
      dr = mix(dr, 170, k);
      dg = mix(dg, 252, k);
      db = mix(db, 250, k);
    }

    // specular streak down the left flank
    const ax = (du + 0.42) * 0.94 + (dv + 0.5) * 0.34;
    const ay = -(du + 0.42) * 0.34 + (dv + 0.5) * 0.94;
    const e = 1 - Math.hypot(ax / 0.3, ay / 0.62);
    if (e > 0) {
      const k = Math.pow(e, 0.6) * 0.62;
      dr = mix(dr, 255, k);
      dg = mix(dg, 255, k);
      db = mix(db, 255, k);
    }

    // rim light along the silhouette
    const rim = clamp(1 - inside / 0.07, 0, 1) * 0.26;
    dr = mix(dr, 255, rim);
    dg = mix(dg, 255, rim);
    db = mix(db, 255, rim);

    r = dr;
    g = dg;
    b = db;
  }

  return [r, g, b];
}

function render(size) {
  const hi = size * SS;
  const buf = new Float32Array(hi * hi * 4);
  const half = 0.5 / hi;
  for (let y = 0; y < hi; y++) {
    for (let x = 0; x < hi; x++) {
      const u = (x + 0.5) / hi;
      const v = (y + 0.5) / hi;
      const sd = squircle(u, v);
      // sub-pixel coverage at the tile edge
      const cov = clamp(0.5 - sd / (2 * half), 0, 1);
      if (cov <= 0) continue;
      const [r, g, b] = sample(u, v);
      const i = (y * hi + x) * 4;
      buf[i] = r * cov;
      buf[i + 1] = g * cov;
      buf[i + 2] = b * cov;
      buf[i + 3] = cov;
    }
  }

  const rgba = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * hi + (x * SS + sx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      r /= n;
      g /= n;
      b /= n;
      a /= n;
      const o = (y * size + x) * 4;
      if (a > 0) {
        rgba[o] = clamp(Math.round(r / a), 0, 255);
        rgba[o + 1] = clamp(Math.round(g / a), 0, 255);
        rgba[o + 2] = clamp(Math.round(b / a), 0, 255);
      }
      rgba[o + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, size, rgba);
}

function icoEntry(png, size, offset) {
  const header = Buffer.alloc(16);
  header[0] = size >= 256 ? 0 : size;
  header[1] = size >= 256 ? 0 : size;
  header[2] = 0;
  header[3] = 0;
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(32, 6);
  header.writeUInt32LE(png.length, 8);
  header.writeUInt32LE(offset, 12);
  return header;
}

mkdirSync(OUT, { recursive: true });

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = sizes.map((size) => ({ size, png: render(size) }));

const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icoImages = images.filter((i) => icoSizes.includes(i.size));
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(icoImages.length, 4);

let offset = 6 + icoImages.length * 16;
const entries = [];
for (const image of icoImages) {
  entries.push(icoEntry(image.png, image.size, offset));
  offset += image.png.length;
}
writeFileSync(join(OUT, 'icon.ico'), Buffer.concat([head, ...entries, ...icoImages.map((i) => i.png)]));

const at = (size) => images.find((i) => i.size === size).png;
writeFileSync(join(OUT, '32x32.png'), at(32));
writeFileSync(join(OUT, '128x128.png'), at(128));
writeFileSync(join(OUT, '128x128@2x.png'), at(256));
writeFileSync(join(OUT, 'icon.png'), at(256));
writeFileSync(join(OUT, 'icon-256.png'), at(256));
mkdirSync(join(OUT, '..', '..', 'ui', 'assets'), { recursive: true });
writeFileSync(join(OUT, '..', '..', 'ui', 'assets', 'logo.png'), at(256));
writeFileSync(join(OUT, '..', '..', 'ui', 'assets', 'logo-64.png'), at(64));
console.log('icons written:', sizes.join(', '));
