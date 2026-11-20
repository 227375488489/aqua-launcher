// Demo backend for previewing the interface in a normal browser.
// The desktop build never loads this file: window.__TAURI__ already exists there.

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

const date = (ms) => new Date(ms).toISOString();
const day = 86_400_000;
const base = Date.parse("2026-11-12T10:00:00Z");
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const releases = ["26.3", "26.2", "26.1", "1.21.8", "1.21.7", "1.21.6", "1.21.5", "1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.20.1", "1.19.4", "1.18.2", "1.17.1", "1.16.5", "1.12.2", "1.8.9", "1.7.10"]
  .map((id, i) => ({ id, kind: "release", releaseTime: date(base - i * 11 * day) }));

const snapshots = ["26.4-snapshot-8", "26.4-snapshot-7", "26.4-snapshot-6", "1.21.9-pre1", "25w45a", "25w44a"]
  .map((id, i) => ({ id, kind: "snapshot", releaseTime: date(base - (i + 1) * 2 * day) }));

const oldies = [["b1.7.3", "old_beta", 700], ["b1.2_01", "old_beta", 718], ["a1.2.6", "old_alpha", 742], ["c0.30_01c", "old_alpha", 760]]
  .map(([id, kind, days]) => ({ id, kind, releaseTime: date(base - days * day) }));

const all = [...snapshots, ...oldies, ...releases].sort((a, b) => Date.parse(b.releaseTime) - Date.parse(a.releaseTime));

let local = [
  { id: "1.21.8", kind: "release", java: 21, size: 512_400_000, loader: "vanilla" },
  { id: "1.20.1", kind: "release", java: 17, size: 398_100_000, loader: "vanilla" },
  { id: "fabric-loader-0.16.10-1.21.8", kind: "release", java: 21, size: 498_200_000, loader: "fabric" },
];

let accounts = [
  { id: "off-1", kind: "offline", name: "Slavyanin", accessToken: null, refreshToken: null, expiresAt: 0 },
  { id: "ms-1", kind: "microsoft", name: "AquaDiver", accessToken: "demo", refreshToken: "demo", expiresAt: now() + 86_400 },
];

let active = "off-1";
let lastVersion = "1.21.8";
let running = null;
let runTimer = null;

const platform = /Mac/i.test(navigator.userAgent) ? "macos" : /Linux/i.test(navigator.userAgent) ? "linux" : "windows";

const packExtras = new Map();
const demoDisabled = new Set();
let profiles = [
  {
    id: "instance-vanilla",
    name: "Vanilla 1.21.8",
    versionId: "1.21.8",
    loader: "vanilla",
    dir: "profiles/instance-vanilla",
    icon: null,
    createdAt: now() - 40 * 86_400,
    options: { maxFps: 120, vsync: false, music: false },
  },
  {
    id: "pack-fabulously-optimized",
    name: "Fabulously Optimized",
    versionId: "fabric-loader-0.16.10-1.21.8",
    loader: "modpack",
    dir: "profiles/pack-fabulously-optimized",
    icon: "https://cdn.modrinth.com/data/1KVo5zza/d8152911f8fd5d7e9a8c499fe89045af81fe816e_96.webp",
    createdAt: now() - 12 * 86_400,
  },
  {
    id: "pack-cobblemon",
    name: "Cobblemon",
    versionId: "fabric-loader-0.16.10-1.21.8",
    loader: "modpack",
    dir: "profiles/pack-cobblemon",
    icon: null,
    createdAt: now() - 3 * 86_400,
  },
];

let activeProfile = "instance-vanilla";

let stats = {
  playtimeSecs: { "1.21.8": 14_520, "1.20.1": 6_120, "fabric-loader-0.16.10-1.21.8": 3_600 },
  launches: 42,
  sessions: 67,
  lastPlayed: now() - 5 * 3600,
};

const demoQuery = new URLSearchParams(location.search);
const pick = (key, fallback) => demoQuery.get(key) ?? fallback;

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
  uiTheme: pick("theme", "dark"),
  uiAccent: pick("accent", "aqua"),
  uiRadius: pick("radius", "soft"),
  uiDensity: pick("density", "normal"),
  uiFont: pick("font", "manrope"),
  uiScale: Number(pick("scale", "100")),
  uiWallpaper: pick("wall", "deep"),
  uiWallpaperPath: null,
  uiWallpaperBlur: 18,
  uiWallpaperDim: 45,
  uiSidebar: pick("side", "left"),
  uiSidebarMode: pick("rail", "full"),
  uiMotion: pick("motion", "on") !== "off",
  uiNav: JSON.stringify(["home", "library", "instances", "discover", "accounts"]),
  uiLayout: JSON.stringify(["stats", "pc", "latest", "instances", "console"]),
  uiBackground: pick("bg", "ocean"),
  uiBgCustom: "#071420",
  uiGrain: true,
  uiGlass: 62,
  uiPlayPosition: pick("playpos", "left"),
  strictMods: true,
  autoRepair: true,
  autoUpdate: true,
  discordRpc: false,
  discordClientId: "",
  allowExperimental: false,
  showSnapshots: true,
  showOld: true,
  language: pick("lang", "ru"),
};
const defaultSettings = structuredClone(settings);

function config() {
  return { settings, accounts, active, lastVersion, profiles, activeProfile, stats };
}

const MODS = [
  { id: "AANobbMI", slug: "sodium", title: "Sodium", author: "jellysquid3", description: "Modern rendering engine that greatly improves performance.", icon: "https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp", downloads: 253_106_880, categories: ["optimization"], kind: "mod" },
  { id: "YL57xq9U", slug: "iris", title: "Iris Shaders", author: "coderbot", description: "A modern shader pack loader for Minecraft.", icon: null, downloads: 84_210_330, categories: ["shaders"], kind: "mod" },
  { id: "gvQqBUqZ", slug: "lithium", title: "Lithium", author: "jellysquid3", description: "No-compromises game logic optimisation.", icon: null, downloads: 120_884_410, categories: ["optimization"], kind: "mod" },
  { id: "P7dR8mSH", slug: "fabric-api", title: "Fabric API", author: "modmuss50", description: "Essential hooks and interoperability for Fabric mods.", icon: null, downloads: 411_002_934, categories: ["library"], kind: "mod" },
  { id: "mOgUt4GM", slug: "mod-menu", title: "Mod Menu", author: "Prospector", description: "Browse and configure installed mods.", icon: null, downloads: 196_441_288, categories: ["utility"], kind: "mod" },
  { id: "1bokaNcj", slug: "xaeros-minimap", title: "Xaero's Minimap", author: "xaero96", description: "A clean, fast minimap with waypoints.", icon: null, downloads: 31_288_402, categories: ["adventure"], kind: "mod" },
  { id: "u6dRKJwZ", slug: "jei", title: "Just Enough Items", author: "mezz", description: "Item and recipe viewing made simple.", icon: null, downloads: 288_114_900, categories: ["utility"], kind: "mod" },
  { id: "LNytGWDc", slug: "create", title: "Create", author: "simibubi", description: "Aesthetic technology with rotating contraptions.", icon: null, downloads: 68_320_911, categories: ["technology"], kind: "mod" },
  { id: "1KVo5zza", slug: "fabulously-optimized", title: "Fabulously Optimized", author: "robotkoer", description: "A simple, performance-focused Fabric modpack.", icon: "https://cdn.modrinth.com/data/1KVo5zza/d8152911f8fd5d7e9a8c499fe89045af81fe816e_96.webp", downloads: 24_118_092, categories: ["optimization"], kind: "modpack" },
  { id: "5FFgwNNP", slug: "cobblemon", title: "Cobblemon", author: "Cobblemon Team", description: "Pokémon in Minecraft, built for Fabric.", icon: null, downloads: 18_902_441, categories: ["adventure", "mobs"], kind: "modpack" },
  { id: "better-mc", slug: "better-mc", title: "Better MC", author: "Luna Pixel", description: "A curated adventure and technology pack.", icon: null, downloads: 9_774_012, categories: ["adventure"], kind: "modpack" },
  { id: "rlcraft", slug: "rlcraft", title: "RLCraft", author: "Shivaxi", description: "Hardcore survival with realistic mechanics.", icon: null, downloads: 7_210_004, categories: ["adventure"], kind: "modpack" },
  { id: "faithful", slug: "faithful-32x", title: "Faithful 32x", author: "Faithful Team", description: "A double-resolution vanilla-style resource pack.", icon: null, downloads: 41_002_771, categories: ["32x"], kind: "resourcepack" },
  { id: "stay-true", slug: "stay-true", title: "Stay True", author: "Fredboi", description: "A soft, hand-drawn take on the vanilla look.", icon: null, downloads: 6_118_204, categories: ["16x"], kind: "resourcepack" },
  { id: "complementary", slug: "complementary", title: "Complementary Shaders", author: "EminGT", description: "Balanced shaders with strong performance.", icon: null, downloads: 28_441_550, categories: ["shaders"], kind: "shader" },
  { id: "bsl", slug: "bsl-shaders", title: "BSL Shaders", author: "capttatsu", description: "Cinematic lighting with a soft palette.", icon: null, downloads: 19_881_402, categories: ["shaders"], kind: "shader" },
];

let installedMods = [  { file: "fabric-api-0.130.0+26.3.jar", name: "Fabric API", id: "fabric-api", version: "0.130.0", loader: "fabric", size: 1_930_482, depends: [], risk: "low", notes: [] },
  { file: "iris-fabric-1.11.7+mc26.3.jar", name: "Iris Shaders", id: "iris", version: "1.11.7", loader: "fabric", size: 2_741_882, depends: ["sodium"], risk: "low", notes: [] },
  { file: "lithium-fabric-0.18.4+mc26.3.jar", name: "Lithium", id: "lithium", version: "0.18.4", loader: "fabric", size: 641_220, depends: [], risk: "low", notes: [] },
  { file: "sodium-extra-0.6.3.jar", name: "Sodium Extra", id: "sodium-extra", version: "0.6.3", loader: "fabric", size: 318_442, depends: ["sodium", "fabric-api"], risk: "medium", notes: ["sodium_extra.class touches memory directly"] },
  { file: "sodium-fabric-0.9.3.jar", name: "Sodium", id: "sodium", version: "0.9.3", loader: "fabric", size: 1_914_521, depends: [], risk: "low", notes: [] },
];

const UNSPLASH = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80";

async function runInstall(kind, id) {
  const stages = kind === "pack"
    ? [["pack", "Modpack files", 24], ["libraries", "Libraries", 12]]
    : [["version", "Version data", 1], ["client", "Client jar", 1], ["libraries", "Libraries", 18], ["assets", "Assets", 26], ["java", "Java runtime", 1]];
  const totalBytes = kind === "pack" ? 180_000_000 : 240_000_000;
  let done = 0;
  let bytes = 0;
  const total = stages.reduce((sum, stage) => sum + stage[2], 0);
  for (const [stage, label, count] of stages) {
    for (let i = 0; i < count; i += 1) {
      await sleep(stage === "assets" ? 16 : 28);
      done += 1;
      bytes = Math.min(totalBytes, bytes + totalBytes / total);
      emit("install://progress", {
        stage,
        label,
        current: done,
        total,
        bytes: Math.round(bytes),
        totalBytes,
      });
    }
  }
  if (kind !== "pack" && !local.some((v) => v.id === id)) {
    const known = all.find((v) => v.id === id);
    local = [{ id, kind: known?.kind || "release", java: 21, size: 470_000_000, loader: id.includes("fabric") ? "fabric" : "vanilla" }, ...local];
  }
  lastVersion = id;
}

function logLine(version) {
  const lines = [
    `[main/INFO]: Loading Minecraft ${version}`,
    "[Render thread/INFO]: OpenGL 4.6 · NVIDIA GeForce RTX 4060",
    "[Render thread/INFO]: Narrator library for x64 successfully loaded",
    "[Server thread/INFO]: Starting integrated minecraft server",
    '[Server thread/INFO]: Preparing level "world"',
    "[Render thread/INFO]: Loaded 1423 recipes",
    "[Render thread/INFO]: Loaded 57 advancements",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function profileFromPack(hit) {
  const slug = hit.slug || hit.id;
  const id = `pack-${slug}`;
  const existing = profiles.find((p) => p.id === id);
  if (existing) return existing;
  return {
    id,
    name: hit.title,
    versionId: "fabric-loader-0.16.10-1.21.8",
    loader: "modpack",
    dir: `profiles/${id}`,
    icon: hit.icon || null,
    createdAt: now(),
  };
}

const handlers = {
  async bootstrap() {
    await sleep(120);
    return {
      settings,
      accounts,
      active,
      local,
      remote: all,
      gameDir: platform === "windows" ? "C:\\Users\\sviat\\AppData\\Roaming\\AquaLauncher\\minecraft" : "/home/sviat/.local/share/AquaLauncher/minecraft",
      activeDir: platform === "windows" ? "C:\\Users\\sviat\\AppData\\Roaming\\AquaLauncher\\minecraft\\profiles\\instance-vanilla" : "/home/sviat/.local/share/AquaLauncher/minecraft/profiles/instance-vanilla",
      dataDir: platform === "windows" ? "C:\\Users\\sviat\\AppData\\Roaming\\AquaLauncher" : "/home/sviat/.local/share/AquaLauncher",
      appVersion: "0.0.4-beta",
      running,
      lastVersion,
      profiles,
      activeProfile,
      stats,
      platform,
    };
  },

  async remote_versions(payload) {
    await sleep(payload?.refresh ? 650 : 260);
    return all;
  },

  async install_version({ id }) {
    await runInstall("version", id);
    return null;
  },

  async fabric_install({ id, loader }) {
    await runInstall("version", id);
    const loaderId = `fabric-loader-${loader || "0.16.10"}-${id}`;
    if (!local.some((v) => v.id === loaderId)) {
      local = [{ id: loaderId, kind: "release", java: 21, size: 498_000_000, loader: "fabric" }, ...local];
    }
    return loaderId;
  },

  async loader_install({ id, loader }) {
    await runInstall("version", id);
    const name = loader === "neoforge" ? "neoforge" : loader === "forge" ? "forge" : "fabric";
    const loaderId = name === "fabric" ? `fabric-loader-0.16.10-${id}` : `${name}-${id}-47.4.13`;
    if (!local.some((v) => v.id === loaderId)) {
      local = [{ id: loaderId, kind: "release", java: 21, size: 520_000_000, loader: name }, ...local];
    }
    return loaderId;
  },

  async launch({ id, version }) {
    const target = id ?? version;
    if (running) throw new Error("game_already_running");
    if (!local.some((v) => v.id === target)) throw new Error("version_not_installed");
    running = target;
    lastVersion = target;
    stats.launches += 1;
    stats.sessions += 1;
    stats.lastPlayed = now();
    emit("game://started", { version: target });
    clearInterval(runTimer);
    runTimer = setInterval(() => emit("game://log", logLine(target)), 1200);
    return null;
  },

  async stop_game() {
    const version = running || lastVersion;
    clearInterval(runTimer);
    running = null;
    emit("game://exit", { code: 0, version });
    return null;
  },

  async add_offline_account({ name }) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error("profile_name_empty");
    if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) throw new Error("account_exists");
    const account = { id: `off-${Date.now()}`, kind: "offline", name, accessToken: null, refreshToken: null, expiresAt: 0 };
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

  async reset_settings() {
    settings = { ...structuredClone(defaultSettings), language: pick("lang", "ru") };
    return config();
  },

  async ms_login() {
    setTimeout(() => {
      const account = { id: `ms-${Date.now()}`, kind: "microsoft", name: "NewDiver", accessToken: "demo", refreshToken: "demo", expiresAt: now() + 86_400 };
      accounts = [...accounts.filter((a) => a.name !== account.name), account];
      active = account.id;
      emit("auth://done", account);
    }, 3200);
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
    profiles = profiles.filter((p) => p.versionId !== id);
    if (lastVersion === id) lastVersion = local[0]?.id ?? null;
    if (!profiles.some((p) => p.id === activeProfile)) activeProfile = profiles[0]?.id ?? null;
    return null;
  },

  async open_dir() {},
  async open_profile() {},
  async pick_wallpaper() {
    await sleep(200);
    return UNSPLASH;
  },
  async pick_folder() {
    await sleep(200);
    return "C:\\Users\\demo\\curseforge\\minecraft\\Instances";
  },
  profile_import({ path }) {
    if (!path) throw new Error("import_path_invalid");
    const id = `import-${Date.now()}`;
    profiles.push({
      id,
      name: "Imported Adventure",
      versionId: "1.21.1",
      loader: "forge",
      loaderVersion: "52.0.1",
      dir: `profiles/${id}`,
      icon: null,
      createdAt: Math.floor(Date.now() / 1000),
      options: {},
    });
    return config();
  },
  async pick_java() {
    await sleep(120);
    return "C:\\Program Files\\GraalVM\\graalvm-jdk-21\\bin\\java.exe";
  },

  async java_install_graalvm() {
    for (let i = 1; i <= 10; i++) {
      emit("install://progress", { stage: "java", label: "GraalVM", current: i, total: 10, bytes: i * 12_400_000, totalBytes: 124_000_000 });
      await sleep(120);
    }
    return "C:\\Users\\demo\\AppData\\Roaming\\AquaLauncher\\java\\graalvm-21.0.2\\bin\\java.exe";
  },

  async check_java({ path }) {
    await sleep(400);
    return /java/i.test(path ?? "") ? 21 : null;
  },

  profiles_list() {
    return profiles;
  },

  profile_activate({ id }) {
    activeProfile = id || null;
    const profile = profiles.find((p) => p.id === id);
    if (profile) lastVersion = profile.versionId;
    return config();
  },

  profile_options({ id }) {
    return profiles.find((p) => p.id === id)?.options || {};
  },

  profile_set_options({ id, options }) {
    const profile = profiles.find((p) => p.id === id);
    if (profile) profile.options = options || {};
    return config();
  },

  profile_set_version({ id, versionId, loader, loaderVersion }) {
    const profile = profiles.find((p) => p.id === id);
    if (profile) {
      profile.versionId = versionId;
      profile.loader = loader || profile.loader;
      profile.loaderVersion = loaderVersion || "";
    }
    return config();
  },

  profile_clone({ id, name, versionId, loader, loaderVersion }) {
    const source = profiles.find((p) => p.id === id);
    const copy = {
      ...(source || {}),
      id: `instance-${Date.now()}`,
      name: name || "New pack",
      versionId,
      loader: loader || source?.loader || "vanilla",
      loaderVersion: loaderVersion || "",
      createdAt: Math.floor(Date.now() / 1000),
    };
    profiles.push(copy);
    activeProfile = copy.id;
    lastVersion = copy.versionId;
    return config();
  },

  profile_set_icon({ id, path }) {
    const profile = profiles.find((p) => p.id === id);
    if (profile) profile.icon = path || null;
    return config();
  },

  mods_quarantine() {
    return [];
  },

  mods_retry_pending() {
    return { restored: [], remaining: [] };
  },

  game_defaults() {
    return settings.gameDefaults || {};
  },

  set_game_defaults({ defaults }) {
    settings.gameDefaults = defaults || {};
    return config();
  },

  profile_contents({ id }) {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) throw new Error("profile_not_found");
    return [
      { file: "sodium-0.6.9.jar", name: "Sodium", kind: "mod", size: 1_240_000, enabled: !demoDisabled.has(`${id}:sodium-0.6.9.jar`) },
      { file: "iris-1.8.1.jar", name: "Iris Shaders", kind: "mod", size: 2_980_000, enabled: !demoDisabled.has(`${id}:iris-1.8.1.jar`) },
      { file: "fabric-api-0.110.0.jar", name: "Fabric API", kind: "mod", size: 2_100_000, enabled: !demoDisabled.has(`${id}:fabric-api-0.110.0.jar`) },
      { file: "Faithful-32x.zip", name: "Faithful 32x", kind: "resourcepack", size: 14_800_000, enabled: true },
      { file: "Complementary.zip", name: "Complementary Reimagined", kind: "shader", size: 4_300_000, enabled: true },
      { file: "Terralith.zip", name: "Terralith", kind: "datapack", size: 9_200_000, enabled: true },
    ].concat((packExtras.get(id) || []).map((item) => ({ ...item, enabled: !demoDisabled.has(`${id}:${item.file}`) })));
  },

  profile_files_action({ id, action, files }) {
    for (const file of files) {
      if (action === "remove") {
        const extra = packExtras.get(id);
        if (extra) packExtras.set(id, extra.filter((m) => m.file !== file));
      } else if (action === "disable") demoDisabled.add(`${id}:${file}`);
      else if (action === "enable") demoDisabled.delete(`${id}:${file}`);
    }
    return null;
  },

  async loader_versions({ id, loader }) {
    if (loader === "vanilla") return [];
    return ["latest", "0.16.9", "0.15.11", "0.15.10"].slice(0, 4);
  },

  profile_file_remove({ id, file }) {
    const extra = packExtras.get(id);
    if (extra) packExtras.set(id, extra.filter((m) => m.file !== file));
    return null;
  },

  profile_create({ name, versionId, loader: wanted, loaderVersion, icon }) {
    if (!name || !name.trim()) throw new Error("profile_name_empty");
    if (!versionId || !versionId.trim()) throw new Error("profile_version_empty");
    const id = `instance-${Date.now()}`;
    const lower = versionId.toLowerCase();
    const loader = wanted || (lower.includes("neoforge") ? "neoforge" : lower.includes("forge") ? "forge" : lower.includes("fabric") ? "fabric" : "vanilla");
    const profile = {
      id,
      name: name.trim(),
      versionId,
      loader,
      loaderVersion: loaderVersion || null,
      dir: `profiles/${id}`,
      icon: icon || null,
      createdAt: now(),
      options: {},
    };
    profiles = [...profiles, profile];
    activeProfile = id;
    lastVersion = versionId;
    return config();
  },

  profile_remove({ id }) {
    profiles = profiles.filter((p) => p.id !== id);
    if (activeProfile === id) activeProfile = profiles[0]?.id ?? null;
    return config();
  },

  stats_reset() {
    stats = { playtimeSecs: {}, launches: 0, sessions: 0, lastPlayed: 0 };
    return config();
  },

  check_update() {
    const demo = new URLSearchParams(location.search).has("update");
    return {
      current: "0.0.4-beta",
      latest: demo ? "0.0.5-beta" : "0.0.4-beta",
      url: "https://github.com/227375488489/aqua-launcher/releases",
      notes: demo ? "## Beta 0.0.5\n\n- Catalog from Modrinth and CurseForge\n- Pack page with content and add-content\n- Pack import and global game defaults" : "",
      published: date(Date.now() - 3 * day),
      available: demo,
      asset: demo ? "https://github.com/227375488489/aqua-launcher/releases/download/v0.0.5-beta/Aqua.Launcher_0.0.5-beta_x64-setup.exe" : "",
      assetName: demo ? "Aqua.Launcher_0.0.5-beta_x64-setup.exe" : "",
    };
  },

  async download_update({ filename }) {
    const total = 12_400_000;
    for (let i = 1; i <= 24; i += 1) {
      await sleep(70);
      emit("update://progress", { bytes: Math.round((total * i) / 24), total });
    }
    return `C:\\Users\\demo\\AppData\\Roaming\\AquaLauncher\\updates\\${filename || "aqua-update.exe"}`;
  },

  async install_update() {
    await sleep(250);
    return null;
  },

  modpack_search({ query }) {
    const term = (query ?? "").toLowerCase();
    return MODS.filter((m) => m.kind === "modpack" && (!term || m.title.toLowerCase().includes(term) || m.description.toLowerCase().includes(term)));
  },

  modrinth_project({ project }) {
    const hit = MODS.find((m) => m.id === project || m.slug === project) || MODS[0];
    const shots = [
      "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=900&q=80",
      "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=900&q=80",
      "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=900&q=80",
    ];
    return {
      ...hit,
      followers: Math.round((hit.downloads || 0) / 42),
      body: `# ${hit.title}\n\n${hit.description}\n\n## What's inside\n\n- Carefully tuned configs for smooth framerates\n- Updated world generation and visuals\n- Works with shaders and resource packs\n\n## Notes\n\nDrop the pack into Aqua Launcher, press install, and the launcher creates an isolated instance with the right loader and Java runtime.`,
      gameVersions: ["26.3", "1.21.8", "1.21.1"],
      loaders: hit.kind === "modpack" ? ["fabric"] : ["fabric", "quilt"],
      clientSide: "required",
      serverSide: "optional",
      published: date(Date.now() - 420 * day),
      updated: date(Date.now() - 6 * day),
      license: "MIT",
      sourceUrl: "https://github.com/example/project",
      issuesUrl: "",
      wikiUrl: "",
      gallery: shots.map((url, index) => ({ url, featured: index === 0, title: index === 0 ? "Overview" : "", description: "" })),
      versions: [
        { id: `${hit.id}-v3`, name: `${hit.title} 3.2`, number: "3.2.0", gameVersions: ["26.3"], loaders: ["fabric"], published: date(Date.now() - 6 * day), downloads: 1_204_311, file: `${hit.slug}-3.2.0.mrpack`, size: 18_400_000 },
        { id: `${hit.id}-v2`, name: `${hit.title} 3.1`, number: "0.1.0", gameVersions: ["1.21.8"], loaders: ["fabric"], published: date(Date.now() - 74 * day), downloads: 2_840_112, file: `${hit.slug}-3.1.0.mrpack`, size: 17_200_000 },
      ],
    };
  },

  modpack_contents() {
    const mods = MODS.filter((m) => m.kind === "mod").slice(0, 8);
    const extras = [
      { id: "faithful", title: "Faithful 32x", slug: "faithful-32x", icon: null, kind: "resourcepack", file: "resourcepacks/Faithful_32x.zip" },
      { id: "complementary", title: "Complementary Shaders", slug: "complementary", icon: null, kind: "shader", file: "shaderpacks/ComplementaryReimagined.zip" },
      { id: "datapack-x", title: "Terralith", slug: "terralith", icon: null, kind: "datapack", file: "datapacks/terralith.zip" },
    ];
    return [
      ...mods.map((m, i) => ({
        id: m.id,
        title: m.title,
        slug: m.slug,
        icon: m.icon,
        file: `mods/${m.slug}-1.${i + 2}.jar`,
        kind: "mod",
        client: i === 0 ? "required" : "optional",
        server: i === 0 ? "unsupported" : "optional",
      })),
      ...extras,
    ].map((x) => ({ client: "optional", server: "optional", ...x }));
  },

  async modpack_install({ project }) {
    const hit = MODS.find((m) => m.id === project || m.slug === project) || MODS.find((m) => m.kind === "modpack");
    await runInstall("pack", hit.id);
    const profile = profileFromPack(hit);
    profiles = [...profiles.filter((p) => p.id !== profile.id), profile];
    activeProfile = profile.id;
    lastVersion = profile.versionId;
    return config();
  },

  version_banners: () => banners(),

  modrinth_search({ query, kind }) {
    const term = (query ?? "").toLowerCase();
    const wanted = kind || "mod";
    return MODS.filter((m) => m.kind === wanted && (!term || m.title.toLowerCase().includes(term) || m.description.toLowerCase().includes(term)));
  },

  curse_search({ query, kind }) {
    const term = (query ?? "").toLowerCase();
    const wanted = kind || "mod";
    return MODS.filter((m) => m.kind === wanted && (!term || m.title.toLowerCase().includes(term) || m.description.toLowerCase().includes(term)))
      .slice(0, 6)
      .map((m) => ({ ...m, id: `cf:${m.slug || m.id}`, provider: "curseforge", sources: ["curseforge"] }));
  },

  catalog_search({ query, kind, provider, category, exclude, sort, limit = 20, offset = 0 }) {
    const source = provider || "modrinth";
    const pick = (fn) => fn({ query, kind });
    let hits = [];
    if (source !== "curseforge") hits = hits.concat(pick((args) => handlers.modrinth_search(args)).map((m) => ({ ...m, provider: "modrinth", sources: ["modrinth"] })));
    if (source !== "modrinth") hits = hits.concat(pick((args) => handlers.curse_search(args)));
    if (source === "both") {
      const merged = [];
      for (const hit of hits) {
        const found = merged.find((m) => m.title.toLowerCase() === hit.title.toLowerCase());
        if (found) {
          found.downloads += hit.downloads;
          found.provider = "both";
          found.sources = [...new Set([...(found.sources || []), ...(hit.sources || [])])];
        } else merged.push({ ...hit });
      }
      hits = merged;
    }
    if (category && category !== "all") {
      hits = hits.filter((hit) => (hit.categories || []).some((c) => String(c).toLowerCase().replace(/\s+/g, "-") === category));
    }
    if (Array.isArray(exclude) && exclude.length) {
      hits = hits.filter((hit) => !(hit.categories || []).some((c) => exclude.includes(String(c).toLowerCase().replace(/\s+/g, "-"))));
    }
    if (sort === "downloads") hits.sort((a, b) => b.downloads - a.downloads);
    else if (sort === "newest") hits.reverse();
    return hits.slice(offset, offset + limit);
  },

  async curse_project({ project }) {
    const id = String(project).replace(/^cf:/, "");
    const hit = MODS.find((m) => m.id === id || m.slug === id) || MODS[0];
    const detail = await handlers.modrinth_project({ project: hit.id });
    return {
      ...detail,
      id: `cf:${id}`,
      title: hit.title,
      sourceUrl: "https://www.curseforge.com/minecraft",
      gallery: detail.gallery,
      versions: (detail.versions || []).map((v, i) => ({ ...v, id: `cf:${id}-${i}` })),
    };
  },

  mods_list: () => installedMods,

  mods_health: () => ({
    total: installedMods.length,
    missing: installedMods.some((m) => m.id === "sodium-extra") && !installedMods.some((m) => m.id === "sodium")
      ? [{ modName: "Sodium Extra", modId: "sodium-extra", need: "sodium" }]
      : [],
  }),

  async mods_install({ project, kind, profile }) {
    await sleep(700);
    const plain = String(project).replace(/^cf:/, "");
    const found = MODS.find((m) => m.id === project || m.slug === project || m.id === plain || m.slug === plain);
    if (!found) throw new Error("catalog");
    const file = `${found.slug}-1.0.0.jar`;
    if (profile) {
      const extra = packExtras.get(profile) || [];
      if (!extra.some((m) => m.file === file)) {
        extra.push({ file, name: found.title, kind: kind || "mod", size: 480_000 });
        packExtras.set(profile, extra);
      }
    }
    if (!installedMods.some((m) => m.id === found.slug || m.id === found.id)) {
      installedMods = [{
        file: `${found.slug}-1.0.0.jar`,
        name: found.title,
        id: found.slug || found.id,
        version: "1.0.0",
        loader: kind === "mod" ? "fabric" : kind,
        size: 480_000,
        depends: [],
        risk: "low",
        notes: [],
      }, ...installedMods];
    }
    emit("mods://progress", { done: 1, bytes: 480_000 });
    return { installed: [`${found.slug}-1.0.0.jar`], notes: [] };
  },

  async mods_repair() {
    await sleep(600);
    return { installed: ["fabric-api-0.130.0.jar"], notes: [] };
  },

  async mods_remove({ file }) {
    installedMods = installedMods.filter((m) => m.file !== file);
    return null;
  },

  system_report: () => ({
    specs: {
      cpu: platform === "macos" ? "Apple M2 Pro" : platform === "linux" ? "AMD Ryzen 7 5800X 8-Core" : "AMD Ryzen 5 5600 6-Core Processor",
      cores: 8,
      threads: 16,
      ramGb: 16,
      gpu: platform === "macos" ? "Apple M2 Pro (10-core GPU)" : "NVIDIA GeForce RTX 3060",
      vramGb: platform === "macos" ? 16 : 12,
      diskFreeGb: 214,
      diskTotalGb: 930,
      os: platform === "macos" ? "macOS 15.1 arm64" : platform === "linux" ? "Linux x86_64" : "Windows 11 x86_64",
    },
    recommendation: {
      tier: "high",
      memoryMb: 6144,
      renderDistance: 16,
      width: 1920,
      height: 1080,
      shaders: [
        { id: "none", fpsLow: 520, fpsHigh: 820, verdict: "easily" },
        { id: "light", fpsLow: 170, fpsHigh: 240, verdict: "easily" },
        { id: "balanced", fpsLow: 110, fpsHigh: 160, verdict: "easily" },
        { id: "heavy", fpsLow: 58, fpsHigh: 82, verdict: "fine" },
      ],
    },
  }),

  async win_minimize() {},
  async win_toggle_maximize() {},
  async win_close() {},
};

const BANNER_FALLBACK = [
  ["26.4-snapshot-8", "26.4snapshot8540x540.jpg"],
  ["26.4-snapshot-7", "26.4snapshot7540x540.jpg"],
  ["26.3", "dappledcamp540x540.jpg"],
  ["26.2", "26.2540x540.jpg"],
  ["26.1", "26.1540x540.jpg"],
  ["1.21.8", "1.21.8540x540.jpg"],
  ["1.21.7", "1.21.7540x540.jpg"],
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
        image: entry.image.url.startsWith("http") ? entry.image.url : `https://launchercontent.mojang.com${entry.image.url}`,
        title: entry.title ?? "",
        date: entry.date ?? "",
      }));
    if (!bannerCache.length) bannerCache = BANNER_FALLBACK;
  } catch {
    bannerCache = BANNER_FALLBACK;
  }
  return bannerCache;
}

async function invoke(cmd, payload) {
  const fn = handlers[cmd];
  if (!fn) throw new Error(`unknown_command:${cmd}`);
  return fn(payload);
}

window.__TAURI__ = {
  core: { invoke, convertFileSrc: (path) => path },
  event: { listen, emit },
  opener: {
    openUrl: async (url) => {
      console.info("[demo] open", url);
    },
    openPath: async (path) => {
      console.info("[demo] open path", path);
    },
  },
  dialog: {
    open: async () => UNSPLASH,
  },
};
