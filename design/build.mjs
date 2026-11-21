// Generates editable SVG design frames for Aqua Launcher.
// Run: node design/build.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "screens");
mkdirSync(out, { recursive: true });

// Embed the same variable font the launcher ships so browser previews match the app.
const font = (file, range) => {
  const data = readFileSync(join(here, "..", "ui", "assets", "fonts", file)).toString("base64");
  return `@font-face{font-family:'Manrope';font-style:normal;font-weight:200 800;font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range};}`;
};
const FONT_CSS = `<style>${font("manrope-cyrillic.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116")}${font("manrope-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122")}</style>`;

const W = 1440;
const H = 900;
const RAIL = 248;

const C = {
  bg: "#050f17",
  bgDeep: "#030a10",
  panel: "#0a1923",
  panel2: "#0d202b",
  field: "#0e2430",
  line: "#ffffff",
  text: "#e9f5f8",
  dim: "#aac2cc",
  muted: "#7d97a4",
  accent: "#5ce8dc",
  accent2: "#3bc6ff",
  accentSoft: "#123c3d",
  ink: "#03211f",
  ok: "#5fe3a1",
  warn: "#ffc86b",
  danger: "#ff8095",
};

const esc = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const T = (x, y, value, o = {}) => {
  const { size = 13, weight = 500, fill = C.text, anchor = "start", opacity = 1, tracking = 0, family = "Manrope, Inter, sans-serif" } = o;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" fill-opacity="${opacity}" text-anchor="${anchor}" letter-spacing="${tracking}">${esc(value)}</text>`;
};

const R = (x, y, w, h, r = 0, fill = "none", o = {}) => {
  const { opacity = 1, stroke = "none", strokeOpacity = 1, strokeWidth = 1 } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="${strokeWidth}"/>`;
};

const line = (x1, y1, x2, y2, color = C.line, opacity = 0.08) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-opacity="${opacity}"/>`;

const panel = (x, y, w, h, r = 20) =>
  `<g id="Panel">${R(x, y, w, h, r, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}</g>`;

const ICONS = {
  home: '<path d="M4 10.6 12 4l8 6.6V19a1.4 1.4 0 0 1-1.4 1.4h-3.4v-5.6H8.8v5.6H5.4A1.4 1.4 0 0 1 4 19z"/>',
  library: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.4 8.6-2 4.8-4.8 2 2-4.8z"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
  star: '<path d="m12 3.4 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.6l5.9-.8z"/>',
  settings: '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/><path d="M4 12h6"/><path d="M14 12h6"/><circle cx="12" cy="12" r="2"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="m6.5 7 1 13h9l1-13"/>',
  folder: '<path d="M3.5 6.5h6l2 2h9v11h-17z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6z"/>',
  sparkles: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/>',
  external: '<path d="M14 4h6v6"/><path d="m20 4-8.5 8.5"/><path d="M19 14v5.5H4.5V5H10"/>',
  sunny: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
};

const icon = (name, x, y, size = 18, color = C.dim, opacity = 1) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" color="${color}">${ICONS[name] || ""}</g>`;

const btn = (x, y, w, h, label, kind = "soft", iconName = "") => {
  const primary = kind === "primary";
  const fill = primary ? "url(#accent)" : "rgba(255,255,255,0.055)";
  const stroke = primary ? "none" : C.line;
  const color = primary ? C.ink : C.text;
  const iconSize = 16;
  const gap = iconName ? 9 : 0;
  const textWidth = label.length * 7.2;
  const start = x + (w - textWidth - gap - (iconName ? iconSize : 0)) / 2;
  return `<g id="Button ${esc(label)}">
    ${R(x, y, w, h, 12, fill, { stroke, strokeOpacity: primary ? 0 : 0.14 })}
    ${iconName ? icon(iconName, start, y + (h - iconSize) / 2, iconSize, color) : ""}
    ${T(start + (iconName ? iconSize + gap : 0), y + h / 2 + 4.5, label, { size: 13, weight: 700, fill: color })}
  </g>`;
};

const chip = (x, y, label, kind = "neutral") => {
  const palette = {
    neutral: ["rgba(255,255,255,0.055)", C.dim],
    accent: [C.accentSoft, C.accent],
    ok: ["rgba(95,227,161,0.12)", C.ok],
    warn: ["rgba(255,200,107,0.12)", C.warn],
    danger: ["rgba(255,128,149,0.12)", C.danger],
  }[kind];
  const w = label.length * 6.6 + 20;
  return `<g>${R(x, y, w, 24, 12, palette[0])}${T(x + w / 2, y + 16, label, { size: 10.5, weight: 700, fill: palette[1], anchor: "middle", tracking: 0.3 })}</g>`;
};

const head = (title, sub, action) => `
  <g id="Page header">
    ${T(RAIL + 48, 92, title, { size: 30, weight: 800, tracking: -0.8 })}
    ${T(RAIL + 48, 118, sub, { size: 12.5, fill: C.muted })}
    ${action || ""}
  </g>`;

const navItem = (y, name, label, active = false) => `
  <g id="Nav ${esc(label)}">
    ${active ? R(12, y, RAIL - 24, 42, 12, C.accentSoft) : ""}
    ${active ? R(12, y + 9, 3, 24, 2, C.accent) : ""}
    ${icon(name, 26, y + 12, 18, active ? C.accent : C.muted)}
    ${T(56, y + 26, label, { size: 13, weight: active ? 700 : 600, fill: active ? C.text : C.dim, opacity: active ? 1 : 0.9 })}
  </g>`;

const titlebar = () => `
  <g id="Title bar">
    ${R(0, 0, W, 52, 0, "rgba(5,15,23,0.72)")}
    ${line(0, 52, W, 52)}
    <g id="Brand">
      ${R(22, 13, 26, 26, 8, "url(#accent)")}
      <path d="M27 27c3.5 0 3.5-4 7-4s3.5 4 7 4" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>
      ${T(56, 32, "aqua", { size: 19, weight: 800, tracking: -0.4 })}
      ${T(112, 31, "ЛАУНЧЕР", { size: 9, weight: 700, fill: C.muted, tracking: 1.8 })}
      ${R(180, 13, 92, 26, 8, "rgba(255,255,255,0.055)", { stroke: C.line, strokeOpacity: 0.1 })}
      ${T(226, 30, "v0.0.13 Beta", { size: 10.5, weight: 700, fill: C.dim, anchor: "middle" })}
    </g>
    <g id="Window controls">
      ${T(1340, 30, "—", { size: 14, fill: C.muted, anchor: "middle" })}
      ${R(1374, 22, 10, 9, 1.5, "none", { stroke: C.muted, strokeOpacity: 0.8, strokeWidth: 1.5 })}
      ${T(1418, 30, "×", { size: 18, fill: C.muted, anchor: "middle" })}
    </g>
  </g>`;

const rail = (active) => `
  <g id="Rail">
    ${R(0, 52, RAIL, H - 52, 0, "rgba(6,18,26,0.55)")}
    ${line(RAIL, 52, RAIL, H, C.line, 0.06)}
    ${T(26, 100, "ИГРАТЬ", { size: 9, weight: 800, fill: C.muted, tracking: 1.6, opacity: 0.7 })}
    ${navItem(112, "home", "Главная", active === "home")}
    ${navItem(164, "library", "Версии", active === "library")}
    ${navItem(216, "layers", "Сборки", active === "instances")}
    ${T(26, 292, "ОБЗОР", { size: 9, weight: 800, fill: C.muted, tracking: 1.6, opacity: 0.7 })}
    ${navItem(304, "compass", "Каталог", active === "discover")}
    ${navItem(356, "star", "Достижения", active === "achievements")}
    ${navItem(408, "user", "Аккаунты", active === "accounts")}
    <g id="Account">
      ${R(14, 770, RAIL - 28, 58, 14, "rgba(255,255,255,0.05)", { stroke: C.line, strokeOpacity: 0.1 })}
      <circle cx="44" cy="799" r="17" fill="#28454b"/>
      <circle cx="44" cy="793" r="5.5" fill="#8fb9ba"/>
      <path d="M34 811a10 10 0 0 1 20 0" fill="#8fb9ba"/>
      ${T(72, 795, "Steve", { size: 13, weight: 700 })}
      ${T(72, 812, "Офлайн-аккаунт", { size: 10, fill: C.muted })}
      ${icon("settings", 214, 789, 18, C.muted)}
    </g>
    ${T(24, 864, "v0.0.13 Beta", { size: 10, fill: C.muted, opacity: 0.7 })}
    ${T(24, 880, "Windows · x64", { size: 10, fill: C.muted, opacity: 0.5 })}
  </g>`;

const statTile = (x, y, w, h, label, value, accent = false) => `
  <g>
    ${R(x, y, w, h, 14, accent ? C.accentSoft : "rgba(255,255,255,0.045)", { stroke: C.line, strokeOpacity: accent ? 0.16 : 0.07 })}
    ${T(x + 16, y + 24, label, { size: 9, weight: 800, fill: C.muted, tracking: 1 })}
    ${T(x + 16, y + 54, value, { size: 20, weight: 800, fill: accent ? C.accent : C.text, tracking: -0.4 })}
  </g>`;

const versionCard = (x, y, title, kind, sub, accent = false) => `
  <g id="Version ${esc(title)}">
    ${R(x, y, 260, 212, 18, "url(#panel)", { stroke: C.line, strokeOpacity: accent ? 0.3 : 0.08 })}
    ${R(x + 12, y + 12, 236, 104, 12, accent ? "url(#accentSoft)" : "url(#cardArt)")}
    ${R(x + 24, y + 54, 42, 42, 12, "rgba(3,17,22,0.5)")}
    ${icon("layers", x + 35, y + 65, 20, accent ? C.accent : "#9fd8d4")}
    ${chip(x + 186, y + 24, kind, "neutral")}
    ${T(x + 16, y + 146, title, { size: 16, weight: 800, tracking: -0.2 })}
    ${T(x + 16, y + 166, sub, { size: 10.5, fill: C.muted })}
    ${R(x + 16, y + 180, 96, 20, 6, "rgba(255,255,255,0.05)")}
    ${T(x + 64, y + 194, "Установлено", { size: 9, weight: 700, fill: C.ok, anchor: "middle" })}
    ${icon("play", x + 222, y + 180, 20, accent ? C.accent : C.dim)}
  </g>`;

const projectRow = (x, y, title, author, desc, downloads, label = "Установить", badge = "Мод", hue = "teal") => {
  const palettes = {
    teal: ["#123b3b", "#1d5b56", "#8fe6da"],
    blue: ["#152a44", "#20456a", "#8fc7ff"],
    violet: ["#241b3d", "#3a2a5e", "#c0a6ff"],
    amber: ["#35260f", "#5a4016", "#ffd28f"],
  };
  const [a, b, f] = palettes[hue] || palettes.teal;
  return `<g id="Project ${esc(title)}">
    ${R(x, y, 1080, 92, 16, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${R(x + 14, y + 14, 64, 64, 14, a)}
    <circle cx="${x + 46}" cy="${y + 46}" r="22" fill="${b}"/>
    <path d="M${x + 34} ${y + 53}c8-12 16-2 24-12" fill="none" stroke="${f}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
    ${T(x + 96, y + 36, title, { size: 15, weight: 800 })}
    ${T(x + 96 + title.length * 8.4, y + 36, `от ${author}`, { size: 10.5, fill: C.muted })}
    ${T(x + 96, y + 57, desc, { size: 11.5, fill: C.dim })}
    ${chip(x + 96, y + 64, badge, "neutral")}
    ${T(x + 900, y + 30, downloads, { size: 10.5, fill: C.muted, anchor: "end" })}
    ${T(x + 900, y + 46, "загрузок", { size: 9, fill: C.muted, anchor: "end", opacity: 0.7 })}
    ${btn(x + 916, y + 25, 146, 42, label, "soft", "download")}
  </g>`;
};

const iconCard = (x, y, w, h, title, sub, meta, action = true) => `
  <g id="Instance ${esc(title)}">
    ${R(x, y, w, h, 18, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${R(x + 16, y + 16, 52, 52, 14, "url(#accentSoft)")}
    ${icon("layers", x + 32, y + 32, 20, C.accent)}
    ${T(x + 16, y + 94, title, { size: 15, weight: 800 })}
    ${T(x + 16, y + 114, sub, { size: 10.5, fill: C.muted })}
    ${R(x + 16, y + 130, w - 32, 1, 0, C.line, { opacity: 0.08 })}
    ${T(x + 16, y + 156, meta, { size: 10, fill: C.dim })}
    ${chip(x + 16, y + 166, "Готова", "ok")}
    ${action ? btn(x + 16, y + 198, 100, 34, "Играть", "soft", "play") : ""}
    ${action ? icon("folder", x + w - 76, y + 204, 18, C.muted) : ""}
    ${action ? icon("trash", x + w - 44, y + 204, 18, C.muted) : ""}
  </g>`;

const screen = (name, active, body) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
  <title>Aqua Launcher — ${esc(name)}</title>
  ${FONT_CSS}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#06141d"/>
      <stop offset="0.55" stop-color="#041019"/>
      <stop offset="1" stop-color="#071a20"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.accent}"/>
      <stop offset="1" stop-color="${C.accent2}"/>
    </linearGradient>
    <linearGradient id="accentSoft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="rgba(92,232,220,0.20)"/>
      <stop offset="1" stop-color="rgba(59,198,255,0.08)"/>
    </linearGradient>
    <linearGradient id="cardArt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#11343a"/>
      <stop offset="1" stop-color="#0a2029"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0c1c26"/>
      <stop offset="1" stop-color="#081620"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.accent2}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${C.accent2}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g id="${esc(name)} frame">
    ${R(0, 0, W, H, 0, "url(#bg)")}
    <ellipse cx="420" cy="60" rx="420" ry="260" fill="url(#glow)"/>
    <ellipse cx="1220" cy="780" rx="460" ry="300" fill="url(#glow2)"/>
    ${titlebar()}
    ${rail(active)}
    ${body}
  </g>
</svg>
`;

/* ------------------------------------------------------------------ home */
const home = screen("Home", "home", `
  <g id="Hero">
    ${R(RAIL + 48, 84, 1096, 336, 24, "#0d2a2c")}
    <path d="M${RAIL + 48} 340c120-120 250-160 380-120s250 150 420 60 220-100 296-60v180H${RAIL + 48}z" fill="#12362f" opacity="0.7"/>
    <path d="M${RAIL + 48} 370c150-70 280-40 410 10s260 60 390-20 220-70 296-30v70H${RAIL + 48}z" fill="#0b2624" opacity="0.9"/>
    <ellipse cx="${RAIL + 820}" cy="140" rx="300" ry="220" fill="url(#glow)"/>
    ${R(RAIL + 48, 84, 1096, 336, 24, "url(#panel)", { opacity: 0.18 })}
    <g id="Hero copy">
      ${icon("sparkles", RAIL + 84, 132, 16, C.accent)}
      ${T(RAIL + 108, 146, "AQUA LAUNCHER", { size: 10, weight: 800, fill: C.accent, tracking: 2.2 })}
      ${T(RAIL + 84, 214, "Мир ждёт тебя", { size: 44, weight: 800, tracking: -1.4 })}
      ${T(RAIL + 84, 244, "Сборка «Vanilla 1.21.8» · Minecraft 1.21.8", { size: 13.5, fill: C.dim })}
      <g id="Version selector">
        ${R(RAIL + 84, 272, 286, 58, 16, "rgba(4,18,24,0.62)", { stroke: C.line, strokeOpacity: 0.14 })}
        ${R(RAIL + 98, 286, 30, 30, 9, C.accentSoft)}
        ${icon("layers", RAIL + 105, 293, 16, C.accent)}
        ${T(RAIL + 140, 296, "1.21.8", { size: 14, weight: 800 })}
        ${T(RAIL + 140, 314, "РЕЛИЗ · VANILLA", { size: 9, weight: 700, fill: C.muted, tracking: 0.8 })}
        ${icon("chevron", RAIL + 340, 294, 18, C.muted)}
      </g>
      ${btn(RAIL + 386, 272, 196, 58, "Играть", "primary", "play")}
      ${T(RAIL + 84, 372, "Выбрана: Vanilla 1.21.8  ·  Установлено  ·  Последний запуск: Сегодня", { size: 11, fill: C.dim })}
    </g>
  </g>
  <g id="Widgets section">
    ${T(RAIL + 48, 474, "Панель", { size: 20, weight: 800, tracking: -0.3 })}
    ${T(RAIL + 48, 496, "Виджеты, статистика и сборки", { size: 11.5, fill: C.muted })}
    ${btn(RAIL + 986, 458, 158, 40, "Настроить", "soft", "settings")}
    <g id="Widget overview">
      ${R(RAIL + 48, 524, 352, 320, 20, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
      ${R(RAIL + 68, 544, 32, 32, 10, C.accentSoft)}
      ${icon("clock", RAIL + 76, 552, 16, C.accent)}
      ${T(RAIL + 112, 558, "Обзор", { size: 14, weight: 800 })}
      ${T(RAIL + 112, 575, "Ваше время и железо", { size: 10.5, fill: C.muted })}
      ${statTile(RAIL + 68, 596, 152, 76, "ВРЕМЯ В ИГРЕ", "6 ч 44 мин")}
      ${statTile(RAIL + 228, 596, 152, 76, "ЗАПУСКИ", "42")}
      ${statTile(RAIL + 68, 680, 152, 76, "СЕССИИ", "67")}
      ${statTile(RAIL + 228, 680, 152, 76, "ПОСЛЕДНИЙ ЗАПУСК", "Сегодня")}
      ${T(RAIL + 68, 790, "1.21.8", { size: 10, fill: C.dim })}
      ${T(RAIL + 380, 790, "4 ч 2 мин", { size: 10, fill: C.muted, anchor: "end" })}
      ${R(RAIL + 68, 798, 312, 4, 2, "rgba(255,255,255,0.08)")}
      ${R(RAIL + 68, 798, 210, 4, 2, "url(#accent)")}
      ${T(RAIL + 68, 824, "fabric-loader-0.16.10", { size: 10, fill: C.dim })}
      ${T(RAIL + 380, 824, "1 ч 42 мин", { size: 10, fill: C.muted, anchor: "end" })}
    </g>
    <g id="Widget pc">
      ${R(RAIL + 416, 524, 352, 320, 20, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
      ${R(RAIL + 436, 544, 32, 32, 10, C.accentSoft)}
      ${icon("monitor", RAIL + 444, 552, 16, C.accent)}
      ${T(RAIL + 480, 558, "Этот ПК", { size: 14, weight: 800 })}
      ${T(RAIL + 480, 575, "Характеристики и пресет", { size: 10.5, fill: C.muted })}
      ${icon("refresh", RAIL + 720, 550, 16, C.muted)}
      ${["Процессор|AMD Ryzen 5 5600G", "Видеокарта|NVIDIA RTX 3060", "Память|16 ГБ", "Диск|214 ГБ свободно"].map((row, i) => {
        const [k, v] = row.split("|");
        const y = 610 + i * 38;
        return `${T(RAIL + 436, y, k, { size: 11, fill: C.muted })}${T(RAIL + 748, y, v, { size: 11, weight: 700, anchor: "end" })}${line(RAIL + 436, y + 14, RAIL + 748, y + 14)}`;
      }).join("")}
      ${R(RAIL + 436, 774, 312, 48, 12, "rgba(95,227,161,0.08)", { stroke: C.ok, strokeOpacity: 0.18 })}
      ${icon("sparkles", RAIL + 450, 790, 16, C.ok)}
      ${T(RAIL + 476, 802, "Высокий пресет", { size: 12, weight: 700 })}
    </g>
    <g id="Widget latest">
      ${R(RAIL + 784, 524, 360, 320, 20, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
      ${R(RAIL + 804, 544, 32, 32, 10, C.accentSoft)}
      ${icon("sparkles", RAIL + 812, 552, 16, C.accent)}
      ${T(RAIL + 848, 558, "Свежие версии", { size: 14, weight: 800 })}
      ${T(RAIL + 848, 575, "Что нового в Minecraft", { size: 10.5, fill: C.muted })}
      ${[["1.21.8", "Релиз", "5 дн. назад"], ["1.21.7", "Релиз", "1 мес. назад"], ["26w45a", "Снапшот", "3 дн. назад"]].map((r, i) => {
        const y = 604 + i * 62;
        return `${R(RAIL + 804, y, 320, 52, 12, "rgba(255,255,255,0.04)")}
          ${R(RAIL + 816, y + 10, 32, 32, 9, i === 2 ? "rgba(255,200,107,0.12)" : C.accentSoft)}
          ${icon("layers", RAIL + 824, y + 18, 16, i === 2 ? C.warn : C.accent)}
          ${T(RAIL + 860, y + 23, r[0], { size: 12, weight: 700 })}
          ${T(RAIL + 860, y + 39, r[2], { size: 9.5, fill: C.muted })}
          ${chip(RAIL + 1040, y + 14, r[1], i === 2 ? "warn" : "neutral")}`;
      }).join("")}
    </g>
  </g>
`);

/* --------------------------------------------------------------- library */
const libCards = [
  ["1.21.8", "Релиз", "Последний стабильный релиз", true],
  ["1.21.7", "Релиз", "Предыдущий релиз", false],
  ["1.21.6", "Релиз", "Стабильная версия", false],
  ["1.21.5", "Релиз", "Стабильная версия", false],
  ["26w45a", "Снапшот", "Снимок разработки", false],
  ["1.20.6", "Релиз", "Популярная версия", false],
  ["1.19.4", "Релиз", "Классика модпаков", false],
  ["1.18.2", "Релиз", "Для старых сборок", false],
];
const library = screen("Library", "library", `
  ${head("Мои версии", "Установленные версии Minecraft и загрузчики", btn(RAIL + 1006, 72, 138, 40, "Обновить", "soft", "refresh"))}
  <g id="Toolbar">
    ${R(RAIL + 48, 152, 352, 44, 12, C.field, { stroke: C.line, strokeOpacity: 0.1 })}
    ${icon("search", RAIL + 64, 165, 16, C.muted)}
    ${T(RAIL + 90, 179, "Поиск по версиям", { size: 11.5, fill: C.muted })}
    ${R(RAIL + 418, 152, 344, 44, 12, "rgba(255,255,255,0.04)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${R(RAIL + 422, 156, 104, 36, 9, "rgba(255,255,255,0.09)")}
    ${T(RAIL + 474, 178, "Релизы", { size: 11, weight: 700, anchor: "middle" })}
    ${T(RAIL + 586, 178, "Снапшоты", { size: 11, fill: C.muted, anchor: "middle" })}
    ${T(RAIL + 690, 178, "Старые", { size: 11, fill: C.muted, anchor: "middle" })}
    ${T(RAIL + 762, 178, "Все", { size: 11, fill: C.muted, anchor: "middle" })}
    ${R(RAIL + 940, 152, 204, 44, 12, "rgba(255,255,255,0.04)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${T(RAIL + 958, 178, "Сортировка", { size: 11, fill: C.muted })}
    ${T(RAIL + 1062, 178, "Новые", { size: 11, weight: 700 })}
    ${icon("chevron", RAIL + 1114, 166, 16, C.muted)}
  </g>
  <g id="Version grid">
    ${libCards.map((c, i) => versionCard(RAIL + 48 + (i % 4) * 278, 226 + Math.floor(i / 4) * 238, c[0], c[1], c[2], c[3])).join("")}
  </g>
  ${T(RAIL + 48, 726, "Показано 8 из 24 версий", { size: 11, fill: C.muted })}
  ${btn(RAIL + 962, 700, 182, 40, "Показать ещё", "soft", "download")}
`);

/* -------------------------------------------------------------- discover */
const discover = screen("Discover", "discover", `
  ${head("Моды и сборки", "Поиск: сборки на Modrinth — с зависимостями и проверкой безопасности", btn(RAIL + 1006, 72, 138, 40, "Обновить", "soft", "refresh"))}
  <g id="Tabs">
    ${T(RAIL + 48, 152, "Сборки", { size: 12.5, weight: 800 })}
    ${R(RAIL + 48, 162, 56, 2, 1, C.accent)}
    ${T(RAIL + 140, 152, "Моды", { size: 12.5, weight: 600, fill: C.muted })}
    ${T(RAIL + 204, 152, "Ресурспаки", { size: 12.5, weight: 600, fill: C.muted })}
    ${T(RAIL + 312, 152, "Шейдеры", { size: 12.5, weight: 600, fill: C.muted })}
    ${line(RAIL + 48, 178, RAIL + 1144, 178)}
  </g>
  <g id="Catalog bar">
    ${R(RAIL + 48, 196, 536, 44, 12, C.field, { stroke: C.line, strokeOpacity: 0.1 })}
    ${icon("search", RAIL + 64, 209, 16, C.muted)}
    ${T(RAIL + 90, 223, "Поиск по Modrinth…", { size: 11.5, fill: C.muted })}
    ${R(RAIL + 600, 196, 218, 44, 12, "rgba(255,255,255,0.04)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${T(RAIL + 616, 223, "ПОПУЛЯРНОСТЬ", { size: 9, weight: 700, fill: C.muted, tracking: 0.8 })}
    ${T(RAIL + 708, 223, "По популярности", { size: 11, weight: 700 })}
    ${btn(RAIL + 1030, 196, 114, 44, "Фильтры", "soft", "settings")}
    ${chip(RAIL + 48, 258, "Установить в сборку: Vanilla 1.21.8 ×", "accent")}
    ${T(RAIL + 48, 306, "Проектов: 60", { size: 11, fill: C.muted })}
    ${T(RAIL + 1128, 306, "Modrinth", { size: 10.5, fill: C.muted, anchor: "end" })}
  </g>
  <g id="Results">
    ${projectRow(RAIL + 48, 322, "Fabulously Optimized", "robotkoer", "A simple, performance-focused Fabric modpack.", "24 118 092", "Установить сборку", "Сборка", "teal")}
    ${projectRow(RAIL + 48, 426, "Cobblemon 2", "Cobblemon Team", "Pokémon in Minecraft, built for Fabric.", "18 902 441", "Установить сборку", "Сборка", "blue")}
    ${projectRow(RAIL + 48, 530, "Better MC 3", "Luna Pixel", "A curated adventure and technology pack.", "9 777 012", "Установить сборку", "Сборка", "violet")}
    ${projectRow(RAIL + 48, 634, "RLCraft 4", "Shivaxi", "Hardcore survival with realistic mechanics.", "7 210 004", "Установить сборку", "Сборка", "amber")}
  </g>
  <g id="Pager">
    ${T(RAIL + 48, 776, "Страница 1 из 3", { size: 11, fill: C.muted })}
    ${[1, 2, 3].map((n, i) => `${R(RAIL + 980 + i * 44, 756, 36, 32, 9, i === 0 ? C.accentSoft : "rgba(255,255,255,0.04)")}${T(RAIL + 998 + i * 44, 777, String(n), { size: 11, weight: 700, fill: i === 0 ? C.accent : C.dim, anchor: "middle" })}`).join("")}
  </g>
`);

/* ------------------------------------------------------------- instances */
const instances = screen("Instances", "instances", `
  ${head("Сборки", "Изолированные профили: моды, настройки и миры хранятся отдельно", btn(RAIL + 956, 72, 188, 40, "Новая сборка", "primary", "plus"))}
  <g id="Instance grid">
    ${iconCard(RAIL + 48, 168, 264, 250, "Vanilla 1.21.8", "Minecraft 1.21.8 · vanilla", "3 мода · 4 ч 2 мин", true)}
    ${iconCard(RAIL + 330, 168, 264, 250, "Fabulously Optimized", "1.21.8 · fabric", "48 модов · 12 ч", true)}
    ${iconCard(RAIL + 612, 168, 264, 250, "Better MC 3", "1.21.1 · forge", "312 модов · 6 ч", true)}
    ${iconCard(RAIL + 894, 168, 264, 250, "Cobblemon 2", "1.21.8 · fabric", "27 модов · 2 ч", true)}
    <g id="New instance">
      ${R(RAIL + 48, 438, 264, 250, 18, "rgba(92,232,220,0.03)", { stroke: C.accent, strokeOpacity: 0.25, strokeWidth: 1.5 })}
      <circle cx="${RAIL + 180}" cy="528" r="30" fill="rgba(92,232,220,0.1)"/>
      ${icon("plus", RAIL + 166, 514, 28, C.accent)}
      ${T(RAIL + 180, 590, "Новая сборка", { size: 14, weight: 800, anchor: "middle" })}
      ${T(RAIL + 180, 610, "Соберите свой набор модов", { size: 10.5, fill: C.muted, anchor: "middle" })}
    </g>
  </g>
  <g id="Tips">
    ${R(RAIL + 48, 716, 1110, 112, 18, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${R(RAIL + 68, 736, 36, 36, 11, C.accentSoft)}
    ${icon("shield", RAIL + 78, 746, 18, C.accent)}
    ${T(RAIL + 120, 750, "Каждая сборка изолирована", { size: 13, weight: 700 })}
    ${T(RAIL + 120, 770, "Моды, конфиги и сохранения не пересекаются. Переключайтесь между сборками в один клик — лаунчер сам подберёт загрузчик и Java.", { size: 11, fill: C.muted })}
    ${T(RAIL + 120, 794, "Импорт из CurseForge и Modrinth · Автоматические зависимости · Проверка безопасности модов", { size: 10.5, fill: C.dim })}
  </g>
`);

/* ------------------------------------------------------------------ pack */
const files = [
  ["Sodium", "sodium-0.6.9.jar", "1.2 MB", "ok"],
  ["Iris Shaders", "iris-1.8.1.jar", "2.8 MB", "ok"],
  ["Fabric API", "fabric-api-0.110.0.jar", "2 MB", "ok"],
  ["Faithful 32x", "Faithful-32x.zip", "14.1 MB", "neutral"],
  ["Complementary Reimagined", "Complementary.zip", "4.1 MB", "neutral"],
];
const pack = screen("Pack", "instances", `
  <g id="Back">
    ${R(RAIL + 48, 72, 108, 34, 10, "rgba(255,255,255,0.05)", { stroke: C.line, strokeOpacity: 0.1 })}
    ${T(RAIL + 78, 94, "‹ Назад", { size: 11.5, weight: 700 })}
  </g>
  <g id="Pack hero">
    ${R(RAIL + 48, 122, 1110, 148, 22, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    <ellipse cx="${RAIL + 900}" cy="196" rx="320" ry="140" fill="url(#glow)"/>
    ${R(RAIL + 72, 146, 74, 74, 18, "url(#accentSoft)")}
    ${icon("layers", RAIL + 94, 168, 30, C.accent)}
    ${chip(RAIL + 166, 144, "vanilla", "neutral")}
    ${chip(RAIL + 236, 144, "1.21.8", "neutral")}
    ${T(RAIL + 166, 196, "Vanilla 1.21.8", { size: 25, weight: 800, tracking: -0.6 })}
    ${T(RAIL + 166, 218, "Minecraft 1.21.8 · vanilla · 6 файлов · 4 ч 2 мин", { size: 11, fill: C.muted })}
    ${btn(RAIL + 166, 232, 122, 38, "Играть", "primary", "play")}
    ${btn(RAIL + 300, 232, 176, 38, "Добавить контент", "soft", "plus")}
    ${R(RAIL + 490, 232, 42, 38, 10, "rgba(255,255,255,0.05)", { stroke: C.line, strokeOpacity: 0.1 })}
    ${icon("settings", RAIL + 503, 245, 16, C.dim)}
    ${R(RAIL + 544, 232, 42, 38, 10, "rgba(255,255,255,0.05)", { stroke: C.line, strokeOpacity: 0.1 })}
    ${T(RAIL + 565, 256, "···", { size: 14, fill: C.dim, anchor: "middle" })}
  </g>
  <g id="Pack tabs">
    ${T(RAIL + 56, 314, "Обзор", { size: 12, weight: 800 })}
    ${R(RAIL + 48, 328, 88, 2, 1, C.accent)}
    ${T(RAIL + 170, 314, "Файлы", { size: 12, weight: 600, fill: C.muted })}
    ${T(RAIL + 234, 314, "Миры", { size: 12, weight: 600, fill: C.muted })}
    ${T(RAIL + 294, 314, "Логи", { size: 12, weight: 600, fill: C.muted })}
    ${T(RAIL + 348, 314, "Поделиться", { size: 12, weight: 600, fill: C.muted })}
    ${line(RAIL + 48, 338, RAIL + 1148, 338)}
  </g>
  <g id="Pack stats">
    ${statTile(RAIL + 48, 358, 266, 84, "СТАТУС", "Готов", true)}
    ${statTile(RAIL + 326, 358, 266, 84, "МОДОВ", "3")}
    ${statTile(RAIL + 604, 358, 266, 84, "ПОСЛЕДНИЙ ЗАПУСК", "21 нояб. 2026")}
    ${statTile(RAIL + 882, 358, 276, 84, "ВРЕМЯ В ИГРЕ", "4 ч 2 мин")}
  </g>
  <g id="File controls">
    ${chip(RAIL + 48, 466, "Обзор 6", "accent")}
    ${chip(RAIL + 136, 466, "Моды 3", "neutral")}
    ${chip(RAIL + 224, 466, "Ресурспаки 1", "neutral")}
    ${chip(RAIL + 340, 466, "Шейдеры 1", "neutral")}
    ${chip(RAIL + 438, 466, "Датапаки 1", "neutral")}
    ${R(RAIL + 48, 508, 356, 42, 12, C.field, { stroke: C.line, strokeOpacity: 0.1 })}
    ${icon("search", RAIL + 64, 521, 16, C.muted)}
    ${T(RAIL + 90, 534, "Поиск по содержимому", { size: 11.5, fill: C.muted })}
    ${R(RAIL + 1046, 508, 112, 42, 11, "rgba(255,255,255,0.04)", { stroke: C.line, strokeOpacity: 0.1 })}
    ${T(RAIL + 1102, 534, "Выбрать все", { size: 10.5, fill: C.dim, anchor: "middle" })}
  </g>
  <g id="File list">
    ${files.map((f, i) => {
      const y = 566 + i * 62;
      return `<g id="File ${esc(f[0])}">
        ${R(RAIL + 48, y, 1110, 54, 14, i === 0 ? "rgba(92,232,220,0.055)" : "url(#panel)", { stroke: C.line, strokeOpacity: i === 0 ? 0.16 : 0.07 })}
        <circle cx="${RAIL + 70}" cy="${y + 27}" r="8" fill="none" stroke="${i === 0 ? C.accent : C.muted}" stroke-opacity="0.7"/>
        ${R(RAIL + 90, y + 9, 36, 36, 10, i < 3 ? C.accentSoft : "rgba(255,255,255,0.06)")}
        ${T(RAIL + 108, y + 32, f[0][0], { size: 13, weight: 800, fill: i < 3 ? C.accent : C.dim, anchor: "middle" })}
        ${T(RAIL + 138, y + 24, f[0], { size: 12, weight: 700 })}
        ${T(RAIL + 138, y + 41, f[1], { size: 9.5, fill: C.muted })}
        ${T(RAIL + 1016, y + 32, f[2], { size: 10.5, fill: C.dim, anchor: "end" })}
        ${icon("refresh", RAIL + 1040, y + 18, 16, C.muted)}
        ${icon("check", RAIL + 1074, y + 18, 16, C.muted)}
        ${icon("trash", RAIL + 1108, y + 18, 16, C.muted)}
      </g>`;
    }).join("")}
  </g>
`);

/* ---------------------------------------------------------- achievements */
const achievements = screen("Achievements", "achievements", `
  ${head("Достижения", "Ваши вехи в Minecraft — прогресс сохраняется между сборками")}
  <g id="Progress hero">
    ${R(RAIL + 48, 156, 1110, 190, 22, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    <ellipse cx="${RAIL + 240}" cy="250" rx="180" ry="130" fill="url(#glow)"/>
    <circle cx="${RAIL + 150}" cy="251" r="66" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>
    <circle cx="${RAIL + 150}" cy="251" r="66" fill="none" stroke="url(#accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="79 336" transform="rotate(-90 ${RAIL + 150} 251)"/>
    ${T(RAIL + 150, 248, "19%", { size: 28, weight: 800, anchor: "middle", tracking: -1 })}
    ${T(RAIL + 150, 268, "прогресс", { size: 9, weight: 700, fill: C.muted, anchor: "middle", tracking: 1 })}
    ${T(RAIL + 264, 214, "Первые шаги сделаны", { size: 22, weight: 800, tracking: -0.5 })}
    ${T(RAIL + 264, 240, "3 из 16 достижений открыто. Продолжайте исследовать миры,", { size: 11.5, fill: C.dim })}
    ${T(RAIL + 264, 258, "собирать механизмы и играть с друзьями.", { size: 11.5, fill: C.dim })}
    ${R(RAIL + 264, 278, 232, 38, 10, C.accentSoft)}
    ${T(RAIL + 380, 302, "Посмотреть все достижения", { size: 11, weight: 700, fill: C.accent, anchor: "middle" })}
    ${T(RAIL + 900, 200, "СТАТИСТИКА", { size: 9, weight: 800, fill: C.muted, tracking: 1.4 })}
    ${[["Всего", "16"], ["Открыто", "3"], ["Осталось", "13"]].map((s, i) => `${T(RAIL + 900 + i * 86, 246, s[1], { size: 24, weight: 800 })}${T(RAIL + 900 + i * 86, 266, s[0], { size: 9.5, fill: C.muted })}`).join("")}
    ${T(RAIL + 900, 306, "Серия: 4 дня подряд", { size: 10.5, fill: C.ok })}
  </g>
  <g id="Achievement grid">
    ${[["Первая ночь", "Переживите ночь в новом мире", true], ["Кузнец", "Создайте железный меч", true], ["Исследователь", "Откройте 10 биомов", true], ["Алмазы!", "Найдите алмазы", false], ["Механизмы", "Постройте редстоун-схему", false], ["Покоритель", "Победите дракона", false]].map((a, i) => {
      const x = RAIL + 48 + (i % 3) * 374;
      const y = 380 + Math.floor(i / 3) * 152;
      return `<g id="Achievement ${esc(a[0])}">
        ${R(x, y, 362, 136, 16, "url(#panel)", { stroke: C.line, strokeOpacity: a[2] ? 0.14 : 0.07 })}
        ${R(x + 16, y + 18, 44, 44, 12, a[2] ? C.accentSoft : "rgba(255,255,255,0.05)")}
        ${icon(a[2] ? "check" : "star", x + 28, y + 30, 20, a[2] ? C.accent : C.muted)}
        ${T(x + 76, y + 38, a[0], { size: 13, weight: 800 })}
        ${T(x + 76, y + 57, a[1], { size: 10.5, fill: C.muted })}
        ${T(x + 16, y + 94, a[2] ? "Открыто" : "Скрыто", { size: 9, weight: 800, fill: a[2] ? C.ok : C.muted, tracking: 1 })}
        ${a[2] ? chip(x + 290, y + 16, "100%", "ok") : R(x + 16, y + 104, 330, 5, 2.5, "rgba(255,255,255,0.07)")}
      </g>`;
    }).join("")}
  </g>
`);

/* --------------------------------------------------------------- accounts */
const accounts = screen("Accounts", "accounts", `
  ${head("Аккаунты", "Войдите через Microsoft или добавьте офлайн-профиль")}
  <g id="Account list">
    <g>
      ${R(RAIL + 48, 156, 660, 92, 16, "url(#panel)", { stroke: C.accent, strokeOpacity: 0.32 })}
      <circle cx="${RAIL + 92}" cy="202" r="24" fill="#28454b"/>
      <circle cx="${RAIL + 92}" cy="195" r="7" fill="#8fb9ba"/>
      <path d="M${RAIL + 78} 216a14 14 0 0 1 28 0" fill="#8fb9ba"/>
      ${T(RAIL + 130, 196, "Steve", { size: 14, weight: 800 })}
      ${T(RAIL + 130, 214, "Офлайн-аккаунт · UUID 8a1f…c2", { size: 10.5, fill: C.muted })}
      ${chip(RAIL + 646, 178, "Активен", "ok")}
      ${icon("settings", RAIL + 664, 208, 16, C.muted)}
    </g>
    ${R(RAIL + 48, 260, 660, 92, 16, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    <circle cx="${RAIL + 92}" cy="306" r="24" fill="#1c3540"/>
    ${T(RAIL + 92, 312, "A", { size: 15, weight: 800, fill: C.dim, anchor: "middle" })}
    ${T(RAIL + 130, 300, "Alex", { size: 14, weight: 800 })}
    ${T(RAIL + 130, 318, "Microsoft · Premium", { size: 10.5, fill: C.muted })}
    ${btn(RAIL + 584, 284, 100, 34, "Выбрать", "soft")}
    ${btn(RAIL + 48, 368, 188, 42, "Добавить аккаунт", "soft", "plus")}
  </g>
  <g id="Account side">
    ${R(RAIL + 736, 156, 422, 500, 20, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${icon("shield", RAIL + 764, 180, 22, C.accent)}
    ${T(RAIL + 800, 194, "Вход через Microsoft", { size: 16, weight: 800 })}
    ${T(RAIL + 764, 220, "Официальный аккаунт: скины, друзья и доступ", { size: 10.5, fill: C.muted })}
    ${T(RAIL + 764, 236, "к лицензионным серверам.", { size: 10.5, fill: C.muted })}
    ${btn(RAIL + 764, 254, 366, 46, "Войти через Microsoft", "primary", "external")}
    ${line(RAIL + 764, 322, RAIL + 1130, 322)}
    ${T(RAIL + 764, 356, "Офлайн-профиль", { size: 13, weight: 800 })}
    ${T(RAIL + 764, 376, "Имя видно на серверах без лицензии.", { size: 10.5, fill: C.muted })}
    ${T(RAIL + 764, 408, "ИМЯ ИГРОКА", { size: 9, weight: 800, fill: C.muted, tracking: 1 })}
    ${R(RAIL + 764, 418, 366, 44, 12, C.field, { stroke: C.line, strokeOpacity: 0.1 })}
    ${T(RAIL + 780, 445, "Steve", { size: 12, fill: C.dim })}
    ${btn(RAIL + 764, 478, 150, 42, "Добавить профиль", "soft", "plus")}
    ${R(RAIL + 764, 548, 366, 82, 12, "rgba(92,232,220,0.05)", { stroke: C.accent, strokeOpacity: 0.16 })}
    ${icon("sparkles", RAIL + 780, 566, 16, C.accent)}
    ${T(RAIL + 806, 580, "Скины и плащи", { size: 11.5, weight: 700 })}
    ${T(RAIL + 780, 602, "Загрузите скин или выберите из галереи —", { size: 10, fill: C.muted })}
    ${T(RAIL + 780, 618, "он применится ко всем сборкам.", { size: 10, fill: C.muted })}
  </g>
`);

/* --------------------------------------------------------------- settings */
const themeCard = (x, y, label, bg, active) => `
  <g id="Theme ${esc(label)}">
    ${R(x, y, 158, 88, 12, bg, { stroke: active ? C.accent : C.line, strokeOpacity: active ? 1 : 0.1, strokeWidth: active ? 1.5 : 1 })}
    ${R(x + 14, y + 14, 58, 8, 4, active ? C.accent : "rgba(255,255,255,0.35)")}
    ${R(x + 14, y + 30, 42, 5, 2.5, "rgba(255,255,255,0.18)")}
    ${R(x + 14, y + 58, 32, 16, 5, active ? C.accent : "rgba(255,255,255,0.16)")}
    ${T(x + 79, y + 78, label, { size: 9.5, weight: 700, fill: active ? C.text : C.dim, anchor: "middle" })}
  </g>`;

const settings = screen("Settings", "settings", `
  ${head("Настройки", "Меняется сразу — сохраните, когда закончите")}
  <g id="Settings tabs">
    ${R(RAIL + 48, 156, 208, 366, 18, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${[["Внешний вид", true], ["Раскладка", false], ["Игра", false], ["Производительность", false], ["Java", false], ["Моды", false], ["Дополнительно", false]].map((t, i) => {
      const y = 174 + i * 48;
      return `<g>${t[1] ? R(RAIL + 60, y, 184, 40, 11, C.accentSoft) : ""}${t[1] ? R(RAIL + 60, y + 8, 3, 24, 2, C.accent) : ""}${icon(["sunny", "library", "play", "sparkles", "monitor", "shield", "settings"][i], RAIL + 78, y + 11, 16, t[1] ? C.accent : C.muted)}${T(RAIL + 104, y + 25, t[0], { size: 11.5, weight: t[1] ? 700 : 600, fill: t[1] ? C.text : C.dim })}</g>`;
    }).join("")}
  </g>
  <g id="Settings panel">
    ${R(RAIL + 274, 156, 884, 672, 20, "url(#panel)", { stroke: C.line, strokeOpacity: 0.08 })}
    ${T(RAIL + 302, 192, "Внешний вид", { size: 18, weight: 800, tracking: -0.3 })}
    ${line(RAIL + 302, 214, RAIL + 1130, 214)}
    <g id="Language">
      ${T(RAIL + 302, 248, "Язык", { size: 12, weight: 700 })}
      ${T(RAIL + 302, 266, "Язык интерфейса, даты и числа.", { size: 10, fill: C.muted })}
      ${R(RAIL + 880, 232, 250, 42, 11, C.field, { stroke: C.line, strokeOpacity: 0.1 })}
      ${T(RAIL + 896, 258, "Русский", { size: 12 })}
      ${icon("chevron", RAIL + 1106, 245, 16, C.muted)}
      ${line(RAIL + 302, 292, RAIL + 1130, 292)}
    </g>
    <g id="Theme">
      ${T(RAIL + 302, 324, "Тема", { size: 12, weight: 700 })}
      ${T(RAIL + 302, 342, "Тёмная, светлая или как в системе.", { size: 10, fill: C.muted })}
      ${themeCard(RAIL + 628, 312, "Системная", "#0d202b", false)}
      ${themeCard(RAIL + 796, 312, "Светлая", "#f3f7f8", false)}
      ${themeCard(RAIL + 964, 312, "Тёмная", "#08131b", true)}
      ${line(RAIL + 302, 424, RAIL + 1130, 424)}
    </g>
    <g id="Accent">
      ${T(RAIL + 302, 456, "Акцент", { size: 12, weight: 700 })}
      ${T(RAIL + 302, 474, "Цвет, который связывает интерфейс.", { size: 10, fill: C.muted })}
      ${["#5ce8dc", "#79f2b6", "#71b7ff", "#b79bff", "#ff9db5", "#ffd27a", "#c8f57b", "#bfe9ff", "#ff8a9a", "#8fd6ff", "#ffe0a3", "#d8a5ff"].map((c, i) => `<circle cx="${RAIL + 650 + i * 31}" cy="470" r="11" fill="${c}"/>${i === 0 ? `<circle cx="${RAIL + 650}" cy="470" r="15" fill="none" stroke="${C.accent}" stroke-width="1.5"/>` : ""}`).join("")}
      ${T(RAIL + 1044, 474, "#5ce8dc", { size: 10, fill: C.muted })}
      ${line(RAIL + 302, 506, RAIL + 1130, 506)}
    </g>
    <g id="Radius density">
      ${T(RAIL + 302, 538, "Скругления", { size: 12, weight: 700 })}
      ${R(RAIL + 820, 518, 310, 38, 10, "rgba(255,255,255,0.04)", { stroke: C.line, strokeOpacity: 0.08 })}
      ${R(RAIL + 824, 522, 98, 30, 8, "rgba(255,255,255,0.09)")}
      ${T(RAIL + 873, 541, "Острые", { size: 10, fill: C.muted, anchor: "middle" })}
      ${T(RAIL + 970, 541, "Мягкие", { size: 10, weight: 700, anchor: "middle" })}
      ${T(RAIL + 1066, 541, "Круглые", { size: 10, fill: C.muted, anchor: "middle" })}
      ${T(RAIL + 302, 578, "Плотность", { size: 12, weight: 700 })}
      ${R(RAIL + 820, 558, 310, 38, 10, "rgba(255,255,255,0.04)", { stroke: C.line, strokeOpacity: 0.08 })}
      ${R(RAIL + 928, 562, 94, 30, 8, "rgba(255,255,255,0.09)")}
      ${T(RAIL + 873, 581, "Компактно", { size: 10, fill: C.muted, anchor: "middle" })}
      ${T(RAIL + 975, 581, "Обычно", { size: 10, weight: 700, anchor: "middle" })}
      ${T(RAIL + 1070, 581, "Просторно", { size: 10, fill: C.muted, anchor: "middle" })}
      ${line(RAIL + 302, 612, RAIL + 1130, 612)}
    </g>
    <g id="Scale and presets">
      ${T(RAIL + 302, 644, "Масштаб интерфейса", { size: 12, weight: 700 })}
      ${T(RAIL + 302, 662, "100%", { size: 10, fill: C.muted })}
      ${R(RAIL + 628, 654, 502, 4, 2, "rgba(255,255,255,0.10)")}
      ${R(RAIL + 628, 654, 220, 4, 2, "url(#accent)")}
      <circle cx="${RAIL + 848}" cy="656" r="7" fill="${C.accent}" stroke="#06201f" stroke-width="2"/>
      ${T(RAIL + 302, 700, "Готовые темы", { size: 12, weight: 700 })}
      ${["Океан", "Аврора", "Небула", "Закат"].map((n, i) => `<g>${R(RAIL + 628 + i * 128, 718, 116, 72, 12, ["#0a2328", "#0b2a22", "#1c1636", "#2c1a1a"][i], { stroke: i === 0 ? C.accent : C.line, strokeOpacity: i === 0 ? 1 : 0.1 })}${R(RAIL + 640 + i * 128, 730, 36, 16, 5, ["#5ce8dc", "#79f2b6", "#b79bff", "#ffd27a"][i], { opacity: 0.85 })}${T(RAIL + 640 + i * 128, 772, n, { size: 10, weight: 700, fill: i === 0 ? C.text : C.dim })}</g>`).join("")}
    </g>
  </g>
`);

const screens = { home, library, discover, instances, pack, achievements, accounts, settings };
for (const [name, svg] of Object.entries(screens)) {
  writeFileSync(join(out, `${name}.svg`), svg, "utf8");
  process.stdout.write(join(out, `${name}.svg`) + "\n");
}

/* ------------------------------------------------ one-file Figma master */
// A single SVG holding every screen side by side. Figma imports it as one
// frame whose groups/text stay editable, which is easier to hand off than
// eight separate files.
const frameInner = (svg) =>
  svg
    .replace(/^<\?xml[^>]*>\s*/, "")
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<defs>[\s\S]*?<\/defs>/, "");

const sharedStyle = home.match(/<style>[\s\S]*?<\/style>/)?.[0] || "";
const sharedDefs = home.match(/<defs>[\s\S]*?<\/defs>/)?.[0] || "";

const MASTER_LABELS = {
  home: "Главная",
  library: "Версии",
  discover: "Каталог",
  instances: "Сборки",
  pack: "Сборка",
  achievements: "Достижения",
  accounts: "Аккаунты",
  settings: "Настройки",
};
const MASTER_ORDER = ["home", "library", "discover", "instances", "pack", "achievements", "accounts", "settings"];
const COLS = 2;
const GAP = 80;
const PAD = 80;
const LABEL = 58;
const ROWS = Math.ceil(MASTER_ORDER.length / COLS);
const MASTER_W = PAD * 2 + COLS * W + (COLS - 1) * GAP;
const MASTER_H = PAD * 2 + ROWS * (LABEL + H) + (ROWS - 1) * GAP;

const masterFrames = MASTER_ORDER.map((name, index) => {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = PAD + col * (W + GAP);
  const y = PAD + row * (LABEL + H + GAP);
  const inner = frameInner(screens[name]).replace(/ id="([^"]+)"/g, (_, id) => ` id="${name} · ${id}"`);
  return `<g id="Screen · ${MASTER_LABELS[name]}" transform="translate(${x} ${y})">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#030a10"/>
    ${inner}
  </g>
  ${T(x, y - 20, MASTER_LABELS[name], { size: 22, weight: 800, fill: "#e9f5f8", tracking: -0.3 })}
  ${T(x + 2, y - 4, "Aqua Launcher · 1440 × 900", { size: 11, weight: 600, fill: "#7d97a4" })}`;
}).join("\n  ");

const master = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_W}" height="${MASTER_H}" viewBox="0 0 ${MASTER_W} ${MASTER_H}" fill="none">
  <title>Aqua Launcher — Figma design</title>
  ${sharedStyle}
  ${sharedDefs}
  <rect x="0" y="0" width="${MASTER_W}" height="${MASTER_H}" fill="#030a10"/>
  ${masterFrames}
</svg>
`;
writeFileSync(join(here, "Aqua-Launcher.fig.svg"), master, "utf8");
process.stdout.write(join(here, "Aqua-Launcher.fig.svg") + "\n");
