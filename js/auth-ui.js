/**
 * Интерфейс TwistX ID на сайте: вход, регистрация, живая валидация,
 * состояния загрузки и сообщения об ошибках.
 *
 * Модуль намеренно не зависит от main.js и Firebase: страницы авторизации
 * вызывают AuthUI.* напрямую, а данные ходят в собственный API (/api/auth/*),
 * который использует ту же таблицу аккаунтов, что и лаунчер.
 */
(function () {
    "use strict";

    const NICKNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
    const PASSWORD_MIN = 8;

    const AuthUI = {
        /** Текущий пользователь или null. */
        user: null,

        /* ==================== Инфраструктура ==================== */

        /** Единая точка запросов: cookie-сессия уходит автоматически. */
        api: async (path, options = {}) => {
            if (location.protocol === "file:") {
                return {
                    ok: false,
                    status: 0,
                    data: {
                        error: "NO_SERVER",
                        message:
                            "Страница открыта как файл. Запусти сервер: cd website → npm run start → http://localhost:3000",
                    },
                };
            }

            // Долгий ответ сервера не должен выглядеть как зависание: по таймауту
            // возвращаем понятное сообщение вместо бесконечного ожидания.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), AuthUI.REQUEST_TIMEOUT_MS);

            try {
                const response = await fetch(path, {
                    credentials: "same-origin",
                    headers: options.body ? { "Content-Type": "application/json" } : undefined,
                    method: options.method || (options.body ? "POST" : "GET"),
                    body: options.body ? JSON.stringify(options.body) : undefined,
                    signal: controller.signal,
                });

                let data = {};
                try {
                    data = await response.json();
                } catch (error) {
                    data = { message: "Сервер вернул некорректный ответ" };
                }
                return { ok: response.ok, status: response.status, data };
            } catch (error) {
                const timedOut = error && error.name === "AbortError";
                return {
                    ok: false,
                    status: 0,
                    data: {
                        error: timedOut ? "TIMEOUT" : "NETWORK",
                        message: timedOut
                            ? "Сервер не ответил вовремя. Проверьте соединение и попробуйте ещё раз."
                            : "Сервер недоступен. Проверьте соединение и повторите попытку.",
                    },
                };
            } finally {
                clearTimeout(timeoutId);
            }
        },

        /** Сколько ждём ответ сервера. Дольше — показываем ошибку, а не «вечное» ожидание. */
        REQUEST_TIMEOUT_MS: 20000,

        byId: (id) => document.getElementById(id),

        setBusy: (button, busy, busyLabel) => {
            if (!button) return;
            const label = button.querySelector(".btn-label");
            const spinner = button.querySelector(".spinner");
            button.disabled = busy;
            button.classList.toggle("is-busy", busy);
            if (label && busyLabel) {
                if (!label.dataset.idleText) label.dataset.idleText = label.textContent;
                label.textContent = busy ? busyLabel : label.dataset.idleText;
            }
            if (spinner) spinner.hidden = !busy;
            button.setAttribute("aria-busy", busy ? "true" : "false");
        },

        alert: (element, message, kind) => {
            if (!element) return;
            if (!message) {
                element.hidden = true;
                element.textContent = "";
                return;
            }
            element.hidden = false;
            element.className = "auth-alert" + (kind ? " is-" + kind : "");
            element.textContent = message;
        },

        hint: (element, message, kind) => {
            if (!element) return;
            element.textContent = message || "";
            element.className = "field-hint" + (kind ? " is-" + kind : "");
        },

        /* ==================== Валидация ==================== */

        scorePassword: (password) => {
            const value = String(password || "");
            if (!value) return { score: 0, label: "" };
            let score = 0;
            if (value.length >= PASSWORD_MIN) score += 1;
            if (value.length >= 12) score += 1;
            if (/[A-Za-zА-Яа-я]/.test(value) && /[0-9]/.test(value)) score += 1;
            if (/[^A-Za-zА-Яа-я0-9]/.test(value) || /[A-ZА-Я]/.test(value)) score += 1;
            const labels = ["", "Слабый", "Средний", "Хороший", "Надёжный"];
            return { score: Math.min(score, 4), label: labels[Math.min(score, 4)] };
        },

        validateNickname: (value) => {
            const nickname = String(value || "").trim();
            if (!nickname) return "Введите ник";
            if (!NICKNAME_RE.test(nickname)) return "3–16 символов: латиница, цифры и _";
            return "";
        },

        validatePassword: (value, nickname) => {
            const password = String(value || "");
            if (!password) return "Введите пароль";
            if (password.length < PASSWORD_MIN) return `Минимум ${PASSWORD_MIN} символов`;
            if (!/[A-Za-zА-Яа-я]/.test(password) || !/[0-9]/.test(password)) return "Нужны буквы и цифры";
            if (nickname && password.toLowerCase().includes(String(nickname).toLowerCase())) return "Пароль не должен содержать ник";
            return "";
        },

        /* ==================== Переключение вкладок ==================== */

        switchTab: (tab) => {
            const isRegister = tab === "register";
            const loginForm = AuthUI.byId("loginForm");
            const registerForm = AuthUI.byId("registerForm");
            if (!loginForm || !registerForm) return;

            loginForm.hidden = isRegister;
            registerForm.hidden = !isRegister;
            document.querySelectorAll(".auth-tab").forEach((button) => {
                const active = button.dataset.tab === tab;
                button.classList.toggle("is-active", active);
                button.setAttribute("aria-selected", active ? "true" : "false");
            });

            AuthUI.alert(AuthUI.byId("loginError"), "");
            AuthUI.alert(AuthUI.byId("registerError"), "");

            const focusTarget = isRegister ? AuthUI.byId("regUser") : AuthUI.byId("loginUser");
            if (focusTarget && !focusTarget.disabled) focusTarget.focus();
        },

        /* ==================== Вход и регистрация ==================== */

        submitLogin: async (event) => {
            if (event) event.preventDefault();
            const button = AuthUI.byId("loginSubmit");
            const errorBox = AuthUI.byId("loginError");
            const nickname = AuthUI.byId("loginUser").value.trim();
            const password = AuthUI.byId("loginPassword").value;

            AuthUI.alert(errorBox, "");

            const nicknameError = AuthUI.validateNickname(nickname);
            if (nicknameError) {
                AuthUI.alert(errorBox, nicknameError, "error");
                AuthUI.byId("loginUser").focus();
                return false;
            }
            if (!password) {
                AuthUI.alert(errorBox, "Введите пароль", "error");
                AuthUI.byId("loginPassword").focus();
                return false;
            }

            // Статус виден сразу, а «занято» снимается в любом случае —
            // раньше при долгом ответе кнопка молча висела заблокированной.
            AuthUI.setBusy(button, true, "Входим…");
            AuthUI.alert(errorBox, "Проверяем данные…");

            let result;
            try {
                // Код двухфакторки отправляем, если он введён (поле показывается
                // только после ответа TOTP_REQUIRED).
                const codeInput = AuthUI.byId("loginCode");
                const code = codeInput ? String(codeInput.value || "").trim() : "";

                result = await AuthUI.api("/api/auth/login", {
                    body: code ? { username: nickname, password, code } : { username: nickname, password },
                });
            } finally {
                AuthUI.setBusy(button, false);
            }

            AuthUI.alert(errorBox, "");

            if (!result.ok || !result.data.success) {
                // Аккаунт защищён двухфакторкой: показываем поле для кода вместо
                // сообщения «неверный пароль» — пароль-то как раз верный.
                if (result.data.error === "TOTP_REQUIRED") {
                    const field = AuthUI.byId("loginCodeField");
                    if (field) field.style.display = ""; // возвращаем стиль из CSS (grid)
                    const input = AuthUI.byId("loginCode");
                    if (input) input.focus();
                    AuthUI.alert(errorBox, result.data.message || "Введите код из приложения-аутентификатора", "info");
                    return false;
                }

                AuthUI.alert(errorBox, result.data.message || "Неверный ник или пароль", "error");
                return false;
            }

            AuthUI.user = result.data.user;

            if (AuthUI.launcherState) {
                await AuthUI.linkLauncher(result.data.user.username);
                return true;
            }

            AuthUI.alert(errorBox, "Готово! Открываем кабинет…", "success");
            window.location.replace("./profile.html");
            return true;
        },

        submitRegister: async (event) => {
            if (event) event.preventDefault();
            const button = AuthUI.byId("registerSubmit");
            const errorBox = AuthUI.byId("registerError");
            const nickname = AuthUI.byId("regUser").value.trim();
            const email = AuthUI.byId("regEmail").value.trim();
            const password = AuthUI.byId("regPassword").value;
            const passwordRepeat = AuthUI.byId("regPasswordRepeat").value;

            AuthUI.alert(errorBox, "");

            const nicknameError = AuthUI.validateNickname(nickname);
            if (nicknameError) {
                AuthUI.alert(errorBox, nicknameError, "error");
                AuthUI.byId("regUser").focus();
                return false;
            }
            const passwordError = AuthUI.validatePassword(password, nickname);
            if (passwordError) {
                AuthUI.alert(errorBox, passwordError, "error");
                AuthUI.byId("regPassword").focus();
                return false;
            }
            if (password !== passwordRepeat) {
                AuthUI.alert(errorBox, "Пароли не совпадают", "error");
                AuthUI.byId("regPasswordRepeat").focus();
                return false;
            }

            AuthUI.setBusy(button, true, "Создаём аккаунт…");
            AuthUI.alert(errorBox, "Создаём аккаунт…");

            let result;
            try {
                result = await AuthUI.api("/api/auth/register", {
                    body: { username: nickname, email: email || undefined, password, passwordRepeat },
                });
            } finally {
                AuthUI.setBusy(button, false);
            }

            AuthUI.alert(errorBox, "");

            if (!result.ok || !result.data.success) {
                if (result.data.error === "ALREADY_EXISTS") AuthUI.hint(AuthUI.byId("regUserHint"), "Ник уже занят", "error");
                AuthUI.alert(errorBox, result.data.message || "Не удалось создать аккаунт", "error");
                return false;
            }

            AuthUI.user = result.data.user;

            if (AuthUI.launcherState) {
                await AuthUI.linkLauncher(result.data.user.username);
                return true;
            }

            AuthUI.alert(errorBox, "Аккаунт создан. Открываем кабинет…", "success");
            window.location.replace("./profile.html");
            return true;
        },

        logout: async () => {
            await AuthUI.api("/api/auth/logout", { body: {} });
            window.location.replace("./index.html");
        },

        /* ==================== Вход из лаунчера ==================== */

        /** Одноразовый код, если страница открыта лаунчером (?launcher=…). */
        launcherState: null,

        /** Сообщить серверу, что вход выполнен: лаунчер заберёт аккаунт сам. */
        linkLauncher: async (username) => {
            const state = AuthUI.launcherState;
            if (!state) return false;

            const result = await AuthUI.api("/api/launcher/link", { body: { state } });
            if (!result.ok || !result.data.success) {
                const box = AuthUI.byId("loginError") || AuthUI.byId("registerError");
                AuthUI.alert(box, result.data.message || "Не удалось передать аккаунт в лаунчер", "error");
                return false;
            }

            AuthUI.showLauncherDone(username || result.data.username);
            return true;
        },

        /** Экран «вернитесь в лаунчер» вместо перехода в кабинет. */
        showLauncherDone: (username) => {
            const card = document.querySelector(".auth-card");
            if (!card) return;
            card.innerHTML =
                '<div class="auth-done">' +
                '<span class="material-icons-outlined auth-done-icon">check_circle</span>' +
                "<h2>Аккаунт готов</h2>" +
                "<p>Вы вошли как <b>" + AuthUI.escapeHtml(username) + "</b>.<br>" +
                "Вернитесь в TwistX Launcher — аккаунт добавится автоматически.</p>" +
                '<a class="btn-mc primary auth-submit" href="./index.html"><span class="btn-label">На главную</span></a>' +
                "</div>";
            document.title = "Готово — TwistX ID";
        },

        escapeHtml: (value) =>
            String(value == null ? "" : value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;"),

        /** Подхватить код из адреса и объяснить, что происходит. */
        bindLauncherFlow: () => {
            const state = new URLSearchParams(location.search).get("launcher");
            if (!state) return;
            AuthUI.launcherState = state;

            const notice = AuthUI.byId("authNotice");
            if (notice) {
                notice.hidden = false;
                notice.className = "auth-alert";
                notice.textContent =
                    "Вход для лаунчера: войдите или зарегистрируйтесь — TwistX Launcher добавит аккаунт автоматически.";
            }
            document.title = "Вход для лаунчера — TwistX ID";
        },

        /* ==================== Инициализация страницы входа ==================== */

        initAuthPage: () => {
            const loginForm = AuthUI.byId("loginForm");
            const registerForm = AuthUI.byId("registerForm");
            if (!loginForm || !registerForm) return;

            document.querySelectorAll(".auth-tab").forEach((button) => {
                button.addEventListener("click", () => AuthUI.switchTab(button.dataset.tab));
            });

            document.querySelectorAll("[data-auth-tab]").forEach((link) => {
                link.addEventListener("click", (event) => {
                    event.preventDefault();
                    AuthUI.switchTab(link.dataset.authTab);
                });
            });

            loginForm.addEventListener("submit", AuthUI.submitLogin);
            registerForm.addEventListener("submit", AuthUI.submitRegister);

            document.querySelectorAll("[data-password-toggle]").forEach((button) => {
                button.addEventListener("click", () => {
                    const input = AuthUI.byId(button.dataset.passwordToggle);
                    if (!input) return;
                    const show = input.type === "password";
                    input.type = show ? "text" : "password";
                    button.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
                    const icon = button.querySelector(".material-icons-outlined");
                    if (icon) icon.textContent = show ? "visibility_off" : "visibility";
                });
            });

            // Живая валидация ника и пароля.
            const regUser = AuthUI.byId("regUser");
            if (regUser) {
                let timer = null;
                regUser.addEventListener("input", () => {
                    const error = AuthUI.validateNickname(regUser.value);
                    AuthUI.hint(AuthUI.byId("regUserHint"), error || "3–16 символов: латиница, цифры и _", error ? "error" : "");
                    clearTimeout(timer);
                    if (error || !regUser.value.trim()) return;
                    timer = setTimeout(async () => {
                        const result = await AuthUI.api("/api/auth/check-username?username=" + encodeURIComponent(regUser.value.trim()));
                        if (result.ok && result.data.success) {
                            AuthUI.hint(AuthUI.byId("regUserHint"), result.data.message, result.data.available ? "ok" : "error");
                        }
                    }, 450);
                });
            }

            const regPassword = AuthUI.byId("regPassword");
            if (regPassword) {
                regPassword.addEventListener("input", () => {
                    const { score, label } = AuthUI.scorePassword(regPassword.value);
                    const meter = AuthUI.byId("regStrength");
                    if (meter) {
                        meter.hidden = !regPassword.value;
                        meter.dataset.score = String(score);
                        const text = meter.querySelector(".strength-label");
                        if (text) text.textContent = label;
                    }
                    const error = AuthUI.validatePassword(regPassword.value, regUser ? regUser.value : "");
                    AuthUI.hint(AuthUI.byId("regPasswordHint"), error || "Минимум 8 символов, буквы и цифры", error ? "error" : "ok");
                });
            }

            const repeat = AuthUI.byId("regPasswordRepeat");
            if (repeat) {
                repeat.addEventListener("input", () => {
                    AuthUI.hint(
                        AuthUI.byId("regPasswordRepeatHint"),
                        repeat.value && repeat.value !== regPassword.value ? "Пароли не совпадают" : "",
                        repeat.value && repeat.value !== regPassword.value ? "error" : ""
                    );
                });
            }

            AuthUI.bindLauncherFlow();

            if (location.hash === "#register") AuthUI.switchTab("register");
        },

        init: () => {
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", AuthUI.initAuthPage);
            } else {
                AuthUI.initAuthPage();
            }
        },
    };

    window.AuthUI = AuthUI;
    AuthUI.init();
})();
