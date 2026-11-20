<p align="center">
  <img src="ui/assets/logo.png" width="112" alt="Aqua Launcher" />
</p>

<h1 align="center">Aqua Launcher</h1>

<p align="center">
  Быстрый лаунчер Minecraft: Java Edition для Windows, macOS и Linux.<br />
  Все версии игры, моды, сборки и изолированные профили — в одном приложении.<br />
  Rust + Tauri 2, без Electron и без npm.
</p>

<p align="center">
  <a href="https://github.com/227375488489/aqua-launcher/releases/latest"><img alt="Скачать" src="https://img.shields.io/badge/Скачать-последний%20релиз-5be9dc?style=for-the-badge" /></a>
  <a href="https://github.com/227375488489/aqua-launcher/issues"><img alt="Issues" src="https://img.shields.io/badge/Issues-сообщить%20о%20проблеме-1a8f9e?style=for-the-badge" /></a>
</p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-0b6c7a?style=flat-square" />
  <img alt="macOS" src="https://img.shields.io/badge/macOS-10.15%2B-1a8f9e?style=flat-square" />
  <img alt="Linux" src="https://img.shields.io/badge/Linux-x64%20%2F%20ARM64-24b0c4?style=flat-square" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-1.82%2B-1a8f9e?style=flat-square" />
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24b0c4?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-5be9dc?style=flat-square" />
</p>

## Что это

Aqua Launcher запускает любую версию Minecraft, ставит моды, ресурспаки и шейдеры из Modrinth и CurseForge, собирает изолированные сборки с собственными настройками и мирами. Интерфейс настраивается: темы, акцент, фон, раскладка, шрифт и масштаб. Аккаунты Microsoft и офлайн, автоматическая починка, Discord Rich Presence и обновления встроены.

## Возможности

- Все версии игры, включая снапшоты и старые сборки, с деревом версий и загрузчиков.
- Fabric, Quilt, Forge и NeoForge; выбор версии загрузчика при создании сборки.
- Каталог Modrinth + CurseForge с фильтрами, категориями, сортировкой и страницами.
- Установка модов с зависимостями, импорт `.mrpack`, MultiMC/Prism и папок CurseForge.
- Отдельные сборки: свои моды, конфиги, миры, память и параметры запуска.
- Массовое включение, отключение и удаление модов, смена версии отдельного мода.
- Очистка сборки от логов, крашей и кэша миникарт.
- 12 языков, светлая, тёмная и OLED-темы, свой акцент.
- Визуальный редактор раскладки и достижения по реальной статистике.
- Встроенное обновление с перезапуском и MCP-мост для ИИ-агентов.

## Ссылки

- [Скачать последний релиз](https://github.com/227375488489/aqua-launcher/releases/latest)
- [Все релизы и список изменений](https://github.com/227375488489/aqua-launcher/releases)
- [Сообщить о проблеме](https://github.com/227375488489/aqua-launcher/issues)
- [MCP-сервер для ИИ-агентов](agent/README.md)
- [Лицензия MIT](LICENSE)

## Сборка из исходников

```bash
cd src-tauri
cargo tauri build
```

Нужны Rust 1.82+, Node не требуется. Готовые установщики собираются GitHub Actions для Windows, macOS (universal) и Linux.

## Данные

Настройки, аккаунты и сборки лежат в `%APPDATA%\AquaLauncher` на Windows, `~/Library/Application Support/AquaLauncher` на macOS и `~/.local/share/AquaLauncher` на Linux.
