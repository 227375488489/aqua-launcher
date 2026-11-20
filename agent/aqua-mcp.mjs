#!/usr/bin/env node
// Aqua Launcher MCP bridge (stdio, no dependencies).
// Lets coding agents inspect instances, install Modrinth projects into a
// profile and open the launcher. It edits the same folders the launcher uses,
// so a running game can overwrite files — close the game before installing.
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join, resolve, basename } from "node:path";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const DATA_DIR =
  process.env.AQUA_DATA_DIR ||
  (process.platform === "win32"
    ? join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "AquaLauncher")
    : process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support", "AquaLauncher")
      : join(homedir(), ".local", "share", "AquaLauncher"));
const CONFIG = join(DATA_DIR, "config.json");
const UA = "AquaLauncher-Agent/0.0.11";
const API = "https://api.modrinth.com/v2";

const tools = [
  {
    name: "launcher_status",
    description: "Read the Aqua Launcher config: active instance, settings summary and instance list.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_instances",
    description: "List Minecraft instances with their version, loader, folder and installed file counts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "profile_files",
    description: "List files in an instance folder (mods, resourcepacks, shaderpacks, datapacks).",
    inputSchema: {
      type: "object",
      properties: { profile: { type: "string", description: "Instance id from list_instances" } },
      required: ["profile"],
    },
  },
  {
    name: "install_modrinth",
    description: "Install a Modrinth project (mod, resource pack, shader or datapack) into an instance, including required dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string" },
        project: { type: "string", description: "Project slug or search query" },
        kind: { type: "string", enum: ["mod", "resourcepack", "shader", "datapack"], default: "mod" },
      },
      required: ["profile", "project"],
    },
  },
  {
    name: "open_launcher",
    description: "Start the installed Aqua Launcher application.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function config() {
  const raw = JSON.parse(await readFile(CONFIG, "utf8"));
  return raw;
}

function root(cfg, profile) {
  const base = cfg.settings?.gameDir || join(DATA_DIR, "minecraft");
  const dir = profile.dir || join("profiles", profile.id);
  return resolve(dir.startsWith("/") || /^[A-Za-z]:/.test(dir) ? dir : join(base, dir));
}

function compact(cfg) {
  return {
    activeProfile: cfg.activeProfile || null,
    activeVersion: cfg.active || null,
    dataDir: DATA_DIR,
    settings: {
      language: cfg.settings?.language,
      theme: cfg.settings?.uiTheme,
      accent: cfg.settings?.uiAccent,
      memoryMb: cfg.settings?.memoryMb,
      gameDir: cfg.settings?.gameDir || join(DATA_DIR, "minecraft"),
    },
    profiles: (cfg.profiles || []).map((p) => ({
      id: p.id,
      name: p.name,
      version: p.versionId,
      loader: p.loader || "vanilla",
      loaderVersion: p.loaderVersion || null,
      dir: root(cfg, p),
      active: p.id === cfg.activeProfile,
    })),
  };
}

async function listProfileFiles(cfg, profileId) {
  const profile = (cfg.profiles || []).find((p) => p.id === profileId);
  if (!profile) throw new Error(`Unknown profile: ${profileId}`);
  const dir = root(cfg, profile);
  const out = {};
  for (const folder of ["mods", "resourcepacks", "shaderpacks", "datapacks"]) {
    const path = join(dir, folder);
    out[folder] = existsSync(path) ? (await readdir(path)).filter((f) => !f.startsWith(".aqua")).sort() : [];
  }
  return out;
}

async function modrinth(path, params = {}) {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Modrinth ${res.status}: ${await res.text()}`);
  return res.json();
}

function folderFor(kind) {
  return kind === "resourcepack" ? "resourcepacks" : kind === "shader" ? "shaderpacks" : kind === "datapack" ? "datapacks" : "mods";
}

function safeName(url, fallback) {
  const name = decodeURIComponent(basename(new URL(url).pathname));
  return name && name.length < 160 ? name : fallback;
}

async function download(url, target) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes);
  return bytes.length;
}

async function installModrinth(cfg, args) {
  const profile = (cfg.profiles || []).find((p) => p.id === args.profile);
  if (!profile) throw new Error(`Unknown profile: ${args.profile}`);
  const kind = args.kind || "mod";
  const version = String(profile.versionId || "").match(/\d+\.\d+(?:\.\d+)?/)?.[0] || profile.versionId;
  const loader = kind === "mod" ? (profile.loader || "fabric") : "";

  let projectId = args.project;
  if (!/^[A-Za-z0-9]{8,}$/.test(projectId)) {
    const facets = [[`project_type:${kind === "mod" ? "mod" : kind}`]];
    if (loader) facets.push([`categories:${loader}`]);
    facets.push([`versions:${version}`]);
    const search = await modrinth("/search", { query: args.project, limit: "5", facets: JSON.stringify(facets) });
    if (!search.hits?.length) throw new Error("Nothing found on Modrinth for this instance");
    projectId = search.hits[0].project_id;
  }

  const params = { game_versions: JSON.stringify([version]) };
  if (loader) params.loaders = JSON.stringify([loader]);
  const versions = await modrinth(`/project/${projectId}/version`, params);
  if (!versions.length) throw new Error(`No ${kind} build for Minecraft ${version}${loader ? ` / ${loader}` : ""}`);
  const chosen = versions[0];
  const file = chosen.files?.find((f) => f.primary) || chosen.files?.[0];
  if (!file) throw new Error("Release has no downloadable file");

  const dir = root(cfg, profile);
  const installed = [];
  const queue = [{ projectId, version: chosen, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const item = queue.shift();
    if (seen.has(item.projectId)) continue;
    seen.add(item.projectId);
    const target = join(dir, folderFor(kind), safeName(item.version.files[0].url, `${item.projectId}.jar`));
    const size = await download(item.version.files[0].url, target);
    installed.push({ project: item.projectId, name: item.version.name, file: target, bytes: size });
    if (kind !== "mod" || item.depth > 1) continue;
    for (const dep of item.version.dependencies || []) {
      if (dep.dependency_type !== "required" || !dep.project_id) continue;
      try {
        const dVersions = await modrinth(`/project/${dep.project_id}/version`, params);
        if (dVersions[0]) queue.push({ projectId: dep.project_id, version: dVersions[0], depth: item.depth + 1 });
      } catch {
        // A missing optional dependency should not fail the whole install.
      }
    }
  }
  return { profile: profile.name, minecraft: version, loader, installed };
}

function findLauncher() {
  const candidates = [
    process.env.AQUA_EXE,
    join(process.env.LOCALAPPDATA || "", "Programs", "Aqua Launcher", "Aqua Launcher.exe"),
    join(process.env.LOCALAPPDATA || "", "Aqua Launcher", "Aqua Launcher.exe"),
    "/Applications/Aqua Launcher.app/Contents/MacOS/Aqua Launcher",
    join(homedir(), "Applications", "Aqua Launcher.app", "Contents", "MacOS", "Aqua Launcher"),
    "/usr/bin/aqua-launcher",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

async function call(name, args) {
  if (name === "launcher_status") return compact(await config());
  if (name === "list_instances") return (await config()).profiles || [];
  if (name === "profile_files") return listProfileFiles(await config(), args.profile);
  if (name === "install_modrinth") return installModrinth(await config(), args);
  if (name === "open_launcher") {
    const exe = findLauncher();
    if (!exe) throw new Error("Launcher executable not found; set AQUA_EXE to its path");
    spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
    return { opened: exe };
  }
  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (request.id === undefined) return; // notification
  try {
    if (request.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "aqua-launcher", version: "0.0.11" },
        },
      });
    } else if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools } });
    } else if (request.method === "tools/call") {
      try {
        const result = await call(request.params?.name, request.params?.arguments || {});
        send({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
      } catch (error) {
        send({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true } });
      }
    } else if (request.method === "ping") {
      send({ jsonrpc: "2.0", id: request.id, result: {} });
    } else {
      send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
    }
  } catch (error) {
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: error.message } });
  }
});
