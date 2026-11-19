import { i18n } from "./i18n.js";

if (!window.__TAURI__) await import("./demo.js");

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const openUrl = (url) => window.__TAURI__.opener.openUrl(url);
const t = (key, vars) => i18n.t(key, vars);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const APP_VERSION = "0.0.6-beta";
const APP_LABEL = "0.0.6 Beta";
const NAV_DEFAULT = ["home", "library", "instances", "discover", "accounts"];
const WIDGET_DEFAULT = ["stats", "pc", "latest", "instances", "console"];
const LINKS = {
  github: "https://github.com/227375488489/aqua-launcher",
  modrinth: "https://modrinth.com",
};
const ACCENT_NAMES = ["aqua", "mint", "azure", "violet", "rose", "amber", "lime", "ice", "crimson", "sky", "sand", "plum", "custom"];
const THEMES = [
  { id: "ocean", bg: "ocean", accent: "aqua", light: false },
  { id: "aurora", bg: "aurora", accent: "mint", light: false },
  { id: "nebula", bg: "nebula", accent: "violet", light: false },
  { id: "sunset", bg: "sunset", accent: "amber", light: false },
  { id: "sakura", bg: "sakura", accent: "rose", light: false },
  { id: "forest", bg: "forest", accent: "lime", light: false },
  { id: "cyber", bg: "cyber", accent: "sky", light: false },
  { id: "ember", bg: "ember", accent: "crimson", light: false },
  { id: "candy", bg: "candy", accent: "plum", light: false },
  { id: "ice", bg: "ice", accent: "ice", light: false },
  { id: "midnight", bg: "midnight", accent: "azure", light: false },
  { id: "daylight", bg: "plain", accent: "sand", light: true },
];

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function rgbHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.min(1, Math.max(0, s)); l = Math.min(1, Math.max(0, l));
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const v = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${v(f(0))}${v(f(8))}${v(f(4))}`;
}
const ACCENT_HEX = {
  aqua: "#5be9dc", mint: "#79f2b6", azure: "#71b7ff", violet: "#b79bff",
  rose: "#ff9db5", amber: "#ffd27a", lime: "#c8f57b", ice: "#bfe9ff",
  crimson: "#ff8a9a", sky: "#8fd6ff", sand: "#ffe0a3", plum: "#d8a5ff",
};
function accentVars(hex) {
  const rgb = hexRgb(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbHsl(rgb);
  const ink = l > 0.58 ? "#04161d" : "#eefbff";
  return {
    accent: `#${rgb.map((x) => x.toString(16).padStart(2, "0")).join("")}`,
    accent2: hslHex(h + 16, Math.min(1, s + 0.06), Math.min(0.78, l + 0.07)),
    soft: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.15)`,
    ink,
  };
}

/* Recolor the taskbar icon to the current accent (hue-rotate the source mark). */
let iconSource = null;
function syncWindowIcon(deg) {
  try {
    if (!iconSource) {
      iconSource = new Image();
      iconSource.src = "assets/logo.png";
    }
    const paint = () => {
      try {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.filter = `hue-rotate(${Math.round(Number(deg) || 0)}deg)`;
        ctx.drawImage(iconSource, 0, 0, size, size);
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = canvas.toDataURL("image/png");
        const data = ctx.getImageData(0, 0, size, size).data;
        invoke("set_window_icon", { rgba: Array.from(data), width: size, height: size }).catch(() => {});
      } catch {}
    };
    if (iconSource.complete && iconSource.naturalWidth) paint();
    else iconSource.addEventListener("load", paint, { once: true });
  } catch {}
}

const S = {
  boot: null,
  settings: {},
  accounts: [],
  active: null,
  local: [],
  remote: [],
  banners: [],
  profiles: [],
  stats: { playtimeSecs: {}, launches: 0, sessions: 0, lastPlayed: 0 },
  platform: "windows",
  system: null,
  mods: [],
  modHealth: null,
  selected: null,
  page: "home",
  libFilter: "release",
  libQuery: "",
  libSort: "new",
  libShown: 36,
  discoverKind: "modpack",
  discoverQuery: "",
  discoverProvider: "modrinth",
  discoverProfile: "",
  discoverVersion: "",
  discoverLoader: "fabric",
  discoverResults: [],
  discoverBusy: false,
  discoverCat: "all",
  discoverPage: 1,
  discoverPer: 20,
  discoverSort: "featured",
  discoverTotal: null,
  discoverHasMore: false,
  modsQuery: "",
  savedSettings: null,
  running: null,
  launching: false,
  installing: new Set(),
  dirty: false,
  msFlow: null,
  log: [],
  uiNav: NAV_DEFAULT.map((id) => ({ id, on: true })),
  uiLayout: WIDGET_DEFAULT.map((id) => ({ id, on: true })),
  uiText: {},
  edit: false,
  editChanged: false,
  versionQuery: "",
  icons: new Map(),
  loadToken: 0,
};

/* ------------------------------------------------------------------ utils */

function localOf(id) {
  return S.local.find((v) => v.id === id);
}
function isInstalled(id) {
  return Boolean(localOf(id));
}
function accountById(id) {
  return S.accounts.find((a) => a.id === id);
}
function activeAccount() {
  return accountById(S.active) || null;
}
function profileById(id) {
  return S.profiles.find((p) => p.id === id);
}
function activeProfile() {
  return profileById(S.boot?.activeProfile) || null;
}
function baseOf(id) {
  const found = String(id ?? "").match(/\d+\.\d+(?:\.\d+)?/g);
  return found ? found[found.length - 1] : String(id ?? "");
}
function loaderOf(id) {
  const v = localOf(id);
  if (v?.loader) return v.loader;
  const s = String(id).toLowerCase();
  if (s.includes("fabric")) return "fabric";
  if (s.includes("quilt")) return "quilt";
  if (s.includes("neoforge")) return "neoforge";
  if (s.includes("forge")) return "forge";
  return "vanilla";
}
function loaderLabel(id) {
  const l = loaderOf(id);
  return l === "vanilla" ? "Vanilla" : l[0].toUpperCase() + l.slice(1);
}
function kindLabel(kind) {
  const k = String(kind || "release");
  if (k === "snapshot" || k === "old_snapshot") return t("library.snapshot");
  if (k.startsWith("old")) return t("library.old");
  return t("library.release");
}
function bannerFor(id) {
  const base = baseOf(id);
  return S.banners.find((b) => b.version === base) || S.banners.find((b) => b.version === id) || null;
}
function bannerForRelease(id) {
  return S.banners.find((b) => b.version === id) || null;
}
function relativeDay(secs) {
  if (!secs) return t("time.never");
  const d = new Date(secs * 1000);
  const now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff <= 0) return t("time.today");
  if (diff === 1) return t("time.yesterday");
  return i18n.date(d);
}
function duration(secs) {
  const value = Math.max(0, Math.round(secs || 0));
  const h = Math.floor(value / 3600);
  const m = Math.round((value % 3600) / 60);
  if (h > 0) return `${i18n.number(h)} ${t("unit.h")} ${m > 0 ? `${i18n.number(m)} ${t("unit.m")}` : ""}`.trim();
  return `${i18n.number(m)} ${t("unit.m")}`;
}
function totalPlaytime() {
  return Object.values(S.stats.playtimeSecs || {}).reduce((a, b) => a + Number(b || 0), 0);
}
function versionDate(id) {
  const remote = S.remote.find((v) => v.id === id);
  const local = localOf(id);
  const iso = remote?.releaseTime || local?.releaseTime || null;
  return iso ? i18n.date(iso) : "—";
}
function sortVersions(list, mode) {
  const copy = [...list];
  if (mode === "name") return copy.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const time = (v) => new Date(v.releaseTime || 0).getTime();
  copy.sort((a, b) => time(b) - time(a));
  return mode === "old" ? copy.reverse() : copy;
}
function plural(n, one, many) {
  return `${i18n.number(n)} ${n === 1 ? one : many}`;
}
function isMsAccount(account) {
  return Boolean(account) && (account.kind === "ms" || account.kind === "microsoft");
}
function avatarFor(account) {
  if (!account) return fallbackAvatar("?");
  const key = isMsAccount(account) ? account.id : account.name;
  return `https://mc-heads.net/avatar/${encodeURIComponent(key)}/64`;
}
function fallbackAvatar(seed) {
  const letter = String(seed || "?").trim().charAt(0).toUpperCase() || "?";
  const hue = [...String(seed || "aqua")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue},60%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 48) % 360},55%,28%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="42" font-family="Manrope,Arial" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function artFor(seed) {
  const hue = [...String(seed || "aqua")].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360},60%,24%)"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="30" cy="28" r="26" fill="#ffffff" fill-opacity=".1"/><circle cx="76" cy="72" r="34" fill="#ffffff" fill-opacity=".06"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function versionArt(id) {
  const seed = String(id || "minecraft");
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const hue = hash;
  const blocks = Array.from({ length: 26 }, (_, i) => {
    const x = ((i * 53 + seed.length * 7) % 92) / 100 * 640;
    const y = ((i * 37 + 11) % 80) / 100 * 320;
    const size = 26 + (i % 5) * 18;
    const o = 0.05 + ((i * 13) % 7) / 70;
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${size}" height="${size}" rx="4" fill="#d9fbff" opacity="${o.toFixed(2)}"/>`;
  }).join("");
  const safe = seed.replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="hsl(${hue},52%,25%)"/><stop offset=".55" stop-color="hsl(${(hue + 26) % 360},48%,15%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},40%,9%)"/>
      </linearGradient>
      <radialGradient id="glow" cx="78%" cy="8%" r="70%">
        <stop stop-color="hsl(${(hue + 30) % 360},80%,60%)" stop-opacity=".45"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360},80%,60%)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="640" height="320" fill="url(#bg)"/>
    ${blocks}
    <rect width="640" height="320" fill="url(#glow)"/>
    <text x="34" y="252" font-family="Manrope,Segoe UI,Arial,sans-serif" font-size="96" font-weight="800" letter-spacing="-4" fill="#effdff" opacity=".94">${safe}</text>
    <text x="37" y="286" font-family="Manrope,Segoe UI,Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="6" fill="#bfe6ee" opacity=".72">MINECRAFT</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function fileUrl(path) {
  try {
    return window.__TAURI__.core.convertFileSrc(path);
  } catch {
    return path;
  }
}
function applyImgFallback(root, selector, fn) {
  $$(selector, root).forEach((img) => {
    img.addEventListener("error", () => {
      img.src = fn(img.dataset.seed || "aqua");
      img.classList.add("is-fallback");
    }, { once: true });
  });
}

function toast(message, kind = "ok") {
  if (!message) return;
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.innerHTML = `<svg class="ico"><use href="#${kind === "err" ? "i-alert" : "i-check"}"></use></svg><span>${esc(message)}</span>`;
  $("#toasts").append(node);
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 240);
  }, kind === "err" ? 6200 : 3400);
}

function setStatus(text, mode = "ready") {
  const chip = $("#status");
  if (!chip) return;
  chip.dataset.mode = mode;
  const label = $("#status-text");
  if (label) label.textContent = text;
}

function friendly(err) {
  const raw = typeof err === "string" ? err : err?.message || String(err ?? "");
  if (!raw) return t("errors.generic");
  const code = raw.split("|")[0];
  const [head, tail] = code.split(/:(.+)/);
  if (head === "java_missing") return t("errors.javaMissing", { version: tail || "" });
  if (raw === "version_not_installed") return t("errors.notInstalled");
  if (raw === "profile_not_found") return t("errors.profileMissing");
  if (raw === "profile_name_empty") return t("errors.badName");
  if (raw === "import_unknown") return t("errors.importUnknown");
  if (raw === "import_path_invalid") return t("errors.importPath");
  if (head === "modpack_loader_unsupported") return t("errors.packLoader", { loader: tail || "" });
  if (head === "fabric_no_loader") return t("errors.fabricMissing", { version: tail || "" });
  if (/Строгий режим/i.test(raw)) return t("errors.strict");
  if (/Modrinth|Modrinth недоступен|Modrinth вернул/i.test(raw)) return t("errors.modrinth");
  if (/сети|соедин|timeout|dns|connect/i.test(raw)) return t("errors.network");
  if (/Java/i.test(raw) && /не найден|not found/i.test(raw)) return t("errors.javaMissing", { version: "" });
  return raw;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast(t("toast.copied"));
  } catch {
    toast(t("toast.copyFailed"), "err");
  }
}

/* ------------------------------------------------------------------ appearance */

function resolveTheme(theme) {
  if (theme === "system") {
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme === "light" ? "light" : "dark";
}

function applyAppearance(s) {
  const root = document.documentElement;
  const theme = resolveTheme(s.uiTheme || "dark");
  const accentHex = s.uiAccent === "custom"
    ? (s.uiAccentCustom || "#5ce8dc")
    : (ACCENT_HEX[s.uiAccent] || ACCENT_HEX.aqua);
  const rgb = hexRgb(accentHex);
  let custom = s.uiAccent === "custom" ? accentVars(accentHex) : null;
  if (theme === "light" && rgb) {
    const [h, sat, l] = rgbHsl(rgb);
    const deep = Math.min(l, 0.27);
    const soft = hslHex(h, Math.max(0.38, Math.min(0.82, sat + 0.08)), deep + 0.1);
    custom = {
      accent: hslHex(h, Math.max(0.4, Math.min(0.9, sat)), deep),
      accent2: hslHex(h + 14, Math.max(0.4, Math.min(0.9, sat)), Math.min(0.34, deep + 0.07)),
      soft: `rgba(${hexRgb(soft).join(",")},.13)`,
      ink: "#ffffff",
    };
  }
  if (custom) {
    root.style.setProperty("--accent", custom.accent);
    root.style.setProperty("--accent-2", custom.accent2);
    root.style.setProperty("--accent-soft", custom.soft);
    root.style.setProperty("--accent-ink", custom.ink);
    root.dataset.accent = s.uiAccent === "custom" ? "custom" : (ACCENT_NAMES.includes(s.uiAccent) ? s.uiAccent : "aqua");
  } else {
    ["--accent", "--accent-2", "--accent-soft", "--accent-ink"].forEach((key) => root.style.removeProperty(key));
    root.dataset.accent = ACCENT_NAMES.includes(s.uiAccent) && s.uiAccent !== "custom" ? s.uiAccent : "aqua";
  }
  if (rgb) {
    root.style.setProperty("--logo-rotate", `${rgbHsl(rgb)[0] - 186}deg`);
    syncWindowIcon(rgbHsl(rgb)[0] - 186);
  }
  root.dataset.theme = s.uiTheme === "oled" ? "oled" : theme;
  const themeBtn = $("#theme-btn");
  if (themeBtn) {
    const light = theme === "light";
    themeBtn.querySelector("use")?.setAttribute("href", light ? "#i-moon" : "#i-sun");
    themeBtn.title = t(light ? "theme.toDark" : "theme.toLight");
    themeBtn.setAttribute("aria-label", themeBtn.title);
  }
  root.dataset.radius = s.uiRadius || "soft";
  root.dataset.density = s.uiDensity || "normal";
  root.dataset.font = s.uiFont === "system" ? "system" : "manrope";
  root.dataset.side = s.uiSidebar === "right" ? "right" : "left";
  root.dataset.rail = s.uiSidebarMode === "icons" ? "icons" : "full";
  root.dataset.motion = s.uiMotion === false ? "off" : "on";
  root.dataset.bg = s.uiBackground || "ocean";
  root.style.setProperty("--bg-custom", s.uiBgCustom || "#071420");
  root.dataset.grain = s.uiGrain === false ? "off" : "on";
  root.dataset.playpos = s.uiPlayPosition || "left";
  root.dataset.platform = S.platform || "windows";
  root.style.setProperty("--zoom", String((Number(s.uiScale) || 100) / 100));
  root.style.setProperty("--glass", String((Number(s.uiGlass) || 62) / 100));
  const backdrop = $(".backdrop");
  backdrop.dataset.wall = s.uiWallpaper || "deep";
  if (s.uiWallpaperPath) {
    backdrop.style.setProperty("--wall-image", `url("${fileUrl(s.uiWallpaperPath)}")`);
    backdrop.style.setProperty("--wall-blur", `${Number(s.uiWallpaperBlur) || 0}px`);
    backdrop.style.setProperty("--wall-dim", String((Number(s.uiWallpaperDim) || 45) / 100));
    backdrop.classList.add("has-wall");
  } else {
    backdrop.classList.remove("has-wall");
    backdrop.style.removeProperty("--wall-image");
  }
  $("#wall-path").textContent = s.uiWallpaperPath ? s.uiWallpaperPath.split(/[\\/]/).pop() : t("set.none");
  const preview = $("#wall-preview");
  if (preview) {
    preview.hidden = !s.uiWallpaperPath;
    $("#wall-clear").hidden = !s.uiWallpaperPath;
    if (s.uiWallpaperPath) $("#wall-preview-img").src = fileUrl(s.uiWallpaperPath);
  }
}

/* ------------------------------------------------------------------ boot / render */

function applyBoot(boot, resetSelected = false) {
  if (!boot) return;
  S.boot = boot;
  S.settings = boot.settings || S.settings;
  S.savedSettings = JSON.parse(JSON.stringify(S.settings || {}));
  S.accounts = boot.accounts || [];
  S.active = boot.active || null;
  S.local = boot.local || [];
  S.remote = boot.remote || S.remote;
  S.profiles = boot.profiles || [];
  S.stats = boot.stats || S.stats;
  S.platform = boot.platform || S.platform;
  S.running = boot.running || null;
  S.uiNav = parseLayout(S.settings.uiNav, NAV_DEFAULT);
  S.uiLayout = parseLayout(S.settings.uiLayout, WIDGET_DEFAULT);
  if (boot.connected === false) setStatus(t("status.offline"), "error");
  const installedIds = new Set(S.local.map((v) => v.id));
  if (resetSelected || !S.selected || (!installedIds.has(S.selected) && !S.remote.some((v) => v.id === S.selected))) {
    const profile = activeProfile();
    S.selected = profile?.versionId || boot.lastVersion || S.local[0]?.id || S.remote.find((v) => v.kind === "release")?.id || null;
  }
  const lang = S.settings.language || "auto";
  i18n.init(lang);
  i18n.apply(document);
  applyTexts();
  $("#app-version")?.remove();
  $("#rail-version").textContent = APP_LABEL;
  $("#rail-platform").textContent = platformLabel(S.platform);
  $("#version-chip").textContent = `v${APP_LABEL}`;
  $("#about-version").textContent = APP_LABEL;
  $("#game-dir").textContent = boot.gameDir || "—";
  applyAppearance(S.settings);
  renderAccountChip();
  buildRail();
  fillSettings();
  renderAll();
  syncPlay();
}

function platformLabel(platform) {
  return platform === "macos" ? "macOS" : platform === "linux" ? "Linux" : "Windows";
}

function parseLayout(raw, defaults) {
  if (!raw) return defaults.map((id) => ({ id, on: true }));
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("layout");
    const items = parsed
      .map((x) => (typeof x === "string" ? { id: x, on: true } : { id: x?.id, on: x?.on !== false }))
      .filter((x) => x.id);
    defaults.forEach((id) => { if (!items.some((x) => x.id === id)) items.push({ id, on: false }); });
    return items;
  } catch {
    return defaults.map((id) => ({ id, on: true }));
  }
}

async function refreshBoot(resetSelected = false) {
  try {
    const boot = await invoke("bootstrap");
    applyBoot(boot, resetSelected);
    return boot;
  } catch (err) {
    toast(friendly(err), "err");
    return null;
  }
}

function renderAll() {
  renderHero();
  renderWidgets();
  renderLibrary();
  renderInstances();
  renderAccounts();
  renderMods();
  renderSystem();
  renderAccountChip();
  syncPlay();
}

function renderAccountChip() {
  const account = activeAccount();
  const img = $("#account-avatar");
  img.src = avatarFor(account);
  img.addEventListener("error", () => { img.src = fallbackAvatar(account?.name || "?"); }, { once: true });
  $("#account-name").textContent = account?.name || t("accounts.empty");
  $("#account-kind").textContent = !account
    ? t("accounts.addOffline")
    : isMsAccount(account) ? t("accounts.msKind") : t("accounts.offlineKind");
}

function buildRail() {
  const nav = $("#rail-nav");
  const order = S.uiNav.filter((x) => x.on).map((x) => x.id);
  const meta = {
    home: { icon: "i-home", label: t("nav.home") },
    library: { icon: "i-library", label: t("nav.library") },
    discover: { icon: "i-compass", label: t("nav.discover") },
    instances: { icon: "i-layers", label: t("nav.instances") },
    accounts: { icon: "i-user", label: t("nav.accounts") },
  };
  const groups = [
    { id: "play", label: t("nav.group.play"), items: ["home", "library", "instances"] },
    { id: "explore", label: t("nav.group.explore"), items: ["discover", "accounts"] },
  ];
  nav.innerHTML = groups.map((group) => {
    const items = order.filter((id) => group.items.includes(id) && meta[id]);
    if (!items.length) return "";
    return `<div class="rail-group" data-group="${group.id}">
      <span class="rail-label">${esc(group.label)}</span>
      ${items.map((id) => `<button class="nav-item ${S.page === id ? "is-on" : ""}" data-nav="${id}">
        <svg class="ico"><use href="#${meta[id].icon}"></use></svg>
        <span>${esc(meta[id].label)}</span>
        ${id === "instances" && S.profiles.length ? `<span class="nav-count">${S.profiles.length}</span>` : ""}
      </button>`).join("")}
    </div>`;
  }).join("");
  $("#nav-settings").classList.toggle("is-on", S.page === "settings");
}

function renderHero() {
  const id = S.selected;
  const local = localOf(id);
  const banner = id ? bannerFor(id) : null;
  const img = $("#hero-img");
  const media = $(".hero-media");
  if (banner?.image) {
    img.src = banner.image;
    img.style.display = "";
    media.style.background = "";
  } else {
    img.src = id ? versionArt(id) : "";
    img.style.display = id ? "" : "none";
    media.style.background = "";
  }
  const profile = S.profiles.find((p) => p.versionId === id) || null;
  $("#version-current").textContent = id || t("common.none");
  $("#version-current-kind").textContent = id ? `${kindLabel(local?.kind || "release")} · ${loaderLabel(id)}` : t("hero.select");
  const size = local?.size ? i18n.bytes(local.size) : null;
  const last = S.stats.lastPlayed ? relativeDay(S.stats.lastPlayed) : t("stats.never");
  $("#hero-meta").innerHTML = id
    ? [
        profile ? `<span>${esc(t("instances.active"))}: <b>${esc(profile.name)}</b></span>` : "",
        local ? `<span><b>${esc(t("common.installed"))}</b></span>` : `<span>${esc(t("hero.notInstalled"))}</span>`,
        size ? `<span><b>${esc(size)}</b></span>` : "",
        `<span>${esc(t("stats.last"))}: <b>${esc(last)}</b></span>`,
      ].filter(Boolean).join('<i class="dot"></i>')
    : "";
  $("#hero-stats").innerHTML = [
    [duration(totalPlaytime()), t("stats.playtime")],
    [i18n.number(S.stats.launches || 0), t("stats.launches")],
    [i18n.number(S.stats.sessions || 0), t("stats.sessions")],
    [last, t("stats.last")],
  ].map(([value, label]) => `<div class="hs"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join("");
  const hasFabric = id ? S.local.some((v) => /fabric/i.test(v.id) && baseOf(v.id) === baseOf(id)) : false;
  $("#fabric-btn").hidden = hasFabric || !id;
  renderVersionMenu();
  syncPlay();
}

function visibleBySettings(v) {
  const kind = String(v.kind || "");
  if (kind !== "release" && S.settings.allowExperimental !== true) return false;
  if (kind === "snapshot" && S.settings.showSnapshots === false) return false;
  if (kind.startsWith("old") && S.settings.showOld === false) return false;
  return true;
}
function renderVersionMenu() {
  const menu = $("#version-menu");
  if (!menu) return;
  menu.innerHTML = `<label class="menu-search">
      <svg class="ico"><use href="#i-search"></use></svg>
      <input id="version-search" type="search" placeholder="${esc(t("library.search"))}" autocomplete="off" spellcheck="false">
      <kbd>esc</kbd>
    </label>
    <div class="menu-list" id="version-list"></div>`;
  const input = $("#version-search");
  input.value = S.versionQuery || "";
  input.addEventListener("input", () => {
    S.versionQuery = input.value;
    renderVersionList();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const first = $("#version-list [data-pick]");
      if (first) first.click();
    }
  });
  renderVersionList();
}

function renderVersionList() {
  const host = $("#version-list");
  if (!host) return;
  const q = String(S.versionQuery || "").trim().toLowerCase();
  const known = new Map();
  [...S.remote, ...S.local].forEach((v) => {
    if (visibleBySettings(v) || isInstalled(v.id)) known.set(v.id, v);
  });
  S.profiles.forEach((p) => {
    if (!known.has(p.versionId)) known.set(p.versionId, { id: p.versionId, kind: "release", releaseTime: "" });
  });
  const versions = sortVersions([...known.values()], "new");
  const mark = (text) => {
    const raw = String(text ?? "");
    const at = q ? raw.toLowerCase().indexOf(q) : -1;
    if (at < 0) return esc(raw);
    return `${esc(raw.slice(0, at))}<mark>${esc(raw.slice(at, at + q.length))}</mark>${esc(raw.slice(at + q.length))}`;
  };
  const item = (id, kind, sub, loader, profile, child = false) => {
    const current = profile ? S.boot?.activeProfile === profile.id : S.selected === id;
    const packSub = profile ? `${id} · ${profile.loader || "vanilla"}${profile.loaderVersion ? ` ${profile.loaderVersion}` : ""}` : sub;
    return `<button class="menu-item ${current ? "is-on" : ""} ${child ? "is-child" : ""}" data-pick="${esc(id)}" ${profile ? `data-profile-pick="${esc(profile.id)}"` : ""}>
    <span class="mi-main"><b>${mark(profile ? profile.name : id)}</b><small>${esc(packSub)}</small></span>
    ${profile ? `<span class="chip ${S.boot?.activeProfile === profile.id ? "chip-soft" : ""}">${esc(S.boot?.activeProfile === profile.id ? t("common.active") : t("common.installed"))}</span>` : loader ? `<span class="chip">${esc(loader)}</span>` : ""}
    ${current ? `<svg class="ico" style="width:14px;height:14px;color:var(--accent)"><use href="#i-check"></use></svg>` : ""}
  </button>`;
  };
  const hit = (v) => !q || `${v.id} ${v.kind || ""}`.toLowerCase().includes(q);
  const groups = new Map();
  for (const v of versions) {
    const base = baseOf(v.id) || v.id;
    if (!groups.has(base)) groups.set(base, { base: null, children: [] });
    const group = groups.get(base);
    if (v.id === base) group.base = v;
    else group.children.push(v);
  }
  const parts = [];
  for (const [baseId, group] of groups) {
    const rows = [];
    const baseVersion = group.base || { id: baseId, kind: "release" };
    const baseHit = hit(baseVersion);
    if (group.base && baseHit) {
      rows.push(item(baseVersion.id, baseVersion.kind, isInstalled(baseVersion.id) ? `${kindLabel(baseVersion.kind)} · ${t("common.installed")}` : kindLabel(baseVersion.kind), loaderLabel(baseVersion.id)));
    }
    for (const child of group.children) {
      if (!baseHit && !hit(child)) continue;
      rows.push(item(child.id, child.kind, isInstalled(child.id) ? `${kindLabel(child.kind)} · ${t("common.installed")}` : kindLabel(child.kind), loaderLabel(child.id), null, true));
    }
    const versionIds = [baseId, ...group.children.map((c) => c.id)];
    for (const p of S.profiles.filter((profile) => versionIds.includes(profile.versionId))) {
      if (!baseHit && !`${p.name} ${p.versionId} ${p.loader || ""}`.toLowerCase().includes(q)) continue;
      rows.push(item(p.versionId, "release", p.loader || "vanilla", "", p));
    }
    if (rows.length) parts.push(rows.join(""));
  }
  host.innerHTML = parts.length
    ? `<div class="menu-label">${esc(t("menu.available"))}</div>${parts.join("")}`
    : `<div class="menu-empty">${esc(t("pack.noResults"))}</div>`;
}

function fitVersionMenu() {
  const menu = $("#version-menu");
  const wrap = menu && menu.parentElement;
  if (!menu || menu.hidden || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const below = innerHeight - rect.bottom - 16;
  const above = rect.top - 16;
  const up = below < 240 && above > below;
  menu.classList.toggle("is-up", up);
  menu.style.maxHeight = `${Math.max(160, Math.min(430, up ? above : below))}px`;
}

function toggleVersionMenu(force) {
  const menu = $("#version-menu");
  const trigger = $("#version-trigger");
  const open = typeof force === "boolean" ? force : menu.hidden;
  menu.hidden = !open;
  trigger.setAttribute("aria-expanded", String(open));
  if (open) {
    S.versionQuery = "";
    const input = $("#version-search");
    if (input) {
      input.value = "";
      renderVersionList();
      fitVersionMenu();
      const list = $("#version-list");
      if (list) list.scrollTop = 0;
      requestAnimationFrame(() => input.focus());
    }
  }
}
function closeVersionMenu() {
  toggleVersionMenu(false);
}
function setSelected(id) {
  S.selected = id;
  $("#version-current").textContent = id;
  renderHero();
  closeVersionMenu();
}

function syncPlay() {
  const btn = $("#play-btn");
  const label = $("#play-label");
  const icon = $("#play-icon");
  const id = S.selected;
  const installing = id ? S.installing.has(id) : false;
  btn.classList.remove("busy");
  btn.disabled = false;
  let iconName = "i-play";
  let text = t("common.play");
  if (S.running) {
    text = t("common.stop");
    iconName = "i-stop";
  } else if (S.launching) {
    text = t("common.launching");
    iconName = "i-refresh";
    btn.classList.add("busy");
    btn.disabled = true;
  } else if (installing) {
    text = t("common.installing");
    iconName = "i-download";
    btn.classList.add("busy");
    btn.disabled = true;
  } else if (!id) {
    btn.disabled = true;
  } else if (!isInstalled(id)) {
    text = t("common.install");
    iconName = "i-download";
  }
  label.textContent = text;
  icon.querySelector("use").setAttribute("href", `#${iconName}`);
  if (S.running) setStatus(`${t("status.running")} · ${S.running}`, "game");
  else if (S.launching || installing) setStatus(t("status.working"), "busy");
  else setStatus(t("status.ready"), "ready");
}

/* ------------------------------------------------------------------ widgets */

const WIDGET_META = {
  stats: { w: 5, icon: "i-gauge", title: "widget.stats", sub: "widget.statsSub" },
  pc: { w: 3, icon: "i-cpu", title: "widget.pc", sub: "widget.pcSub" },
  latest: { w: 4, icon: "i-sparkles", title: "widget.latest", sub: "widget.latestSub" },
  instances: { w: 5, icon: "i-layers", title: "widget.instances", sub: "widget.instancesSub" },
  console: { w: 7, icon: "i-terminal", title: "widget.console", sub: "widget.consoleSub" },
};

function widgetShell(id, body, action = "") {
  const meta = WIDGET_META[id];
  return `<section class="widget" data-w="${meta.w}" data-widget="${id}">
    <div class="widget-head">
      <span class="wi"><svg class="ico"><use href="#${meta.icon}"></use></svg></span>
      <div><h3>${esc(t(meta.title))}</h3><p>${esc(t(meta.sub))}</p></div>
      ${action}
    </div>
    ${body}
  </section>`;
}

function renderWidgets() {
  const host = $("#widgets");
  if (!host) return;
  const layout = S.uiLayout.filter((x) => x.on).map((x) => x.id).filter((id) => WIDGET_META[id]);
  const builders = {
    stats: widgetStats,
    pc: widgetPc,
    latest: widgetLatest,
    instances: widgetInstances,
    console: widgetConsole,
  };
  host.innerHTML = layout.map((id) => builders[id]?.() || "").join("");
  if (S.edit) $$("#widgets .widget").forEach((el) => { el.draggable = true; });
  bindWidgetActions();
  const consoleBody = $("#console-body");
  if (consoleBody) consoleBody.scrollTop = consoleBody.scrollHeight;
}

function widgetStats() {
  const entries = Object.entries(S.stats.playtimeSecs || {})
    .map(([id, secs]) => [id, Number(secs || 0)])
    .filter(([, secs]) => secs > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const max = Math.max(1, ...entries.map(([, secs]) => secs));
  const bars = entries.length
    ? `<div class="bars">${entries.map(([id, secs]) => `<div class="bar-row"><span>${esc(id)}</span><b>${esc(duration(secs))}</b><i class="bar-track"><i style="width:${Math.max(4, (secs / max) * 100)}%"></i></i></div>`).join("")}</div>`
    : `<p class="widget-empty">${esc(t("stats.noData"))}</p>`;
  return widgetShell(
    "stats",
    `<div class="stat-tiles">
      <div class="tile"><b>${esc(duration(totalPlaytime()))}</b><span>${esc(t("stats.playtime"))}</span></div>
      <div class="tile"><b>${i18n.number(S.stats.launches || 0)}</b><span>${esc(t("stats.launches"))}</span></div>
      <div class="tile"><b>${i18n.number(S.stats.sessions || 0)}</b><span>${esc(t("stats.sessions"))}</span></div>
      <div class="tile"><b>${esc(S.stats.lastPlayed ? relativeDay(S.stats.lastPlayed) : t("stats.never"))}</b><span>${esc(t("stats.last"))}</span></div>
    </div>${bars}`,
  );
}

function widgetPc() {
  const specs = S.system?.specs;
  if (!specs) {
    return widgetShell("pc", `<p class="widget-empty">${esc(t("common.loading"))}</p>`, `<button class="btn btn-quiet btn-sm" data-goto="settings" data-tab-target="performance">${esc(t("widget.open"))}</button>`);
  }
  const rows = [
    [t("pc.cpu"), specs.cpu],
    [t("pc.gpu"), specs.gpu],
    [t("pc.ram"), `${i18n.number(specs.ramGb)} GB`],
    [t("pc.disk"), `${i18n.number(specs.diskFreeGb)} GB ${t("pc.free")}`],
  ];
  return widgetShell(
    "pc",
    `<div class="spec-list">${rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b title="${esc(v)}">${esc(v)}</b></div>`).join("")}</div>
     ${S.system.recommendation ? `<div class="tier"><svg class="ico" style="width:15px;height:15px"><use href="#i-zap"></use></svg><span>${esc(t(`tier.${S.system.recommendation.tier}`))}</span></div>` : ""}`,
    `<button class="btn btn-quiet icon-only" data-goto="settings" data-tab-target="performance" title="${esc(t("pc.tune"))}" aria-label="${esc(t("pc.tune"))}"><svg class="ico"><use href="#i-settings"></use></svg></button>`,
  );
}

function widgetLatest() {
  const list = S.remote.filter((v) => v.kind === "release").slice(0, 6);
  const body = list.length
    ? `<div class="release-list">${list.map((v) => `<button class="release" data-pick-latest="${esc(v.id)}">
        <span class="rv">${esc(v.id)}</span>
        <span class="chip ${isInstalled(v.id) ? "ok" : ""}">${esc(isInstalled(v.id) ? t("common.installed") : kindLabel(v.kind))}</span>
        <span class="rd">${esc(i18n.date(v.releaseTime))}</span>
        <svg class="ico"><use href="#i-arrow"></use></svg>
      </button>`).join("")}</div>`
    : `<p class="widget-empty">${esc(t("common.loading"))}</p>`;
  return widgetShell("latest", body, `<button class="btn btn-quiet btn-sm" data-goto="library">${esc(t("widget.all"))}</button>`);
}

function widgetInstances() {
  const rows = S.profiles.slice(0, 4);
  const body = rows.length
    ? `<div>${rows.map((p) => `<button class="instance-mini" data-instance="${esc(p.id)}">
        <img src="${p.icon ? esc(p.icon) : artFor(p.name)}" alt="">
        <span class="im"><b>${esc(p.name)}</b><small>${esc(p.versionId)}</small></span>
        ${S.boot?.activeProfile === p.id ? `<span class="chip chip-soft">${esc(t("common.active"))}</span>` : `<span class="chip">${esc(p.loader)}</span>`}
      </button>`).join("")}</div>`
    : `<p class="widget-empty">${esc(t("instances.empty"))}</p>`;
  return widgetShell("instances", body, `<button class="btn btn-quiet btn-sm" data-goto="instances">${esc(t("widget.manage"))}</button>`);
}

function widgetConsole() {
  const lines = S.log.slice(-80);
  return widgetShell(
    "console",
    `<div class="console" id="console-body" data-empty="${esc(t("widget.consoleEmpty"))}">${lines.map((line) => `<span class="ln ${line.kind || ""}">${esc(line.text)}</span>`).join("")}</div>`,
    `<button class="btn btn-quiet btn-sm" id="console-clear">${esc(t("common.clear"))}</button>`,
  );
}

function bindWidgetActions() {
  $$("[data-goto]", $("#widgets")).forEach((el) => el.addEventListener("click", () => go(el.dataset.goto, el.dataset.tabTarget)));
  $$("[data-pick-latest]", $("#widgets")).forEach((el) => el.addEventListener("click", () => setSelected(el.dataset.pickLatest)));
  $$("[data-instance]", $("#widgets")).forEach((el) => el.addEventListener("click", () => openPack(el.dataset.instance)));
  $("#console-clear")?.addEventListener("click", () => {
    S.log = [];
    renderWidgets();
  });
}

/* ------------------------------------------------------------------ library */

function librarySource() {
  const ids = new Set(S.local.map((v) => v.id));
  const remote = S.remote.length ? S.remote : S.local.map((v) => ({ id: v.id, kind: v.kind, releaseTime: null }));
  const all = [...remote];
  S.local.forEach((v) => {
    if (!all.some((r) => r.id === v.id)) all.push({ id: v.id, kind: v.kind, releaseTime: null });
  });
  return { all, ids };
}

function filteredVersions() {
  const { all } = librarySource();
  const q = S.libQuery.trim().toLowerCase();
  let list = all.filter((v) => {
    if (!visibleBySettings(v)) return false;
    if (S.libFilter === "installed") return isInstalled(v.id);
    if (S.libFilter === "release" && v.kind !== "release") return false;
    if (S.libFilter === "snapshot" && v.kind !== "snapshot") return false;
    if (S.libFilter === "old" && !String(v.kind || "").startsWith("old")) return false;
    if (q && !String(v.id).toLowerCase().includes(q)) return false;
    return true;
  });
  list = sortVersions(list, S.libSort);
  return list;
}

function renderLibrary() {
  const grid = $("#version-grid");
  if (!grid) return;
  const list = filteredVersions();
  const shown = list.slice(0, S.libShown);
  $("#library-empty").hidden = list.length > 0;
  $("#library-more").hidden = list.length <= S.libShown;
  $("#library-more").textContent = t("library.more");
  grid.innerHTML = shown.map((v) => {
    const installed = isInstalled(v.id);
    const banner = bannerForRelease(baseOf(v.id)) || bannerForRelease(v.id);
    const thumb = banner?.image
      ? `<img src="${esc(banner.image)}" alt="" loading="lazy">`
      : `<img src="${versionArt(v.id)}" alt="" loading="lazy">`;
    return `<article class="vcard ${installed ? "is-installed" : ""}" data-version="${esc(v.id)}">
      <div class="vcard-thumb">${thumb}<span class="vcard-kind chip ${v.kind === "release" ? "ok" : ""}">${esc(kindLabel(v.kind))}</span></div>
      <div class="vcard-body">
        <div class="vcard-id" title="${esc(v.id)}">${esc(v.id)}</div>
        <div class="vcard-meta">
          <span>${esc(installed ? loaderLabel(v.id) : i18n.date(v.releaseTime))}</span>
          ${installed ? `<span class="chip chip-soft" style="height:18px;font-size:9px">${esc(t("common.installed"))}</span>` : ""}
        </div>
        <div class="vcard-actions">
          ${installed
            ? `<button class="btn btn-soft" data-lib-play="${esc(v.id)}"><svg class="ico"><use href="#i-play"></use></svg><span>${esc(t("common.play"))}</span></button>
               <button class="btn btn-quiet icon-only" data-lib-delete="${esc(v.id)}" title="${esc(t("common.delete"))}"><svg class="ico"><use href="#i-trash"></use></svg></button>`
            : `<button class="btn btn-primary" data-lib-install="${esc(v.id)}"><svg class="ico"><use href="#i-download"></use></svg><span>${esc(S.installing.has(v.id) ? t("common.installing") : t("common.install"))}</span></button>`}
        </div>
      </div>
    </article>`;
  }).join("");
  applyImgFallback(grid, "img", artFor);
}

function bindLibrary() {
  $("#library-search").addEventListener("input", (e) => {
    S.libQuery = e.target.value;
    S.libShown = 36;
    renderLibrary();
  });
  $("#library-filter").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    S.libFilter = btn.dataset.filter;
    S.libShown = 36;
    setSegmented("#library-filter", "data-filter", S.libFilter);
    renderLibrary();
  });
  $("#library-sort").addEventListener("change", (e) => {
    S.libSort = e.target.value;
    renderLibrary();
  });
  $("#library-refresh").addEventListener("click", async () => {
    try {
      S.remote = await invoke("remote_versions", { refresh: true });
      renderLibrary();
      renderWidgets();
      toast(t("toast.refreshed"));
    } catch (err) {
      toast(friendly(err), "err");
    }
  });
  $("#library-more").addEventListener("click", () => {
    S.libShown += 36;
    renderLibrary();
  });
  $("#version-grid").addEventListener("click", (e) => {
    const install = e.target.closest("[data-lib-install]");
    if (install) return installVersion(install.dataset.libInstall, false);
    const play = e.target.closest("[data-lib-play]");
    if (play) return quickLaunch(play.dataset.libPlay);
    const del = e.target.closest("[data-lib-delete]");
    if (del) return askDeleteVersion(del.dataset.libDelete);
  });
}

async function askDeleteVersion(id) {
  const ok = await confirmAction(t("confirm.deleteVersion"), t("confirm.deleteVersionText", { id }), t("common.delete"));
  if (!ok) return;
  try {
    await invoke("delete_version", { id });
    await refreshBoot();
    toast(t("toast.removed"));
  } catch (err) {
    toast(friendly(err), "err");
  }
}

/* ------------------------------------------------------------------ install / launch */

function showBar(stage = "download", detail = "", percent = 0) {
  const bar = $("#download-bar");
  bar.hidden = false;
  $("#download-stage").textContent = stageLabel(stage);
  $("#download-detail").textContent = detail;
  $("#download-percent").textContent = `${Math.round(percent)}%`;
  $("#download-fill").style.width = `${Math.max(0, Math.min(100, percent))}%`;
}
function hideBar(delay = 0) {
  setTimeout(() => {
    $("#download-bar").hidden = true;
    $("#download-fill").style.width = "0%";
  }, delay);
}
function stageLabel(stage) {
  return t(`progress.${stage}`) === `progress.${stage}` ? t("progress.download") : t(`progress.${stage}`);
}
function updateDownload(payload) {
  const stage = payload.stage || "download";
  const total = Number(payload.totalBytes || 0);
  const bytes = Number(payload.bytes || 0);
  const count = Number(payload.total || 0);
  const current = Number(payload.current || 0);
  const percent = total > 0 ? (bytes / total) * 100 : count > 0 ? (current / count) * 100 : 0;
  const detail = total > 0
    ? `${i18n.bytes(bytes)} / ${i18n.bytes(total)}`
    : count > 0 ? `${i18n.number(current)} / ${i18n.number(count)}` : payload.label || "";
  showBar(stage, detail, percent);
  if (stage === "done") hideBar(900);
}

async function installVersion(id, thenPlay = false) {
  if (!id || S.installing.has(id)) return;
  const entry = S.remote.find((v) => v.id === id);
  if (entry && entry.kind !== "release" && S.settings.allowExperimental !== true && !isInstalled(id)) {
    toast(t("errors.experimentalOff"), "err");
    return;
  }
  S.installing.add(id);
  S.selected = id;
  renderHero();
  renderLibrary();
  showBar("download", id, 0);
  try {
    await invoke("install_version", { id });
    await refreshBoot();
    toast(t("toast.installDone", { version: id }));
    S.selected = id;
    renderAll();
    if (thenPlay) await launchSelected();
  } catch (err) {
    hideBar();
    toast(friendly(err), "err");
  } finally {
    S.installing.delete(id);
    renderHero();
    renderLibrary();
    syncPlay();
  }
}

async function quickLaunch(id) {
  setSelected(id);
  go("home");
  if (!isInstalled(id)) return installVersion(id, true);
  if (S.running) return;
  await launchSelected();
}

async function launchSelected() {
  if (!S.selected || S.launching) return;
  S.launching = true;
  syncPlay();
  try {
    await invoke("launch", { id: S.selected });
    toast(t("toast.launched"));
  } catch (err) {
    toast(friendly(err), "err");
  } finally {
    S.launching = false;
    syncPlay();
  }
}

async function handlePlay() {
  if (S.running) {
    try {
      await invoke("stop_game");
    } catch (err) {
      toast(friendly(err), "err");
    }
    return;
  }
  if (!S.selected || S.launching) return;
  if (!isInstalled(S.selected)) return installVersion(S.selected, true);
  await launchSelected();
}

async function installFabric() {
  if (!S.selected) return;
  const base = baseOf(S.selected);
  showBar("download", base, 0);
  try {
    const loaderId = await invoke("fabric_install", { id: base, loader: null });
    await refreshBoot();
    S.selected = loaderId;
    renderAll();
    toast(t("toast.installed", { name: loaderId }));
  } catch (err) {
    hideBar();
    toast(friendly(err), "err");
  }
}

async function installDiscoverLoader() {
  const base = baseOf(S.selected || S.remote.find((v) => v.kind === "release")?.id || "1.21.8");
  const loader = S.discoverLoader || "fabric";
  showBar("loader", base, 0);
  try {
    const loaderId = await invoke("loader_install", { id: base, loader, version: null });
    await refreshBoot();
    await invoke("profile_create", { name: `${loaderLabel(loader)} ${base}`, versionId: loaderId });
    await refreshBoot();
    S.selected = loaderId;
    renderAll();
    toast(t("toast.profileCreated"));
    loadMods();
  } catch (err) {
    hideBar();
    toast(friendly(err), "err");
  }
}

function hasLoaderProfile() {
  const wanted = (S.discoverLoader || "fabric").toLowerCase();
  return S.profiles.some((p) => {
    const text = `${p.loader} ${p.versionId}`.toLowerCase();
    if (wanted === "forge") return text.includes("forge") && !text.includes("neoforge");
    return text.includes(wanted);
  });
}

/* ------------------------------------------------------------------ discover */

const DISCOVER_CATS = {
  modpack: ["adventure", "technology", "magic", "quests", "skyblock", "hardcore", "optimization", "vanilla"],
  mod: ["optimization", "adventure", "decoration", "technology", "magic", "library", "utility", "worldgen"],
  resourcepack: ["realistic", "medieval", "modern", "cartoon", "fantasy", "simplistic", "themed", "tweaks"],
  shader: ["realistic", "fantasy", "cartoon", "performance", "reflections", "vanilla", "low", "high"],
};

function catLabel(id) {
  if (/^\d+x$/i.test(id)) return id;
  const value = t(`cat.${id}`);
  return value === `cat.${id}` ? id.charAt(0).toUpperCase() + id.slice(1) : value;
}

function planDiscoverVisibility() {
  const kind = S.discoverKind;
  $("#discover-version-filter").hidden = kind === "modpack" || kind === "shader";
  $("#discover-loader-filter").hidden = kind !== "mod";
  $("#discover-profile-filter").hidden = kind === "modpack";
  $("#discover-provider-wrap").hidden = kind === "modpack";
  $("#fabric-notice").hidden = !(kind === "mod" && !hasLoaderProfile());
  updateCatalogChrome();
}

function providerName() {
  if (S.discoverKind === "modpack") return "Modrinth";
  if (S.discoverProvider === "curseforge") return "CurseForge";
  if (S.discoverProvider === "both") return "Modrinth + CurseForge";
  return "Modrinth";
}

function catalogKindLabel() {
  const map = { modpack: "catalog.kindPacks", mod: "catalog.kindMods", resourcepack: "catalog.kindRp", shader: "catalog.kindShaders" };
  return t(map[S.discoverKind] || "catalog.kindMods");
}

function updateCatalogChrome() {
  const source = providerName();
  const kind = catalogKindLabel();
  const sub = $("#discover-sub");
  if (sub) {
    sub.removeAttribute("data-i18n");
    sub.textContent = t("catalog.sub", { kind, source });
  }
  const search = $("#discover-search");
  if (search) {
    search.removeAttribute("data-i18n-ph");
    search.placeholder = t("catalog.searchIn", { source });
  }
  $("#discover-source") && ($("#discover-source").textContent = source);
}

function activeFilterCount() {
  let n = 0;
  if (S.discoverKind !== "modpack" && S.discoverProvider !== "modrinth") n++;
  if (S.discoverCat !== "all") n++;
  if (S.discoverKind !== "modpack" && S.discoverKind !== "shader" && S.discoverVersion) n++;
  if (S.discoverKind === "mod" && S.discoverLoader) n++;
  return n;
}

function renderDiscoverActive() {
  const host = $("#discover-active");
  if (!host) return;
  const chips = [];
  if (S.discoverKind !== "modpack" && S.discoverProvider !== "modrinth") {
    chips.push(`<button class="filter-chip" data-clear="provider">${esc(providerName())}<svg class="ico"><use href="#i-close"></use></svg></button>`);
  }
  if (S.discoverCat !== "all") {
    chips.push(`<button class="filter-chip" data-clear="cat">${esc(catLabel(S.discoverCat))}<svg class="ico"><use href="#i-close"></use></svg></button>`);
  }
  if (S.discoverKind !== "modpack" && S.discoverKind !== "shader" && S.discoverVersion) {
    chips.push(`<button class="filter-chip" data-clear="version">${esc(S.discoverVersion)}<svg class="ico"><use href="#i-close"></use></svg></button>`);
  }
  if (S.discoverKind === "mod" && S.discoverLoader) {
    chips.push(`<button class="filter-chip" data-clear="loader">${esc(S.discoverLoader === "forge" ? "Forge" : S.discoverLoader === "neoforge" ? "NeoForge" : "Fabric")}<svg class="ico"><use href="#i-close"></use></svg></button>`);
  }
  host.hidden = !chips.length;
  host.innerHTML = chips.join("");
  const badge = $("#discover-filter-count");
  if (badge) {
    const n = activeFilterCount();
    badge.hidden = !n;
    badge.textContent = String(n);
  }
}

function renderDiscoverCats() {
  const host = $("#discover-cats");
  if (!host) return;
  const cats = DISCOVER_CATS[S.discoverKind] || [];
  host.hidden = false;
  host.innerHTML = [{ id: "all", label: t("discover.all") }]
    .concat(cats.map((id) => ({ id, label: catLabel(id) })))
    .map((c) => `<button class="cat-chip ${S.discoverCat === c.id ? "is-on" : ""}" data-cat="${esc(c.id)}" aria-pressed="${S.discoverCat === c.id}">${esc(c.label)}</button>`)
    .join("");
}

function renderDiscoverPager() {
  const host = $("#discover-pager");
  if (!host) return;
  const per = S.discoverPer;
  const offset = (S.discoverPage - 1) * per;
  const known = S.discoverTotal == null ? offset + S.discoverResults.length + (S.discoverHasMore ? 1 : 0) : S.discoverTotal;
  const pages = Math.max(1, Math.ceil(known / per));
  host.hidden = S.discoverBusy || (!S.discoverResults.length && S.discoverPage === 1);
  if (host.hidden) return;
  const count = $("#discover-page-count");
  if (count) {
    count.textContent = `${offset + 1}–${offset + S.discoverResults.length} · ${t("catalog.resultsCount", { n: known })}`;
  }
  const nums = [];
  const from = Math.max(1, Math.min(S.discoverPage - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  for (let i = from; i <= to; i++) nums.push(i);
  $("#discover-pages").innerHTML = [
    `<button class="pager-btn" data-page="${S.discoverPage - 1}" ${S.discoverPage <= 1 ? "disabled" : ""} aria-label="prev"><svg class="ico"><use href="#i-chevron"></use></svg></button>`,
    ...nums.map((n) => `<button class="pager-btn ${n === S.discoverPage ? "is-on" : ""}" data-page="${n}">${n}</button>`),
    `<button class="pager-btn" data-page="${S.discoverPage + 1}" ${!S.discoverHasMore ? "disabled" : ""} aria-label="next"><svg class="ico"><use href="#i-chevron"></use></svg></button>`,
  ].join("");
  const perSelect = $("#discover-per");
  if (perSelect) perSelect.value = String(per);
}

async function searchDiscover(reset = true) {
  planDiscoverVisibility();
  renderDiscoverCats();
  renderDiscoverActive();
  if (reset) S.discoverPage = 1;
  const token = ++S.loadToken;
  S.discoverBusy = true;
  const empty = $("#discover-empty");
  empty.hidden = true;
  const offset = (S.discoverPage - 1) * S.discoverPer;
  if (!S.discoverResults.length || reset) {
    $("#discover-results").innerHTML = `<div class="result-skeleton"><span class="spinner"></span><span>${esc(t("common.loading"))}</span></div>`;
  }
  try {
    let results;
    if (S.discoverKind === "modpack") {
      const all = await invoke("modpack_search", { query: S.discoverQuery });
      S.discoverTotal = (all || []).length;
      results = (all || []).slice(offset, offset + S.discoverPer);
      S.discoverHasMore = offset + results.length < S.discoverTotal;
    } else {
      results = await invoke("catalog_search", {
        query: S.discoverQuery,
        kind: S.discoverKind,
        version: S.discoverKind === "shader" ? null : S.discoverVersion || null,
        loader: S.discoverKind === "mod" ? S.discoverLoader : null,
        provider: S.discoverProvider,
        category: S.discoverCat === "all" ? null : S.discoverCat,
        sort: S.discoverSort,
        limit: S.discoverPer,
        offset,
      });
      S.discoverTotal = null;
      S.discoverHasMore = (results || []).length >= S.discoverPer;
    }
    if (token !== S.loadToken) return;
    S.discoverResults = results || [];
    renderDiscoverResults();
  } catch (err) {
    if (token !== S.loadToken) return;
    S.discoverResults = [];
    renderDiscoverResults();
    toast(friendly(err), "err");
  } finally {
    if (token === S.loadToken) {
      S.discoverBusy = false;
      renderDiscoverPager();
    }
  }
}

function renderDiscoverResults() {
  const host = $("#discover-results");
  const list = S.discoverResults;
  $("#discover-empty").hidden = list.length > 0 || S.discoverBusy;
  const meta = $("#discover-meta");
  if (meta) meta.hidden = !list.length;
  if ($("#discover-count")) {
    const offset = (S.discoverPage - 1) * S.discoverPer;
    const total = S.discoverTotal == null ? offset + list.length + (S.discoverHasMore ? 1 : 0) : S.discoverTotal;
    $("#discover-count").textContent = t("catalog.resultsCount", { n: total });
  }
  updateCatalogChrome();
  host.innerHTML = list.map((hit) => {
    const installing = S.discoverInstalling?.has?.(hit.id);
    const cats = (hit.categories || []).slice(0, 3).map((c) => `<span class="tag">${esc(catLabel(c))}</span>`).join("");
    const sources = (hit.sources || [hit.provider]).filter(Boolean).map((s) => `<span class="tag src">${s === "curseforge" ? "CurseForge" : "Modrinth"}</span>`).join("");
    return `<article class="result-row" data-project="${esc(hit.id)}">
      <img class="rr-icon" src="${esc(hit.icon || artFor(hit.title))}" alt="" loading="lazy" data-seed="${esc(hit.title)}">
      <div class="rr-main">
        <div class="rr-head"><h3 title="${esc(hit.title)}">${esc(hit.title)}</h3><span class="rr-author">${esc(t("catalog.by", { name: hit.author || "—" }))}</span></div>
        <p class="rr-desc">${esc(hit.description || "")}</p>
        <div class="rr-tags">${cats}${sources}</div>
      </div>
      <div class="rr-side">
        <span class="rr-downloads"><svg class="ico"><use href="#i-download"></use></svg>${i18n.number(hit.downloads || 0)}</span>
        <button class="btn btn-primary btn-sm" data-install="${esc(hit.id)}" ${installing ? "disabled" : ""}>
          <svg class="ico"><use href="#${installing ? "i-refresh" : "i-download"}"></use></svg>
          <span>${esc(installing ? t("discover.installing") : S.discoverKind === "modpack" ? t("discover.installPack") : t("common.install"))}</span>
        </button>
      </div>
    </article>`;
  }).join("");
  applyImgFallback(host, "img", artFor);
  renderDiscoverPager();
}

async function installProject(hit) {
  if (!hit?.id) return;
  const kind = hit.kind || S.discoverKind;
  if (kind === "modpack") return installModpack(hit);
  if (kind === "mod" && !hasLoaderProfile()) {
    planDiscoverVisibility();
    toast(t("errors.needFabric"), "err");
    return;
  }
  const version = S.discoverVersion || baseOf(S.selected);
  showBar("download", hit.title, 0);
  try {
    const outcome = await invoke("mods_install", {
      project: hit.id,
      version,
      loader: S.discoverLoader,
      kind,
      provider: String(hit.id).startsWith("cf:") ? "curseforge" : (hit.provider || S.discoverProvider),
      profile: S.discoverProfile || S.boot?.activeProfile || null,
    });
    toast(t("toast.modInstalled", { count: (outcome?.installed || []).length }));
    loadMods();
  } catch (err) {
    toast(friendly(err), "err");
  } finally {
    hideBar(400);
  }
}

async function installModpack(hit) {
  showBar("pack", hit.title, 0);
  try {
    await invoke("modpack_install", { project: hit.id, version: null });
    await refreshBoot();
    toast(t("toast.packInstalled", { name: hit.title }));
    go("instances");
    loadMods();
  } catch (err) {
    hideBar();
    toast(friendly(err), "err");
  }
}

function mdToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let list = false;
  const closeList = () => { if (list) { out.push("</ul>"); list = false; } };
  const inline = (text) => esc(text)
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" data-ext="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    if (/^#{1,3}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level + 2}>${inline(line.replace(/^#+\s*/, ""))}</h${level + 2}>`);
    } else if (/^[-*]\s/.test(line)) {
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s*/, ""))}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

async function openProject(id, kindHint) {
  const hit = S.discoverResults.find((r) => r.id === id || r.slug === id);
  const kind = kindHint || hit?.kind || S.discoverKind;
  const isCurse = String(id).startsWith("cf:") || hit?.provider === "curseforge";
  openModal(`<div class="pd-loading"><span class="spinner"></span><span>${esc(t("common.loading"))}</span></div>`);
  try {
    const [detail, contents] = await Promise.all([
      isCurse ? invoke("curse_project", { project: id }) : invoke("modrinth_project", { project: id }),
      kind === "modpack" && !isCurse ? invoke("modpack_contents", { project: id }).catch(() => []) : Promise.resolve([]),
    ]);
    const gallery = detail.gallery || [];
    const cover = gallery[0]?.url || detail.icon || artFor(detail.title);
    const latest = (detail.versions || [])[0] || null;
    const shotHtml = gallery.length
      ? `<div class="pd-shots">${gallery.map((shot, index) => `<button class="pd-shot ${index === 0 ? "is-on" : ""}" data-shot="${esc(shot.url)}"><img src="${esc(shot.url)}" alt="" loading="lazy" data-seed="${esc(detail.title)}"></button>`).join("")}</div>`
      : "";

    const kindMeta = [
      ["mod", t("project.mods")],
      ["resourcepack", t("project.resourcepacks")],
      ["shader", t("project.shaders")],
      ["datapack", t("project.datapacks")],
      ["other", t("project.other")],
    ];
    const counts = Object.fromEntries(kindMeta.map(([k]) => [k, contents.filter((c) => c.kind === k).length]));
    const kinds = kindMeta.filter(([k]) => counts[k] > 0);
    const tabsHtml = kind === "modpack"
      ? `<div class="pd-subtabs" id="pd-kinds">
          <button class="pd-subtab is-on" data-pdkind="mod">${esc(t("project.mods"))} <i>${counts.mod || 0}</i></button>
          ${kinds.filter(([k]) => k !== "mod").map(([k, label]) => `<button class="pd-subtab" data-pdkind="${k}">${esc(label)} <i>${counts[k]}</i></button>`).join("")}
        </div>`
      : "";
    const contentPanel = kind === "modpack"
      ? `<div class="pd-panel" data-pdpanel="content" hidden>
          <div class="pd-content-tools">${tabsHtml}<div class="pd-search"><svg class="ico"><use href="#i-search"></use></svg><input id="pd-content-search" type="search" placeholder="${esc(t("project.search"))}" autocomplete="off"></div></div>
          <div class="pd-rows" id="pd-rows"></div>
        </div>`
      : "";
    const tabBar = `<div class="pd-tabs">
      <button class="pd-tab is-on" data-pdtab="overview">${esc(t("project.overview"))}</button>
      ${kind === "modpack" ? `<button class="pd-tab" data-pdtab="content">${esc(t("project.content"))} <i>${contents.length}</i></button>` : ""}
      <button class="pd-tab" data-pdtab="versions">${esc(t("project.versions"))}</button>
    </div>`;

    const versions = (detail.versions || []).slice(0, 12);
    const versionsHtml = versions.length
      ? versions.map((v) => `<div class="pd-version"><div><b>${esc(v.number || v.name)}</b><small>${esc((v.gameVersions || []).slice(0, 4).join(", "))} · ${esc((v.loaders || []).join(", "))}</small></div><span>${esc(v.file || "")}</span><span>${i18n.date(v.published)}</span><span>${i18n.bytes(v.size || 0)}</span></div>`).join("")
      : `<p class="pd-muted">${esc(t("project.noContents"))}</p>`;

    const envLabel = (value) => {
      const key = value === "required" ? "project.required" : value === "unsupported" ? "project.unsupported" : "project.optional";
      return t(key);
    };
    const row = (item) => `<button class="pd-row" ${item.id ? `data-content-id="${esc(item.id)}"` : ""}>
      <img src="${esc(item.icon || artFor(item.title))}" alt="" loading="lazy" data-seed="${esc(item.title)}">
      <span class="pd-row-main"><b>${esc(item.title)}</b><small>${esc(item.file)}</small></span>
      <span class="pd-row-env" title="${esc(t("project.client") + ": " + envLabel(item.client))}"><svg class="ico"><use href="#i-monitor"></use></svg><i class="${item.client === "unsupported" ? "off" : ""}"></i></span>
      <span class="pd-row-env" title="${esc(t("project.server") + ": " + envLabel(item.server))}"><svg class="ico"><use href="#i-globe"></use></svg><i class="${item.server === "unsupported" ? "off" : ""}"></i></span>
    </button>`;
    const sorted = [...contents].sort((a, b) => a.title.localeCompare(b.title));
    const initialRows = sorted.filter((c) => c.kind === "mod");

    openModal(`
      <button class="win-btn pd-close" data-close aria-label="${esc(t("common.cancel"))}"><svg class="ico"><use href="#i-close"></use></svg></button>
      <div class="pd-hero">
        <img class="pd-cover" id="pd-cover" src="${esc(cover)}" alt="" data-seed="${esc(detail.title)}">
        <div class="pd-headline">
          <img class="pd-icon" src="${esc(detail.icon || artFor(detail.title))}" alt="" data-seed="${esc(detail.title)}">
          <div>
            <h2>${esc(detail.title)}</h2>
            <p>${esc(detail.description || "")}</p>
            <div class="pd-tags">${(detail.categories || []).slice(0, 6).map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>
            <div class="pd-fileline">${latest ? `${esc(latest.file || "")} · ${esc((latest.gameVersions || []).slice(0, 2).join(", "))} · ${esc((latest.loaders || []).join(", "))}` : ""}</div>
          </div>
        </div>
        <div class="pd-actions">
          <button class="btn btn-primary" data-project-install="${esc(detail.id || id)}"><svg class="ico"><use href="#i-download"></use></svg><span>${esc(kind === "modpack" ? t("discover.installPack") : t("common.install"))}</span></button>
          ${detail.sourceUrl ? `<button class="btn btn-soft" data-ext="${esc(detail.sourceUrl)}"><svg class="ico"><use href="#i-external"></use></svg><span>Source</span></button>` : ""}
        </div>
      </div>
      ${tabBar}
      <div class="pd-body">
        <div class="pd-panel" data-pdpanel="overview">
          ${shotHtml}
          <div class="pd-stats">
            <span><b>${i18n.number(detail.downloads || 0)}</b>${esc(t("common.downloads"))}</span>
            <span><b>${i18n.number(detail.followers || 0)}</b>${esc(t("project.followers"))}</span>
            <span><b>${esc(detail.license || "—")}</b>${esc(t("project.license"))}</span>
            <span><b>${esc(i18n.date(detail.updated))}</b>${esc(t("project.updated"))}</span>
          </div>
          <div class="pd-markdown">${mdToHtml(detail.body)}</div>
        </div>
        ${contentPanel}
        <div class="pd-panel" data-pdpanel="versions" hidden>
          <div class="pd-versions">${versionsHtml}</div>
        </div>
      </div>
    `, () => {
      const coverImg = $("#pd-cover");
      $$(".pd-shot").forEach((btn) => btn.addEventListener("click", () => {
        $$(".pd-shot").forEach((b) => b.classList.toggle("is-on", b === btn));
        if (coverImg) coverImg.src = btn.dataset.shot;
      }));
      $("[data-project-install]")?.addEventListener("click", async () => {
        closeModal();
        await installProject(hit || { id, title: detail.title, kind });
      });
      $$("[data-pdtab]").forEach((btn) => btn.addEventListener("click", () => {
        $$("[data-pdtab]").forEach((b) => b.classList.toggle("is-on", b === btn));
        $$("[data-pdpanel]").forEach((p) => { p.hidden = p.dataset.pdpanel !== btn.dataset.pdtab; });
      }));
      const rowsHost = $("#pd-rows");
      let pdKind = "mod";
      const paint = () => {
        const query = ($("#pd-content-search")?.value || "").trim().toLowerCase();
        const list = sorted.filter((c) => c.kind === pdKind && (!query || `${c.title} ${c.file}`.toLowerCase().includes(query)));
        if (rowsHost) rowsHost.innerHTML = list.length ? list.map(row).join("") : `<p class="pd-muted">${esc(t("discover.noResults"))}</p>`;
        $$("[data-content-id]", rowsHost || document).forEach((btn) => {
          btn.onclick = () => { const item = contents.find((x) => x.id === btn.dataset.contentId); if (item?.id) openProject(item.id, "mod"); };
        });
      };
      if (rowsHost) {
        rowsHost.innerHTML = initialRows.length ? initialRows.map(row).join("") : "";
        $$("[data-pdkind]").forEach((btn) => btn.addEventListener("click", () => {
          pdKind = btn.dataset.pdkind;
          $$("[data-pdkind]").forEach((b) => b.classList.toggle("is-on", b === btn));
          paint();
        }));
        $("#pd-content-search")?.addEventListener("input", paint);
        paint();
      }
      $$("[data-ext]").forEach((el) => el.addEventListener("click", (e) => {
        e.preventDefault();
        openUrl(el.dataset.ext);
      }));
      $$("img[data-seed]", $("#modal-root")).forEach((img) => img.addEventListener("error", () => { img.src = artFor(img.dataset.seed); }, { once: true }));
    }, true);
  } catch (err) {
    openModal(`<div class="pd-error"><p>${esc(friendly(err))}</p><button class="btn btn-soft" data-close>${esc(t("common.cancel"))}</button></div>`);
  }
}

async function loadMods() {
  try {
    S.mods = await invoke("mods_list");
    S.modHealth = await invoke("mods_health");
    const pid = activeProfile()?.id;
    if (pid) {
      try {
        const map = await invoke("profile_icons", { id: pid });
        Object.entries(map || {}).forEach(([file, url]) => { if (url) S.icons.set(`${pid}:${file}`, url); });
      } catch {}
    }
    renderMods();
    renderModHealth();
  } catch {
    S.mods = [];
    S.modHealth = null;
  }
}

function renderMods() {
  const host = $("#mods-list");
  if (!host) return;
  const q = (S.modsQuery || "").trim().toLowerCase();
  const list = q
    ? S.mods.filter((m) => `${m.name} ${m.file} ${m.version || ""} ${m.loader || ""}`.toLowerCase().includes(q))
    : S.mods;
  const count = $("#mods-count");
  if (count) {
    count.hidden = !S.mods.length;
    count.textContent = String(S.mods.length);
  }
  if (!S.mods.length) {
    host.innerHTML = `<div class="empty mods-empty"><p>${esc(t("discover.noneInstalled"))}</p></div>`;
    return;
  }
  if (!list.length) {
    host.innerHTML = `<div class="empty mods-empty"><p>${esc(t("catalog.noMatches"))}</p></div>`;
    return;
  }
  const riskKey = (risk) => (risk === "high" ? "discover.risk.high" : risk === "medium" ? "discover.risk.medium" : "discover.risk.safe");
  const pid = activeProfile()?.id;
  host.innerHTML = list.map((m) => {
    const icon = pid ? S.icons.get(`${pid}:${m.file}`) : null;
    return `<div class="mod-row" data-mod="${esc(m.file)}">
    ${icon ? `<img class="micon" src="${esc(icon)}" alt="" loading="lazy">` : `<span class="micon">${ico("i-layers")}</span>`}
    <div class="mname"><b title="${esc(m.name)}">${esc(m.name)}</b><small>${esc([m.version, m.loader, i18n.bytes(m.size)].filter(Boolean).join(" · "))}</small></div>
    <span class="chip ${m.risk === "high" ? "danger" : m.risk === "medium" ? "warn" : "ok"}">${esc(t(riskKey(m.risk)))}</span>
    <button class="btn btn-quiet icon-only" data-mod-remove="${esc(m.file)}" title="${esc(t("common.remove"))}"><svg class="ico"><use href="#i-trash"></use></svg></button>
  </div>`;
  }).join("");
  host.onclick = async (e) => {
    const btn = e.target.closest("[data-mod-remove]");
    if (!btn) return;
    try {
      await invoke("mods_remove", { file: btn.dataset.modRemove });
      await loadMods();
      toast(t("toast.removed"));
    } catch (err) {
      toast(friendly(err), "err");
    }
  };
}

function renderModHealth() {
  const el = $("#mods-health");
  if (!el) return;
  if (!S.modHealth) {
    el.textContent = "—";
    return;
  }
  el.textContent = S.modHealth.missing?.length
    ? `${S.modHealth.missing.length} ${t("discover.missing")}`
    : `${S.modHealth.total || 0} ${t("discover.healthOk")}`;
}

async function repairMods() {
  try {
    const version = S.discoverVersion || baseOf(S.selected);
    showBar("download", t("discover.repair"), 0);
    await invoke("mods_repair", { version, loader: S.discoverLoader });
    await loadMods();
    toast(t("toast.repaired"));
  } catch (err) {
    toast(friendly(err), "err");
  } finally {
    hideBar(400);
  }
}

/* ------------------------------------------------------------------ instances */

function renderInstances() {
  const host = $("#instance-grid");
  if (!host) return;
  $("#instances-empty").hidden = S.profiles.length > 0;
  host.innerHTML = S.profiles.map((p) => {
    const active = S.boot?.activeProfile === p.id;
    const secs = S.stats.playtimeSecs?.[p.versionId] || 0;
    return `<article class="icard ${active ? "is-active" : ""}" data-profile="${esc(p.id)}">
      <div class="icard-top">
        ${p.icon ? `<img class="icard-icon" src="${esc(p.icon)}" alt="">` : `<span class="icard-icon"><svg class="ico"><use href="#i-layers"></use></svg></span>`}
        <div style="min-width:0;flex:1">
          <h3>${esc(p.name)}</h3>
          <div class="sub"><span>${esc(p.versionId)}</span><span class="dot" style="width:2px;height:2px;border-radius:50%;background:currentColor"></span><span>${esc(p.loader || "vanilla")}</span></div>
        </div>
        ${active ? `<span class="chip chip-soft">${esc(t("instances.active"))}</span>` : ""}
      </div>
      <div class="icard-stats">
        <span>${esc(t("stats.playtime"))}: <b>${esc(duration(secs))}</b></span>
        <span>${esc(t("instances.created"))}: <b>${esc(i18n.date(new Date((p.createdAt || 0) * 1000)))}</b></span>
      </div>
      <div class="icard-actions">
        <button class="btn btn-primary" data-profile-play="${esc(p.id)}"><svg class="ico"><use href="#i-play"></use></svg><span>${esc(t("common.play"))}</span></button>
        <button class="btn btn-quiet icon-only" data-profile-options="${esc(p.id)}" title="${esc(t("opt.title"))}"><svg class="ico"><use href="#i-settings"></use></svg></button>
        <button class="btn btn-quiet icon-only" data-profile-open="${esc(p.id)}" title="${esc(t("instances.openFolder"))}"><svg class="ico"><use href="#i-folder"></use></svg></button>
        <button class="btn btn-quiet icon-only" data-profile-delete="${esc(p.id)}" title="${esc(t("common.delete"))}"><svg class="ico"><use href="#i-trash"></use></svg></button>
      </div>
    </article>`;
  }).join("");
  applyImgFallback(host, "img", artFor);
}

function bindInstances() {
  $("#instance-create").addEventListener("click", createInstance);
  $("#instances-empty-create").addEventListener("click", createInstance);
  $("#instance-import")?.addEventListener("click", async () => {
    try {
      const path = await invoke("pick_folder");
      if (!path) return;
      await invoke("profile_import", { path });
      await refreshBoot();
      toast(t("toast.imported"));
    } catch (err) {
      toast(friendly(err), "err");
    }
  });
  $("#instance-grid").addEventListener("click", async (e) => {
    const activate = e.target.closest("[data-profile-activate]");
    if (activate) return activateProfile(activate.dataset.profileActivate);
    const play = e.target.closest("[data-profile-play]");
    if (play) return activateProfile(play.dataset.profilePlay, true);
    const options = e.target.closest("[data-profile-options]");
    if (options) return openInstanceOptions(options.dataset.profileOptions);
    const open = e.target.closest("[data-profile-open]");
    if (open) {
      try { await invoke("open_profile", { id: open.dataset.profileOpen }); } catch (err) { toast(friendly(err), "err"); }
      return;
    }
    const del = e.target.closest("[data-profile-delete]");
    if (del) return askDeleteProfile(del.dataset.profileDelete);
    if (e.target.closest("button")) return;
    const card = e.target.closest("[data-profile]");
    if (card) return openPack(card.dataset.profile);
  });
}

async function activateProfile(id, thenPlay = false) {
  try {
    await invoke("profile_activate", { id });
    await refreshBoot();
    const profile = profileById(id);
    if (profile) S.selected = profile.versionId;
    renderAll();
    toast(t("toast.activated"));
    if (thenPlay) {
      go("home");
      await launchSelected();
    }
  } catch (err) {
    toast(friendly(err), "err");
  }
}

function createInstance() {
  const installed = new Set(S.local.map((v) => v.id));
  const seen = new Set();
  const versions = [...S.local, ...S.remote]
    .filter((v) => visibleBySettings(v) || installed.has(v.id))
    .filter((v) => v.kind === "release" || installed.has(v.id))
    .filter((v) => (seen.has(v.id) ? false : seen.add(v.id)))
    .sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }))
    .slice(0, 200);
  if (!versions.length) {
    toast(t("errors.generic"), "err");
    return;
  }
  const first = S.selected || versions[0].id;
  const loaders = [
    ["vanilla", "Vanilla"],
    ["fabric", "Fabric"],
    ["forge", "Forge"],
    ["neoforge", "NeoForge"],
  ];
  openModal(`<h3>${esc(t("instances.createTitle"))}</h3><p>${esc(t("instances.createText"))}</p>
    <div class="cp-layout">
      <button class="cp-cover" id="instance-cover" type="button" title="${esc(t("set.wall.pick"))}">
        <img src="${versionArt(first)}" alt="">
        <span class="cp-pencil"><svg class="ico"><use href="#i-palette"></use></svg></span>
      </button>
      <div class="cp-fields">
        <label class="input"><input id="instance-name" maxlength="40" placeholder="${esc(t("instances.name"))}" autocomplete="off"></label>
        <label class="select-inline wide"><select id="instance-version">${versions.map((v) => `<option value="${esc(v.id)}" ${v.id === first ? "selected" : ""}>${esc(v.id)}${installed.has(v.id) ? " · ✓" : ""}</option>`).join("")}</select><svg class="ico"><use href="#i-chevron"></use></svg></label>
        <div class="cp-loaders" id="instance-loaders">${loaders.map(([value, label], i) => `<button class="cp-loader ${i === 0 ? "is-on" : ""}" data-loader="${value}" type="button">${label}</button>`).join("")}</div>
        <label class="input"><input id="instance-loader-version" placeholder="Loader version (auto)" autocomplete="off"></label>
        <input id="instance-icon" type="hidden" value="">
      </div>
    </div>
    <div class="modal-actions"><button class="btn btn-quiet" data-close>${esc(t("common.cancel"))}</button><button class="btn btn-primary" id="instance-create-ok">${esc(t("common.create"))}</button></div>`, () => {
    $("#instance-name").focus();
    let loader = "vanilla";
    $("#instance-cover").addEventListener("click", async () => {
      try {
        const path = await invoke("pick_wallpaper");
        if (!path) return;
        $("#instance-icon").value = path;
        $("#instance-cover img").src = fileUrl(path);
      } catch (err) {
        toast(friendly(err), "err");
      }
    });
    $("#instance-version").addEventListener("change", (e) => {
      $("#instance-cover img").src = versionArt(e.target.value);
    });
    $$("#instance-loaders .cp-loader").forEach((btn) => btn.addEventListener("click", () => {
      loader = btn.dataset.loader;
      $$("#instance-loaders .cp-loader").forEach((b) => b.classList.toggle("is-on", b === btn));
    }));
    $("#instance-create-ok").addEventListener("click", async () => {
      const name = $("#instance-name").value.trim();
      const versionId = $("#instance-version").value;
      if (!name) return toast(t("errors.badName"), "err");
      try {
        await invoke("profile_create", {
          name,
          versionId,
          loader,
          loaderVersion: $("#instance-loader-version").value.trim() || null,
          icon: $("#instance-icon").value || null,
        });
        closeModal();
        await refreshBoot();
        renderAll();
        toast(t("toast.profileCreated"));
        loadMods();
      } catch (err) {
        toast(friendly(err), "err");
      }
    });
  });
}

const MC_LANGUAGES = [
  ["ru_ru", "Русский"], ["en_us", "English"], ["uk_ua", "Українська"], ["kk_kz", "Қазақша"],
  ["pl_pl", "Polski"], ["cs_cz", "Čeština"], ["sk_sk", "Slovenčina"], ["fr_fr", "Français"],
  ["de_de", "Deutsch"], ["it_it", "Italiano"], ["es_es", "Español"], ["pt_br", "Português (BR)"],
  ["tr_tr", "Türkçe"], ["ja_jp", "日本語"], ["zh_cn", "简体中文"],
];

function optionField(key, label, control) {
  return `<label class="opt-field"><span>${esc(label)}</span>${control}</label>`;
}

function optionSelect(key, label, entries, value) {
  const current = value === undefined || value === null ? "" : String(value);
  const options = [`<option value="">${esc(t("opt.default"))}</option>`]
    .concat(entries.map(([val, text]) => `<option value="${esc(val)}" ${current === String(val) ? "selected" : ""}>${esc(text)}</option>`));
  return optionField(key, label, `<select class="input" data-opt="${key}">${options.join("")}</select>`);
}

function optionNumber(key, label, value, min, max) {
  return optionField(key, label, `<input class="input" type="number" min="${min}" max="${max}" data-optnum="${key}" value="${value ?? ""}" placeholder="${esc(t("opt.default"))}">`);
}

function ico(name) {
  return `<svg class="ico"><use href="#${name}"></use></svg>`;
}

const PACK_CATS = {
  mod: ["optimization", "adventure", "magic", "technology", "decoration", "worldgen", "library", "storage", "food", "equipment", "utility"],
  resourcepack: ["realistic", "simplistic", "medieval", "fantasy", "modern", "cartoon", "anime", "16x", "32x", "64x", "128x", "256x"],
  shader: ["realistic", "fantasy", "cartoon", "performance", "low-end", "volumetric", "lighting", "water"],
  datapack: ["adventure", "utility", "worldgen", "mobs", "recipes", "structures"],
};
const PACK_ICONS = { mod: "i-layers", resourcepack: "i-palette", shader: "i-sparkles", datapack: "i-folder" };

async function openPack(id) {
  const profile = profileById(id);
  if (!profile) return;
  let contents = [];
  try {
    contents = await invoke("profile_contents", { id });
  } catch {}
  let filter = "all";
  let query = "";
  let addKind = "mod";
  let addCat = "all";
  let addResults = [];
  let addBusy = false;
  let addLoaded = false;
  let addToken = 0;
  let addSort = "featured";
  let addProvider = "both";
  let addPage = 1;
  let addPer = 20;
  let addHasMore = false;
  const kinds = [
    ["mod", t("project.mods")],
    ["resourcepack", t("project.resourcepacks")],
    ["shader", t("project.shaders")],
    ["datapack", t("project.datapacks")],
  ];
  const kindOf = (item) => item.kind || "mod";
  const iconFor = (item) => S.icons.get(`${id}:${item.file}`) || "";
  const rows = () => {
    const list = contents.filter((item) => (filter === "all" || kindOf(item) === filter) && (!query || item.name.toLowerCase().includes(query)));
    if (!list.length) return `<div class="empty" style="padding:28px"><p>${esc(t("instances.emptySub"))}</p></div>`;
    return list.map((item) => {
      const icon = iconFor(item);
      const kind = kindOf(item);
      return `<div class="pd-row ${kind === "pending" ? "is-pending" : ""}">
      <div class="pd-row-icon">${icon ? `<img src="${esc(icon)}" alt="" loading="lazy">` : ico(PACK_ICONS[kind] || "i-layers")}</div>
      <div class="pd-row-main"><b>${esc(item.name)}</b><span>${esc(item.file)}</span></div>
      ${kind === "pending" ? `<span class="chip warn">${esc(t("pack.pendingChip"))}</span>` : `<span class="chip">${esc(i18n.bytes(item.size || 0))}</span>`}
      <button class="btn btn-quiet icon-only" data-pack-remove="${esc(item.file)}" data-kind="${esc(kind)}" title="${esc(t("common.delete"))}">${ico("i-trash")}</button>
    </div>`;
    }).join("");
  };
  const count = (kind) => contents.filter((item) => kindOf(item) === kind).length;
  const pendingCount = () => count("pending");
  const statusText = () => (pendingCount() ? t("pack.pendingCount", { n: pendingCount() }) : t("status.ready"));
  const addRows = () => {
    if (addBusy && !addResults.length) return `<div class="result-skeleton"><span class="spinner"></span><span>${esc(t("common.loading"))}</span></div>`;
    if (!addResults.length) return `<div class="empty" style="padding:26px"><p>${esc(t("pack.searchHint"))}</p></div>`;
    return addResults.map((hit) => {
      const cats = (hit.categories || []).slice(0, 3).map((c) => `<span class="tag">${esc(catLabel(c))}</span>`).join("");
      return `<div class="result-row add-row">
        <div class="pd-row-icon">${hit.icon ? `<img src="${esc(hit.icon)}" alt="" loading="lazy">` : ico(PACK_ICONS[addKind] || "i-layers")}</div>
        <div class="rr-main">
          <div class="rr-head"><h3>${esc(hit.title)}</h3><span class="rr-author">${esc(t("catalog.by", { name: hit.author || "—" }))}</span></div>
          <p class="rr-desc">${esc(hit.description || "")}</p>
          <div class="rr-tags">${cats}<span class="tag src">${esc(hit.provider === "curseforge" ? "CurseForge" : "Modrinth")}</span></div>
        </div>
        <div class="rr-side">
          <span class="rr-downloads">${ico("i-download")}${i18n.number(hit.downloads || 0)}</span>
          <button class="btn btn-primary btn-sm" data-pack-install="${esc(hit.id)}" data-provider="${esc(hit.provider || "modrinth")}">${esc(t("common.install"))}</button>
        </div>
      </div>`;
    }).join("");
  };
  const html = `
    <div class="pack-page-top">
      <button class="btn btn-quiet btn-sm" id="pack-back">${ico("i-chevron")}<span>${esc(t("common.back"))}</span></button>
    </div>
    <div class="pack-head">
      <button class="pack-cover-btn" id="pack-cover-btn" title="${esc(t("pack.changeCover"))}">
        ${profile.icon ? `<img class="pack-cover" src="${esc(profile.icon)}" alt="">` : `<span class="pack-cover">${ico("i-layers")}</span>`}
        <span class="pack-cover-edit">${ico("i-palette")}</span>
      </button>
      <div class="pack-title">
        <div class="pack-eyebrow"><span class="chip">${esc(profile.loader || "vanilla")}</span><span class="chip">${esc(profile.versionId)}</span>${profile.loaderVersion ? `<span class="chip chip-soft">${esc(profile.loaderVersion)}</span>` : ""}${pendingCount() ? `<span class="chip warn">${esc(t("pack.pendingCount", { n: pendingCount() }))}</span>` : ""}</div>
        <h2>${esc(profile.name)}</h2>
        <p>${esc(t("pack.contentsCount", { n: contents.length }))}</p>
        <div class="pack-actions">
          <button class="btn btn-primary" id="pack-play">${ico("i-play")}<span>${esc(t("common.play"))}</span></button>
          <button class="btn btn-soft" id="pack-add">${ico("i-plus")}<span>${esc(t("discover.addContent"))}</span></button>
          <button class="btn btn-quiet" id="pack-version">${ico("i-refresh")}<span>${esc(t("pack.updateVersion"))}</span></button>
          <button class="btn btn-quiet" id="pack-retry" ${pendingCount() ? "" : "hidden"}>${ico("i-zap")}<span>${esc(t("pack.retryPending"))}</span></button>
          <button class="btn btn-quiet" id="pack-repair">${ico("i-shield")}<span>${esc(t("discover.repair"))}</span></button>
          <button class="btn btn-quiet icon-only" id="pack-rename" title="${esc(t("edit.renameInstance"))}">${ico("i-edit")}</button>
        </div>
      </div>
    </div>
    <div class="pack-stats">
      <div><span>${esc(t("pack.status"))}</span><b id="pack-status">${esc(statusText())}</b></div>
      <div><span>${esc(t("pack.modsCount"))}</span><b id="pack-mods-count">${count("mod") + count("pending")}</b></div>
      <div><span>${esc(t("stats.last"))}</span><b>${esc(S.stats.lastPlayed ? i18n.date(new Date(S.stats.lastPlayed * 1000)) : t("stats.never"))}</b></div>
      <div><span>${esc(t("stats.playtime"))}</span><b>${esc(duration(S.stats.playtimeSecs?.[profile.versionId] || 0))}</b></div>
    </div>
    <div class="pd-subtabs" id="pack-kinds">
      <button class="pd-subtab is-on" data-packkind="all">${esc(t("project.overview"))} ${contents.length}</button>
      ${kinds.map(([k, label]) => `<button class="pd-subtab" data-packkind="${k}">${esc(label)} ${count(k)}</button>`).join("")}
      ${pendingCount() ? `<button class="pd-subtab" data-packkind="pending">${esc(t("pack.pendingChip"))} ${pendingCount()}</button>` : ""}
    </div>
    <div class="pd-search"><input class="input" id="pack-search" placeholder="${esc(t("project.search"))}"></div>
    <div class="pd-rows" id="pack-rows">${rows()}</div>
    <div id="pack-add-panel" hidden>
      <div class="pack-add-head">
        <div><b>${esc(t("pack.addTitle"))}</b><small>${esc(t("pack.addSub"))}</small></div>
        <button class="btn btn-quiet icon-only" id="pack-add-close" title="${esc(t("common.cancel"))}">${ico("i-close")}</button>
      </div>
      <div class="pack-lockchips">
        <span class="lock-chip">${ico("i-layers")}${esc(profile.loader || "vanilla")}</span>
        <span class="lock-chip">${ico("i-gamepad")}${esc(profile.versionId)}</span>
        <span class="lock-chip lock-chip-hint">${esc(t("pack.filteredHint"))}</span>
      </div>
      <div class="pd-subtabs" id="pack-add-kinds">
        ${kinds.map(([k, label], i) => `<button class="pd-subtab ${i === 0 ? "is-on" : ""}" data-addkind="${k}">${esc(label)}</button>`).join("")}
      </div>
      <div class="pack-add-bar">
        <label class="input search"><svg class="ico"><use href="#i-search"></use></svg><input id="pack-add-search" placeholder="${esc(t("pack.addSearch"))}" autocomplete="off"></label>
        <label class="select-inline"><select id="pack-add-sort">
          <option value="featured" data-i18n="catalog.sortFeatured">${esc(t("catalog.sortFeatured"))}</option>
          <option value="downloads">${esc(t("catalog.sortDownloads"))}</option>
          <option value="updated">${esc(t("catalog.sortUpdated"))}</option>
          <option value="newest">${esc(t("catalog.sortNewest"))}</option>
        </select><svg class="ico"><use href="#i-chevron"></use></svg></label>
        <label class="select-inline"><select id="pack-add-provider">
          <option value="both" data-i18n="discover.both">${esc(t("discover.both"))}</option>
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
        </select><svg class="ico"><use href="#i-chevron"></use></svg></label>
      </div>
      <div class="cat-row" id="pack-add-cats"></div>
      <div class="pack-results" id="pack-add-results">${addRows()}</div>
      <div class="pager pack-pager" id="pack-add-pager" hidden>
        <span class="pager-count" id="pack-add-page-count"></span>
        <div class="pager-pages" id="pack-add-pages"></div>
        <label class="select-inline pager-size"><select id="pack-add-per">
          <option value="20">20</option><option value="30">30</option><option value="50">50</option>
        </select><svg class="ico"><use href="#i-chevron"></use></svg></label>
      </div>
    </div>`;
  const page = $("#pack-page-body");
  page.innerHTML = html;
  go("pack");
  (() => {
    $("#pack-back").addEventListener("click", () => go("instances"));
    const host = $("#pack-rows");
    const paint = () => {
      host.innerHTML = rows();
      applyImgFallback(host, "img", artFor);
      const all = $("#pack-kinds [data-packkind='all']");
      if (all) all.textContent = `${t("project.overview")} ${contents.length}`;
      kinds.forEach(([k]) => {
        const chip = $(`#pack-kinds [data-packkind='${k}']`);
        if (chip) chip.textContent = `${kinds.find(([k2]) => k2 === k)[1]} ${count(k)}`;
      });
      const pendingTab = $("#pack-kinds [data-packkind='pending']");
      if (pendingTab) {
        pendingTab.hidden = !pendingCount();
        pendingTab.textContent = `${t("pack.pendingChip")} ${pendingCount()}`;
      }
      const status = $("#pack-status");
      if (status) status.textContent = statusText();
      const retry = $("#pack-retry");
      if (retry) retry.hidden = !pendingCount();
      const mods = $("#pack-mods-count");
      if (mods) mods.textContent = String(count("mod") + count("pending"));
    };
    const loadIcons = async () => {
      try {
        const map = await invoke("profile_icons", { id });
        Object.entries(map || {}).forEach(([file, url]) => { if (url) S.icons.set(`${id}:${file}`, url); });
        paint();
      } catch {}
    };
    $("#pack-kinds").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-packkind]");
      if (!btn) return;
      filter = btn.dataset.packkind;
      $$("#pack-kinds .pd-subtab").forEach((el) => el.classList.toggle("is-on", el === btn));
      paint();
    });
    $("#pack-search").addEventListener("input", (e) => {
      query = e.target.value.trim().toLowerCase();
      paint();
    });
    host.addEventListener("click", async (e) => {
      const remove = e.target.closest("[data-pack-remove]");
      if (!remove) return;
      try {
        const kind = remove.dataset.kind === "pending" ? "mod" : remove.dataset.kind;
        await invoke("profile_file_remove", { id, file: remove.dataset.packRemove, kind });
        contents = await invoke("profile_contents", { id });
        paint();
        const status = $("#pack-status");
        if (status) status.textContent = statusText();
        const modsCount = $("#pack-mods-count");
        if (modsCount) modsCount.textContent = String(count("mod") + count("pending"));
        toast(t("toast.removed"));
      } catch (err) {
        toast(friendly(err), "err");
      }
    });
    $("#pack-play").addEventListener("click", () => {
      activateProfile(id, true);
    });
    $("#pack-add").addEventListener("click", () => {
      const panel = $("#pack-add-panel");
      const open = panel.hidden;
      panel.hidden = !open;
      if (!open) return;
      if (!addLoaded) searchAdd("");
      panel.scrollIntoView({ block: "start", behavior: "smooth" });
      $("#pack-add-search")?.focus({ preventScroll: true });
    });
    $("#pack-add-close").addEventListener("click", () => {
      $("#pack-add-panel").hidden = true;
    });
    $("#pack-repair").addEventListener("click", async () => {
      try {
        await invoke("mods_repair", { version: profile.versionId, loader: profile.loader || "fabric", profile: id });
        toast(t("toast.repaired"));
      } catch (err) {
        toast(friendly(err), "err");
      }
    });
    $("#pack-rename").addEventListener("click", () => {
      openModal(`<h3>${esc(t("edit.renameInstance"))}</h3>
        <p>${esc(profile.versionId)} · ${esc(profile.loader || "vanilla")}</p>
        <label class="input" style="margin:14px 0"><input class="input" id="pack-name-input" maxlength="60" value="${esc(profile.name)}"></label>
        <div class="modal-actions"><button class="btn btn-quiet" data-close>${esc(t("common.cancel"))}</button><button class="btn btn-primary" id="pack-name-save">${esc(t("common.save"))}</button></div>`, () => {
        const input = $("#pack-name-input");
        input.focus();
        input.select();
        const save = async () => {
          const name = input.value.trim();
          if (!name) return;
          try {
            await invoke("profile_rename", { id, name });
            closeModal();
            await refreshBoot();
            openPack(id);
            toast(t("toast.saved"));
          } catch (err) {
            toast(friendly(err), "err");
          }
        };
        $("#pack-name-save").addEventListener("click", save);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
      });
    });

    const retryPending = async (silent) => {
      if (!pendingCount()) return;
      try {
        const version = baseOf(profile.versionId) || profile.versionId;
        const result = await invoke("mods_retry_pending", { id, version, loader: profile.loader || "fabric" });
        const restored = result?.restored?.length || 0;
        if (restored) {
          contents = await invoke("profile_contents", { id });
          paint();
          loadIcons();
          const status = $("#pack-status");
          if (status) status.textContent = statusText();
          toast(t("pack.restored", { n: restored }));
        } else if (!silent) {
          toast(t("pack.nothingPending"));
        }
      } catch (err) {
        if (!silent) toast(friendly(err), "err");
      }
    };
    $("#pack-retry").addEventListener("click", () => retryPending(false));

    $("#pack-cover-btn").addEventListener("click", async () => {
      try {
        const path = await invoke("pick_wallpaper");
        if (!path) return;
        await invoke("profile_set_icon", { id, path });
        await refreshBoot();
        openPack(id);
        toast(t("pack.coverChanged"));
      } catch (err) {
        toast(friendly(err), "err");
      }
    });

    $("#pack-version").addEventListener("click", () => {
      const versions = [...new Set([
        ...S.remote.filter((v) => v.kind === "release").map((v) => v.id),
        ...S.local.map((v) => v.id),
      ])];
      const current = baseOf(profile.versionId) || profile.versionId;
      openModal(`<h3>${esc(t("pack.updateTitle"))}</h3>
        <p>${esc(t("pack.updateSub"))}</p>
        <div class="pack-update-grid">
          <label class="field"><span>${esc(t("pack.targetVersion"))}</span>
            <select class="input" id="pack-up-version">${versions.map((v) => `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
          </label>
          <label class="field"><span>${esc(t("pack.loader"))}</span>
            <select class="input" id="pack-up-loader">${["fabric", "forge", "neoforge", "vanilla"].map((l) => `<option value="${l}" ${(profile.loader || "vanilla") === l ? "selected" : ""}>${esc(l === "vanilla" ? t("pack.vanilla") : l.charAt(0).toUpperCase() + l.slice(1))}</option>`).join("")}</select>
          </label>
          <label class="field"><span>${esc(t("pack.loaderVersion"))}</span>
            <input class="input" id="pack-up-loader-version" placeholder="${esc(t("pack.loaderAuto"))}" value="${esc(profile.loaderVersion || "")}">
          </label>
          <label class="field"><span>${esc(t("pack.newName"))}</span>
            <input class="input" id="pack-up-name" maxlength="60" value="${esc(profile.name)}" disabled>
          </label>
        </div>
        <div class="pack-modes">
          <label class="pack-mode is-on"><input type="radio" name="pack-mode" value="current" checked><span><b>${esc(t("pack.updateCurrent"))}</b><small>${esc(t("pack.updateCurrentSub", { n: count("mod") }))}</small></span></label>
          <label class="pack-mode"><input type="radio" name="pack-mode" value="new"><span><b>${esc(t("pack.createNew"))}</b><small>${esc(t("pack.createNewSub"))}</small></span></label>
        </div>
        <div class="notice warn"><svg class="ico"><use href="#i-alert"></use></svg><div><p>${esc(t("pack.pendingWarning"))}</p></div></div>
        <div class="modal-actions"><button class="btn btn-quiet" data-close>${esc(t("common.cancel"))}</button><button class="btn btn-primary" id="pack-up-apply">${esc(t("pack.applyUpdate"))}</button></div>`, () => {
        const nameInput = $("#pack-up-name");
        $$("input[name=pack-mode]", $("#modal-root")).forEach((radio) => radio.addEventListener("change", () => {
          nameInput.disabled = radio.value !== "new" || !radio.checked;
          $$(".pack-mode", $("#modal-root")).forEach((el) => el.classList.toggle("is-on", el.contains(radio) && radio.checked));
        }));
        $("#pack-up-apply").addEventListener("click", async () => {
          const version = $("#pack-up-version").value;
          const loader = $("#pack-up-loader").value;
          const loaderVersion = $("#pack-up-loader-version").value.trim() || null;
          const mode = $$("input[name=pack-mode]", $("#modal-root")).find((r) => r.checked)?.value || "current";
          const name = nameInput.value.trim() || profile.name;
          if (!version) return;
          const btn = $("#pack-up-apply");
          btn.disabled = true;
          try {
            let targetId = id;
            if (mode === "new") {
              const cfg = await invoke("profile_clone", { id, name, versionId: version, loader, loaderVersion });
              targetId = cfg?.activeProfile || id;
            } else {
              await invoke("profile_set_version", { id, versionId: version, loader, loaderVersion });
            }
            let disabled = [];
            try {
              disabled = await invoke("mods_quarantine", { id: targetId, version, loader });
            } catch {}
            closeModal();
            await refreshBoot();
            openPack(targetId);
            toast(disabled.length ? t("pack.updateDone", { n: disabled.length }) : t("pack.updateClean"));
          } catch (err) {
            btn.disabled = false;
            toast(friendly(err), "err");
          }
        });
      });
    });

    const paintCats = () => {
      const box = $("#pack-add-cats");
      box.innerHTML = [`<button class="cat-chip ${addCat === "all" ? "is-on" : ""}" data-addcat="all">${esc(t("discover.all"))}</button>`]
        .concat(PACK_CATS[addKind].map((cat) => `<button class="cat-chip ${addCat === cat ? "is-on" : ""}" data-addcat="${cat}">${esc(catLabel(cat))}</button>`))
        .join("");
    };
    const paintAdd = () => {
      const host = $("#pack-add-results");
      host.innerHTML = addRows();
      applyImgFallback(host, "img", artFor);
      renderAddPager();
    };
    const renderAddPager = () => {
      const host = $("#pack-add-pager");
      if (!host) return;
      const offset = (addPage - 1) * addPer;
      const known = offset + addResults.length + (addHasMore ? 1 : 0);
      host.hidden = addBusy || (!addResults.length && addPage === 1);
      if (host.hidden) return;
      const countEl = $("#pack-add-page-count");
      if (countEl) countEl.textContent = `${offset + 1}–${offset + addResults.length} · ${t("catalog.resultsCount", { n: known })}`;
      const pages = Math.max(1, Math.ceil(known / addPer));
      const from = Math.max(1, Math.min(addPage - 2, pages - 4));
      const to = Math.min(pages, from + 4);
      const nums = [];
      for (let i = from; i <= to; i++) nums.push(i);
      $("#pack-add-pages").innerHTML = [
        `<button class="pager-btn" data-addpage="${addPage - 1}" ${addPage <= 1 ? "disabled" : ""} aria-label="prev"><svg class="ico"><use href="#i-chevron"></use></svg></button>`,
        ...nums.map((n) => `<button class="pager-btn ${n === addPage ? "is-on" : ""}" data-addpage="${n}">${n}</button>`),
        `<button class="pager-btn" data-addpage="${addPage + 1}" ${!addHasMore ? "disabled" : ""} aria-label="next"><svg class="ico"><use href="#i-chevron"></use></svg></button>`,
      ].join("");
      const perSelect = $("#pack-add-per");
      if (perSelect) perSelect.value = String(addPer);
    };
    const searchAdd = async (text, resetPage = true) => {
      const q = String(text ?? "").trim();
      if (resetPage) addPage = 1;
      const token = ++addToken;
      addBusy = true;
      addResults = [];
      paintAdd();
      try {
        const results = await invoke("catalog_search", {
          query: q,
          kind: addKind,
          version: baseOf(profile.versionId) || profile.versionId,
          loader: addKind === "mod" ? profile.loader || "fabric" : null,
          provider: addProvider,
          category: addCat === "all" ? null : addCat,
          sort: addSort,
          limit: addPer,
          offset: (addPage - 1) * addPer,
        });
        if (token !== addToken) return;
        addLoaded = true;
        addHasMore = (results || []).length >= addPer;
        addResults = results || [];
      } catch (err) {
        if (token !== addToken) return;
        addResults = [];
        toast(friendly(err), "err");
      } finally {
        if (token === addToken) {
          addBusy = false;
          paintAdd();
        }
      }
    };
    const resetAdd = (q) => {
      addCat = "all";
      addPage = 1;
      const input = $("#pack-add-search");
      input.value = q;
      paintCats();
      searchAdd(q, true);
    };
    $("#pack-add-kinds").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-addkind]");
      if (!btn) return;
      addKind = btn.dataset.addkind;
      addCat = "all";
      addPage = 1;
      $$("#pack-add-kinds .pd-subtab").forEach((el) => el.classList.toggle("is-on", el === btn));
      resetAdd("");
    });
    $("#pack-add-cats").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-addcat]");
      if (!chip) return;
      addCat = chip.dataset.addcat;
      addPage = 1;
      paintCats();
      searchAdd($("#pack-add-search").value, true);
    });
    $("#pack-add-sort").addEventListener("change", (e) => {
      addSort = e.target.value;
      searchAdd($("#pack-add-search").value, true);
    });
    $("#pack-add-provider").addEventListener("change", (e) => {
      addProvider = e.target.value;
      searchAdd($("#pack-add-search").value, true);
    });
    $("#pack-add-per").addEventListener("change", (e) => {
      addPer = Number(e.target.value) || 20;
      addPage = 1;
      searchAdd($("#pack-add-search").value, true);
    });
    $("#pack-add-pages").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-addpage]");
      if (!btn || btn.disabled) return;
      const page = Number(btn.dataset.addpage);
      if (!page || page === addPage) return;
      addPage = page;
      searchAdd($("#pack-add-search").value, false);
      $("#pack-add-results").scrollIntoView({ block: "start", behavior: "smooth" });
    });
    let timer;
    $("#pack-add-search").addEventListener("input", (e) => {
      clearTimeout(timer);
      const value = e.target.value;
      timer = setTimeout(() => searchAdd(value), 380);
    });
    $("#pack-add-results").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-pack-install]");
      if (!btn) return;
      btn.disabled = true;
      try {
        await invoke("mods_install", {
          project: btn.dataset.packInstall,
          version: baseOf(profile.versionId) || profile.versionId,
          loader: profile.loader || "fabric",
          kind: addKind,
          provider: btn.dataset.provider,
          profile: id,
        });
        contents = await invoke("profile_contents", { id });
        paint();
        loadIcons();
        $("#pack-status").textContent = statusText();
        $("#pack-mods-count").textContent = String(count("mod") + count("pending"));
        toast(t("pack.added"));
      } catch (err) {
        toast(friendly(err), "err");
      } finally {
        btn.disabled = false;
      }
    });
    paintCats();
    paint();
    loadIcons();
    void retryPending(true);
  })();
  applyImgFallback(page, "img", artFor);
}

async function openGameDefaults() {
  let o = {};
  try {
    o = await invoke("game_defaults");
  } catch {}
  const bool = (value) => (value === true ? "true" : value === false ? "false" : "");
  const html = `
    <h3>${esc(t("set.gameDefaults"))}</h3>
    <p>${esc(t("set.gameDefaultsSub"))}</p>
    <div class="opt-grid">
      ${optionSelect("language", t("opt.language"), MC_LANGUAGES, o.language)}
      ${optionNumber("maxFps", t("opt.maxFps"), o.maxFps, 10, 1000)}
      ${optionSelect("vsync", "VSync", [["true", t("opt.on")], ["false", t("opt.off")]], bool(o.vsync))}
      ${optionNumber("guiScale", t("opt.guiScale"), o.guiScale, 1, 4)}
      ${optionNumber("renderDistance", t("opt.renderDistance"), o.renderDistance, 2, 32)}
      ${optionSelect("graphics", t("opt.graphics"), [["fast", t("opt.fast")], ["fancy", t("opt.fancy")], ["fabulous", t("opt.fabulous")]], o.graphics)}
      ${optionSelect("particles", t("opt.particles"), [["all", t("opt.particlesAll")], ["decreased", t("opt.particlesDecreased")], ["minimal", t("opt.particlesMinimal")]], o.particles)}
      ${optionSelect("music", t("opt.music"), [["true", t("opt.on")], ["false", t("opt.off")]], bool(o.music))}
      ${optionSelect("sound", t("opt.sound"), [["true", t("opt.on")], ["false", t("opt.off")]], bool(o.sound))}
      ${optionSelect("fullscreen", "Fullscreen", [["true", t("opt.on")], ["false", t("opt.off")]], bool(o.fullscreen))}
      ${optionSelect("gpu", t("opt.gpu"), [["high", t("opt.gpuHigh")], ["default", t("opt.gpuDefault")]], o.gpu)}
    </div>
    <div class="modal-actions">
      <button class="btn btn-soft" data-close>${esc(t("common.cancel"))}</button>
      <button class="btn btn-primary" id="gd-save">${esc(t("common.save"))}</button>
    </div>`;
  openModal(html, () => {
    $("#gd-save").addEventListener("click", async () => {
      const result = {};
      $$("[data-opt]").forEach((el) => {
        const value = el.value;
        if (!value) return;
        result[el.dataset.opt] = value === "true" ? true : value === "false" ? false : value;
      });
      $$("[data-optnum]").forEach((el) => {
        if (el.value === "") return;
        const n = Number(el.value);
        if (Number.isFinite(n)) result[el.dataset.optnum] = n;
      });
      try {
        await invoke("set_game_defaults", { defaults: result });
        await refreshBoot();
        closeModal();
        toast(t("toast.optionsSaved"));
      } catch (err) {
        toast(friendly(err), "err");
      }
    });
  });
}

function openInstanceOptions(id) {
  const profile = profileById(id);
  if (!profile) return;
  const o = profile.options || {};
  const bool = (value) => (value === true ? "true" : value === false ? "false" : "");
  const html = `
    <h3>${esc(t("opt.title"))}</h3>
    <p>${esc(t("opt.sub", { name: profile.name }))}</p>
    <div class="opt-grid">
      ${optionSelect("language", t("opt.language"), MC_LANGUAGES, o.language)}
      ${optionNumber("maxFps", t("opt.maxFps"), o.maxFps, 10, 1000)}
      ${optionSelect("vsync", "VSync", [["true", t("opt.on")], ["false", t("opt.off")]], o.vsync === undefined ? "" : bool(o.vsync))}
      ${optionNumber("guiScale", t("opt.guiScale"), o.guiScale, 1, 4)}
      ${optionNumber("renderDistance", t("opt.renderDistance"), o.renderDistance, 2, 32)}
      ${optionSelect("graphics", t("opt.graphics"), [["fast", t("opt.fast")], ["fancy", t("opt.fancy")], ["fabulous", t("opt.fabulous")]], o.graphics)}
      ${optionSelect("particles", t("opt.particles"), [["all", t("opt.particlesAll")], ["decreased", t("opt.particlesDecreased")], ["minimal", t("opt.particlesMinimal")]], o.particles)}
      ${optionSelect("music", t("opt.music"), [["true", t("opt.on")], ["false", t("opt.off")]], bool(o.music))}
      ${optionSelect("sound", t("opt.sound"), [["true", t("opt.on")], ["false", t("opt.off")]], bool(o.sound))}
      ${optionSelect("fullscreen", "Fullscreen", [["true", t("opt.on")], ["false", t("opt.off")]], bool(o.fullscreen))}
      ${optionSelect("gpu", t("opt.gpu"), [["high", t("opt.gpuHigh")], ["default", t("opt.gpuDefault")]], o.gpu)}
      ${optionSelect("memoryMb", t("opt.memory"), [["2048", "2 GB"], ["3072", "3 GB"], ["4096", "4 GB"], ["6144", "6 GB"], ["8192", "8 GB"], ["10240", "10 GB"], ["12288", "12 GB"]], o.memoryMb ? String(o.memoryMb) : "")}
    </div>
    <div class="mem-hint">
      <div><b>${esc(t("opt.memRecoTitle"))}</b><span id="opt-mem-hint"></span></div>
      <button class="btn btn-soft btn-sm" id="opt-mem-apply">${esc(t("opt.memApply"))}</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-quiet" id="opt-reset">${esc(t("common.reset"))}</button>
      <button class="btn btn-soft" data-close>${esc(t("common.cancel"))}</button>
      <button class="btn btn-primary" id="opt-save">${esc(t("common.save"))}</button>
    </div>`;
  openModal(html, () => {
    const active = profile.id === activeProfile()?.id;
    const mods = active ? S.mods.length : 0;
    const ram = Number(S.system?.specs?.ramGb) || 16;
    let reco = mods > 30 ? 8192 : mods > 0 ? 6144 : 4096;
    reco = Math.min(reco, Math.max(2048, Math.floor(ram / 2) * 1024), 8192);
    const hint = $("#opt-mem-hint");
    if (hint) hint.textContent = t("opt.memHint", { gb: Math.round(reco / 1024), mods });
    $("#opt-mem-apply")?.addEventListener("click", () => {
      const select = $("[data-opt=\"memoryMb\"]");
      if (select) select.value = String(reco);
    });
    const collect = () => {
      const result = {};
      $$("[data-opt]").forEach((el) => {
        const key = el.dataset.opt;
        const value = el.value;
        if (!value) return;
        result[key] = key === "memoryMb" ? Number(value) : value === "true" ? true : value === "false" ? false : value;
      });
      $$("[data-optnum]").forEach((el) => {
        if (el.value === "") return;
        const n = Number(el.value);
        if (Number.isFinite(n)) result[el.dataset.optnum] = n;
      });
      return result;
    };
    $("#opt-save").addEventListener("click", async () => {
      try {
        await invoke("profile_set_options", { id, options: collect() });
        await refreshBoot();
        closeModal();
        toast(t("toast.optionsSaved"));
      } catch (err) {
        toast(friendly(err), "err");
      }
    });
    $("#opt-reset").addEventListener("click", async () => {
      try {
        await invoke("profile_set_options", { id, options: {} });
        await refreshBoot();
        closeModal();
        toast(t("toast.optionsSaved"));
      } catch (err) {
        toast(friendly(err), "err");
      }
    });
  });
}

async function askDeleteProfile(id) {
  const profile = profileById(id);
  if (!profile) return;
  openModal(`<h3>${esc(t("confirm.deleteProfile"))}</h3><p>${esc(t("instances.deleteText", { name: profile.name }))}</p>
    <label style="display:flex;gap:9px;align-items:center;margin-top:14px;font-size:12px;color:var(--muted)"><input type="checkbox" id="profile-del-files" style="accent-color:var(--accent)"> ${esc(t("instances.deleteFiles"))}</label>
    <div class="modal-actions"><button class="btn btn-quiet" data-close>${esc(t("common.cancel"))}</button><button class="btn btn-danger" id="profile-del-ok">${esc(t("common.delete"))}</button></div>`, () => {
    $("#profile-del-ok").addEventListener("click", async () => {
      try {
        await invoke("profile_remove", { id, deleteFiles: $("#profile-del-files").checked });
        closeModal();
        await refreshBoot();
        renderAll();
        toast(t("toast.profileRemoved"));
      } catch (err) {
        toast(friendly(err), "err");
      }
    });
  });
}

/* ------------------------------------------------------------------ accounts */

function renderAccounts() {
  const host = $("#account-list");
  if (!host) return;
  if (!S.accounts.length) {
    host.innerHTML = `<div class="empty" style="padding:34px"><svg class="ico"><use href="#i-user"></use></svg><p>${esc(t("accounts.empty"))}</p></div>`;
    return;
  }
  host.innerHTML = S.accounts.map((a) => {
    const active = S.active === a.id;
    return `<article class="acard ${active ? "is-active" : ""}">
      <img src="${esc(avatarFor(a))}" alt="" data-seed="${esc(a.name)}">
      <div class="am"><h3>${esc(a.name)}</h3><p>${esc(isMsAccount(a) ? t("accounts.msKind") : t("accounts.offlineKind"))}</p></div>
      <div class="acard-actions">
        ${active ? `<span class="chip chip-soft">${esc(t("common.active"))}</span>` : `<button class="btn btn-soft btn-sm" data-account-use="${esc(a.id)}">${esc(t("accounts.activate"))}</button>`}
        <button class="btn btn-quiet icon-only" data-account-remove="${esc(a.id)}" title="${esc(t("common.remove"))}"><svg class="ico"><use href="#i-trash"></use></svg></button>
      </div>
    </article>`;
  }).join("");
  applyImgFallback(host, "img", fallbackAvatar);
}

function bindAccounts() {
  $("#offline-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#offline-name").value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return toast(t("errors.badName"), "err");
    try {
      await invoke("add_offline_account", { name });
      $("#offline-name").value = "";
      await refreshBoot();
      renderAll();
      toast(t("toast.accountAdded"));
    } catch (err) {
      toast(friendly(err), "err");
    }
  });
  $("#ms-login").addEventListener("click", startMsLogin);
  $("#account-list").addEventListener("click", async (e) => {
    const use = e.target.closest("[data-account-use]");
    if (use) {
      try {
        await invoke("set_account", { id: use.dataset.accountUse });
        await refreshBoot();
        renderAll();
      } catch (err) { toast(friendly(err), "err"); }
      return;
    }
    const remove = e.target.closest("[data-account-remove]");
    if (remove) {
      const ok = await confirmAction(t("confirm.removeAccount"), t("confirm.removeAccountText"), t("common.remove"));
      if (!ok) return;
      try {
        await invoke("remove_account", { id: remove.dataset.accountRemove });
        await refreshBoot();
        renderAll();
        toast(t("toast.removed"));
      } catch (err) { toast(friendly(err), "err"); }
    }
  });
}

async function startMsLogin() {
  try {
    const flow = await invoke("ms_login");
    S.msFlow = flow;
    openModal(`<h3>${esc(t("accounts.deviceTitle"))}</h3><p>${esc(t("accounts.deviceText"))}</p>
      <div class="code-box"><b>${esc(flow.userCode)}</b><button class="btn btn-soft btn-sm" id="copy-code"><svg class="ico"><use href="#i-copy"></use></svg><span>${esc(t("common.copy"))}</span></button></div>
      <p class="hint">${esc(t("accounts.waiting"))}</p>
      <div class="modal-actions"><button class="btn btn-quiet" data-close-cancel>${esc(t("common.cancel"))}</button><button class="btn btn-primary" id="open-verify"><svg class="ico"><use href="#i-external"></use></svg><span>${esc(t("accounts.open"))}</span></button></div>`, () => {
      $("#copy-code").addEventListener("click", () => copyText(flow.userCode));
      $("#open-verify").addEventListener("click", () => openUrl(flow.verificationUri));
    });
    openUrl(flow.verificationUri);
  } catch (err) {
    toast(friendly(err), "err");
  }
}

/* ------------------------------------------------------------------ settings */

function valueOf(key, fallback) {
  return S.settings[key] !== undefined && S.settings[key] !== null ? S.settings[key] : fallback;
}

function fillSettings() {
  const s = S.settings;
  const lang = $("#language-select");
  const langs = [{ code: "auto", name: t("lang.auto") }, ...i18n.languages];
  lang.innerHTML = langs.map((l) => `<option value="${esc(l.code)}">${esc(l.name)}</option>`).join("");
  lang.value = s.language || "auto";
  setSegmented("#theme-choice", "data-theme-choice", s.uiTheme || "dark");
  setSegmented("#accent-choice", "data-accent", s.uiAccent || "aqua");
  const customInput = $("#accent-custom");
  if (customInput) customInput.value = hexRgb(s.uiAccentCustom) ? s.uiAccentCustom : "#5ce8dc";
  const themeHost = $("#theme-presets");
  if (themeHost) {
    themeHost.innerHTML = THEMES.map((theme) => {
      const on = (s.uiBackground === theme.bg && s.uiAccent === theme.accent) || (theme.id === "ocean" && s.uiBackground === "ocean" && !THEMES.some((x) => x.bg === s.uiBackground && x.accent === s.uiAccent));
      return `<button class="theme-card ${on ? "is-on" : ""}" data-theme-preset="${theme.id}"><span class="theme-swatch" data-swatch="${theme.id}"></span><span>${esc(t(`theme.${theme.id}`))}</span></button>`;
    }).join("");
  }
  setSegmented("#radius-choice", "data-radius-choice", s.uiRadius || "soft");
  setSegmented("#density-choice", "data-density-choice", s.uiDensity || "normal");
  setSegmented("#bg-choice", "data-bg-choice", s.uiBackground || "ocean");
  if ($("#bg-custom")) $("#bg-custom").value = s.uiBgCustom || "#071420";
  setSegmented("#wall-choice", "data-wall", s.uiWallpaper || "deep");
  setSegmented("#side-choice", "data-side-choice", s.uiSidebar || "left");
  setSegmented("#rail-choice", "data-rail-choice", s.uiSidebarMode || "full");
  setSegmented("#play-pos-choice", "data-play-pos", s.uiPlayPosition || "left");

  $("#scale-range").value = Number(s.uiScale) || 100;
  $("#scale-value").textContent = `${Number(s.uiScale) || 100}%`;
  paintRange($("#scale-range"));
  $("#wall-blur").value = Number(s.uiWallpaperBlur) ?? 18;
  $("#wall-blur-value").textContent = String(Number(s.uiWallpaperBlur) || 0);
  paintRange($("#wall-blur"));
  $("#wall-dim").value = Number(s.uiWallpaperDim) || 45;
  $("#wall-dim-value").textContent = `${Number(s.uiWallpaperDim) || 0}%`;
  paintRange($("#wall-dim"));
  $("#glass-range").value = Number(s.uiGlass) ?? 62;
  $("#glass-value").textContent = `${Number(s.uiGlass) || 0}%`;
  paintRange($("#glass-range"));
  $("#wall-path").textContent = s.uiWallpaperPath ? String(s.uiWallpaperPath).split(/[\\/]/).pop() : t("set.none");

  setSwitch("#motion-switch", s.uiMotion !== false);
  setSwitch("#fullscreen-switch", Boolean(s.fullscreen));
  setSwitch("#close-switch", Boolean(s.closeOnLaunch));
  setSwitch("#experimental-switch", s.allowExperimental === true);
  setSwitch("#snapshots-switch", s.showSnapshots !== false);
  setSwitch("#old-switch", s.showOld !== false);
  setSwitch("#auto-update-switch", s.autoUpdate !== false);
  setSwitch("#discord-switch", s.discordRpc === true);
  if ($("#discord-client")) $("#discord-client").value = s.discordClientId || "";
  setSwitch("#flags-switch", s.optimizedFlags !== false);
  setSwitch("#auto-java-switch", s.autoJava !== false);
  setSwitch("#strict-switch", s.strictMods !== false);
  setSwitch("#auto-repair-switch", s.autoRepair !== false);

  $("#res-width").value = Number(s.width) || 925;
  $("#res-height").value = Number(s.height) || 530;
  $("#memory-range").value = Number(s.memoryMb) || 4096;
  $("#memory-value").textContent = i18n.bytes((Number(s.memoryMb) || 4096) * 1024 * 1024);
  paintRange($("#memory-range"));
  $("#workers-range").value = Number(s.downloadWorkers) || 16;
  $("#workers-value").textContent = i18n.number(Number(s.downloadWorkers) || 16);
  paintRange($("#workers-range"));
  $("#jvm-args").value = s.jvmArgs || "";
  $("#java-path").value = s.javaPath || "";
  $("#game-dir").textContent = S.boot?.gameDir || "—";
  $("#save-state").textContent = S.dirty ? t("settings.unsaved") : t("settings.savedState");
  $("#save-state").classList.toggle("is-dirty", S.dirty);
  renderOrderEditors();
  fillDiscoverVersions();
  planDiscoverVisibility();
  renderModHealth();
  renderSystem();
}

function setSegmented(selector, attr, value) {
  $$(`${selector} [${attr}]`).forEach((el) => el.classList.toggle("is-on", el.getAttribute(attr) === value));
}
function setSwitch(selector, on) {
  $(selector)?.classList.toggle("is-on", Boolean(on));
}
function paintRange(el) {
  if (!el) return;
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const value = Number(el.value) || 0;
  el.style.setProperty("--fill", `${((value - min) / Math.max(1, max - min)) * 100}%`);
}

function showDirtyBar(on) {
  const bar = $("#dirty-bar");
  if (bar) bar.hidden = !on;
}

function markDirty() {
  let dirty = true;
  try {
    dirty = JSON.stringify(S.settings) !== JSON.stringify(S.savedSettings || {});
  } catch {}
  S.dirty = dirty;
  const state = $("#save-state");
  if (state) {
    state.textContent = dirty ? t("settings.unsaved") : t("settings.savedState");
    state.classList.toggle("is-dirty", dirty);
  }
  showDirtyBar(dirty);
}

function applyTexts() {
  let map = {};
  try { map = JSON.parse(S.settings.uiText || "{}") || {}; } catch {}
  S.uiText = map;
  $$("[data-edit-key]").forEach((el) => {
    const value = map[el.dataset.editKey];
    if (typeof value === "string" && value.trim()) el.textContent = value;
  });
}

async function setEdit(on) {
  S.edit = on;
  document.documentElement.dataset.edit = on ? "on" : "off";
  $("#edit-btn")?.classList.toggle("is-on", on);
  const label = $("#edit-mode-btn")?.querySelector("span");
  if (label) label.textContent = t(on ? "edit.disable" : "edit.enable");
  $$("[data-edit-key]").forEach((el) => {
    el.contentEditable = on ? "true" : "false";
    el.spellcheck = false;
  });
  $$("#widgets .widget").forEach((el) => { el.draggable = on; });
  let bar = $("#edit-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "edit-bar";
    bar.className = "edit-bar";
    bar.innerHTML = `<svg class="ico"><use href="#i-grip"></use></svg>
      <div><b>${esc(t("edit.barTitle"))}</b><small>${esc(t("edit.barHint"))}</small></div>
      <button class="btn btn-quiet btn-sm" id="edit-reset">${esc(t("edit.reset"))}</button>
      <button class="btn btn-primary btn-sm" id="edit-done">${esc(t("edit.done"))}</button>`;
    document.body.append(bar);
    $("#edit-done").addEventListener("click", () => setEdit(false));
    $("#edit-reset").addEventListener("click", () => {
      S.uiText = {};
      S.settings.uiText = "";
      i18n.apply(document);
      applyTexts();
      renderWidgets();
      S.editChanged = true;
      toast(t("edit.resetDone"));
    });
  }
  bar.hidden = !on;
  if (!on && S.editChanged) {
    S.editChanged = false;
    try {
      await invoke("save_settings", { settings: S.settings });
      S.dirty = false;
      showDirtyBar(false);
      const state = $("#save-state");
      if (state) { state.textContent = t("settings.savedState"); state.classList.remove("is-dirty"); }
      toast(t("edit.saved"));
    } catch (err) {
      toast(friendly(err), "err");
    }
  }
}

function renderOrderEditors() {
  const labels = {
    home: t("nav.home"), library: t("nav.library"), discover: t("nav.discover"),
    instances: t("nav.instances"), accounts: t("nav.accounts"),
  };
  renderOrderList($("#nav-order"), S.uiNav, (id) => labels[id] || id, (items) => {
    S.uiNav = items;
    S.settings.uiNav = JSON.stringify(items);
    markDirty();
    buildRail();
  });
  renderOrderList($("#widget-order"), S.uiLayout, (id) => t(WIDGET_META[id]?.title || id), (items) => {
    S.uiLayout = items;
    S.settings.uiLayout = JSON.stringify(items);
    markDirty();
    renderWidgets();
  });
}

function renderOrderList(host, items, labelOf, onChange) {
  if (!host) return;
  const icons = {
    home: "i-home", library: "i-library", discover: "i-compass", instances: "i-layers", accounts: "i-user",
    stats: "i-gauge", pc: "i-cpu", latest: "i-sparkles", console: "i-terminal",
  };
  host.innerHTML = items.map((item) => `<div class="layout-card ${item.on ? "" : "is-hidden"}" data-id="${esc(item.id)}" draggable="true">
    <span class="lc-grip" aria-hidden="true">${ico("i-grip")}</span>
    <span class="lc-icon">${ico(icons[item.id] || WIDGET_META[item.id]?.icon || "i-layers")}</span>
    <span class="lc-name">${esc(labelOf(item.id))}</span>
    <button class="icon-btn lc-eye" data-visible title="${esc(t("common.visible"))}" aria-pressed="${item.on}"><svg class="ico"><use href="#${item.on ? "i-check" : "i-close"}"></use></svg></button>
  </div>`).join("");
  host.onclick = (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    if (e.target.closest("[data-visible]")) {
      const item = items.find((x) => x.id === row.dataset.id);
      if (item) {
        item.on = !item.on;
        onChange(items);
        renderOrderEditors();
      }
    }
  };
  let dragId = null;
  host.ondragstart = (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    dragId = row.dataset.id;
    row.classList.add("is-drag");
    e.dataTransfer.effectAllowed = "move";
  };
  host.ondragover = (e) => {
    e.preventDefault();
    const row = e.target.closest("[data-id]");
    $$(".layout-card", host).forEach((el) => el.classList.toggle("is-over", el === row && el.dataset.id !== dragId));
  };
  host.ondragleave = () => $$(".layout-card", host).forEach((el) => el.classList.remove("is-over"));
  host.ondrop = (e) => {
    e.preventDefault();
    const target = e.target.closest("[data-id]");
    $$(".layout-card", host).forEach((el) => el.classList.remove("is-over", "is-drag"));
    if (!target || !dragId || target.dataset.id === dragId) return;
    const from = items.findIndex((x) => x.id === dragId);
    const to = items.findIndex((x) => x.id === target.dataset.id);
    if (from < 0 || to < 0) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    onChange(items);
    renderOrderEditors();
  };
  host.ondragend = () => {
    dragId = null;
    $$(".layout-card", host).forEach((el) => el.classList.remove("is-over", "is-drag"));
  };
}

async function checkUpdate(manual = false) {
  const state = $("#update-state");
  if (manual && state) state.textContent = t("common.loading");
  try {
    const info = await invoke("check_update");
    S.update = info;
    if (info?.available) {
      const banner = $("#update-banner");
      if (banner) banner.hidden = false;
      const label = $("#update-version");
      if (label) label.textContent = `v${info.latest}`;
      if (state) state.textContent = t("update.available", { version: `v${info.latest}` });
      if (manual) toast(t("update.available", { version: `v${info.latest}` }));
      if (S.settings?.autoUpdate && info.asset) downloadUpdate(true);
    } else {
      if (state) state.textContent = t("update.latest");
      if (manual) toast(t("update.latest"));
    }
  } catch {
    if (state) state.textContent = t("update.failed");
    if (manual) toast(t("update.failed"), "err");
  }
}

function setUpdateButton(labelKey) {
  const label = $("#update-label");
  if (label) label.textContent = t(labelKey);
}

async function downloadUpdate(auto = false) {
  const info = S.update;
  if (!info?.available || S.updateBusy) return;
  if (info.path) return installUpdate();
  if (!info.asset) {
    openUrl(info.url || `${LINKS.github}/releases/latest`);
    return;
  }
  S.updateBusy = true;
  setUpdateButton("update.downloading");
  const detail = $("#update-detail");
  if (detail) detail.textContent = "0%";
  try {
    const path = await invoke("download_update", { url: info.asset, filename: info.assetName || "aqua-update.exe" });
    info.path = path;
    setUpdateButton("update.restart");
    if (detail) detail.textContent = "100%";
    if (!auto) toast(t("update.ready"));
  } catch (err) {
    if (detail) detail.textContent = "";
    setUpdateButton("update.download");
    toast(friendly(err), "err");
  } finally {
    S.updateBusy = false;
  }
}

async function installUpdate() {
  const path = S.update?.path;
  if (!path || S.updateBusy) {
    downloadUpdate();
    return;
  }
  try {
    await invoke("install_update", { path });
  } catch (err) {
    toast(friendly(err), "err");
  }
}

function bindSettings() {
  $("#settings-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) activateTab(tab.dataset.tab);
  });
  $("#settings-save").addEventListener("click", saveSettings);
  $("#language-select").addEventListener("change", (e) => {
    S.settings.language = e.target.value;
    i18n.init(e.target.value);
    i18n.apply(document);
    applyTexts();
    buildRail();
    fillSettings();
    renderAll();
    markDirty();
    toast(t("toast.langChanged"));
  });

  bindSegChoice("#theme-choice", "data-theme-choice", "uiTheme", (v) => { applyAppearance(S.settings); });
  bindSegChoice("#accent-choice", "data-accent", "uiAccent", (value) => {
    if (value === "custom") {
      S.settings.uiAccentCustom = $("#accent-custom")?.value || S.settings.uiAccentCustom || "#5ce8dc";
    }
    applyAppearance(S.settings);
  });
  $("#accent-custom").addEventListener("input", (e) => {
    S.settings.uiAccent = "custom";
    S.settings.uiAccentCustom = e.target.value;
    setSegmented("#accent-choice", "data-accent", "custom");
    $$("#theme-presets .theme-card").forEach((card) => card.classList.remove("is-on"));
    applyAppearance(S.settings);
    markDirty();
  });
  $("#accent-custom").addEventListener("click", (e) => e.stopPropagation());
  $("#theme-presets").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-preset]");
    if (!btn) return;
    const theme = THEMES.find((x) => x.id === btn.dataset.themePreset);
    if (!theme) return;
    S.settings.uiBackground = theme.bg;
    S.settings.uiAccent = theme.accent;
    S.settings.uiTheme = theme.light ? "light" : "dark";
    S.settings.uiWallpaperPath = null;
    $$("#theme-presets .theme-card").forEach((el) => el.classList.toggle("is-on", el === btn));
    setSegmented("#theme-choice", "data-theme-choice", S.settings.uiTheme);
    setSegmented("#accent-choice", "data-accent", theme.accent);
    setSegmented("#bg-choice", "data-bg-choice", theme.bg);
    applyAppearance(S.settings);
    markDirty();
  });
  bindSegChoice("#radius-choice", "data-radius-choice", "uiRadius", () => applyAppearance(S.settings));
  bindSegChoice("#density-choice", "data-density-choice", "uiDensity", () => applyAppearance(S.settings));
  bindSegChoice("#bg-choice", "data-bg-choice", "uiBackground", () => applyAppearance(S.settings));
  $("#bg-custom")?.addEventListener("input", (e) => {
    S.settings.uiBackground = "custom";
    S.settings.uiBgCustom = e.target.value;
    setSegmented("#bg-choice", "data-bg-choice", "custom");
    applyAppearance(S.settings);
    markDirty();
  });
  bindSegChoice("#wall-choice", "data-wall", "uiWallpaper", () => applyAppearance(S.settings));
  bindSegChoice("#side-choice", "data-side-choice", "uiSidebar", () => applyAppearance(S.settings));
  bindSegChoice("#rail-choice", "data-rail-choice", "uiSidebarMode", () => applyAppearance(S.settings));
  bindSegChoice("#play-pos-choice", "data-play-pos", "uiPlayPosition", () => applyAppearance(S.settings));

  $("#scale-range").addEventListener("input", (e) => {
    S.settings.uiScale = Number(e.target.value);
    $("#scale-value").textContent = `${e.target.value}%`;
    paintRange(e.target);
    applyAppearance(S.settings);
    markDirty();
  });
  $("#wall-blur").addEventListener("input", (e) => {
    S.settings.uiWallpaperBlur = Number(e.target.value);
    $("#wall-blur-value").textContent = e.target.value;
    applyAppearance(S.settings);
    paintRange(e.target);
    markDirty();
  });
  $("#wall-dim").addEventListener("input", (e) => {
    S.settings.uiWallpaperDim = Number(e.target.value);
    $("#wall-dim-value").textContent = `${e.target.value}%`;
    applyAppearance(S.settings);
    paintRange(e.target);
    markDirty();
  });
  $("#glass-range").addEventListener("input", (e) => {
    S.settings.uiGlass = Number(e.target.value);
    $("#glass-value").textContent = `${e.target.value}%`;
    applyAppearance(S.settings);
    paintRange(e.target);
    markDirty();
  });
  $("#wall-pick").addEventListener("click", async () => {
    try {
      const path = await invoke("pick_wallpaper");
      if (!path) return;
      S.settings.uiWallpaperPath = path;
      applyAppearance(S.settings);
      $("#wall-path").textContent = path.split(/[\\/]/).pop();
      markDirty();
    } catch (err) {
      toast(friendly(err), "err");
    }
  });

  $("#wall-clear").addEventListener("click", () => {
    S.settings.uiWallpaperPath = null;
    applyAppearance(S.settings);
    markDirty();
  });

  bindSwitch("#motion-switch", "uiMotion", () => applyAppearance(S.settings));
  bindSwitch("#fullscreen-switch", "fullscreen");
  bindSwitch("#close-switch", "closeOnLaunch");
  bindSwitch("#experimental-switch", "allowExperimental", () => { renderAll(); });
  bindSwitch("#snapshots-switch", "showSnapshots", () => { renderAll(); });
  bindSwitch("#old-switch", "showOld", () => { renderAll(); });
  bindSwitch("#auto-update-switch", "autoUpdate");
  bindSwitch("#discord-switch", "discordRpc");
  $("#discord-client")?.addEventListener("input", (e) => {
    S.settings.discordClientId = e.target.value.trim();
    markDirty();
  });
  bindSwitch("#flags-switch", "optimizedFlags");
  bindSwitch("#auto-java-switch", "autoJava");
  bindSwitch("#strict-switch", "strictMods");
  bindSwitch("#auto-repair-switch", "autoRepair");

  $("#res-width").addEventListener("change", (e) => { S.settings.width = Number(e.target.value) || 925; markDirty(); });
  $("#res-height").addEventListener("change", (e) => { S.settings.height = Number(e.target.value) || 530; markDirty(); });
  $("#memory-range").addEventListener("input", (e) => {
    S.settings.memoryMb = Number(e.target.value);
    $("#memory-value").textContent = i18n.bytes(S.settings.memoryMb * 1024 * 1024);
    paintRange(e.target);
    markDirty();
  });
  $("#workers-range").addEventListener("input", (e) => {
    S.settings.downloadWorkers = Number(e.target.value);
    $("#workers-value").textContent = i18n.number(S.settings.downloadWorkers);
    paintRange(e.target);
    markDirty();
  });
  $("#jvm-args").addEventListener("input", (e) => { S.settings.jvmArgs = e.target.value; markDirty(); });
  $("#java-path").addEventListener("input", (e) => { S.settings.javaPath = e.target.value; markDirty(); });
  $("#java-browse").addEventListener("click", async () => {
    try {
      const path = await invoke("pick_java");
      if (!path) return;
      $("#java-path").value = path;
      S.settings.javaPath = path;
      markDirty();
    } catch {
      /* dialog cancelled */
    }
  });
  $("#java-check").addEventListener("click", async () => {
    const result = $("#java-result");
    result.textContent = t("common.loading");
    try {
      const major = await invoke("check_java", { path: $("#java-path").value });
      result.textContent = major ? t("set.javaFound", { version: major }) : t("set.javaMissing");
    } catch {
      result.textContent = t("set.javaMissing");
    }
  });
  $("#java-graal")?.addEventListener("click", async () => {
    const button = $("#java-graal");
    button.disabled = true;
    try {
      const path = await invoke("java_install_graalvm");
      if (path) {
        $("#java-path").value = path;
        S.settings.javaPath = path;
        S.settings.autoJava = false;
        $("#java-result").textContent = t("set.javaFound", { version: 21 });
        toast(t("toast.javaInstalled"));
        markDirty();
      }
    } catch (err) {
      toast(friendly(err), "err");
    } finally {
      button.disabled = false;
    }
  });
  $("#system-apply").addEventListener("click", applyRecommendation);
  $("#connection-check").addEventListener("click", async () => {
    const state = $("#connection-state");
    state.textContent = t("common.loading");
    try {
      await invoke("remote_versions", { refresh: true });
      state.textContent = t("toast.connected");
      toast(t("toast.connected"));
    } catch {
      state.textContent = t("status.offline");
      toast(t("toast.offline"), "err");
    }
  });
  $("#update-check").addEventListener("click", () => checkUpdate(true));
  $("#game-defaults-edit").addEventListener("click", openGameDefaults);
  $("#update-open").addEventListener("click", () => {
    if (S.update?.path) installUpdate();
    else if (S.update?.available) downloadUpdate();
    else openUrl(S.update?.url || `${LINKS.github}/releases/latest`);
  });
  $("#update-hide").addEventListener("click", () => { $("#update-banner").hidden = true; });
  $("#update-notes")?.addEventListener("click", () => {
    const info = S.update;
    if (!info) return;
    openModal(`
      <h3>${esc(t("update.title"))} · v${esc(info.latest)}</h3>
      <div class="pd-markdown" style="max-height:46vh;margin-top:10px">${mdToHtml(info.notes || info.url || "")}</div>
      <div class="modal-actions">
        <button class="btn btn-soft" data-close>${esc(t("common.cancel"))}</button>
        <button class="btn btn-primary" id="update-modal-open">${esc(t("update.download"))}</button>
      </div>`, () => {
      $("#update-modal-open")?.addEventListener("click", () => openUrl(info.url));
    });
  });
  $$("[data-open]").forEach((btn) => btn.addEventListener("click", async () => {
    try { await invoke("open_dir", { kind: btn.dataset.open }); } catch (err) { toast(friendly(err), "err"); }
  }));
  $("#stats-reset").addEventListener("click", async () => {
    const ok = await confirmAction(t("confirm.resetStats"), t("confirm.resetStatsText"), t("common.reset"));
    if (!ok) return;
    try {
      await invoke("stats_reset");
      await refreshBoot();
      renderAll();
      toast(t("toast.statsReset"));
    } catch (err) { toast(friendly(err), "err"); }
  });
  $("#factory-reset").addEventListener("click", async () => {
    const ok = await confirmAction(t("confirm.resetSettings"), t("confirm.resetSettingsText"), t("common.reset"));
    if (!ok) return;
    try {
      await invoke("reset_settings");
      await refreshBoot();
      applyAppearance(S.settings);
      i18n.init(S.settings.language || "auto");
      i18n.apply(document);
      applyTexts();
      renderAll();
      toast(t("toast.settingsReset"));
    } catch (err) { toast(friendly(err), "err"); }
  });
  $("#about-github").addEventListener("click", () => openUrl(LINKS.github));
  $("#layout-reset").addEventListener("click", () => {
    S.uiNav = NAV_DEFAULT.map((id) => ({ id, on: true }));
    S.uiLayout = WIDGET_DEFAULT.map((id) => ({ id, on: true }));
    S.settings.uiNav = JSON.stringify(S.uiNav);
    S.settings.uiLayout = JSON.stringify(S.uiLayout);
    S.settings.uiSidebar = "left";
    S.settings.uiSidebarMode = "full";
    S.settings.uiPlayPosition = "left";
    markDirty();
    fillSettings();
    applyAppearance(S.settings);
    buildRail();
    renderWidgets();
  });
}

function bindSegChoice(selector, attr, field, after) {
  const host = $(selector);
  if (!host) return;
  host.addEventListener("click", (e) => {
    const btn = e.target.closest(`[${attr}]`);
    if (!btn) return;
    S.settings[field] = btn.getAttribute(attr);
    host.querySelectorAll(`[${attr}]`).forEach((el) => el.classList.toggle("is-on", el === btn));
    markDirty();
    after?.(btn.getAttribute(attr));
  });
}

function bindSwitch(selector, field, after) {
  const el = $(selector);
  if (!el) return;
  el.addEventListener("click", () => {
    const on = !el.classList.contains("is-on");
    el.classList.toggle("is-on", on);
    S.settings[field] = on;
    markDirty();
    after?.(on);
  });
}

async function saveSettings() {
  try {
    await invoke("save_settings", { settings: S.settings });
    S.savedSettings = JSON.parse(JSON.stringify(S.settings || {}));
    S.dirty = false;
    showDirtyBar(false);
    const state = $("#save-state");
    if (state) {
      state.textContent = t("settings.savedState");
      state.classList.remove("is-dirty");
    }
    await refreshBoot();
    toast(t("toast.saved"));
  } catch (err) {
    toast(friendly(err), "err");
  }
}

async function discardSettings() {
  S.dirty = false;
  showDirtyBar(false);
  await refreshBoot();
  toast(t("settings.discarded"));
}

function activateTab(name) {
  $$("#settings-tabs [data-tab]").forEach((el) => el.classList.toggle("is-on", el.dataset.tab === name));
  $$(".settings-panel").forEach((el) => el.classList.toggle("is-on", el.dataset.panel === name));
}

function applyRecommendation() {
  const reco = S.system?.recommendation;
  if (!reco) return;
  S.settings.memoryMb = reco.memoryMb;
  S.settings.width = reco.width;
  S.settings.height = reco.height;
  $("#memory-range").value = reco.memoryMb;
  $("#memory-value").textContent = i18n.bytes(reco.memoryMb * 1024 * 1024);
  $("#res-width").value = reco.width;
  $("#res-height").value = reco.height;
  paintRange($("#memory-range"));
  markDirty();
  toast(t("toast.applied"));
}

function renderSystem() {
  const reco = $("#system-reco");
  const specsHost = $("#system-specs");
  const shadersHost = $("#shader-estimates");
  if (!reco || !specsHost || !shadersHost) return;
  const report = S.system;
  if (!report) {
    reco.innerHTML = `<svg class="ico"><use href="#i-cpu"></use></svg><div><b>${esc(t("common.loading"))}</b><span>${esc(t("widget.pcSub"))}</span></div>`;
    specsHost.innerHTML = "";
    shadersHost.innerHTML = "";
    return;
  }
  const specs = report.specs;
  const rec = report.recommendation;
  const packGb = Math.min(S.mods.length > 30 ? 8 : S.mods.length > 0 ? 6 : 4, Math.max(2, Math.floor(specs.ramGb / 2)));
  reco.innerHTML = `<svg class="ico"><use href="#i-zap"></use></svg><div><b>${esc(t(`tier.${rec.tier}`))}</b><span>${esc(t("set.reco", { ram: rec.memoryMb / 1024, distance: rec.renderDistance }))}</span><span>${esc(t("set.recoPack", { gb: packGb, mods: S.mods.length }))}</span></div>`;
  const rows = [
    [t("pc.cpu"), `${specs.cpu} · ${i18n.number(specs.cores)}C/${i18n.number(specs.threads)}T`],
    [t("pc.gpu"), specs.gpu],
    [t("pc.ram"), `${i18n.number(specs.ramGb)} GB`],
    [t("pc.disk"), `${i18n.number(specs.diskFreeGb)} / ${i18n.number(specs.diskTotalGb)} GB`],
    [t("pc.os"), specs.os],
  ];
  specsHost.innerHTML = rows.map(([k, v]) => `<div class="spec"><span>${esc(k)}</span><b title="${esc(v)}">${esc(v)}</b></div>`).join("");
  shadersHost.innerHTML = (rec.shaders || []).map((s) => `<div class="shader"><b>${esc(t(`shader.${s.id}`))}</b><span>${i18n.number(s.fpsLow)}–${i18n.number(s.fpsHigh)} FPS · ${esc(t(`verdict.${s.verdict}`))}</span></div>`).join("");
}

function fillDiscoverProfiles() {
  const select = $("#discover-profile");
  if (!select) return;
  if (!S.discoverProfile) S.discoverProfile = S.boot?.activeProfile || S.profiles[0]?.id || "";
  select.innerHTML = S.profiles.length
    ? S.profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === S.discoverProfile ? "selected" : ""}>${esc(p.name)} · ${esc(p.versionId)}</option>`).join("")
    : `<option value="">${esc(t("discover.activeProfile"))}</option>`;
  if (!S.profiles.some((p) => p.id === S.discoverProfile)) {
    S.discoverProfile = S.profiles[0]?.id || "";
    select.value = S.discoverProfile;
  }
}

function fillDiscoverVersions() {
  const select = $("#discover-version");
  if (!select) return;
  fillDiscoverProfiles();
  const releases = sortVersions(S.remote.filter((v) => v.kind === "release"), "new");
  const installed = S.local.map((v) => baseOf(v.id)).filter(Boolean);
  const all = [...new Set([...installed, ...releases.map((v) => v.id)])];
  if (!S.discoverVersion) {
    const profile = activeProfile();
    S.discoverVersion = profile ? baseOf(profile.versionId) : all[0] || "1.21.8";
  }
  select.innerHTML = all.map((id) => `<option value="${esc(id)}" ${id === S.discoverVersion ? "selected" : ""}>${esc(id)}</option>`).join("");
  if (!all.includes(S.discoverVersion) && all.length) {
    S.discoverVersion = all[0];
    select.value = S.discoverVersion;
  }
}

function closeCatalogPanel() {
  const panel = $("#discover-panel");
  const btn = $("#discover-filters");
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  btn?.setAttribute("aria-expanded", "false");
}

function bindDiscover() {
  $("#discover-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-kind]");
    if (!tab || tab.dataset.kind === S.discoverKind) return;
    S.discoverKind = tab.dataset.kind;
    S.discoverCat = "all";
    S.discoverQuery = "";
    S.discoverPage = 1;
    const input = $("#discover-search");
    if (input) input.value = "";
    $$("#discover-tabs .tab").forEach((el) => el.classList.toggle("is-on", el === tab));
    planDiscoverVisibility();
    S.discoverResults = [];
    searchDiscover(true);
  });
  $("#discover-cats").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-cat]");
    if (!chip) return;
    S.discoverCat = chip.dataset.cat;
    renderDiscoverCats();
    renderDiscoverActive();
    searchDiscover(true);
  });
  let timer = 0;
  $("#discover-search").addEventListener("input", (e) => {
    S.discoverQuery = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => searchDiscover(true), 420);
  });
  $("#discover-sort").addEventListener("change", (e) => {
    S.discoverSort = e.target.value;
    searchDiscover(true);
  });
  $("#discover-version").addEventListener("change", (e) => {
    S.discoverVersion = e.target.value;
    searchDiscover(true);
  });
  $("#discover-loader").addEventListener("change", (e) => {
    S.discoverLoader = e.target.value;
    searchDiscover(true);
  });
  $("#discover-profile")?.addEventListener("change", (e) => {
    S.discoverProfile = e.target.value;
    const profile = profileById(S.discoverProfile);
    if (profile) {
      S.discoverVersion = baseOf(profile.versionId) || profile.versionId;
      if (/forge|neoforge|fabric/i.test(profile.loader || "")) S.discoverLoader = /neoforge/i.test(profile.loader) ? "neoforge" : /forge/i.test(profile.loader) ? "forge" : "fabric";
      const versionSelect = $("#discover-version");
      if (versionSelect) versionSelect.value = S.discoverVersion;
      const loaderSelect = $("#discover-loader");
      if (loaderSelect) loaderSelect.value = S.discoverLoader;
    }
    searchDiscover(true);
  });
  $("#discover-provider").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-provider]");
    if (!btn) return;
    S.discoverProvider = btn.dataset.provider;
    $$("#discover-provider [data-provider]").forEach((el) => el.classList.toggle("is-on", el === btn));
    searchDiscover(true);
  });
  $("#discover-filters").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $("#discover-panel");
    panel.hidden = !panel.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("#discover-panel").addEventListener("click", (e) => e.stopPropagation());
  $("#discover-panel-close").addEventListener("click", closeCatalogPanel);
  $("#discover-panel-apply").addEventListener("click", () => {
    closeCatalogPanel();
    searchDiscover(true);
  });
  document.addEventListener("click", closeCatalogPanel);
  $("#discover-reset").addEventListener("click", () => {
    S.discoverProvider = "modrinth";
    S.discoverCat = "all";
    S.discoverQuery = "";
    S.discoverSort = "featured";
    S.discoverPage = 1;
    $$("#discover-provider [data-provider]").forEach((el) => el.classList.toggle("is-on", el.dataset.provider === "modrinth"));
    const input = $("#discover-search");
    if (input) input.value = "";
    const sort = $("#discover-sort");
    if (sort) sort.value = "featured";
    renderDiscoverCats();
    searchDiscover(true);
  });
  $("#discover-active").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-clear]");
    if (!chip) return;
    const field = chip.dataset.clear;
    if (field === "provider") {
      S.discoverProvider = "modrinth";
      $$("#discover-provider [data-provider]").forEach((el) => el.classList.toggle("is-on", el.dataset.provider === "modrinth"));
    } else if (field === "cat") {
      S.discoverCat = "all";
      renderDiscoverCats();
    } else if (field === "loader") {
      S.discoverLoader = "fabric";
      const el = $("#discover-loader");
      if (el) el.value = "fabric";
    } else if (field === "version") {
      S.discoverVersion = "";
      const el = $("#discover-version");
      if (el) el.value = "";
    }
    searchDiscover(true);
  });
  $("#discover-pages").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (!btn || btn.disabled) return;
    const page = Number(btn.dataset.page);
    if (!page || page === S.discoverPage) return;
    S.discoverPage = page;
    searchDiscover(false);
    $("#view").scrollTo({ top: 0, behavior: "smooth" });
  });
  $("#discover-per").addEventListener("change", (e) => {
    S.discoverPer = Number(e.target.value) || 20;
    S.discoverPage = 1;
    searchDiscover(true);
  });
  $("#discover-refresh").addEventListener("click", () => searchDiscover(true));
  $("#discover-results").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-install]");
    if (btn) {
      const hit = S.discoverResults.find((r) => r.id === btn.dataset.install);
      if (hit) installProject(hit);
      return;
    }
    const card = e.target.closest("[data-project]");
    if (card) openProject(card.dataset.project);
  });
  $("#mods-search").addEventListener("input", (e) => {
    S.modsQuery = e.target.value;
    renderMods();
  });
  $("#fabric-create").addEventListener("click", installDiscoverLoader);
  $("#mods-repair").addEventListener("click", repairMods);
  $("#settings-mods-repair").addEventListener("click", repairMods);
}

/* ------------------------------------------------------------------ modal */

function openModal(html, bind, wide = false) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal ${wide ? "modal-wide" : ""}">${html}</div>`;
  root.hidden = false;
  root.onclick = (e) => {
    if (e.target === root) closeModal();
  };
  $$("[data-close]", root).forEach((el) => el.addEventListener("click", closeModal));
  $$("[data-close-cancel]", root).forEach((el) => el.addEventListener("click", async () => {
    try { await invoke("ms_cancel"); } catch {}
    closeModal();
  }));
  bind?.();
}

function closeModal() {
  const root = $("#modal-root");
  root.hidden = true;
  root.innerHTML = "";
  root.onclick = null;
}

function confirmAction(title, text, label) {
  return new Promise((resolve) => {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal"><h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="modal-actions"><button class="btn btn-quiet" id="confirm-cancel">${esc(t("common.cancel"))}</button><button class="btn btn-danger" id="confirm-ok">${esc(label)}</button></div></div>`;
    root.hidden = false;
    const done = (value) => {
      root.hidden = true;
      root.innerHTML = "";
      root.onclick = null;
      resolve(value);
    };
    root.onclick = (e) => { if (e.target === root) done(false); };
    $("#confirm-cancel").addEventListener("click", () => done(false));
    $("#confirm-ok").addEventListener("click", () => done(true));
  });
}

/* ------------------------------------------------------------------ navigation */

function go(page, tab) {
  if (!page) return;
  if (S.dirty && S.page === "settings" && page !== "settings") {
    showDirtyBar(true);
    toast(t("settings.unsavedHint"), "warn");
    return;
  }
  S.page = page;
  $$(".page").forEach((el) => { el.hidden = el.dataset.page !== page; });
  $$("[data-nav]").forEach((el) => el.classList.toggle("is-on", el.dataset.nav === page));
  $("#view").scrollTop = 0;
  closeVersionMenu();
  if (tab) activateTab(tab);
  if (page === "discover") {
    loadMods();
    if (!S.discoverResults.length && !S.discoverBusy) searchDiscover();
  }
  if (page === "instances") renderInstances();
  if (page === "accounts") renderAccounts();
  if (page === "settings") fillSettings();
  if (page === "home") renderWidgets();
}

/* ------------------------------------------------------------------ backend events */

function appendLog(text, kind = "") {
  const line = String(text ?? "").replace(/\s+$/, "");
  if (!line) return;
  const level = kind || (/error|exception|failed|crash/i.test(line) ? "err" : /started|loaded|done/i.test(line) ? "ok" : "");
  S.log.push({ text: line, kind: level });
  if (S.log.length > 300) S.log.splice(0, S.log.length - 300);
  const body = $("#console-body");
  if (body) {
    const span = document.createElement("span");
    span.className = `ln ${level}`;
    span.textContent = line;
    body.append(span);
    body.scrollTop = body.scrollHeight;
  }
}

async function bindBackend() {
  await listen("install://progress", (e) => updateDownload(e.payload || {}));
  await listen("update://progress", (e) => {
    const p = e.payload || {};
    const total = Number(p.total || 0);
    const bytes = Number(p.bytes || 0);
    const pct = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0;
    if (S.update) S.update.percent = pct;
    const detail = $("#update-detail");
    if (detail) detail.textContent = total > 0 ? `${pct}% · ${i18n.bytes(bytes)} / ${i18n.bytes(total)}` : `${i18n.bytes(bytes)}`;
  });
  await listen("mods://progress", (e) => {
    const p = e.payload || {};
    showBar("download", `${i18n.number(p.done || 0)} ${t("progress.files")}`, 0);
  });
  await listen("game://log", (e) => {
    const p = e.payload;
    appendLog(typeof p === "string" ? p : p?.line || p?.text || "");
  });
  await listen("game://started", (e) => {
    S.running = e.payload?.version || S.selected;
    appendLog(`Started ${S.running}`, "ok");
    syncPlay();
  });
  await listen("game://exit", (e) => {
    const version = e.payload?.version || S.running;
    S.running = null;
    appendLog(`Exited ${version ?? ""} (${e.payload?.code ?? 0})`, "ok");
    syncPlay();
    refreshBoot().then(() => renderAll());
  });
  await listen("auth://done", async () => {
    closeModal();
    S.msFlow = null;
    await refreshBoot();
    renderAll();
    toast(t("toast.msSignedIn"));
  });
  await listen("auth://error", (e) => {
    const p = e.payload;
    closeModal();
    S.msFlow = null;
    toast(friendly(typeof p === "string" ? p : p?.message || "auth"), "err");
  });
}

/* ------------------------------------------------------------------ static bindings */

function bindStatic() {
  $("#rail-nav").addEventListener("click", (e) => {
    const item = e.target.closest("[data-nav]");
    if (item) go(item.dataset.nav);
  });
  $("#nav-settings").addEventListener("click", () => go("settings"));
  $("#account-card").addEventListener("click", () => go("accounts"));
  $("#play-btn").addEventListener("click", handlePlay);
  $("#fabric-btn").addEventListener("click", installFabric);
  $("#version-trigger").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleVersionMenu();
  });
  $("#version-menu").addEventListener("click", (e) => {
    const item = e.target.closest("[data-pick]");
    if (!item) return;
    if (item.dataset.profilePick) {
      closeVersionMenu();
      return activateProfile(item.dataset.profilePick);
    }
    setSelected(item.dataset.pick);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".select-wrap")) closeVersionMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeVersionMenu();
      if (!$("#modal-root").hidden) closeModal();
    }
  });
  $("#customize-btn").addEventListener("click", () => go("settings", "layout"));
  $("#download-hide").addEventListener("click", () => hideBar());

  $("#dirty-save").addEventListener("click", saveSettings);
  $("#dirty-discard").addEventListener("click", discardSettings);
  $("#edit-btn")?.addEventListener("click", () => setEdit(!S.edit));
  $("#edit-mode-btn").addEventListener("click", () => setEdit(!S.edit));
  $("#theme-btn").addEventListener("click", () => {
    const next = resolveTheme(S.settings.uiTheme || "dark") === "light" ? "dark" : "light";
    S.settings.uiTheme = next;
    applyAppearance(S.settings);
    setSegmented("#theme-choice", "data-theme-choice", next);
    markDirty();
  });

  document.addEventListener("input", (e) => {
    const el = e.target.closest?.("[data-edit-key]");
    if (!el || !S.edit) return;
    const key = el.dataset.editKey;
    const value = el.textContent.replace(/\s+/g, " ").trim();
    const map = { ...(S.uiText || {}) };
    if (value) map[key] = value; else delete map[key];
    S.uiText = map;
    S.settings.uiText = JSON.stringify(map);
    S.editChanged = true;
  });

  let dragWidget = null;
  const widgets = $("#widgets");
  widgets.addEventListener("dragstart", (e) => {
    const w = e.target.closest("[data-widget]");
    if (!S.edit || !w) { e.preventDefault(); return; }
    dragWidget = w.dataset.widget;
    w.classList.add("is-drag");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragWidget);
  });
  widgets.addEventListener("dragover", (e) => {
    if (!S.edit || !dragWidget) return;
    const w = e.target.closest("[data-widget]");
    if (!w || w.dataset.widget === dragWidget) return;
    e.preventDefault();
    const rect = w.getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    $$("#widgets .widget").forEach((el) => el.classList.remove("drop-before", "drop-after"));
    w.classList.add(after ? "drop-after" : "drop-before");
  });
  widgets.addEventListener("drop", (e) => {
    if (!S.edit || !dragWidget) return;
    const w = e.target.closest("[data-widget]");
    const target = w?.dataset.widget;
    const after = w?.classList.contains("drop-after");
    $$("#widgets .widget").forEach((el) => el.classList.remove("drop-before", "drop-after", "is-drag"));
    if (!w || target === dragWidget) return;
    e.preventDefault();
    const from = S.uiLayout.findIndex((x) => x.id === dragWidget);
    let to = S.uiLayout.findIndex((x) => x.id === target);
    if (from < 0 || to < 0) return;
    const [item] = S.uiLayout.splice(from, 1);
    if (from < to) to -= 1;
    S.uiLayout.splice(to + (after ? 1 : 0), 0, item);
    S.settings.uiLayout = JSON.stringify(S.uiLayout);
    S.editChanged = true;
    dragWidget = null;
    renderWidgets();
  });
  widgets.addEventListener("dragend", () => {
    dragWidget = null;
    $$("#widgets .widget").forEach((el) => el.classList.remove("drop-before", "drop-after", "is-drag"));
  });

  $("#win-min").addEventListener("click", () => invoke("win_minimize"));
  $("#win-max").addEventListener("click", () => invoke("win_toggle_maximize"));
  $("#win-close").addEventListener("click", async () => {
    if (S.dirty) {
      const ok = await confirmAction(t("settings.unsaved"), t("settings.unsavedHint"), t("settings.discard"));
      if (!ok) return;
    }
    invoke("win_close");
  });

  bindLibrary();
  bindDiscover();
  bindInstances();
  bindAccounts();
  bindSettings();

  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    if (S.settings.uiTheme === "system") applyAppearance(S.settings);
  });
  window.addEventListener("resize", () => {
    if (!$("#version-menu").hidden) fitVersionMenu();
  });
}

/* ------------------------------------------------------------------ init */

async function loadRemote() {
  try {
    const [remote, banners, system] = await Promise.all([
      invoke("remote_versions", { refresh: false }),
      invoke("version_banners"),
      invoke("system_report", { refresh: false }).catch(() => null),
    ]);
    S.remote = remote || [];
    S.banners = banners || [];
    S.system = system;
    renderHero();
    renderLibrary();
    renderWidgets();
    renderSystem();
    fillDiscoverVersions();
  } catch (err) {
    console.warn("remote load failed", err);
  }
}

async function init() {
  try {
    const boot = await invoke("bootstrap");
    applyBoot(boot, true);
    bindStatic();
    await bindBackend();
    loadRemote();
    loadMods();
    checkUpdate();
  } catch (err) {
    console.error(err);
    setStatus(t("status.offline"), "error");
    toast(friendly(err), "err");
  }
}

await init();

