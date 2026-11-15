// Демо-бэкенд для просмотра интерфейса в обычном браузере.
// В приложении этот файл не загружается: window.__TAURI__ уже существует.

const listeners = new Map();

function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const cb of set) {
    try {
      cb({ event, payload });
    } catch (err) {
      console.error(err);
    }
  }
}

function listen(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return Promise.resolve(() => listeners.get(event)?.delete(cb));
}

const date = (iso) => new Date(iso).toISOString();
const day = 86400000;
const base = Date.parse("2026-11-12T10:00:00Z");

const releases = [
  "26.3", "26.2", "26.1", "1.21.8", "1.21.7", "1.21.6", "1.21.5", "1.21.4",
  "1.21.1", "1.20.6", "1.20.4", "1.20.1", "1.19.4", "1.18.2", "1.17.1",
  "1.16.5", "1.12.2", "1.8.9", "1.7.10",
].map((id, i) => ({ id, kind: "release", releaseTime: date(base - i * 11 * day) }));

const snapshots = [
  "26.4-snapshot-8", "26.4-snapshot-7", "26.4-snapshot-6", "1.21.9-pre1", "25w45a",
].map((id, i) => ({ id, kind: "snapshot", releaseTime: date(base - (i + 1) * 2 * day) }));

const all = [...snapshots, ...releases].sort(
  (a, b) => Date.parse(b.releaseTime) - Date.parse(a.releaseTime),
);

let local = [
  { id: "1.21.8", kind: "release", java: 21, size: 512_400_000 },
  { id: "1.20.1", kind: "release", java: 17, size: 398_100_000 },
];

let accounts = [
  {
    id: "off-1",
    kind: "offline",
    name: "Slavyanin",
    accessToken: null,
    refreshToken: null,
    expiresAt: 0,
  },
  {
    id: "ms-1",
    kind: "microsoft",
    name: "AquaDiver",
    accessToken: "demo",
    refreshToken: "demo",
    expiresAt: Date.now() / 1000 + 86400,
  },
];

let active = "off-1";
let lastVersion = "1.21.8";
let running = false;
let runTimer = null;

let settings = {
  gameDir: null,
  memoryMb: 4096,
  javaPath: null,
  autoJava: true,
  jvmArgs: "",
  optimizedFlags: true,
  closeOnLaunch: false,
  downloadWorkers: 16,
  customResolution: true,
  width: 925,
  height: 530,
  fullscreen: false,
  msClientId: "00000000402b5328",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function install(id) {
  const known = all.find((v) => v.id === id);
  if (!known) throw new Error("Неизвестная версия");

  const stages = [
    ["version", "Манифест версии", 1],
    ["client", "Клиент игры", 12],
    ["libraries", "Библиотеки", 42],
    ["assets", "Ресурсы", 120],
    ["java", "Java", 1],
  ];

  let done = 0;
  let bytes = 0;
  const totalBytes = 240_000_000;

  for (const [stage, label, count] of stages) {
    for (let i = 0; i < count; i += 1) {
      await sleep(stage === "assets" ? 18 : 34);
      done += 1;
      bytes = Math.min(totalBytes, bytes + totalBytes / 176);
      emit("install://progress", {
        stage,
        label,
        current: i + 1,
        total: count,
        bytes: Math.round(bytes),
        totalBytes,
      });
    }
  }

  if (!local.some((v) => v.id === id)) {
    local = [
      { id, kind: known.kind, java: 21, size: 470_000_000 },
      ...local,
    ];
  }
  lastVersion = id;
  return null;
}

function logLine(version) {
  const lines = [
    `[${new Date().toLocaleTimeString("ru-RU")}] [main/INFO]: Loading Minecraft ${version}`,
    "[Render thread/INFO]: OpenGL 4.6 · NVIDIA GeForce RTX 4060",
    "[Render thread/INFO]: Narrator library for x64 successfully loaded",
    "[Server thread/INFO]: Starting integrated minecraft server version",
    "[Server thread/INFO]: Preparing level \"world\"",
    "[Render thread/INFO]: Loaded 1423 recipes",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

const handlers = {
  async bootstrap() {
    return {
      settings,
      accounts,
      active,
      local,
      gameDir: "C:\\Users\\sviat\\AppData\\Roaming\\AquaLauncher\\minecraft",
      dataDir: "C:\\Users\\sviat\\AppData\\Roaming\\AquaLauncher",
      appVersion: "1.0.0",
      running,
      lastVersion,
    };
  },

  async remote_versions(payload) {
    await sleep(payload?.refresh ? 700 : 320);
    return all;
  },

  async install_version({ id }) {
    await install(id);
    return null;
  },

  async launch({ version }) {
    if (running) throw new Error("Игра уже запущена");
    if (!local.some((v) => v.id === version)) throw new Error("Версия не установлена");
    running = true;
    lastVersion = version;
    emit("game://started", { version });
    clearInterval(runTimer);
    runTimer = setInterval(() => emit("game://log", logLine(version)), 1200);
    return null;
  },

  async stop_game() {
    const version = lastVersion ?? "1.21.8";
    clearInterval(runTimer);
    running = false;
    emit("game://exit", { code: 0, version });
    return null;
  },

  async add_offline_account({ name }) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      throw new Error("Ник: 3–16 символов, латиница, цифры и _");
    }
    if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("Такой аккаунт уже добавлен");
    }
    const account = {
      id: `off-${Date.now()}`,
      kind: "offline",
      name,
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
    };
    accounts = [...accounts, account];
    active = account.id;
    return account;
  },

  async remove_account({ id }) {
    accounts = accounts.filter((a) => a.id !== id);
    if (active === id) active = accounts[0]?.id ?? null;
    return null;
  },

  async set_account({ id }) {
    active = id;
    return null;
  },

  async save_settings({ settings: next }) {
    settings = { ...settings, ...next };
    return null;
  },

  async ms_login() {
    setTimeout(() => {
      const account = {
        id: `ms-${Date.now()}`,
        kind: "microsoft",
        name: "NewDiver",
        accessToken: "demo",
        refreshToken: "demo",
        expiresAt: Date.now() / 1000 + 86400,
      };
      accounts = [...accounts.filter((a) => a.name !== account.name), account];
      active = account.id;
      emit("auth://done", account);
    }, 4200);

    return {
      userCode: "QK7R-3M2PX",
      verificationUri: "https://www.microsoft.com/link",
      expiresIn: 900,
      interval: 5,
    };
  },

  async ms_cancel() {
    return null;
  },

  async delete_version({ id }) {
    local = local.filter((v) => v.id !== id);
    if (lastVersion === id) lastVersion = local[0]?.id ?? null;
    return null;
  },

  async open_dir() {
    return null;
  },

  async check_java({ path }) {
    await sleep(400);
    return /java/i.test(path ?? "") ? 21 : null;
  },

  async win_minimize() {},
  async win_toggle_maximize() {},
  async win_close() {},
  version_banners: () => banners(),
};

const BANNER_FALLBACK = [
  ["26.4-snapshot-8", "26.4snapshot8540x540.jpg"],
  ["26.4-snapshot-7", "26.4snapshot7540x540.jpg"],
  ["26.3", "dappledcamp540x540.jpg"],
  ["26.2", "26.2540x540.jpg"],
  ["26.1", "26.1540x540.jpg"],
  ["1.21.11", "1.21.11540x540.jpg"],
  ["1.21.10", "1.21.10540x540.jpg"],
  ["25w45a", "25w45a540x540.jpg"],
].map(([version, file]) => ({
  version,
  image: `https://launchercontent.mojang.com/v2/images/${file}`,
  title: "",
  date: "",
}));

let bannerCache = null;

async function banners() {
  if (bannerCache) return bannerCache;
  try {
    const res = await fetch("https://launchercontent.mojang.com/v2/javaPatchNotes.json");
    const data = await res.json();
    bannerCache = (data.entries ?? [])
      .filter((entry) => entry.image?.url)
      .map((entry) => ({
        version: entry.version,
        image: entry.image.url.startsWith("http")
          ? entry.image.url
          : `https://launchercontent.mojang.com${entry.image.url}`,
        title: entry.title ?? "",
        date: entry.date ?? "",
      }));
    if (!bannerCache.length) bannerCache = BANNER_FALLBACK;
  } catch {
    bannerCache = BANNER_FALLBACK;
  }
  return bannerCache;
}

async function invoke(cmd, payload) {  const fn = handlers[cmd];
  if (!fn) throw new Error(`Неизвестная команда: ${cmd}`);
  return fn(payload);
}

window.__TAURI__ = {
  core: { invoke },
  event: { listen, emit },
  opener: {
    openUrl: async (url) => {
      console.info("[demo] open", url);
    },
  },
};
