// Builds the Aqua Launcher icon set from tools/logo-source.png.
// Usage: node tools/make-icons.mjs
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "src-tauri", "icons");
const UI = join(ROOT, "ui", "assets");
const SOURCE = join(import.meta.dirname, "logo-source.png");

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
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
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
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Minimal 8-bit PNG decoder (colour types 0, 2, 4, 6; no interlace).
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let depth = 0;
  let interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += len + 12;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported png (depth ${depth}, interlace ${interlace})`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`unsupported png colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const out = Buffer.alloc(width * height * 4);
  let ptr = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ptr++];
    raw.copy(cur, 0, ptr, ptr + stride);
    ptr += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      const v = cur[x];
      if (filter === 1) cur[x] = (v + a) & 255;
      else if (filter === 2) cur[x] = (v + b) & 255;
      else if (filter === 3) cur[x] = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        cur[x] = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      const o = (y * width + x) * 4;
      if (channels >= 3) {
        out[o] = cur[i];
        out[o + 1] = cur[i + 1];
        out[o + 2] = cur[i + 2];
        out[o + 3] = channels === 4 ? cur[i + 3] : 255;
      } else if (channels === 2) {
        out[o] = out[o + 1] = out[o + 2] = cur[i];
        out[o + 3] = cur[i + 1];
      } else {
        out[o] = out[o + 1] = out[o + 2] = cur[i];
        out[o + 3] = 255;
      }
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

const src = decodePng(readFileSync(SOURCE));
const RADIUS = 0.19;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function squircle(u, v) {
  const q = 0.5 - RADIUS;
  const dx = Math.abs(u - 0.5) - q;
  const dy = Math.abs(v - 0.5) - q;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - RADIUS;
}

// Area-average the source into the target size, then mask to a squircle.
function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const sx = src.width / size;
  const sy = src.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.ceil((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let py = y0; py < y1; py++) {
        let i = (py * src.width + x0) * 4;
        for (let px = x0; px < x1; px++) {
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          i += 4;
          n++;
        }
      }
      const o = (y * size + x) * 4;
      rgba[o] = r / n;
      rgba[o + 1] = g / n;
      rgba[o + 2] = b / n;
      // 4x4 mask supersampling for a clean rounded edge
      let cov = 0;
      for (let sy2 = 0; sy2 < 4; sy2++) {
        for (let sx2 = 0; sx2 < 4; sx2++) {
          const u = (x + (sx2 + 0.5) / 4) / size;
          const v = (y + (sy2 + 0.5) / 4) / size;
          if (squircle(u, v) <= 0) cov++;
        }
      }
      rgba[o + 3] = Math.round((cov / 16) * 255);
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
      head.write(type, 0, 4, "ascii");
      head.writeUInt32BE(png.length + 8, 4);
      return Buffer.concat([head, png]);
    }),
  );
  const head = Buffer.alloc(8);
  head.write("icns", 0, 4, "ascii");
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
writeFileSync(join(OUT, "icon.ico"), Buffer.concat([head, ...entries, ...icoSizes.map((s) => images.get(s))]));

const at = (size) => images.get(size);
writeFileSync(join(OUT, "32x32.png"), at(32));
writeFileSync(join(OUT, "128x128.png"), at(128));
writeFileSync(join(OUT, "128x128@2x.png"), at(256));
writeFileSync(join(OUT, "icon.png"), at(256));
writeFileSync(join(OUT, "icon-256.png"), at(256));
writeFileSync(join(OUT, "icon-512.png"), render(512));
writeFileSync(
  join(OUT, "icon.icns"),
  icns([
    ["ic11", at(32)],
    ["ic12", at(64)],
    ["ic07", at(128)],
    ["ic13", at(256)],
    ["ic08", at(256)],
    ["ic14", render(512)],
    ["ic09", render(512)],
    ["ic10", render(1024)],
  ]),
);
writeFileSync(join(UI, "logo.png"), render(256));
writeFileSync(join(UI, "logo-64.png"), render(64));
console.log("icons rebuilt from logo-source.png:", sizes.join(", "), "+ icns");
