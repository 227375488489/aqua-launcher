// Generates the Aqua Launcher icon set without external dependencies.
// Usage: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'src-tauri', 'icons');
const UI = join(import.meta.dirname, '..', 'ui', 'assets');
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
const smooth = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// --- tile mask ------------------------------------------------------------
const RADIUS = 0.238;
function squircle(u, v) {
  const q = 0.5 - RADIUS;
  const dx = Math.abs(u - 0.5) - q;
  const dy = Math.abs(v - 0.5) - q;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - RADIUS;
}

// --- triangle SDF (for the play cutout) ----------------------------------
function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}
function sdTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const e0x = bx - ax;
  const e0y = by - ay;
  const e1x = cx - bx;
  const e1y = cy - by;
  const e2x = ax - cx;
  const e2y = ay - cy;
  const v0x = px - ax;
  const v0y = py - ay;
  const v1x = px - bx;
  const v1y = py - by;
  const v2x = px - cx;
  const v2y = py - cy;

  const t0 = clamp(dot(v0x, v0y, e0x, e0y) / dot(e0x, e0y, e0x, e0y), 0, 1);
  const t1 = clamp(dot(v1x, v1y, e1x, e1y) / dot(e1x, e1y, e1x, e1y), 0, 1);
  const t2 = clamp(dot(v2x, v2y, e2x, e2y) / dot(e2x, e2y, e2x, e2y), 0, 1);

  const q0x = v0x - e0x * t0;
  const q0y = v0y - e0y * t0;
  const q1x = v1x - e1x * t1;
  const q1y = v1y - e1y * t1;
  const q2x = v2x - e2x * t2;
  const q2y = v2y - e2y * t2;

  const s = Math.sign(e0x * e2y - e0y * e2x);
  const c0 = s * (v0x * e0y - v0y * e0x);
  const c1 = s * (v1x * e1y - v1y * e1x);
  const c2 = s * (v2x * e2y - v2y * e2x);
  const dist = Math.sqrt(
    Math.min(
      dot(q0x, q0y, q0x, q0y),
      dot(q1x, q1y, q1x, q1y),
      dot(q2x, q2y, q2x, q2y),
    ),
  );
  return Math.min(c0, c1, c2) > 0 ? -dist : dist;
}

// --- droplet --------------------------------------------------------------
const DX = 0.5;
const DY = 0.475;
const DR = 0.208;
const TIP = 1.85;
const CONE = 0.92;

function droplet(du, dv) {
  let inside = 0;
  if (dv <= 0) {
    const t = clamp(1 + dv / TIP, 0, 1);
    inside = Math.pow(t, CONE) - Math.abs(du);
  }
  return Math.max(inside, 1 - Math.hypot(du, dv));
}

// --- palette --------------------------------------------------------------
function background(u, v) {
  const t = clamp(0.5 * u + 0.8 * v, 0, 1);
  let r;
  let g;
  let b;
  if (t < 0.55) {
    const k = t / 0.55;
    r = mix(17, 8, k);
    g = mix(92, 48, k);
    b = mix(112, 70, k);
  } else {
    const k = (t - 0.55) / 0.45;
    r = mix(8, 2, k);
    g = mix(48, 14, k);
    b = mix(70, 25, k);
  }

  // cool halo behind the mark
  const halo = smooth(0.62, 0.0, Math.hypot(u - 0.5, v - 0.44));
  r += halo * 10;
  g += halo * 34;
  b += halo * 40;

  // top-left glass sheen
  const sheen = smooth(0.55, 0, Math.hypot(u - 0.16, v - 0.1));
  r += sheen * 26;
  g += sheen * 62;
  b += sheen * 58;

  // bottom vignette
  const vig = smooth(0.42, 0.95, v);
  r *= 1 - vig * 0.35;
  g *= 1 - vig * 0.35;
  b *= 1 - vig * 0.28;

  return [r, g, b];
}

const TRI = [
  [0.452, 0.389],
  [0.452, 0.569],
  [0.619, 0.479],
];

function sample(u, v) {
  let [r, g, b] = background(u, v);

  // water lines beneath the drop, clipped inside the tile
  for (const [base, amp, alpha, width, phase] of [
    [0.838, 0.022, 0.34, 0.0045, 0.5],
    [0.895, 0.018, 0.16, 0.0035, 1.9],
  ]) {
    const wave = base + Math.sin((u - 0.5) * Math.PI * 3.1 + phase) * amp;
    const d = Math.abs(v - wave);
    if (d < width) {
      const k = (1 - d / width) * alpha;
      r = mix(r, 140, k);
      g = mix(g, 252, k);
      b = mix(b, 246, k);
    }
  }

  // soft pool of light under the droplet
  const pool = 1 - Math.hypot((u - DX) / 0.3, (v - 0.79) / 0.1);
  if (pool > 0) {
    const k = Math.pow(pool, 1.5) * 0.18;
    r = mix(r, 86, k);
    g = mix(g, 234, k);
    b = mix(b, 226, k);
  }

  const du = (u - DX) / DR;
  const dv = (v - DY) / DR;
  const inside = droplet(du, dv);
  const edge = clamp(inside / 0.006, 0, 1);
  if (edge <= 0) return [r, g, b];

  // glass fill: bright crest, teal body, deep blue tail
  const ft = clamp((dv + TIP) / (TIP + 1), 0, 1);
  let dr;
  let dg;
  let db;
  if (ft < 0.42) {
    const k = smooth(0, 0.42, ft);
    dr = mix(224, 128, k);
    dg = mix(255, 249, k);
    db = mix(252, 240, k);
  } else if (ft < 0.78) {
    const k = (ft - 0.42) / 0.36;
    dr = mix(128, 62, k);
    dg = mix(249, 226, k);
    db = mix(240, 218, k);
  } else {
    const k = (ft - 0.78) / 0.22;
    dr = mix(62, 20, k);
    dg = mix(226, 138, k);
    db = mix(218, 190, k);
  }

  // light gathering along the lower belly
  const lower = smooth(0.1, 1.0, dv) * 0.22;
  dr = mix(dr, 156, lower);
  dg = mix(dg, 250, lower);
  db = mix(db, 244, lower);

  // inner shadow toward the silhouette
  const inner = 1 - smooth(0.0, 0.16, inside);
  dr = mix(dr, 14, inner * 0.35);
  dg = mix(dg, 70, inner * 0.35);
  db = mix(db, 88, inner * 0.35);

  // specular streak down the left flank
  const ax = (du + 0.4) * 0.93 + (dv + 0.32) * 0.37;
  const ay = -(du + 0.4) * 0.37 + (dv + 0.32) * 0.93;
  const spec = 1 - Math.hypot(ax / 0.26, ay / 0.58);
  if (spec > 0) {
    const k = Math.pow(spec, 0.55) * 0.7;
    dr = mix(dr, 255, k);
    dg = mix(dg, 255, k);
    db = mix(db, 255, k);
  }

  // crisp rim light
  const rim = clamp(1 - inside / 0.03, 0, 1) * 0.45;
  dr = mix(dr, 236, rim);
  dg = mix(dg, 255, rim);
  db = mix(db, 252, rim);

  // play cutout, filled with the deep background and a light rim
  const tri = sdTriangle(u, v, ...TRI[0], ...TRI[1], ...TRI[2]) - 0.006;
  if (tri < 0.012) {
    const cut = clamp(-tri / 0.004, 0, 1);
    const [br, bg, bb] = background(u, v);
    let cr = br * 0.42;
    let cg = bg * 0.42 + 4;
    let cb = bb * 0.42 + 10;
    // faint cyan bounce just outside the cutout edge
    const glow = clamp(1 - Math.abs(tri) / 0.022, 0, 1) * 0.5;
    dr = mix(dr, 190, glow);
    dg = mix(dg, 255, glow);
    db = mix(db, 250, glow);
    dr = mix(dr, cr, cut);
    dg = mix(dg, cg, cut);
    db = mix(db, cb, cut);
  }

  return [
    mix(r, dr, edge),
    mix(g, dg, edge),
    mix(b, db, edge),
  ];
}

function render(size, ss = SS) {
  const hi = size * ss;
  const buf = new Float32Array(hi * hi * 4);
  const half = 0.5 / hi;
  for (let y = 0; y < hi; y++) {
    for (let x = 0; x < hi; x++) {
      const u = (x + 0.5) / hi;
      const v = (y + 0.5) / hi;
      const sd = squircle(u, v);
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
  const n = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const i = ((y * ss + sy) * hi + (x * ss + sx)) * 4;
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

function icns(entries) {
  const body = Buffer.concat(
    entries.map(([type, png]) => {
      const head = Buffer.alloc(8);
      head.write(type, 0, 4, 'ascii');
      head.writeUInt32BE(png.length + 8, 4);
      return Buffer.concat([head, png]);
    }),
  );
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(UI, { recursive: true });

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = new Map(sizes.map((size) => [size, render(size)]));

const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(icoSizes.length, 4);

let offset = 6 + icoSizes.length * 16;
const entries = [];
for (const size of icoSizes) {
  const png = images.get(size);
  entries.push(icoEntry(png, size, offset));
  offset += png.length;
}
writeFileSync(
  join(OUT, 'icon.ico'),
  Buffer.concat([head, ...entries, ...icoSizes.map((s) => images.get(s))]),
);

const at = (size) => images.get(size);
writeFileSync(join(OUT, '32x32.png'), at(32));
writeFileSync(join(OUT, '128x128.png'), at(128));
writeFileSync(join(OUT, '128x128@2x.png'), at(256));
writeFileSync(join(OUT, 'icon.png'), at(256));
writeFileSync(join(OUT, 'icon-256.png'), at(256));
writeFileSync(join(OUT, 'icon-512.png'), render(512, 3));

const icnsEntries = [
  ['ic11', at(32)],
  ['ic12', at(64)],
  ['ic07', at(128)],
  ['ic13', at(256)],
  ['ic08', at(256)],
  ['ic14', render(512, 3)],
  ['ic09', render(512, 3)],
  ['ic10', render(1024, 2)],
];
writeFileSync(join(OUT, 'icon.icns'), icns(icnsEntries));

writeFileSync(join(UI, 'logo.png'), at(256));
writeFileSync(join(UI, 'logo-64.png'), at(64));
console.log('icons written:', sizes.join(', '), '+ icns');
