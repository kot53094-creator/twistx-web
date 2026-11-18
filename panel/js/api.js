/**
 * Клиент TwistX API для панели администратора.
 *
 * Токен хранится в sessionStorage: он живёт до закрытия вкладки и не остаётся
 * на диске. Все административные запросы идут с заголовком Authorization.
 */
(function () {
    "use strict";

    var TOKEN_KEY = "twistx.token";
    var USER_KEY = "twistx.user";

    function readToken() {
        try { return window.sessionStorage.getItem(TOKEN_KEY) || ""; } catch (error) { return ""; }
    }

    function readUser() {
        try {
            var raw = window.sessionStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) { return null; }
    }

    function saveSession(token, user) {
        try {
            window.sessionStorage.setItem(TOKEN_KEY, token || "");
            window.sessionStorage.setItem(USER_KEY, JSON.stringify(user || null));
        } catch (error) { /* игнорируем */ }
    }

    function clearSession() {
        try {
            window.sessionStorage.removeItem(TOKEN_KEY);
            window.sessionStorage.removeItem(USER_KEY);
        } catch (error) { /* игнорируем */ }
    }

    /** Ошибка API с сохранением кода и HTTP-статуса для точной обработки в UI. */
    function ApiError(message, status, code, payload) {
        var error = new Error(message || "Ошибка запроса");
        error.name = "ApiError";
        error.status = status || 0;
        error.code = code || "error";
        error.payload = payload || null;
        return error;
    }

    function buildUrl(path) {
        var base = window.TwistXConfig.resolve();
        if (/^https?:\/\//i.test(path)) return path;
        return base + path;
    }

    function onUnauthorized() {
        clearSession();
        if (window.TwistXApp && typeof window.TwistXApp.showLogin === "function") {
            window.TwistXApp.showLogin("Сессия истекла. Войдите снова");
        }
    }

    async function request(method, path, options) {
        var opts = options || {};
        var headers = {};

        if (opts.body !== undefined && opts.body !== null) {
            if (opts.raw) {
                headers["Content-Type"] = "application/octet-stream";
            } else {
                headers["Content-Type"] = "application/json";
            }
        }

        var token = readToken();
        if (opts.auth !== false && token) headers["Authorization"] = "Bearer " + token;

        var body;
        if (opts.body !== undefined && opts.body !== null) {
            body = opts.raw ? opts.body : JSON.stringify(opts.body);
        }

        var response;
        try {
            response = await fetch(buildUrl(path), {
                method: method,
                headers: headers,
                body: body,
                cache: "no-store",
            });
        } catch (error) {
            // Сюда попадает именно сетевая ошибка (нет связи, CORS, неверный адрес
            // API) — прежний текст про «сервер обновлений» сбивал с толку при входе.
            throw ApiError("Не удалось связаться с API. Проверьте адрес API и соединение.", 0, "network_error");
        }

        var text = await response.text();
        var data = null;
        if (text) {
            try { data = JSON.parse(text); } catch (error) { data = text; }
        }

        if (!response.ok) {
            // 401 на защищённом маршруте означает отозванную/просроченную сессию.
            if (response.status === 401 && opts.auth !== false) onUnauthorized();
            var message = (data && data.error) ? data.error : ("Ошибка " + response.status);
            throw ApiError(message, response.status, (data && data.code) || "error", data);
        }

        return data;
    }

    window.TwistXApi = {
        ApiError: ApiError,
        token: readToken,
        user: readUser,
        setSession: saveSession,
        clearSession: clearSession,
        isAuthenticated: function () { return !!readToken(); },

        login: async function (username, password) {
            var data = await request("POST", "/api/admin/auth/login", {
                body: { username: username, password: password },
                auth: false,
            });
            saveSession(data.token, data.user);
            return data;
        },

        /** Проверка связи с API (без авторизации) — нужна на экране входа. */
        health: function () { return request("GET", "/api/health", { auth: false }); },

        dashboard: function () { return request("GET", "/api/admin/dashboard"); },

        // --- servers ---
        servers: function () { return request("GET", "/api/admin/servers"); },
        server: function (id) { return request("GET", "/api/admin/servers/" + id); },
        createServer: function (payload) { return request("POST", "/api/admin/servers", { body: payload }); },
        updateServer: function (id, payload) { return request("PUT", "/api/admin/servers/" + id, { body: payload }); },
        deleteServer: function (id) { return request("DELETE", "/api/admin/servers/" + id); },

        // --- builds ---
        builds: function (serverId) {
            return request("GET", "/api/admin/builds" + (serverId ? ("?serverId=" + encodeURIComponent(serverId)) : ""));
        },
        createBuild: function (payload) { return request("POST", "/api/admin/builds", { body: payload }); },
        publishBuild: function (id) { return request("POST", "/api/admin/builds/" + id + "/publish", { body: {} }); },
        rollbackBuild: function (id) { return request("POST", "/api/admin/builds/" + id + "/rollback", { body: {} }); },
        deleteBuild: function (id) { return request("DELETE", "/api/admin/builds/" + id); },

        // --- files ---
        files: function (buildId) {
            return request("GET", "/api/admin/files" + (buildId ? ("?buildId=" + encodeURIComponent(buildId)) : ""));
        },
        createFile: function (payload) { return request("POST", "/api/admin/files", { body: payload }); },
        deleteFile: function (id) { return request("DELETE", "/api/admin/files/" + id); },

        /** Загрузка файла сборки: тело — поток байтов, метаданные — в query. */
        uploadFile: function (buildId, filePath, sha256, blob) {
            var query = "?buildId=" + encodeURIComponent(buildId)
                + "&path=" + encodeURIComponent(filePath)
                + "&sha256=" + encodeURIComponent(sha256);
            return request("POST", "/api/admin/files/upload" + query, { body: blob, raw: true });
        },

        // --- news ---
        news: function () { return request("GET", "/api/admin/news"); },
        createNews: function (payload) { return request("POST", "/api/admin/news", { body: payload }); },
        updateNews: function (id, payload) { return request("POST", "/api/admin/news/" + id, { body: payload }); },
        deleteNews: function (id) { return request("DELETE", "/api/admin/news/" + id); },

        // --- users (аккаунты TwistX ID: кто зарегистрировался) ---
        /**
         * Список аккаунтов. Пароли посмотреть нельзя — в базе только PBKDF2-хэш,
         * поэтому из панели доступны бан и сброс пароля на новый.
         */
        users: function (params) {
            var query = "";
            var opts = params || {};
            var parts = [];
            if (opts.q) parts.push("q=" + encodeURIComponent(opts.q));
            if (opts.limit) parts.push("limit=" + encodeURIComponent(opts.limit));
            if (opts.offset) parts.push("offset=" + encodeURIComponent(opts.offset));
            if (parts.length > 0) query = "?" + parts.join("&");
            return request("GET", "/api/admin/users" + query);
        },
        setUserBanned: function (id, banned) {
            return request("POST", "/api/admin/users/" + id + "/ban", { body: { banned: !!banned } });
        },
        /** Сброс пароля игроку: сайт и лаунчер принимают новый пароль сразу. */
        setUserPassword: function (id, password) {
            return request("POST", "/api/admin/users/" + id + "/password", { body: { password: password } });
        },

        // --- public (для проверки того, что видит игрок) ---
        publicManifest: function (serverId) { return request("GET", "/api/servers/" + serverId + "/manifest", { auth: false }); },
        publicServers: function () { return request("GET", "/api/servers", { auth: false }); },
    };
})();
