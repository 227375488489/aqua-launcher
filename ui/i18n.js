import { LOCALES, DEFAULT_LOCALE } from "./locales.js";
import { EXTRA } from "./lang/extra.js";

const flatCache = new Map();

function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, path, out);
    else out[path] = String(value);
  }
  return out;
}

function stringsFor(code) {
  if (!flatCache.has(code)) {
    const locale = LOCALES[code];
    const table = locale ? flatten(locale.strings) : {};
    if (EXTRA[code]) Object.assign(table, flatten(EXTRA[code]));
    flatCache.set(code, table);
  }
  return flatCache.get(code);
}

function detect() {
  const list = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || ""];
  for (const raw of list) {
    const code = String(raw || "").toLowerCase().split("-")[0];
    if (LOCALES[code]) return code;
  }
  return DEFAULT_LOCALE;
}

export const i18n = {
  code: DEFAULT_LOCALE,
  locale: DEFAULT_LOCALE,
  languages: Object.entries(LOCALES).map(([code, value]) => ({ code, name: value.name })),

  init(language) {
    const code = !language || language === "auto" ? detect() : String(language).toLowerCase().split("-")[0];
    this.code = LOCALES[code] ? code : DEFAULT_LOCALE;
    this.locale = this.code === "en" ? "en" : this.code;
    document.documentElement.lang = this.locale;
    return this.code;
  },

  t(key, vars) {
    const table = stringsFor(this.code);
    let text = table[key];
    if (text === undefined) text = stringsFor(DEFAULT_LOCALE)[key];
    if (text === undefined) {
      const last = String(key).split(".").pop() || key;
      console.warn(`[i18n] missing key: ${key}`);
      return last.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
    }
    if (vars && typeof vars === "object") {
      text = text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
    }
    return text;
  },

  apply(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = this.t(el.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.setAttribute("placeholder", this.t(el.dataset.i18nPh));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const text = this.t(el.dataset.i18nTitle);
      el.setAttribute("title", text);
      el.setAttribute("aria-label", text);
    });
  },

  date(value) {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat(this.locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  },

  number(value) {
    try {
      return new Intl.NumberFormat(this.locale).format(Number(value) || 0);
    } catch {
      return String(Number(value) || 0);
    }
  },

  bytes(value) {
    let n = Number(value) || 0;
    const units = ["B", "KB", "MB", "GB", "TB"];
    let unit = 0;
    while (n >= 1024 && unit < units.length - 1) {
      n /= 1024;
      unit += 1;
    }
    const digits = unit === 0 || n >= 100 ? 0 : n >= 10 ? 1 : 1;
    return `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: digits }).format(n)} ${units[unit]}`;
  },
};
