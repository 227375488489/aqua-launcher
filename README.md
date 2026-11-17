<p align="center">
  <img src="ui/assets/logo.png" width="112" alt="Aqua Launcher" />
</p>

<h1 align="center">Aqua Launcher 0.1 Beta</h1>

<p align="center">
  Лаунчер Minecraft: Java Edition для Windows, macOS и Linux.<br />
  Все версии, моды и сборки, изолированные профили и интерфейс, который можно собрать под себя.<br />
  Rust + Tauri 2, без Electron и без npm.
</p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-0b6c7a?style=flat-square" />
  <img alt="macOS" src="https://img.shields.io/badge/macOS-10.15%2B-1a8f9e?style=flat-square" />
  <img alt="Linux" src="https://img.shields.io/badge/Linux-x64%20%2F%20ARM64-24b0c4?style=flat-square" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-1.82%2B-1a8f9e?style=flat-square" />
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24b0c4?style=flat-square" />
  <img alt="12 языков" src="https://img.shields.io/badge/Языки-12-5be9dc?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-5be9dc?style=flat-square" />
</p>

<p align="center">
  <a href="https://github.com/227375488489/aqua-launcher/releases/latest"><img alt="Скачать" src="https://img.shields.io/badge/Скачать-последний%20релиз-5be9dc?style=for-the-badge" /></a>
</p>

## Что нового в 0.1 Beta

- **Страница сборки как на CurseForge.** Обзор, содержимое и версии. В содержимом — отдельные вкладки модов, ресурспаков, шейдеров и датапаков, поиск и строки с иконками, именем файла, автором и окружением (клиент/сервер).
- **Forge и NeoForge.** Лаунчер сам ставит нужный загрузчик и запускает сборки на Forge/NeoForge, а не только на Fabric.
- **Настройки версии.** Для каждого профиля: язык игры, VSync, максимальный FPS, дальность прорисовки, графика, частицы, музыка и звук, fullscreen, размер интерфейса и выбор графического чипа. Всё можно оставить по умолчанию.
- **Своя Java.** Кнопка «Обзор» позволяет указать GraalVM, Zulu, Corretto или любую другую установку Java.
- **Готовые темы.** 12 тем, которые меняют фон и акцент одним нажатием: океан, аврора, небула, закат, сакура, лес, кибер, угли, карамель, лёд, полночь и день.
- **Новый логотип.** Капля с двумя волнами на тёмной плитке.
- **Бета-версия.** Номер 0.1 Beta; лаунчер не предлагает обновиться на старые 3.x-релизы.
- **Исправления.** Запуск игры, переключение языка без блокировки кнопок, картинки модов, повторные запросы к Modrinth при сбоях.

## Возможности

**Версии**
- Любая версия из официального манифеста Mojang: релизы, снапшоты, старые альфы и беты.
- Установка клиента, библиотек, нативов и ассетов с серверов Mojang, докачка и проверка хешей.
- Баннеры версий из `launchercontent.mojang.com`, для версий без баннера — своя обложка с номером.
- Поиск, фильтры (релизы, снапшоты, старые, установленные) и сортировка.
- Переключатели показа снапшотов и старых версий.

**Моды и сборки**
- Поиск модов, ресурспаков и шейдеров на Modrinth под выбранную версию.
- Установка с обязательными зависимостями, обход дерева зависимостей.
- Сборки `.mrpack`: файлы, overrides, иконка и отдельный профиль.
- Загрузчики Fabric, Forge и NeoForge: установка в один клик, в том числе для сборок.
- Страница сборки с вкладками: обзор, содержимое (моды, ресурспаки, шейдеры, датапаки), версии.
- Список содержимого с иконками, именами файлов, автором и окружением, поиск по содержимому.
- Проверка безопасности jar: исполняемые файлы внутри и опасные вызовы.
- Строгий режим, который блокирует подозрительные моды.
- Автопочинка: недостающие библиотеки и зависимости ставятся одной кнопкой.

**Аккаунты**
- Офлайн-аккаунт по нику: стабильный offline-UUID, 3–16 символов.
- Microsoft device-code: код и ссылка, без ввода пароля в лаунчере.
- Быстрое переключение аккаунтов и аватары.

**Производительность**
- Подбор памяти, дальности прорисовки и разрешения под ваш ПК.
- Оценка FPS с шейдерами по классу видеокарты.
- Aikar-флаги, свои JVM-аргументы, число потоков загрузки.
- Автопоиск Java и загрузка Temurin JRE нужной версии с Adoptium.
- Своя Java: GraalVM, Zulu, Corretto, Liberica или любой `java.exe`.
- Выбор графического чипа для запуска (высокопроизводительный или встроенный) на Windows.

**Интерфейс**
- Тёмная, светлая и системная тема; 12 акцентов и свой цвет; три формы углов; три плотности.
- 12 готовых тем, меняющих фон и акцент: океан, аврора, небула, закат, сакура, лес, кибер, угли, карамель, лёд, полночь, день.
- Масштаб интерфейса 80–140%, Manrope или системный шрифт, отключение анимаций.
- Обои: четыре пресета или своя картинка, размытие и затемнение.
- Редактор раскладки: порядок и видимость разделов и виджетов, позиция кнопки «Играть».
- Настройки версии: язык игры, FPS, VSync, графика, частицы, звук, интерфейс, GPU.
- Живой прогресс установки, консоль игры, тосты, модальные окна.

## Языки

`ru` `uk` `en` `kk` `pl` `cs` `sk` `fr` `de` `it` `es` `pt` — плюс режим «Авто» по языку системы.
Числа, даты и склонения используют `Intl`, поэтому формат соответствует выбранному языку.

Хотите добавить язык? Скопируйте `ui/lang/en.js`, переведите значения и подключите файл в `ui/locales.js`.

## Требования

| ОС | Требования |
| --- | --- |
| Windows 10/11 | WebView2 Runtime (есть в Windows 11 и обновлённой Windows 10) |
| macOS 10.15+ | Universal-сборка (Intel и Apple Silicon) |
| Linux | `webkit2gtk-4.1`, `libappindicator3`, `librsvg2`, `patchelf` |

Для сборки из исходников нужен Rust 1.82+ и Cargo.

## Сборка

```bash
git clone https://github.com/227375488489/aqua-launcher.git
cd aqua-launcher/src-tauri
cargo build --release
```

Бинарник: `src-tauri/target/release/aqua-launcher` (`.exe` на Windows).

Пакеты для текущей ОС:

```bash
cargo install tauri-cli --version "^2"
cd src-tauri
cargo tauri build
```

GitHub Actions собирает Windows, macOS и Linux на каждый тег `v*` и прикладывает установщики к релизу. Интерфейс — статические файлы в `ui/`, собирать его не нужно.

## Структура

```
ui/
  index.html          разметка всех экранов
  styles.css          дизайн-система и адаптив
  app.js              вся логика интерфейса
  i18n.js             движок переводов, Intl
  locales.js          подключение языков
  lang/*.js           12 словарей
  demo.js             демо-бэкенд для просмотра в браузере
src-tauri/src/
  state.rs            настройки, аккаунты, профили, статистика
  commands.rs         команды для фронтенда
  mc/install.rs       установка версии: клиент, библиотеки, ассеты
  mc/version.rs       манифест версии, наследование загрузчиков
  mc/fabric.rs        установка Fabric
  mc/forge.rs         установка Forge и NeoForge
  mc/options.rs       options.txt и выбор GPU для профиля
  mc/project.rs       страница проекта Modrinth
  mc/modpack.rs       сборки Modrinth (.mrpack)
  mc/mods.rs          Modrinth: поиск, зависимости, проверка jar
  mc/launch.rs        аргументы JVM и игры
  mc/java.rs          поиск и загрузка Java (Windows/macOS/Linux)
  system.rs           опрос оборудования на трёх ОС
tools/                генератор иконок (PNG/ICO/ICNS) и шрифты
```

## Данные

| Что | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Настройки и аккаунты | `%APPDATA%\AquaLauncher\config.json` | `~/Library/Application Support/AquaLauncher/config.json` | `~/.local/share/AquaLauncher/config.json` |
| Игры и версии | `%APPDATA%\AquaLauncher\minecraft` | `~/Library/Application Support/AquaLauncher/minecraft` | `~/.local/share/AquaLauncher/minecraft` |
| Профили сборок | `<папка игры>\profiles` | то же | то же |
| Java от лаунчера | `<папка игры>\java` | то же | то же |

Токены Microsoft хранятся локально в `config.json`. Файл не покидает машину, но и не шифруется — не выкладывайте его.

## Ограничения

- Загрузчики модов: **Fabric, Forge и NeoForge**. Сборки на Quilt пока не поддерживаются — лаунчер сообщит об этом до скачивания.
- Моды ставятся в активный профиль. Если у версии нет загрузчика, лаунчер предложит установить Fabric, Forge или NeoForge.
- Вход Microsoft использует публичный client id `00000000402b5328`. Для стабильной работы создайте своё приложение в Azure Portal (публичный клиент, device-code) и укажите id в настройках (`msClientId`).

## Лицензия

MIT — см. [LICENSE](LICENSE).

Minecraft — торговая марка Mojang Studios. Проект не связан с Mojang и Microsoft.
