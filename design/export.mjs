// Exports the real launcher UI (HTML + CSS + live layout) to editable SVG.
// Run the demo server first:  python -m http.server 8765 --bind 127.0.0.1  (workdir: ui)
// Then:  node design/export.mjs
//
// Unlike build.mjs, nothing here is drawn by hand: every box, text line, image
// and icon comes from getBoundingClientRect()/getComputedStyle() of the running
// app, so the frames match the shipping interface 1:1.
import { spawn } from "node:child_process";
import { get } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const screensDir = join(here, "screens");
mkdirSync(screensDir, { recursive: true });

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9341;
const BASE = process.env.AQUA_URL || "http://127.0.0.1:8765/?demo=1";
const W = 1440;
const H = 900;

const pages = [
  ["home", null],
  ["library", `document.querySelector('[data-nav="library"]')?.click()`],
  ["discover", `document.querySelector('[data-nav="discover"]')?.click()`],
  ["instances", `document.querySelector('[data-nav="instances"]')?.click()`],
  ["pack", `document.querySelector('[data-nav="instances"]')?.click(); document.querySelector('[data-profile]')?.click()`],
  ["achievements", `document.querySelector('[data-nav="achievements"]')?.click()`],
  ["accounts", `document.querySelector('#account-card')?.click()`],
  ["settings", `document.querySelector('#nav-settings')?.click()`],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// node:http instead of fetch: Python's http.server closes HTTP/1.0 sockets in
// a way that trips an undici assertion on some Node builds.
const httpText = (url) => new Promise((resolve, reject) => {
  get(url, (res) => {
    let data = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => resolve(data));
  }).on("error", reject);
});

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const body = await httpText(BASE);
      if (body.includes("<html")) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`demo server is not answering at ${BASE}`);
}
await waitForServer();

const profile = process.env.TEMP + "\\aqua-export-profile";
mkdirSync(profile, { recursive: true });
const child = spawn(EDGE, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  `--window-size=${W},${H}`,
  BASE,
], { stdio: "ignore" });

async function target() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const body = await httpText(`http://127.0.0.1:${PORT}/json/list`);
      const list = JSON.parse(body);
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error("no CDP target");
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.reload", { ignoreCache: true });

// Wait for the real UI, not the boot splash.
for (let i = 0; i < 80; i += 1) {
  const state = await send("Runtime.evaluate", {
    expression: `({ done: !document.body.classList.contains("is-booting"), page: document.querySelector(".page:not([hidden])")?.id || "", cards: document.querySelectorAll(".vcard").length })`,
    returnByValue: true,
  });
  const value = state.result?.value || {};
  if (value.done && value.cards > 0) break;
  await sleep(250);
}
await sleep(900);

// Background is identical on every screen, so capture it once with the app
// hidden. It carries the real ocean/aurora imagery; all UI on top is vector.
await send("Runtime.evaluate", { expression: `document.querySelector(".app").style.visibility = "hidden"` });
await sleep(120);
const backdrop = await send("Page.captureScreenshot", { format: "jpeg", quality: 88, captureBeyondViewport: false });
await send("Runtime.evaluate", { expression: `document.querySelector(".app").style.visibility = ""` });
const backdropUri = `data:image/jpeg;base64,${backdrop.data}`;

const SNAPSHOT = String.raw`(() => {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const clean = (value) => String(value).replace(/["']/g, "").replace(/\s+/g, " ").trim();
  const splitColor = (value) => {
    const raw = String(value || "");
    const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/.exec(raw);
    if (srgb) {
      const a = srgb[4] === undefined ? 1 : parseFloat(srgb[4]);
      return { color: "rgb(" + [srgb[1], srgb[2], srgb[3]].map((x) => Math.round(parseFloat(x) * 255)).join(",") + ")", opacity: a };
    }
    const m = /^rgba?\(([^)]+)\)$/.exec(raw);
    if (!m) return { color: raw || "none", opacity: 1 };
    const parts = m[1].split(",").map((x) => parseFloat(x));
    const a = parts.length > 3 ? parts[3] : 1;
    return { color: "rgb(" + parts.slice(0, 3).map((x) => Math.round(x)).join(",") + ")", opacity: a };
  };
  const visible = (el, cs) =>
    cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.02;
  const hash = (value) => { let h = 2166136261; for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const metrics = new Map();
  const ascent = (size, weight, family) => {
    const key = size + "|" + weight + "|" + family;
    if (!metrics.has(key)) {
      ctx.font = weight + " " + size + "px " + family;
      const m = ctx.measureText("Hg");
      metrics.set(key, m.actualBoundingBoxAscent || size * 0.75);
    }
    return metrics.get(key);
  };
  const iconMarkup = (svg, color) => {
    const use = svg.querySelector("use");
    const href = use && (use.getAttribute("href") || use.getAttribute("xlink:href") || "");
    const id = href.startsWith("#") ? href.slice(1) : "";
    const symbol = id ? document.getElementById(id) : null;
    let inner = symbol ? symbol.innerHTML : svg.innerHTML;
    inner = inner.replace(/currentColor/g, color);
    inner = inner.replace(/<title[\s\S]*?<\/title>/g, "");
    return inner;
  };
  const textLines = (node, cs, owner) => {    const raw = node.textContent;
    if (!raw || !raw.trim()) return [];
    const value = cs.textTransform === "uppercase" ? raw.toUpperCase() : cs.textTransform === "lowercase" ? raw.toLowerCase() : raw;
    const family = clean(cs.fontFamily.split(",")[0]) || "Manrope";
    const size = parseFloat(cs.fontSize);
    if (!Number.isFinite(size) || size < 1) return [];
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const base = splitColor(cs.color);
    const range = document.createRange();
    const groups = new Map();
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const rect = rects[0];
      if (!rect.width && ch === " ") {
        const keys = [...groups.keys()];
        if (keys.length) groups.get(keys[keys.length - 1]).text += " ";
        continue;
      }
      if (!ch.trim() && !groups.size) continue;
      const key = Math.round(rect.top * 2) / 2;
      if (!groups.has(key)) groups.set(key, { x: rect.left, top: rect.top, height: rect.height, text: "" });
      groups.get(key).text += ch;
    }
    return [...groups.values()].map((line) => ({
      kind: "text",
      x: Math.round(line.x * 100) / 100,
      baseline: Math.round((line.top + (line.height - (ascent(size, weight, family) + size * 0.22)) / 2 + ascent(size, weight, family)) * 100) / 100,
      text: line.text.replace(/\s+$/, ""),
      size, weight, family,
      color: base.color,
      opacity: base.opacity * parseFloat(cs.opacity || 1),
      tracking: cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0,
    }));
  };
  const usedNames = new Map();
  const layerName = (el, tag) => {
    let raw = el.id || el.getAttribute("data-i18n") || [...el.classList].filter((c) => !c.startsWith("is-")).slice(0, 2).join(".") || tag;
    if (el.classList.contains("titlebar")) raw = "Main menu - titlebar";
    else if (el.classList.contains("rail")) raw = "Main menu - sidebar";
    else if (el.id === "view") raw = "Scroll panel - below menu";
    else if (el.id === "app") raw = "App";
    const base = clean(raw).slice(0, 54) || tag;
    const n = (usedNames.get(base) || 0) + 1;
    usedNames.set(base, n);
    return n === 1 ? base : base + " " + n;
  };
  const visit = (el) => {
    if (!(el instanceof Element)) return null;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "defs", "symbol", "title"].includes(tag)) return null;
    if (el.classList.contains("sprite") || el.classList.contains("sr-only") || el.closest("[hidden]")) return null;
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) return null;
    const name = layerName(el, tag);
    const x = Math.round(r.left * 100) / 100;
    const y = Math.round(r.top * 100) / 100;
    const w = Math.round(r.width * 100) / 100;
    const h = Math.round(r.height * 100) / 100;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const bg = splitColor(cs.backgroundColor);
    const bwidth = parseFloat(cs.borderTopWidth) || 0;
    const border = splitColor(cs.borderTopColor);
    const shadow = cs.boxShadow && cs.boxShadow !== "none" && !cs.boxShadow.includes("inset") ? cs.boxShadow : "";
    const bgImage = cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : "";
    const scroller = [cs.overflowX, cs.overflowY, cs.overflow].some((value) => value === "hidden" || value === "auto" || value === "scroll");
    const children = [];
    const push = (item) => { children.push(item); };
    const pseudo = (which) => {
      const ps = getComputedStyle(el, which);
      if (ps.display === "none" || ps.content === "none" || ps.content === "normal" || ps.visibility === "hidden") return;
      if (ps.position !== "absolute" && ps.position !== "fixed") return;
      const pw = parseFloat(ps.width), ph = parseFloat(ps.height);
      if (!(pw > 0.5 && ph > 0.5)) return;
      let px = r.left, py = r.top;
      if (ps.left !== "auto") px = r.left + (parseFloat(ps.left) || 0);
      else if (ps.right !== "auto") px = r.right - (parseFloat(ps.right) || 0) - pw;
      if (ps.top !== "auto") py = r.top + (parseFloat(ps.top) || 0);
      else if (ps.bottom !== "auto") py = r.bottom - (parseFloat(ps.bottom) || 0) - ph;
      const paint = splitColor(ps.backgroundColor);
      const stroke = splitColor(ps.borderTopColor);
      const strokeW = parseFloat(ps.borderTopWidth) || 0;
      if (paint.opacity < 0.01 && strokeW < 0.5) return;
      push({ kind: "box", name: which, x: px, y: py, w: pw, h: ph, radius: parseFloat(ps.borderTopLeftRadius) || 0, fill: paint.color, fillOpacity: paint.opacity, border: stroke.color, borderOpacity: stroke.opacity, borderWidth: strokeW, shadow: "", bgImage: "" });
    };
    const done = () => children.length ? { kind: "group", name, x, y, w, h, clip: scroller ? { x, y, w, h, r: radius } : null, children } : null;
    if ((bg.opacity > 0.01 && bg.color !== "rgba(0, 0, 0, 0)") || bgImage || (bwidth > 0 && cs.borderTopStyle !== "none") || shadow) {
      push({ kind: "box", name, x, y, w, h, radius, fill: bg.color, fillOpacity: bg.opacity, border: border.color, borderOpacity: border.opacity, borderWidth: bwidth, shadow, bgImage });
    }
    pseudo("::before");
    if (tag === "img") {
      push({ kind: "image", name, x, y, w, h, radius, src: el.currentSrc || el.src, fit: cs.objectFit });
      return done();
    }
    if (tag === "svg" && !el.classList.contains("sprite")) {
      push({ kind: "icon", name, x, y, w, h, color: splitColor(cs.color).color, html: iconMarkup(el, splitColor(cs.color).color) });
      return done();
    }
    if (["input", "textarea", "select"].includes(tag)) {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "range") {
        const min = parseFloat(el.min) || 0, max = parseFloat(el.max) || 100;
        const value = parseFloat(el.value) || min;
        const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5ce8dc";
        const cy = y + h / 2;
        const pad = 8;
        push({ kind: "box", name: "range track", x: x + pad, y: cy - 2, w: Math.max(0, w - pad * 2), h: 4, radius: 2, fill: "rgb(255,255,255)", fillOpacity: 0.12, border: "none", borderOpacity: 0, borderWidth: 0, shadow: "", bgImage: "" });
        push({ kind: "box", name: "range fill", x: x + pad, y: cy - 2, w: Math.max(0, (w - pad * 2) * pct), h: 4, radius: 2, fill: accent, fillOpacity: 1, border: "none", borderOpacity: 0, borderWidth: 0, shadow: "", bgImage: "" });
        push({ kind: "box", name: "range thumb", x: x + pad + (w - pad * 2) * pct - 7, y: cy - 7, w: 14, h: 14, radius: 7, fill: accent, fillOpacity: 1, border: "rgb(5,15,23)", borderOpacity: 1, borderWidth: 2, shadow: "", bgImage: "" });
        return done();
      }
      if (!["checkbox", "radio", "color", "file", "hidden"].includes(type)) {
        const value = tag === "select" ? el.options[el.selectedIndex]?.text || "" : el.value || el.placeholder || "";
        if (value) {
          const family = clean(cs.fontFamily.split(",")[0]) || "Manrope";
          const size = parseFloat(cs.fontSize) || 13;
          const weight = parseInt(cs.fontWeight, 10) || 400;
          const base = splitColor(cs.color);
          const pad = parseFloat(cs.paddingLeft) || 0;
          const a = ascent(size, weight, family);
          push({
            kind: "text", name: "value", x: x + pad,
            baseline: y + (h - (a + size * 0.22)) / 2 + a,
            text: el.value ? value : (el.placeholder || value),
            size, weight, family,
            color: base.color,
            opacity: base.opacity * (el.value ? 1 : 0.55),
            tracking: cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0,
          });
        }
      }
      return done();
    }
    for (const node of el.childNodes) {
      if (node.nodeType === 3) textLines(node, cs, el).forEach(push);
    }
    for (const child of el.children) {
      const group = visit(child);
      if (group) children.push(group);
    }
    pseudo("::after");
    return done();
  };
  const root = document.querySelector(".app") || document.body;
  return { out: visit(root), vw, vh };
})()`;

const snapshot = async () => {
  const result = await send("Runtime.evaluate", { expression: SNAPSHOT, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "snapshot failed");
  return result.result.value;
};

const xml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (value) => Math.round(Number(value) * 100) / 100;

function gradient(id, css) {
  const body = /^(linear|radial)-gradient\((.*)\)$/s.exec(css || "");
  if (!body) return null;
  const [, type, args] = body;
  const colors = [...args.matchAll(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g)].map((m) => m[0]);
  if (colors.length < 1) return null;
  const angle = /(-?\d+(?:\.\d+)?)deg/.exec(args);
  const dir = /to\s+(top|bottom|left|right)/.exec(args);
  let x1 = "0%", y1 = "0%", x2 = "100%", y2 = "100%";
  if (dir) {
    const d = dir[1];
    x1 = d === "right" ? "0%" : d === "left" ? "100%" : "0%";
    x2 = d === "right" ? "100%" : d === "left" ? "0%" : "0%";
    y1 = d === "bottom" ? "0%" : d === "top" ? "100%" : "0%";
    y2 = d === "bottom" ? "100%" : d === "top" ? "0%" : "0%";
  } else if (angle) {
    const a = ((parseFloat(angle[1]) - 90) * Math.PI) / 180;
    const dx = Math.cos(a) / 2, dy = Math.sin(a) / 2;
    x1 = `${50 - dx * 100}%`; y1 = `${50 - dy * 100}%`;
    x2 = `${50 + dx * 100}%`; y2 = `${50 + dy * 100}%`;
  }
  const stops = colors.map((color, i) => {
    const rgba = /^rgba?\(([^)]+)\)$/.exec(color);
    let paint = color, alpha = 1;
    if (rgba) {
      const parts = rgba[1].split(",").map((x) => parseFloat(x));
      paint = `rgb(${parts.slice(0, 3).map((x) => Math.round(x)).join(",")})`;
      alpha = parts.length > 3 ? parts[3] : 1;
    }
    return `<stop offset="${colors.length === 1 ? 1 : i / (colors.length - 1)}" stop-color="${paint}"${alpha < 1 ? ` stop-opacity="${alpha}"` : ""}/>`;
  }).join("");
  if (type === "radial") {
    return `<radialGradient id="${id}" cx="50%" cy="50%" r="70%">${stops}</radialGradient>`;
  }
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
}

const imageCache = new Map();
function flatten(item, out = []) {
  if (!item) return out;
  if (item.kind === "group") {
    for (const child of item.children) flatten(child, out);
  } else {
    out.push(item);
  }
  return out;
}
async function embedImages(rootItem) {
  for (const item of flatten(rootItem)) {
    if (item.kind !== "image" || !/^https?:/i.test(item.src || "")) continue;
    if (!imageCache.has(item.src)) {
      try {
        const res = await fetch(item.src, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(String(res.status));
        const type = (res.headers.get("content-type") || "image/png").split(";")[0];
        const buffer = Buffer.from(await res.arrayBuffer());
        imageCache.set(item.src, `data:${type};base64,${buffer.toString("base64")}`);
      } catch {
        imageCache.set(item.src, "");
      }
    }
    const data = imageCache.get(item.src);
    if (data) item.src = data;
  }
}

const MASTER_LABELS = { home: "Главная", library: "Версии", discover: "Каталог", instances: "Сборки", pack: "Сборка", achievements: "Достижения", accounts: "Аккаунты", settings: "Настройки" };

function buildMaster(files) {
  const gridCols = 2, gap = 80, pad = 80, label = 58;
  const rows = Math.ceil(pages.length / gridCols);
  const mw = pad * 2 + gridCols * W + (gridCols - 1) * gap;
  const mh = pad * 2 + rows * (label + H) + (rows - 1) * gap;
  const first = files.get(pages[0][0]);
  const style = first.match(/<style>[\s\S]*?<\/style>/)?.[0] || "";
  const cells = pages.map(([name], index) => {
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);
    const x = pad + col * (W + gap);
    const y = pad + row * (label + H + gap);
    const svg = files.get(name);
    const inner = svg
      .replace(/^<\?xml[^>]*>\s*/, "")
      .replace(/<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "")
      .replace(/<title>[\s\S]*?<\/title>/, "")
      .replace(/<style>[\s\S]*?<\/style>/, "");
    return `<g id="Screen · ${MASTER_LABELS[name]}" transform="translate(${x} ${y})">${inner}</g>
  <text x="${x}" y="${y - 20}" font-family="Manrope" font-size="22" font-weight="800" fill="#e9f5f8" letter-spacing="-0.3">${MASTER_LABELS[name]}</text>
  <text x="${x + 2}" y="${y - 4}" font-family="Manrope" font-size="11" font-weight="600" fill="#7d97a4">Aqua Launcher · 1440 × 900</text>`;
  }).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${mw}" height="${mh}" viewBox="0 0 ${mw} ${mh}" fill="none">
  <title>Aqua Launcher — Figma design</title>
  ${style}
  <rect width="${mw}" height="${mh}" fill="#030a10"/>
  ${cells}
</svg>
`;
}

const FONT_CSS = (() => {
  const font = (file, range) => {
    const data = readFileSync(join(here, "..", "ui", "assets", "fonts", file)).toString("base64");
    return `@font-face{font-family:'Manrope';font-style:normal;font-weight:200 800;font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range};}`;
  };
  return `<style>${font("manrope-cyrillic.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116")}${font("manrope-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122")}</style>`;
})();

function toSvg(name, data, prefix) {
  const defs = [];
  const body = [];
  let counter = 0;
  const nextId = (base) => `${prefix}-${base}-${++counter}`;
  const clipFor = (p) => {
    if (!p.clips || !p.clips.length) return "";
    let x1 = -Infinity, y1 = -Infinity, x2 = Infinity, y2 = Infinity, radius = 0;
    for (const c of p.clips) {
      x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y);
      x2 = Math.min(x2, c.x + c.w); y2 = Math.min(y2, c.y + c.h);
      radius = Math.max(radius, c.r || 0);
    }
    if (x2 - x1 < 0.5 || y2 - y1 < 0.5) return "";
    const id = nextId("clip");
    defs.push(`<clipPath id="${id}"><rect x="${num(x1)}" y="${num(y1)}" width="${num(x2 - x1)}" height="${num(y2 - y1)}" rx="${num(Math.min(radius, (x2 - x1) / 2, (y2 - y1) / 2))}"/></clipPath>`);
    return `clip-path="url(#${id})"`;
  };

  const emit = (p) => {
    if (p.kind === "group") {
      const clip = p.clip ? clipFor({ clips: [p.clip] }) : "";
      const attrs = ` id="${xml(p.name)}"${clip ? ` ${clip}` : ""}`;
      return `<g${attrs}>\n${p.children.map(emit).join("\n")}\n</g>`;
    }
    if (p.kind === "box") {
      const fillId = p.bgImage && /gradient/.test(p.bgImage) ? nextId("grad") : "";
      if (fillId) {
        const g = gradient(fillId, p.bgImage);
        if (g) defs.push(g); else p.bgImage = "";
      }
      const useGradient = fillId && defs.length;
      if (p.fillOpacity < 0.02 && !useGradient && !p.borderWidth && !p.shadow) return "";
      if (p.shadow) {
        const m = /(rgba?\([^)]+\)|#[0-9a-fA-F]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(p.shadow);
        if (m) {
          const id = nextId("shadow");
          const rgba = /^rgba?\(([^)]+)\)$/.exec(m[1]);
          let flood = m[1], floodOpacity = 1;
          if (rgba) {
            const parts = rgba[1].split(",").map((x) => parseFloat(x));
            flood = `rgb(${parts.slice(0, 3).map((x) => Math.round(x)).join(",")})`;
            floodOpacity = parts.length > 3 ? parts[3] : 1;
          }
          defs.push(`<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="${m[2]}" dy="${m[3]}" stdDeviation="${parseFloat(m[4]) / 2}" flood-color="${flood}" flood-opacity="${floodOpacity}"/></filter>`);
          p.filter = id;
        }
      }
      const fill = useGradient ? `url(#${fillId})` : p.fill;
      const fillOp = useGradient || p.fill === "none" ? 1 : p.fillOpacity;
      const stroke = p.borderWidth > 0 && p.borderOpacity > 0.01 ? ` stroke="${p.border}" stroke-opacity="${num(p.borderOpacity)}" stroke-width="${num(p.borderWidth)}"` : "";
      const filter = p.filter ? ` filter="url(#${p.filter})"` : "";
      const clip = clipFor(p);
      const rect = `<rect id="${xml(p.name)}" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" rx="${num(p.radius)}" fill="${fill}" fill-opacity="${num(fillOp)}"${stroke}${filter}/>`;
      return clip ? `<g ${clip}>${rect}</g>` : rect;
    }
    if (p.kind === "image") {
      const id = nextId("clip");
      defs.push(`<clipPath id="${id}"><rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" rx="${num(p.radius)}"/></clipPath>`);
      const fit = p.fit === "contain" ? "xMidYMid meet" : p.fit === "fill" ? "none" : "xMidYMid slice";
      const clip = clipFor(p);
      const image = `<image id="${xml(p.name)}" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" preserveAspectRatio="${fit}" clip-path="url(#${id})" href="${xml(p.src)}"/>`;
      return clip ? `<g ${clip}>${image}</g>` : image;
    }
    if (p.kind === "icon") {
      const clip = clipFor(p);
      const icon = `<g id="${xml(p.name)}" transform="translate(${num(p.x)} ${num(p.y)}) scale(${num(p.w / 24)} ${num(p.h / 24)})" fill="none" stroke="${p.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p.html}</g>`;
      return clip ? `<g ${clip}>${icon}</g>` : icon;
    }
    if (p.kind === "text") {
      const clip = clipFor(p);
      const text = `<text id="${xml(p.name)}" x="${num(p.x)}" y="${num(p.baseline)}" font-family="${xml(p.family)}" font-size="${num(p.size)}" font-weight="${p.weight}" fill="${p.color}" fill-opacity="${num(p.opacity)}" letter-spacing="${num(p.tracking)}">${xml(p.text)}</text>`;
      return clip ? `<g ${clip}>${text}</g>` : text;
    }
    return "";
  };
  body.push(emit(data.out));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
  <title>Aqua Launcher — ${xml(name)}</title>
  ${FONT_CSS}
  <defs>${defs.join("")}</defs>
  <image x="0" y="0" width="${W}" height="${H}" href="${backdropUri}"/>
  ${body.join("\n  ")}
</svg>
`;
}

const files = new Map();
for (const [name, action] of pages) {
  await send("Runtime.evaluate", { expression: `document.querySelector("#view").scrollTop = 0` });
  if (action) {
    await send("Runtime.evaluate", { expression: action });
    await sleep(name === "pack" ? 1800 : 650);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 760, button: "none", pointerType: "mouse" });
  await sleep(260);
  const data = await snapshot();
  await embedImages(data.out);
  const svg = toSvg(name, data, name);
  files.set(name, svg);
  writeFileSync(join(screensDir, `${name}.svg`), svg, "utf8");
  const count = (item) => item ? (item.kind === "group" ? 1 + item.children.reduce((n, child) => n + count(child), 0) : 1) : 0;
  process.stdout.write(`${name}: ${count(data.out)} separate layers\n`);
}

writeFileSync(join(here, "Aqua-Launcher.fig.svg"), buildMaster(files), "utf8");
process.stdout.write(`master: Aqua-Launcher.fig.svg\n`);

ws.close();
child.kill();
