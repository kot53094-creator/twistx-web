/**
 * Точка входа панели: авторизация, хеш-маршрутизация и монтирование views.
 * Зависимостей нет — обычные script-теги, без сборки.
 */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;
    var Config = window.TwistXConfig;

    var Views = window.TwistXViews;
    var DEFAULT_ROUTE = "dashboard";

    var loginScreen = document.getElementById("loginScreen");
    var appScreen = document.getElementById("appScreen");
    var content = document.getElementById("content");
    var pageTitle = document.getElementById("pageTitle");
    var topbarActions = document.getElementById("topbarActions");
    var whoami = document.getElementById("whoami");
    var nav = document.getElementById("nav");

    // ==================== AUTH SCREENS ====================
    function showLogin(message) {
        if (message) {
            var box = document.getElementById("loginError");
            box.textContent = message;
            box.hidden = false;
        }
        appScreen.hidden = true;
        loginScreen.hidden = false;
    }

    function showApp() {
        loginScreen.hidden = true;
        appScreen.hidden = false;
        var user = Api.user() || {};
        whoami.innerHTML = 'Вы вошли как <b>' + UI.esc(user.username || "admin") + '</b>';
    }

    function logout() {
        Api.clearSession();
        window.TwistXState.clear();
        window.location.hash = "";
        showLogin();
    }

    // ==================== ROUTING ====================
    function currentRoute() {
        var hash = String(window.location.hash || "").replace(/^#\/?/, "");
        var name = hash.split("?")[0];
        return Views[name] ? name : DEFAULT_ROUTE;
    }

    function highlightNav(route) {
        nav.querySelectorAll(".nav-item").forEach(function (item) {
            item.classList.toggle("active", item.dataset.view === route);
        });
    }

    async function render() {
        if (!Api.isAuthenticated()) {
            showLogin();
            return;
        }

        var route = currentRoute();
        var view = Views[route];

        showApp();
        highlightNav(route);
        pageTitle.textContent = view.title || route;

        var actionsHtml = typeof view.actions === "function" ? (view.actions() || "") : "";
        topbarActions.innerHTML = actionsHtml;

        try {
            await view.mount(content, topbarActions);
        } catch (error) {
            // Ошибка одного экрана не должна ломать панель целиком.
            console.error("View error", route, error);
            content.innerHTML = UI.empty("Не удалось открыть раздел", error && error.message ? error.message : "Неизвестная ошибка");
        }
    }

    // ==================== LOGIN FORM ====================
    document.getElementById("loginForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        var submit = document.getElementById("loginSubmit");
        var errorBox = document.getElementById("loginError");
        errorBox.hidden = true;

        var username = document.getElementById("loginUsername").value.trim();
        var password = document.getElementById("loginPassword").value;
        if (!username || !password) {
            errorBox.textContent = "Введите логин и пароль";
            errorBox.hidden = false;
            return;
        }

        UI.setBusy(submit, true, "Вход...");
        try {
            await Api.login(username, password);
            document.getElementById("loginPassword").value = "";
            if (!window.location.hash) window.location.hash = "#/" + DEFAULT_ROUTE;
            render();
        } catch (error) {
            errorBox.textContent = error.message;
            errorBox.hidden = false;
        } finally {
            UI.setBusy(submit, false);
        }
    });

    document.getElementById("logoutBtn").addEventListener("click", function () {
        logout();
    });

    window.addEventListener("hashchange", function () {
        if (Api.isAuthenticated()) render();
    });

    // ==================== BOOT ====================
    window.TwistXApp = {
        render: render,
        showLogin: showLogin,
        logout: logout,
        route: currentRoute,
    };

    /**
     * Проверка связи с API до входа.
     *
     * Частая причина «панель ничего не показывает» — сохранённый в настройках адрес
     * API, недоступный с этого компьютера (например, localhost с машины разработчика).
     * Внешне это выглядит как поломка всех функций сразу: не грузятся новости, не
     * сохраняется сервер, не загружается мод. Поэтому проверяем адрес и, если он не
     * отвечает, переключаемся на адрес по умолчанию, сообщая об этом внятно.
     */
    function setApiNotice(text, kind) {
        var notice = document.getElementById("apiNotice");
        if (!notice) return;
        notice.textContent = text || "";
        notice.className = kind ? "login-notice is-" + kind : "login-notice";
        notice.hidden = !text;
    }

    async function checkApi() {
        var configured = Config.resolve();
        var fallback = Config.defaultUrl();

        try {
            await Api.health();
            if (Config.hasStaleLoopback()) {
                setApiNotice("В настройках сохранён адрес localhost — на этой странице он не работает. Использую " + configured, "warn");
            }
            return true;
        } catch (error) {
            // Настроенный адрес не ответил — пробуем адрес по умолчанию.
        }

        if (fallback && fallback !== configured) {
            Config.set(fallback);
            try {
                await Api.health();
                setApiNotice("Адрес API из настроек не отвечал. Переключился на " + fallback, "warn");
                return true;
            } catch (error) {
                // Не ответил и запасной адрес.
            }
        }

        setApiNotice("Нет связи с API (" + Config.resolve() + "). Проверьте интернет и адрес в разделе Settings.", "error");
        return false;
    }

    (async function boot() {
        var hint = document.getElementById("loginApiHint");
        hint.textContent = "API: " + Config.resolve();

        await checkApi();
        hint.textContent = "API: " + Config.resolve();

        if (Api.isAuthenticated()) {
            if (!window.location.hash) window.location.hash = "#/" + DEFAULT_ROUTE;
            render();
        } else {
            showLogin();
        }
    })();
})();
