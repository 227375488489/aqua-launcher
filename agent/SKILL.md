---
name: aqua-launcher
description: Control Aqua Launcher and its Minecraft instances from a coding agent. Use when a task needs the launcher's instance list, mod/resource pack/shader installation into a specific instance, or opening the launcher. Requires the Aqua Launcher MCP bridge.
---

# Aqua Launcher

Use the `aqua-launcher` MCP server instead of editing instance folders by hand.

## Workflow

1. `launcher_status` — learn the active instance, Minecraft version and data folder.
2. `list_instances` — pick the target instance. Never guess an id.
3. `install_modrinth` — pass `profile` and a project slug or search phrase. The bridge matches the instance's Minecraft version and loader and installs required dependencies.
4. `profile_files` — confirm the jar or zip landed in the right folder.
5. `open_launcher` — only when the user wants the UI opened.

## Rules

- Ask before installing into the active instance.
- Close Minecraft before changing mods; a running game can overwrite or lock files.
- Do not edit `config.json` while the launcher runs — it rewrites the file on save.
- Keep instance folders clean: use `install_modrinth`, not manual downloads, so dependencies are resolved.
- Resource packs and shaders are not loader-specific; leave the instance's mod loader out of that decision.
- Report the exact instance name, Minecraft version, loader and installed files.

## Failure handling

- "Launcher executable not found" — set `AQUA_EXE` to the app path.
- "Unknown profile" — re-run `list_instances`; ids change when instances are recreated.
- "No build for Minecraft …" — the project does not support that instance version. Do not force another version's file.
