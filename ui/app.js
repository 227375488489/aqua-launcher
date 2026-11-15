// Aqua Launcher — интерфейс и связь с Rust-бэкендом.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

if (!window.__TAURI__) {
  await import("./demo.js");
}

const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
const listen = (event, cb) => window.__TAURI__.event.listen(event, cb);

const icon = (name) => `<svg class="icon"><use href="#${name}"/></svg>`;

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const fmtDate = (iso) => {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const d = new Date(time);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const fmtBytes = (bytes) => {
  if (!bytes) return "0 МБ";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1).replace(".", ",")} ГБ`;
  return `${Math.round(bytes / 1024 ** 2)} МБ`;
};

const friendly = (err) => {
  if (!err) return "Неизвестная ошибка";
  if (typeof err === "string") return err;
  return err.message || String(err);
};

const S = {
  boot: null,
  remote: [],
  banners: new Map(),
  selected: null,
  query: "",
  filter: "release",
  shown: 60,
  running: false,
  launching: false,
  installing: new Set(),
  dirty: false,
  msOpen: false,
  logLines: [],
};

/* ---------- статус и уведомления ---------- */

function setStatus(text, mode = "idle") {
  const chip = $("#status-chip");
  const label = $("#status-text");
  if (!text) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  chip.classList.toggle("is-busy", mode === "busy");
  chip.classList.toggle("is-error", mode === "error");
  label.textContent = text;
}

function toast(message, kind = "ok") {
  const node = document.createElement("div");
  node.className = `toast${kind === "error" ? " is-error" : ""}`;
  node.innerHTML = `${icon(kind === "error" ? "i-alert" : "i-check")}<span>${esc(message)}</span>`;
  $("#toasts").append(node);
  setTimeout(() => {
    node.classList.add("is-leaving");
    setTimeout(() => node.remove(), 220);
  }, 4600);
}

/* ---------- роутинг ---------- */

let currentPage = "home";

function go(page) {
  if (page === currentPage) return;
  currentPage = page;
  $$("[data-nav]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.nav === page);
  });
  $$(".page").forEach((el) => {
    const active = el.id === `page-${page}`;
    el.hidden = !active;
    el.classList.toggle("is-active", active);
  });
  $("#view").scrollTop = 0;

  if (page === "library") renderLibrary();
  if (page === "accounts") renderAccountList();
  if (page === "settings") fillSettings();
}

/* ---------- данные ---------- */

const isInstalled = (id) => Boolean(S.boot?.local?.some((v) => v.id === id));

const localVersion = (id) => S.boot?.local?.find((v) => v.id === id);

const activeAccount = () =>
  S.boot?.accounts?.find((a) => a.id === S.boot.active) ?? null;

async function refreshBoot() {
  S.boot = await invoke("bootstrap");
  S.selected = S.selected ?? S.boot.lastVersion ?? S.boot.local?.[0]?.id ?? null;
  renderHomeStats();
  renderAccountChip();
  renderAccountList();
  renderLatest();
  syncPlay();
}

async function loadRemote(refresh = false) {
  try {
    S.remote = await invoke("remote_versions", { refresh });
    if (!S.selected) S.selected = S.remote[0]?.id ?? null;
    renderLatest();
    renderLibrary();
    renderVersionMenu();
    syncPlay();
    $("#library-sub").textContent = `Mojang · ${S.remote.length} версий, последняя ${
      S.remote[0]?.id ?? "—"
    }`;
    $("#connection-state").textContent = `Связь с Mojang есть · ${S.remote.length} версий`;
  } catch (err) {
    $("#library-sub").textContent = "Не удалось получить список версий";
    $("#connection-state").textContent = "Нет связи с Mojang";
    $("#latest-list").innerHTML = `<div class="vm-empty">Список недоступен. Проверьте подключение.</div>`;
    toast(friendly(err), "error");
  }
}

/* ---------- баннеры версий ---------- */

async function loadBanners() {
  try {
    const list = await invoke("version_banners");
    S.banners = new Map(list.map((b) => [b.version, b]));
  } catch {
    S.banners = new Map();
  }
  renderDeck();
  renderLibrary();
}

const bannerFor = (id) => S.banners.get(id) ?? null;

function hueFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return 172 + (hash % 24);
}

/* ---------- домашний экран ---------- */

function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (tail > 1 && tail < 5) return forms[1];
  if (tail === 1) return forms[0];
  return forms[2];
}

function renderHomeStats() {
  if (!S.boot) return;
  const installed = S.boot.local?.length ?? 0;
  $("#stat-installed").textContent = String(installed);
  $("#stat-installed-unit").textContent = plural(installed, ["версия", "версии", "версий"]);
  $("#stat-accounts").textContent = String(S.boot.accounts?.length ?? 0);
  $("#stat-memory").textContent = String(Math.round((S.boot.settings?.memoryMb ?? 4096) / 1024));
}

function renderAccountChip() {
  const account = activeAccount();
  const avatar = $("#account-avatar");
  const name = $("#account-name");
  const kind = $("#account-kind");

  if (!account) {
    avatar.textContent = "?";
    avatar.classList.add("is-offline");
    name.textContent = "Нет аккаунта";
    kind.textContent = "добавьте аккаунт";
    return;
  }

  avatar.textContent = account.name.slice(0, 1).toUpperCase();
  avatar.classList.toggle("is-offline", account.kind === "offline");
  name.textContent = account.name;
  kind.textContent = account.kind === "microsoft" ? "Microsoft" : "Offline";
}

function renderLatest() {
  const list = $("#latest-list");
  if (!S.remote.length) return;
  const items = S.remote.filter((v) => v.kind === "release").slice(0, 6);
  list.innerHTML = items
    .map((v) => {
      const banner = bannerFor(v.id);
      return `<button class="latest-item" data-select="${esc(v.id)}">
        <span class="li-art${banner ? "" : " is-empty"}" style="--h:${hueFor(v.id)}${
          banner ? `; background-image: url(&quot;${esc(banner.image)}&quot;)` : ""
        }"></span>
        <span class="li-main">
          <span class="li-id">${esc(v.id)}</span>
          <span class="li-date">${esc(fmtDate(v.releaseTime))}</span>
        </span>
        <svg class="icon li-arrow"><use href="#i-chevron"/></svg>
      </button>`;
    })
    .join("");
}

function deckMeta(id) {
  if (!id) return "Версия не выбрана";
  const local = localVersion(id);
  if (local) return `Установлена · Java ${local.java ?? "—"}`;
  return "Не установлена · скачается при запуске";
}

function renderDeck() {
  $("#version-current").textContent = S.selected ?? "—";
  $("#deck-meta").textContent = deckMeta(S.selected);
  const banner = S.selected ? bannerFor(S.selected) : null;
  const thumb = $("#deck-thumb");
  thumb.hidden = !banner;
  thumb.style.backgroundImage = banner ? `url("${banner.image}")` : "";
  renderVersionMenu();
}

function renderVersionMenu() {
  const menu = $("#version-menu");
  if (!menu) return;
  const installed = S.boot?.local ?? [];
  const remote = S.remote.filter((v) => v.kind === "release").slice(0, 24);
  const ids = [...new Set([...installed.map((v) => v.id), ...remote.map((v) => v.id)])];

  if (!ids.length) {
    menu.innerHTML = `<div class="vm-empty">Список версий пуст</div>`;
    return;
  }

  menu.innerHTML = ids
    .map(
      (id) => `<button class="vm-item${id === S.selected ? " is-selected" : ""}" data-select="${esc(id)}" role="option" aria-selected="${id === S.selected}">
        <span>${esc(id)}</span>
        <small>${isInstalled(id) ? "установлена" : "не установлена"}</small>
      </button>`,
    )
    .join("");
}

function setSelected(id) {
  S.selected = id;
  renderDeck();
  syncPlay();
  closeVersionMenu();
}

function closeVersionMenu() {
  $("#version-menu").hidden = true;
  $("#version-trigger").setAttribute("aria-expanded", "false");
}

function toggleVersionMenu() {
  const menu = $("#version-menu");
  const open = menu.hidden;
  if (!open) {
    closeVersionMenu();
    return;
  }
  renderVersionMenu();
  menu.hidden = false;
  $("#version-trigger").setAttribute("aria-expanded", "true");
}

function syncPlay() {
  const btn = $("#play-btn");
  const use = $("#play-icon use");
  const label = $("#play-label");

  btn.classList.remove("is-stop", "is-busy");
  btn.disabled = false;

  if (S.running) {
    btn.classList.add("is-stop");
    use.setAttribute("href", "#i-stop");
    label.textContent = "Остановить";
    return;
  }

  if (S.launching) {
    btn.classList.add("is-busy");
    use.setAttribute("href", "#i-refresh");
    label.textContent = "Запускаем";
    return;
  }

  if (S.selected && S.installing.has(S.selected)) {
    btn.classList.add("is-busy");
    use.setAttribute("href", "#i-refresh");
    label.textContent = "Загрузка";
    return;
  }

  if (!S.selected) {
    use.setAttribute("href", "#i-play");
    label.textContent = "Играть";
    btn.disabled = true;
    return;
  }

  if (!isInstalled(S.selected)) {
    use.setAttribute("href", "#i-download");
    label.textContent = "Установить";
    return;
  }

  use.setAttribute("href", "#i-play");
  label.textContent = "Играть";
}

/* ---------- каталог ---------- */

function filteredVersions() {
  const query = S.query.trim().toLowerCase();
  return S.remote.filter((v) => {
    if (S.filter !== "all" && v.kind !== S.filter) return false;
    if (query && !v.id.toLowerCase().includes(query)) return false;
    return true;
  });
}

function renderLibrary() {
  const grid = $("#version-grid");
  if (!S.remote.length) {
    grid.innerHTML = `<div class="empty-state">Загружаем список версий Mojang…</div>`;
    $("#library-more").hidden = true;
    return;
  }

  const items = filteredVersions();
  const slice = items.slice(0, S.shown);

  if (!slice.length) {
    grid.innerHTML = `<div class="empty-state">Ничего не нашлось. Попробуйте другой запрос.</div>`;
    $("#library-more").hidden = true;
    return;
  }

  grid.innerHTML = slice
    .map((v) => {
      const installed = isInstalled(v.id);
      const local = localVersion(v.id);
      const snapshot = v.kind === "snapshot";
      const banner = bannerFor(v.id);
      const tag = installed
        ? `<span class="vc-tag">установлена</span>`
        : snapshot
          ? `<span class="vc-tag">снапшот</span>`
          : "";
      return `<article class="version-card${installed ? " is-installed" : ""}">
        <div class="vc-art${banner ? "" : " is-empty"}" style="--h:${hueFor(v.id)}">
          ${banner ? `<img src="${esc(banner.image)}" alt="" loading="lazy" decoding="async" />` : ""}
          ${tag}
        </div>
        <div class="vc-body">
          <div class="vc-line">
            <span class="vc-id">${esc(v.id)}</span>
            <span class="vc-date">${esc(fmtDate(v.releaseTime))}</span>
          </div>
          <div class="vc-actions">
            <button class="btn btn-small${installed ? " btn-primary" : ""}" data-install="${esc(v.id)}">
              ${installed ? "Играть" : "Скачать"}
            </button>
            ${installed ? `<button class="icon-btn" data-delete="${esc(v.id)}" title="Удалить версию" aria-label="Удалить ${esc(v.id)}">${icon("i-trash")}</button>` : ""}
          </div>
        </div>
      </article>`;
    })
    .join("");

  $("#library-more").hidden = items.length <= S.shown;
}

/* ---------- аккаунты ---------- */

function renderAccountList() {
  const list = $("#account-list");
  const accounts = S.boot?.accounts ?? [];

  if (!accounts.length) {
    list.innerHTML = `<div class="panel add-card">
      <h3>Пока ни одного аккаунта</h3>
      <p>Добавьте offline-ник или войдите через Microsoft — без аккаунта игру не запустить.</p>
    </div>`;
    return;
  }

  list.innerHTML = accounts
    .map((account) => {
      const active = account.id === S.boot.active;
      return `<div class="account-card${active ? " is-active" : ""}">
        <span class="ac-avatar${account.kind === "offline" ? " is-offline" : ""}">${esc(
          account.name.slice(0, 1).toUpperCase(),
        )}</span>
        <span class="ac-main">
          <span class="ac-name">${esc(account.name)}</span>
          <span class="ac-kind">${account.kind === "microsoft" ? "Microsoft" : "Offline"}${
            active ? ' · <span class="ac-flag">активный</span>' : ""
          }</span>
        </span>
        <span class="ac-actions">
          ${
            active
              ? ""
              : `<button class="btn btn-small" data-pick="${esc(account.id)}">Выбрать</button>`
          }
          <button class="icon-btn" data-drop="${esc(account.id)}" title="Удалить аккаунт" aria-label="Удалить аккаунт">${icon(
            "i-trash",
          )}</button>
        </span>
      </div>`;
    })
    .join("");
}

/* ---------- настройки ---------- */

function fillSettings() {
  if (!S.boot) return;
  const s = S.boot.settings;
  $("#memory-range").value = String(Math.round(s.memoryMb / 1024));
  $("#memory-value").textContent = `${Math.round(s.memoryMb / 1024)} ГБ`;
  $("#workers-input").value = String(s.downloadWorkers);
  $("#jvm-args").value = s.jvmArgs ?? "";
  $("#java-path").value = s.javaPath ?? "";
  $("#game-dir").value = s.gameDir ?? "";
  $("#game-dir").placeholder = S.boot.gameDir ?? "Путь по умолчанию";
  $("#res-width").value = String(s.width);
  $("#res-height").value = String(s.height);
  setSwitch("#flags-switch", s.optimizedFlags);
  setSwitch("#auto-java-switch", s.autoJava);
  setSwitch("#fullscreen-switch", s.fullscreen);
  setSwitch("#close-switch", s.closeOnLaunch);
  markDirty(false);
}

function setSwitch(sel, on) {
  $(sel).setAttribute("aria-checked", on ? "true" : "false");
}

const switchOn = (sel) => $(sel).getAttribute("aria-checked") === "true";

function readSettings() {
  const width = Number($("#res-width").value) || 925;
  const height = Number($("#res-height").value) || 530;
  return {
    ...(S.boot?.settings ?? {}),
    memoryMb: (Number($("#memory-range").value) || 4) * 1024,
    downloadWorkers: Number($("#workers-input").value) || 16,
    jvmArgs: $("#jvm-args").value.trim(),
    javaPath: $("#java-path").value.trim() || null,
    gameDir: $("#game-dir").value.trim() || null,
    width,
    height,
    optimizedFlags: switchOn("#flags-switch"),
    autoJava: switchOn("#auto-java-switch"),
    fullscreen: switchOn("#fullscreen-switch"),
    closeOnLaunch: switchOn("#close-switch"),
    customResolution: true,
  };
}

function markDirty(dirty = true) {
  S.dirty = dirty;
  const state = $("#save-state");
  state.textContent = dirty ? "Есть несохранённые изменения" : "";
  state.classList.toggle("is-on", dirty);
  state.classList.toggle("is-warn", dirty);
  $("#settings-save").disabled = !dirty;
}

/* ---------- запуск и установка ---------- */

function showBar(stage, detail, percent) {
  $("#download-bar").hidden = false;
  $("#download-stage").textContent = stage;
  $("#download-detail").textContent = detail ?? "";
  $("#download-fill").style.width = `${Math.max(0, Math.min(100, percent))}%`;
  $("#download-percent").textContent = `${Math.round(percent)}%`;
}

function hideBar() {
  $("#download-bar").hidden = true;
}

async function installVersion(id, thenPlay = false) {
  if (S.installing.has(id)) return;
  S.installing.add(id);
  syncPlay();
  renderLibrary();
  showBar(`Установка ${id}`, "Подготовка…", 0);
  setStatus(`Загрузка ${id}`, "busy");

  try {
    await invoke("install_version", { id });
    await refreshBoot();
    toast(`Версия ${id} установлена`);
    setStatus("Готово");
    if (thenPlay) {
      setSelected(id);
      await launch();
    }
  } catch (err) {
    toast(friendly(err), "error");
    setStatus("Ошибка загрузки", "error");
  } finally {
    S.installing.delete(id);
    renderLibrary();
    syncPlay();
    setTimeout(hideBar, 700);
  }
}

async function launch() {
  if (S.launching || S.running) return;
  S.launching = true;
  syncPlay();
  setStatus("Запуск игры…", "busy");

  try {
    await invoke("launch", { version: S.selected });
  } catch (err) {
    S.launching = false;
    syncPlay();
    setStatus("Готово");
    toast(friendly(err), "error");
  }
}

function handlePlay() {
  if (S.running) {
    invoke("stop_game").catch((err) => toast(friendly(err), "error"));
    return;
  }

  if (!S.selected) {
    go("library");
    toast("Выберите версию для запуска");
    return;
  }

  if (!activeAccount()) {
    go("accounts");
    toast("Сначала добавьте аккаунт");
    return;
  }

  if (!isInstalled(S.selected)) {
    installVersion(S.selected, true);
    return;
  }

  launch();
}

/* ---------- журнал игры ---------- */

function appendLog(line) {
  S.logLines.push(line);
  if (S.logLines.length > 500) S.logLines.shift();
  const body = $("#console-body");
  const nearBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 40;
  body.textContent = S.logLines.join("\n");
  if (nearBottom) body.scrollTop = body.scrollHeight;
}

/* ---------- модальные окна ---------- */

function openModal(html) {
  const root = $("#modal-root");
  root.innerHTML = html;
  root.hidden = false;
  const first = root.querySelector("button, input, a");
  first?.focus();
  return root.querySelector(".modal");
}

function closeModal() {
  const root = $("#modal-root");
  root.hidden = true;
  root.innerHTML = "";
}

function confirmAction(title, text, action, label = "Удалить") {
  const modal = openModal(`<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head">
      <h2>${esc(title)}</h2>
      <button class="modal-close" data-close aria-label="Закрыть">${icon("i-close")}</button>
    </div>
    <p class="modal-text">${esc(text)}</p>
    <div class="modal-actions">
      <button class="btn" data-close>Отмена</button>
      <button class="btn btn-primary" data-ok>${esc(label)}</button>
    </div>
  </div>`);

  modal.querySelector("[data-ok]").addEventListener("click", async () => {
    closeModal();
    try {
      await action();
    } catch (err) {
      toast(friendly(err), "error");
    }
  });
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
}

function openMsModal(flow) {
  S.msOpen = true;
  const modal = openModal(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="ms-title">
    <div class="modal-head">
      <h2 id="ms-title">Вход через Microsoft</h2>
      <button class="modal-close" data-ms-cancel aria-label="Отмена">${icon("i-close")}</button>
    </div>
    <p class="modal-text">Откройте страницу Microsoft, введите код и подтвердите вход. Пароль в лаунчер не передаётся.</p>
    <div class="code-box">
      <span class="code-value">${esc(flow.userCode)}</span>
      <button class="btn btn-small" data-copy>${icon("i-copy")} Копировать</button>
    </div>
    <ol class="modal-steps">
      <li>Откройте <a class="modal-link" data-ms-link href="${esc(flow.verificationUri)}" target="_blank" rel="noreferrer">microsoft.com/link ${icon("i-external")}</a></li>
      <li>Введите код выше</li>
      <li>Подтвердите вход в аккаунт</li>
    </ol>
    <div class="modal-status" id="ms-status">
      <span class="status-dot"></span>
      <span>Ожидаем подтверждение…</span>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn" data-ms-cancel>Отмена</button>
    </div>
  </div>`);

  modal.querySelector("[data-copy]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(flow.userCode);
      toast("Код скопирован");
    } catch {
      toast("Не удалось скопировать код", "error");
    }
  });

  modal.querySelector("[data-ms-link]").addEventListener("click", (event) => {
    event.preventDefault();
    const url = flow.verificationUri;
    const opener = window.__TAURI__.opener;
    if (opener?.openUrl) opener.openUrl(url).catch(() => {});
    else window.open(url, "_blank", "noreferrer");
  });

  modal.querySelectorAll("[data-ms-cancel]").forEach((el) =>
    el.addEventListener("click", () => {
      invoke("ms_cancel").catch(() => {});
      S.msOpen = false;
      closeModal();
    }),
  );
}

/* ---------- проверки ---------- */

async function checkConnection() {
  const button = $("#connection-check");
  button.disabled = true;
  $("#connection-state").textContent = "Проверяем связь…";
  try {
    S.remote = await invoke("remote_versions", { refresh: true });
    $("#connection-state").textContent = `Связь есть · ${S.remote.length} версий Mojang`;
    renderLatest();
    renderLibrary();
    renderVersionMenu();
    toast("Список версий обновлён");
  } catch (err) {
    $("#connection-state").textContent = "Нет связи с Mojang";
    toast(friendly(err), "error");
  } finally {
    button.disabled = false;
  }
}

/* ---------- пузырьки ---------- */

function startBubbles() {
  const canvas = $("#bubbles");
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let bubbles = [];
  let raf = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.round((width * height) / 68000);
    bubbles = Array.from({ length: Math.min(34, Math.max(12, count)) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.8 + Math.random() * 2.2,
      vy: 0.12 + Math.random() * 0.32,
      sway: Math.random() * Math.PI * 2,
      alpha: 0.06 + Math.random() * 0.14,
    }));
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    for (const b of bubbles) {
      b.sway += 0.008;
      b.y -= b.vy;
      b.x += Math.sin(b.sway) * 0.14;
      if (b.y < -8) {
        b.y = height + 8;
        b.x = Math.random() * width;
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(120, 232, 226, ${b.alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  const frame = () => {
    draw();
    raf = requestAnimationFrame(frame);
  };

  resize();
  draw();

  if (!reduced) {
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    });
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      draw();
    }, 160);
  });
}

/* ---------- события интерфейса ---------- */

function bindStatic() {
  $$("[data-nav]").forEach((el) => el.addEventListener("click", () => go(el.dataset.nav)));

  $("#win-min").addEventListener("click", () => invoke("win_minimize").catch(() => {}));
  $("#win-max").addEventListener("click", () => invoke("win_toggle_maximize").catch(() => {}));
  $("#win-close").addEventListener("click", () => invoke("win_close").catch(() => {}));
  $(".titlebar").addEventListener("dblclick", (event) => {
    if (event.target.closest(".window-controls")) return;
    invoke("win_toggle_maximize").catch(() => {});
  });

  $("#version-trigger").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleVersionMenu();
  });

  document.addEventListener("click", (event) => {
    if (!$("#version-menu").hidden && !event.target.closest(".version-picker")) closeVersionMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeVersionMenu();
      if (!$("#modal-root").hidden) {
        if (S.msOpen) invoke("ms_cancel").catch(() => {});
        S.msOpen = false;
        closeModal();
      }
    }
  });

  $("#latest-list").addEventListener("click", (event) => {
    const item = event.target.closest("[data-select]");
    if (!item) return;
    setSelected(item.dataset.select);
    go("home");
  });

  $("#version-menu").addEventListener("click", (event) => {
    const item = event.target.closest("[data-select]");
    if (!item) return;
    setSelected(item.dataset.select);
  });

  $("#play-btn").addEventListener("click", handlePlay);

  $("#latest-refresh").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.classList.add("is-spinning");
    await loadRemote(true);
    button.classList.remove("is-spinning");
  });

  $("#library-refresh").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.classList.add("is-spinning");
    await loadRemote(true);
    button.classList.remove("is-spinning");
  });

  $("#library-search").addEventListener("input", (event) => {
    S.query = event.target.value;
    S.shown = 60;
    renderLibrary();
  });

  $("#library-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    S.filter = button.dataset.filter;
    S.shown = 60;
    $$("#library-filter button").forEach((el) => el.classList.toggle("is-active", el === button));
    renderLibrary();
  });

  $("#library-more").addEventListener("click", () => {
    S.shown += 60;
    renderLibrary();
  });

  $("#version-grid").addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (img instanceof HTMLImageElement && img.closest(".vc-art")) {
        img.closest(".vc-art").classList.add("is-empty");
        img.remove();
      }
    },
    true,
  );

  $("#version-grid").addEventListener("click", (event) => {
    const install = event.target.closest("[data-install]");
    if (install) {
      const id = install.dataset.install;
      if (isInstalled(id)) {
        setSelected(id);
        go("home");
        launch();
      } else {
        installVersion(id);
      }
      return;
    }

    const del = event.target.closest("[data-delete]");
    if (del) {
      const id = del.dataset.delete;
      confirmAction(
        `Удалить ${id}?`,
        "Файлы версии и её нативы будут удалены с диска. Аккаунты и настройки останутся.",
        async () => {
          await invoke("delete_version", { id });
          await refreshBoot();
          renderLibrary();
          toast(`Версия ${id} удалена`);
        },
      );
    }
  });

  $("#offline-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#offline-name");
    const name = input.value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      toast("Ник: 3–16 символов, латиница, цифры и _", "error");
      input.focus();
      return;
    }
    try {
      await invoke("add_offline_account", { name });
      input.value = "";
      await refreshBoot();
      renderAccountList();
      toast(`Аккаунт ${name} добавлен`);
    } catch (err) {
      toast(friendly(err), "error");
    }
  });

  $("#ms-login").addEventListener("click", async () => {
    if (S.msOpen) return;
    try {
      const flow = await invoke("ms_login");
      openMsModal(flow);
    } catch (err) {
      toast(friendly(err), "error");
    }
  });

  $("#account-list").addEventListener("click", (event) => {
    const pick = event.target.closest("[data-pick]");
    if (pick) {
      invoke("set_account", { id: pick.dataset.pick })
        .then(refreshBoot)
        .then(() => toast("Аккаунт переключён"))
        .catch((err) => toast(friendly(err), "error"));
      return;
    }

    const drop = event.target.closest("[data-drop]");
    if (drop) {
      const id = drop.dataset.drop;
      const account = S.boot.accounts.find((a) => a.id === id);
      confirmAction(
        "Удалить аккаунт?",
        `Аккаунт ${account?.name ?? ""} будет удалён из лаунчера. Файлы игры не затрагиваются.`,
        async () => {
          await invoke("remove_account", { id });
          await refreshBoot();
          toast("Аккаунт удалён");
        },
      );
    }
  });

  $$(".switch").forEach((el) => {
    el.addEventListener("click", () => {
      setSwitch(`#${el.id}`, !switchOn(`#${el.id}`));
      markDirty();
    });
  });

  $("#memory-range").addEventListener("input", (event) => {
    $("#memory-value").textContent = `${event.target.value} ГБ`;
    markDirty();
  });

  ["#workers-input", "#jvm-args", "#java-path", "#game-dir", "#res-width", "#res-height"].forEach(
    (sel) => $(sel).addEventListener("input", () => markDirty()),
  );
  $("#settings-save").addEventListener("click", async () => {
    const settings = readSettings();
    try {
      await invoke("save_settings", { settings });
      S.boot.settings = { ...S.boot.settings, ...settings };
      markDirty(false);
      renderHomeStats();
      toast("Настройки сохранены");
    } catch (err) {
      toast(friendly(err), "error");
    }
  });

  $("#java-check").addEventListener("click", async () => {
    const path = $("#java-path").value.trim();
    const out = $("#java-result");
    if (!path) {
      out.textContent = "Укажите путь к java.exe";
      return;
    }
    out.textContent = "Проверяем…";
    const major = await invoke("check_java", { path }).catch(() => null);
    out.textContent = major ? `Найдена Java ${major}` : "Java по этому пути не найдена";
  });

  $$("[data-open]").forEach((el) =>
    el.addEventListener("click", () =>
      invoke("open_dir", { kind: el.dataset.open }).catch((err) => toast(friendly(err), "error")),
    ),
  );

  $("#open-game-dir").addEventListener("click", () =>
    invoke("open_dir", { kind: "game" }).catch((err) => toast(friendly(err), "error")),
  );

  $("#connection-check").addEventListener("click", checkConnection);

  $("#console-close").addEventListener("click", () => {
    $("#console-panel").hidden = true;
  });

  $("#modal-root").addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    if (S.msOpen) invoke("ms_cancel").catch(() => {});
    S.msOpen = false;
    closeModal();
  });
}

/* ---------- события бэкенда ---------- */

async function bindBackend() {
  await listen("install://progress", ({ payload }) => {
    const total = payload.totalBytes || 0;
    const percent = total > 0 ? (payload.bytes / total) * 100 : (payload.current / payload.total) * 100;
    const detail = payload.total
      ? `${payload.current} / ${payload.total}${total ? ` · ${fmtBytes(payload.bytes)} из ${fmtBytes(total)}` : ""}`
      : "";
    showBar(payload.label || "Загрузка", detail, percent);
  });

  await listen("game://log", ({ payload }) => {
    $("#console-panel").hidden = false;
    appendLog(payload);
  });

  await listen("game://started", ({ payload }) => {
    S.running = true;
    S.launching = false;
    setStatus(`Игра запущена · ${payload.version}`, "busy");
    $("#console-panel").hidden = false;
    appendLog(`--- Запуск ${payload.version} ---`);
    syncPlay();
  });

  await listen("game://exit", ({ payload }) => {
    S.running = false;
    S.launching = false;
    setStatus("Готово");
    toast(`Игра закрыта (код ${payload.code ?? 0})`);
    appendLog(`--- Игра завершилась, код ${payload.code ?? 0} ---`);
    syncPlay();
  });

  await listen("auth://done", async ({ payload }) => {
    S.msOpen = false;
    closeModal();
    await refreshBoot();
    toast(`Вход выполнен: ${payload.name}`);
  });

  await listen("auth://error", ({ payload }) => {
    const status = $("#ms-status");
    if (status) {
      status.innerHTML = `${icon("i-alert")}<span>${esc(payload)}</span>`;
      status.style.color = "#ff9b8a";
    } else {
      toast(payload, "error");
    }
  });
}

/* ---------- старт ---------- */

async function init() {
  bindStatic();
  startBubbles();
  await bindBackend().catch(() => {});

  try {
    await refreshBoot();
  } catch (err) {
    toast(`Не удалось загрузить настройки: ${friendly(err)}`, "error");
    setStatus("Ошибка запуска", "error");
  }

  renderDeck();
  syncPlay();
  loadRemote(false);
  loadBanners();

  const initial = location.hash.replace("#", "");
  if (["home", "library", "accounts", "settings"].includes(initial)) go(initial);
}

init();
