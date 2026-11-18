/**
 * Учётные записи, кабинет и скины работают только через TwistX ID (/api/auth/*, /api/skins).
 *
 * Раньше здесь стоял `import ... from "./firebase.js"`, а firebase.js тянет модули
 * с gstatic.com. Статический импорт в модуле означает, что при медленном или
 * недоступном Google CDN (в РФ бывает) не выполнялся вообще весь этот файл: пропадала
 * навигация, кабинет не видел вошедшего игрока и загрузка скина отвечала «сначала
 * войдите в аккаунт». Внешние сервисы здесь больше не участвуют.
 */

const TWISTX_PAGE = document.body.dataset.twistxPage || "home";

/* Относительные пути — работают и с file://, и с http://localhost:3000/ */
const TWISTX_PATHS = {
    home: "./index.html",
    download: "./download.html",
    skins: "./skins.html",
    rules: "./rules.html",
    auth: "./auth.html",
    profile: "./profile.html",
};

/** Lighting + backdrop + camera for skinview3d “studio” look */
function applySkinPresentation(viewer, preset) {
    if (!viewer) return;
    const map = {
        hero: { bg: 0x060a12, cam: 0.45, glob: 2.65, fov: 36, zoom: 0.74 },
        profile: { bg: 0x070b14, cam: 0.5, glob: 2.55, fov: 42, zoom: 0.88 },
        modal: { bg: 0x050812, cam: 0.48, glob: 2.58, fov: 44, zoom: 0.8 },
    };
    const p = map[preset] || map.profile;
    try {
        viewer.background = p.bg;
    } catch (e) {}
    try {
        if (viewer.cameraLight) viewer.cameraLight.intensity = p.cam;
        if (viewer.globalLight) viewer.globalLight.intensity = p.glob;
    } catch (e) {}
    try {
        viewer.fov = p.fov;
        viewer.zoom = p.zoom;
    } catch (e) {}
}

// App State
const app = {
    user: null,
    skinViewer: null,
    isAnimating: true,
    heroViewer: null,
    heroAnimating: true,
    serverIp: "play.twistx.net",

    // Init function
    init: async () => {
        const legacyHash = (window.location.hash || "").replace(/^#/, "");
        if (legacyHash === "register") {
            window.location.replace("./auth.html#register");
            return;
        }
        if (legacyHash && TWISTX_PATHS[legacyHash]) {
            window.location.replace(TWISTX_PATHS[legacyHash]);
            return;
        }

        // Авторизация — TwistX ID: та же учётная запись, что и в лаунчере.
        app.bindTwistxId();

        if (TWISTX_PAGE === "download") {
            app.loadDownloads();
        }

        if (document.getElementById("serverStatusCard") || document.querySelector(".server-status-bar")) {
            app.fetchStatus();
        }

        const skinFile = document.getElementById("skinFile");
        if (skinFile) {
            skinFile.addEventListener("change", (e) => {
                const fileName = e.target.files[0] ? e.target.files[0].name : "Файл не выбран";
                const fnEl = document.getElementById("fileName");
                if (fnEl) fnEl.innerText = fileName;
                app.skinStatus("");
            });
            // Скин можно просто перетащить в блок загрузки.
            app.bindSkinDropzone();
        }

        if (TWISTX_PAGE === "home") {
            setTimeout(app.initHeroSkin, 50);
            if (document.getElementById("skinsCards")) app.refreshSkinsGallery();
        }
        if (TWISTX_PAGE === "skins") {
            app.refreshSkinsGallery();
        }
        if (TWISTX_PAGE === "auth" && window.location.hash === "#register") {
            requestAnimationFrame(() => app.switchAuthTab("register"));
        }
    },

    navigate: (route) => {
        let r = route;
        if (r === "profile" && !app.user) r = "auth";
        if (r === "auth" && app.user) r = "profile";
        window.location.href = TWISTX_PATHS[r] || TWISTX_PATHS.home;
    },

    // Copy IP
    copyIP: (ip) => {
        navigator.clipboard.writeText(ip).then(() => {
            app.showToast('IP сервера скопирован!', 'success');
        });
    },

    // Fetch Server Status
    fetchStatus: async () => {
        const indicator = document.querySelector('.status-indicator');
        const text = document.querySelector('.status-players');
        const socket = document.getElementById('serverSocket');

        if (location.protocol === 'file:') {
            indicator?.classList.remove('checking', 'online');
            indicator?.classList.add('offline');
            if (text) text.innerText = 'Нужен локальный сервер (npm run start)';
            return;
        }

        try {
            const res = await fetch("./api/status");
            const data = await res.json();
            if (!indicator || !text) return;

            indicator.classList.remove('checking', 'online', 'offline');
            if (data.online) {
                indicator.classList.add('online');
                text.innerHTML = `Онлайн: <b>${data.players}</b> / ${data.max}`;
            } else {
                indicator.classList.add('offline');
                text.innerText = 'Сервер выключен';
            }
            app.serverIp = data.host || app.serverIp;
            if (socket) socket.innerText = app.serverIp;
        } catch (e) {
            indicator?.classList.remove('checking', 'online');
            indicator?.classList.add('offline');
            if (text) text.innerText = 'Ошибка подключения';
        }
    },

    /** Экранирование значения перед подстановкой в разметку. */
    escapeAttr: (value) =>
        String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;"),

    /**
     * Адрес скина игрока. TwistX ID отдаёт поле skinUrl, но старые вызовы
     * читали skin_url — из-за расхождения имён после обновления страницы
     * всегда показывался скин по умолчанию.
     */
    skinSourceUrl: () =>
        (app.user && (app.user.skinUrl || app.user.skin_url)) || "https://minotar.net/skin/Steve",

    /**
     * Управление мышью для skinview3d. В библиотеке 2.x это
     * skinview3d.createOrbitControls, а в 3.x функция убрана — поэтому
     * вызов проверяем, иначе страница падает и модель не появляется вовсе.
     */
    /**
     * Анимация ходьбы. В разных сборках skinview3d она задана по-разному:
     * в 2.x это функция кадра (её подставляют без new), в 3.x — класс.
     * Поэтому сначала пробуем создать экземпляр, а если нельзя — берём саму функцию.
     */
    makeSkinAnimation: (name, speed) => {
        if (typeof skinview3d === "undefined") return null;
        const candidate = skinview3d[name];
        if (!candidate) return null;

        let animation = null;
        try {
            animation = new candidate();
        } catch (error) {
            animation = candidate;
        }
        try {
            if (speed != null) animation.speed = speed;
        } catch (e) {}
        return animation;
    },

    attachOrbitControls: (viewer, options) => {
        if (!viewer || typeof skinview3d === "undefined") return null;
        const settings = options || {};
        let control = null;
        if (typeof skinview3d.createOrbitControls === "function") {
            try {
                control = skinview3d.createOrbitControls(viewer);
            } catch (error) {
                control = null;
            }
        }
        if (!control && viewer.controls) control = viewer.controls;
        if (!control) return null; // управления нет — модель всё равно показывается и анимируется
        control.enableRotate = settings.rotate !== false;
        control.enableZoom = settings.zoom !== false;
        control.enablePan = Boolean(settings.pan);
        return control;
    },

    formatBytes: (bytes) => {
        if (typeof bytes !== "number" || !isFinite(bytes) || bytes <= 0) return "";
        const units = ["Б", "КБ", "МБ", "ГБ"];
        let value = bytes;
        let index = 0;
        while (value >= 1024 && index < units.length - 1) {
            value /= 1024;
            index += 1;
        }
        return (index === 0 ? value : value.toFixed(1)) + " " + units[index];
    },

    /** Кнопки скачивания из GET /api/downloads — без хардкода имён файлов. */
    loadDownloads: async () => {
        const box = document.getElementById("downloadActions");
        const note = document.getElementById("downloadNote");
        const versionEl = document.getElementById("downloadVersion");
        if (!box) return;

        const setNote = (text) => {
            if (note) note.innerText = text || "";
        };
        const setVersion = (text) => {
            if (versionEl) versionEl.innerText = text;
        };

        if (location.protocol === "file:") {
            box.innerHTML = "";
            setVersion("Нужен локальный сервер");
            setNote("Открой сайт через npm run start → http://localhost:3000, чтобы список сборок пришёл из API.");
            return;
        }

        try {
            const res = await fetch("./api/downloads");
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
            if (!artifacts.length) throw new Error("пустой список");

            setVersion("Версия " + (data.version || "—"));
            box.innerHTML = "";

            const notes = [];
            artifacts.forEach((artifact) => {
                const button = document.createElement("a");
                button.className = "btn-mc " + (artifact.recommended ? "primary" : "ghost");
                const sizeLabel = app.formatBytes(artifact.size);
                button.innerHTML =
                    '<span class="material-icons-outlined">download</span>' +
                    app.escapeAttr(artifact.label || artifact.file) +
                    (sizeLabel ? " · " + sizeLabel : "");

                const href = artifact.available ? artifact.url : artifact.remoteUrl;
                if (href) {
                    button.href = href;
                    button.target = "_blank";
                    button.rel = "noreferrer";
                    if (!artifact.available) {
                        button.title = "Файл будет получен из хранилища релизов";
                        notes.push(
                            (artifact.label || artifact.file) +
                                ": файла нет на этом сервере — загрузка уйдёт в хранилище релизов."
                        );
                    }
                } else {
                    button.classList.add("is-disabled");
                    button.setAttribute("aria-disabled", "true");
                    notes.push((artifact.label || artifact.file) + ": сборка ещё не опубликована.");
                }
                box.appendChild(button);
            });

            setNote(notes.join(" "));
        } catch (error) {
            box.innerHTML = "";
            const fallback = document.createElement("span");
            fallback.className = "btn-mc primary is-disabled";
            fallback.setAttribute("aria-disabled", "true");
            fallback.innerHTML = '<span class="material-icons-outlined">cloud_off</span>Список недоступен';
            box.appendChild(fallback);
            setVersion("Версия неизвестна");
            setNote("Не удалось получить список сборок: " + (error && error.message ? error.message : "ошибка сети") + ".");
        }
    },

    /** Аккаунт TwistX ID: сессия живёт в cookie, пароль на клиенте не хранится. */
    bindTwistxId: async () => {
        const navAuth = document.getElementById("navAuth");
        const page = TWISTX_PAGE;
        const result = await AuthUI.api("/api/auth/me");

        if (!result.ok || !result.data.success) {
            app.user = null;

            if (page === "profile") {
                window.location.replace("./auth.html");
                return;
            }

            if (navAuth) {
                navAuth.innerHTML =
                    '<a href="./auth.html" class="btn-nav-text">Войти</a>' +
                    '<a href="./auth.html#register" class="btn-nav-cabinet">Регистрация</a>';
            }

            const notice = document.getElementById("authNotice");
            if (page === "auth" && notice && result.data.error === "NO_SERVER") {
                notice.hidden = false;
                notice.className = "auth-alert is-error";
                notice.textContent = result.data.message;
            }
            return;
        }

        app.user = result.data.user;

        if (page === "auth") {
            // Страница открыта лаунчером, а пользователь уже вошёл — отдаём аккаунт сразу.
            if (AuthUI.launcherState) {
                await AuthUI.linkLauncher(app.user.username);
                return;
            }
            window.location.replace("./profile.html");
            return;
        }

        if (navAuth) {
            navAuth.innerHTML =
                '<a href="./profile.html" class="btn-nav-cabinet">' +
                app.escapeAttr(app.user.username) +
                "</a>" +
                '<button type="button" class="btn-nav-text" onclick="app.logoutTwistx()">Выйти</button>';
        }

        const navAvatar = document.getElementById("navAvatarImg");
        if (navAvatar) {
            navAvatar.src = "https://minotar.net/helm/" + encodeURIComponent(app.user.username) + "/36.png";
        }

        // 3D-превью на странице профиля: раньше вьюер создавался только в старой
        // ветке Firebase, поэтому с TwistX ID модель вообще не появлялась.
        if (page === "profile") {
            app.fillProfile();
            requestAnimationFrame(() => app.initSkinViewer());
        }
        if (page === "home" && document.getElementById("heroSkinCanvas")) {
            app.initHeroSkin();
        }
    },

    /** Заполнить кабинет данными аккаунта. */
    fillProfile: () => {
        if (!app.user) return;
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        setText("profileUsername", app.user.username || "—");
        setText("profileEmail", app.user.email || "не указан");
        setText("profileUuid", app.user.uuid || "—");
        const nickInput = document.getElementById("nicknameInput");
        if (nickInput) nickInput.placeholder = app.user.username || "";

        // Голова игрока в карточке профиля — та же, что в шапке.
        const head = document.getElementById("profileHead");
        if (head && app.user.username) {
            head.src = "https://minotar.net/helm/" + encodeURIComponent(app.user.username) + "/128.png";
            head.alt = "Голова игрока " + app.user.username;
        }

        // Копирование UUID: нужно для заявок в поддержку и для серверных плагинов.
        const copyButton = document.getElementById("copyUuid");
        if (copyButton && !copyButton.dataset.bound) {
            copyButton.dataset.bound = "1";
            copyButton.addEventListener("click", async () => {
                const uuid = (app.user && app.user.uuid) || "";
                if (!uuid) return;
                try {
                    await navigator.clipboard.writeText(uuid);
                    app.showToast("UUID скопирован", "success");
                } catch (error) {
                    app.showToast("Не удалось скопировать UUID", "error");
                }
            });
        }
    },

    status: (element, message, kind) => {
        if (!element) return;
        if (kind === "loading") {
            element.className = "field-hint";
            element.innerHTML = '<span class="loading-inline"><span class="spinner"></span>' + app.escapeAttr(message) + "</span>";
            return;
        }
        element.className = "field-hint" + (kind === "error" ? " is-error" : kind === "success" ? " is-ok" : "");
        element.textContent = message || "";
    },

    /** Смена ника. Требует пароль; UUID игрока при этом не меняется. */
    changeUsername: async (event) => {
        event.preventDefault();
        if (!app.user) return;
        const usernameInput = document.getElementById("nicknameInput");
        const passwordInput = document.getElementById("nicknamePassword");
        const statusEl = document.getElementById("nicknameStatus");
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) return app.status(statusEl, "Введите новый ник и текущий пароль", "error");

        app.status(statusEl, "Сохраняем…", "loading");
        const result = await AuthUI.api("/api/auth/username", { body: { username, password } });
        if (!result.ok || !result.data.success) {
            return app.status(statusEl, result.data.message || "Не удалось изменить ник", "error");
        }

        app.user = result.data.user;
        usernameInput.value = "";
        passwordInput.value = "";
        app.fillProfile();
        return app.status(statusEl, "Ник обновлён", "success");
    },

    /** Смена пароля: текущий + новый. */
    changePassword: async (event) => {
        event.preventDefault();
        const currentInput = document.getElementById("currentPassword");
        const newInput = document.getElementById("newPassword");
        const repeatInput = document.getElementById("newPasswordRepeat");
        const statusEl = document.getElementById("passwordStatus");

        const policyError = AuthUI.validatePassword(newInput.value, app.user ? app.user.username : "");
        if (policyError) return app.status(statusEl, policyError, "error");
        if (newInput.value !== repeatInput.value) return app.status(statusEl, "Пароли не совпадают", "error");

        app.status(statusEl, "Сохраняем…", "loading");
        const result = await AuthUI.api("/api/auth/password", {
            body: { currentPassword: currentInput.value, newPassword: newInput.value },
        });
        if (!result.ok || !result.data.success) {
            return app.status(statusEl, result.data.message || "Не удалось сменить пароль", "error");
        }

        currentInput.value = "";
        newInput.value = "";
        repeatInput.value = "";
        return app.status(statusEl, "Пароль обновлён", "success");
    },

    logoutTwistx: async () => {
        await AuthUI.api("/api/auth/logout", { body: {} });
        window.location.replace("./index.html");
    },

    // Auth Tabs: переключение вкладок делает auth-ui.js (он же показывает нужную
    // форму через атрибут hidden). Здесь только совместимость со старым вызовом.
    switchAuthTab: (tab) => {
        if (window.AuthUI && AuthUI.switchTab) AuthUI.switchTab(tab === "register" ? "register" : "login");
    },

    /**
     * Выход из аккаунта. Вход и регистрацию обрабатывает auth-ui.js на странице
     * auth.html (он ходит в /api/auth/*), поэтому здесь остался только выход —
     * его зовут и шапка сайта, и панель администратора.
     */
    logout: async () => {
        await app.logoutTwistx();
    },

    /**
     * Проверка файла скина до отправки: формат, вес и размеры.
     * Так игрок сразу видит понятную причину («нужен PNG 64×64»), а не общее
     * «не удалось сохранить» уже после загрузки на сервер.
     */
    checkSkinFile: async (file) => {
        if (!file) return "Выберите файл скина";
        if (!/\.png$/i.test(file.name) && file.type !== "image/png") return "Нужен файл в формате PNG (.png)";
        if (file.size > 64 * 1024) return "Файл больше 64 КБ — сожмите скин (для 64×64 обычно меньше 10 КБ)";

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const isPng = bytes.length > 24
            && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
        if (!isPng) return "Файл не похож на PNG — сохраните скин именно в PNG";

        const view = new DataView(buffer);
        const width = view.getUint32(16);
        const height = view.getUint32(20);
        const sizeOk = (width === 64 && (height === 64 || height === 32)) || (width === 128 && height === 128);
        if (!sizeOk) return "Нужен скин 64×64 (или 64×32, 128×128), а у файла " + width + "×" + height;
        return "";
    },

    /** Строка состояния под формой: и успех, и отказ видны прямо на странице. */
    skinStatus: (text, kind) => {
        const element = document.getElementById("uploadStatus");
        if (!element) return;
        element.textContent = text || "";
        element.className = kind ? "form-hint is-" + kind : "form-hint";
    },

    // Upload Skin
    uploadSkin: async (e) => {
        if (e) e.preventDefault();
        const fileInput = document.getElementById("skinFile");
        const button = document.querySelector('#skinUploadForm button[type="submit"]');

        if (!app.user) {
            app.showToast("Сначала войдите в аккаунт", "error");
            return;
        }

        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        const problem = await app.checkSkinFile(file);
        if (problem) {
            app.skinStatus(problem, "error");
            app.showToast(problem, "error");
            return;
        }

        if (button) {
            button.disabled = true;
            button.textContent = "Загружаем…";
        }
        app.skinStatus("Загружаем скин…");

        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
                reader.onerror = () => reject(new Error("read failed"));
                reader.readAsDataURL(file);
            });

            // Скин уходит в TwistX ID и попадает в игру тем же аккаунтом.
            const response = await AuthUI.api("/api/skins", { body: { png: base64 } });
            if (!response.ok || !response.data.success) {
                const message = response.data.message || "Не удалось сохранить скин";
                app.skinStatus(message, "error");
                app.showToast(message, "error");
                return;
            }

            app.user.skinUrl = response.data.skinUrl;
            app.user.skin_url = response.data.skinUrl;
            app.skinStatus("Скин обновлён. Перезапустите лаунчер — в игре будет новый скин.", "ok");
            app.showToast("Скин обновлён!", "success");
            app.initSkinViewer();
            app.initHeroSkin();
            app.refreshSkinsGallery();
            if (fileInput) fileInput.value = "";
            const nameEl = document.getElementById("fileName");
            if (nameEl) nameEl.textContent = "Файл не выбран";
        } catch (error) {
            app.skinStatus("Не удалось прочитать файл", "error");
            app.showToast("Не удалось прочитать файл", "error");
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "Загрузить";
            }
        }
    },

    /**
     * Перетаскивание скина в блок загрузки — не нужно искать файл в проводнике.
     * Файл переносим в сам input, чтобы дальше работал обычный путь загрузки.
     */
    bindSkinDropzone: () => {
        const form = document.getElementById("skinUploadForm");
        const input = document.getElementById("skinFile");
        if (!form || !input) return;

        ["dragenter", "dragover"].forEach((name) =>
            form.addEventListener(name, (event) => {
                event.preventDefault();
                form.classList.add("is-dragover");
            })
        );
        ["dragleave", "drop"].forEach((name) =>
            form.addEventListener(name, (event) => {
                event.preventDefault();
                form.classList.remove("is-dragover");
            })
        );
        form.addEventListener("drop", (event) => {
            const dropped = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
            if (!dropped) return;
            const transfer = new DataTransfer();
            transfer.items.add(dropped);
            input.files = transfer.files;
            const nameEl = document.getElementById("fileName");
            if (nameEl) nameEl.textContent = dropped.name;
            app.uploadSkin();
        });
    },

    // Skinview3d Initialization
    initSkinViewer: () => {
        if (!app.user) return;

        const container = document.getElementById('skinContainer');
        if (!container) return;

        // Библиотека не загрузилась — вместо пустого прямоугольника объясняем причину.
        if (typeof skinview3d === "undefined") {
            const empty = container.querySelector('.pf-stage-empty');
            if (empty) {
                empty.textContent = "3D-превью не загрузилось: библиотека не получена. Обновите страницу.";
            }
            return;
        }

        container.innerHTML = '';

        const canvas = document.createElement('canvas');
        container.appendChild(canvas);

        const rect = container.getBoundingClientRect();
        const w = Math.max(220, Math.floor(rect.width) || container.clientWidth || 300);
        const h = Math.max(260, Math.floor(rect.height) || container.clientHeight || 350);

        app.skinViewer = new skinview3d.SkinViewer({ canvas });
        app.skinViewer.width = w;
        app.skinViewer.height = h;
        applySkinPresentation(app.skinViewer, 'profile');
        app.skinViewer.loadSkin(app.skinSourceUrl());
        applySkinPresentation(app.skinViewer, 'profile');

        app.attachOrbitControls(app.skinViewer, { rotate: true, zoom: true, pan: false });

        app.isAnimating = true;
        app.skinViewer.animation = app.makeSkinAnimation("WalkingAnimation", 0.78);

        if (!app._profileResizeObs) {
            app._profileResizeObs = new ResizeObserver(() => {
                requestAnimationFrame(() => {
                    if (!app.skinViewer || !container) return;
                    const r = container.getBoundingClientRect();
                    app.skinViewer.width = Math.max(220, Math.floor(r.width) || 300);
                    app.skinViewer.height = Math.max(260, Math.floor(r.height) || 350);
                });
            });
        }
        app._profileResizeObs.disconnect();
        app._profileResizeObs.observe(container);
    },

    initHeroSkin: () => {
        const canvas = document.getElementById("heroSkinCanvas");
        if (!canvas || typeof skinview3d === "undefined") return;

        const skinUrl = app.skinSourceUrl();
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(200, Math.floor(rect.width) || canvas.clientWidth || 420);
        const h = Math.max(200, Math.floor(rect.height) || canvas.clientHeight || 420);

        if (!app.heroViewer) {
            app.heroViewer = new skinview3d.SkinViewer({ canvas });
            app.heroViewer.width = w;
            app.heroViewer.height = h;
            applySkinPresentation(app.heroViewer, 'hero');
            app.attachOrbitControls(app.heroViewer, { rotate: true, zoom: false, pan: false });
            app.heroViewer.animation = app.makeSkinAnimation("WalkingAnimation", 0.72);
            app.heroAnimating = true;
            app.heroViewer.autoRotate = true;
            app.heroViewer.autoRotateSpeed = 0.55;

            if (!app._heroResizeObs) {
                app._heroResizeObs = new ResizeObserver(() => {
                    requestAnimationFrame(() => {
                        const c = document.getElementById("heroSkinCanvas");
                        if (!c || !app.heroViewer) return;
                        const r = c.getBoundingClientRect();
                        app.heroViewer.width = Math.max(200, Math.floor(r.width) || c.clientWidth || 420);
                        app.heroViewer.height = Math.max(200, Math.floor(r.height) || c.clientHeight || 420);
                    });
                });
                app._heroResizeObs.observe(canvas);
            }
        } else {
            app.heroViewer.width = w;
            app.heroViewer.height = h;
        }
        app.heroViewer.loadSkin(skinUrl);
        applySkinPresentation(app.heroViewer, 'hero');
    },

    toggleHeroSkinAnim: () => {
        if (!app.heroViewer) return;
        app.heroAnimating = !app.heroAnimating;
        app.heroViewer.animation = app.heroAnimating ? app.makeSkinAnimation("WalkingAnimation", 0.72) : null;
    },

    // Toggle Animation
    toggleSkinAnimation: () => {
        if (!app.skinViewer) return;
        app.isAnimating = !app.isAnimating;
        if (app.isAnimating) {
            app.skinViewer.animation = app.makeSkinAnimation("WalkingAnimation", 0.78);
        } else {
            app.skinViewer.animation = null;
        }
    },

    refreshSkinsGallery: async () => {
        const hint = document.getElementById("skinsGalleryHint");
        const cards = document.getElementById("skinsCards");
        if (!cards) return;

        if (location.protocol === "file:") {
            cards.innerHTML = "";
            if (hint) hint.innerText = "Галерея работает только через локальный сервер: cd website → npm run start → http://localhost:3000";
            return;
        }

        cards.innerHTML = "";
        if (hint) hint.innerText = "Загружаем…";

        try {
            // Список скинов отдаёт TwistX ID: внешние сервисы больше не участвуют,
            // поэтому галерея работает сразу после деплоя.
            const response = await AuthUI.api("/api/skins");
            const rows = response.ok && response.data && Array.isArray(response.data.skins)
                ? response.data.skins.map((item) => ({ username: item.username, skinUrl: item.url }))
                : [];

            const usable = rows.filter((r) => typeof r.skinUrl === "string" && r.skinUrl.length > 0);
            if (hint) hint.innerText = usable.length ? `Показано: ${usable.length}` : "Пока пусто — загрузи первый скин!";

            usable.forEach((r) => {
                const el = document.createElement("div");
                el.className = "skin-card";
                el.innerHTML = `
                    <div class="skin-card-head">
                        <img class="skin-head" src="https://minotar.net/helm/${encodeURIComponent(r.username || "Steve")}/32.png" alt="head"/>
                        <div class="skin-card-title">
                            <div class="name">${(r.username || "Player").toString().slice(0, 18)}</div>
                            <div class="sub">3D skin</div>
                        </div>
                    </div>
                    <div class="skin-card-actions">
                        <button class="btn-mc mini ghost" data-skin="${r.skinUrl}">
                            <span class="material-icons-outlined">3d_rotation</span>
                            Открыть
                        </button>
                        <a class="btn-mc mini" href="${r.skinUrl}" target="_blank" rel="noreferrer">
                            <span class="material-icons-outlined">open_in_new</span>
                            PNG
                        </a>
                    </div>
                `;
                el.querySelector("button")?.addEventListener("click", () => app.openSkinModal(r.skinUrl, r.username || "Player"));
                cards.appendChild(el);
            });
        } catch (e) {
            if (hint) hint.innerText = "Ошибка загрузки галереи";
        }
    },

    openSkinModal: (skinUrl, title) => {
        const existing = document.getElementById("skinModalOverlay");
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.id = "skinModalOverlay";
        overlay.className = "skin-modal-overlay";
        overlay.innerHTML = `
            <div class="skin-modal mc-card">
                <div class="skin-modal-top">
                    <div class="skin-modal-title">${String(title || "Skin")}</div>
                    <button class="btn-mc mini ghost" id="skinModalClose">
                        <span class="material-icons-outlined">close</span>
                        Закрыть
                    </button>
                </div>
                <div class="skin-modal-stage">
                    <canvas id="skinModalCanvas" class="skin-modal-canvas"></canvas>
                </div>
                <div class="skin-modal-bottom">
                    <button class="btn-mc mini ghost" id="skinModalAnim">
                        <span class="material-icons-outlined">directions_walk</span>
                        Анимация
                    </button>
                    <a class="btn-mc mini" href="${skinUrl}" target="_blank" rel="noreferrer">
                        <span class="material-icons-outlined">download</span>
                        Скачать PNG
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
        overlay.querySelector("#skinModalClose")?.addEventListener("click", close);

        const canvas = overlay.querySelector("#skinModalCanvas");
        const stage = overlay.querySelector(".skin-modal-stage");
        const measureModal = () => {
            const sr = stage?.getBoundingClientRect();
            return {
                w: Math.max(320, Math.floor(sr?.width) || canvas.clientWidth || 520),
                h: Math.max(320, Math.floor(sr?.height) || canvas.clientHeight || 520),
            };
        };
        const { w: mw, h: mh } = measureModal();
        const viewer = new skinview3d.SkinViewer({ canvas });
        viewer.width = mw;
        viewer.height = mh;
        applySkinPresentation(viewer, "modal");
        viewer.loadSkin(skinUrl);
        applySkinPresentation(viewer, "modal");
        app.attachOrbitControls(viewer, { rotate: true, zoom: true, pan: false });
        let anim = true;
        viewer.animation = app.makeSkinAnimation("WalkingAnimation", 0.8);
        viewer.autoRotate = true;
        viewer.autoRotateSpeed = 0.45;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const { w, h } = measureModal();
                viewer.width = w;
                viewer.height = h;
            });
        });

        overlay.querySelector("#skinModalAnim")?.addEventListener("click", () => {
            anim = !anim;
            viewer.animation = anim ? app.makeSkinAnimation("WalkingAnimation", 0.8) : null;
        });
    },

    // Toast Notification
    showToast: (message, type = 'info') => {
        const pool = document.getElementById('toastPool');
        if (!pool) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.borderLeftColor = type === 'error' ? 'var(--error)' : (type === 'success' ? 'var(--accent)' : 'var(--primary)');
        toast.innerText = message;
        
        pool.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// expose for inline onclick handlers (replaces boot.js stubs)
window.app = app;

function startApp() {
    app.init();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

/* Кнопка «Админка» в шапке — только для аккаунтов с ролью admin (см. js/admin-button.js).
   Продублировано здесь, потому что main.js подключён на всех страницах сайта. */
/**
 * Кнопка «Админка» в шапке сайта — только для аккаунтов с ролью admin.
 *
 * Роль приходит из /api/auth/me (поле isAdmin). Кнопка не «спрятана стилями»
 * и не удаляется потом: она вообще не создаётся для обычного игрока, поэтому
 * в разметке её нет и подсмотреть нечего.
 */
(function () {
    "use strict";

    var PANEL_URL = "./panel/";

    function addButton() {
        var nav = document.querySelector("ul.nav-links-center");
        if (!nav || nav.querySelector("[data-admin-link]")) return;

        var item = document.createElement("li");
        item.setAttribute("data-admin-link", "1");

        var link = document.createElement("a");
        link.href = PANEL_URL;
        link.textContent = "Админка";
        link.style.color = "#ffcc4d";
        link.style.fontWeight = "700";
        link.title = "Панель управления TwistX";

        item.appendChild(link);
        nav.appendChild(item);
    }

    function checkRole() {
        fetch("/api/auth/me", { credentials: "same-origin" })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                var user = data && data.user;
                if (user && user.isAdmin) addButton();
            })
            .catch(function () { /* гость или оффлайн — просто нет кнопки */ });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", checkRole);
    } else {
        checkRole();
    }
})();
