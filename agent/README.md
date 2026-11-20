# Aqua Launcher agent bridge

An MCP server that lets a coding agent drive Aqua Launcher and its instances.

## Setup

Requirements: Node.js 20+ and an installed Aqua Launcher.

```bash
node agent/aqua-mcp.mjs
```

Register it once. Claude Code:

```bash
claude mcp add aqua-launcher -- node "<repo>/agent/aqua-mcp.mjs"
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.aqua_launcher]
command = "node"
args = ["<repo>/agent/aqua-mcp.mjs"]
```

Hermes and other MCP clients: use `node <repo>/agent/aqua-mcp.mjs` as the stdio command.

The server reads the launcher config from the standard data folder:

- Windows: `%APPDATA%\AquaLauncher\config.json`
- macOS: `~/Library/Application Support/AquaLauncher/config.json`
- Linux: `~/.local/share/AquaLauncher/config.json`

Set `AQUA_DATA_DIR` for a portable install and `AQUA_EXE` if the launcher is not in a standard location.

## Tools

| Tool | Use |
| --- | --- |
| `launcher_status` | Active instance, theme, memory and instance list |
| `list_instances` | Id, name, Minecraft version, loader, folder |
| `profile_files` | Mods, resource packs, shaders and datapacks of one instance |
| `install_modrinth` | Search Modrinth and install a project with required dependencies |
| `open_launcher` | Start the desktop app |

`install_modrinth` installs into `<instance>/mods`, `resourcepacks`, `shaderpacks` or `datapacks` using the instance's own Minecraft version and loader. It does not edit `config.json`, so the launcher picks the files up on the next refresh.

Close Minecraft before installing: a running game can overwrite jars or hold them open.
