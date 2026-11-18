/**
 * Определение адреса TwistX API.
 *
 * Приоритет:
 *   1. `?api=` в адресной строке (удобно для проверки API на localhost)
 *   2. Значение, сохранённое в Settings панели
 *   3. window.TWISTX_API_URL из этого файла
 *   4. Тот же origin, что и у панели (когда панель отдаётся самим воркером)
 *   5. Локальный API (только при открытии панели с локального адреса)
 *
 * Значение никогда не жёстко зашито в лаунчер и не содержит секретов: панель
 * обращается только к публичному API.
 */
(function () {
    "use strict";

    // Адрес админ-API. Панель отдаёт сам сайт (/panel), а API — отдельный Worker;
    // переопределяется параметром ?api= или в разделе Settings самой панели.
    window.TWISTX_API_URL = "https://twistx-api.twistx-launcher.workers.dev";

    var STORAGE_KEY = "twistx.apiUrl";

    function normalize(value) {
        return String(value || "").trim().replace(/\/+$/, "");
    }

    function fromQuery() {
        try {
            var params = new URLSearchParams(window.location.search);
            return normalize(params.get("api"));
        } catch (error) {
            return "";
        }
    }

    function isLocalPage() {
        var host = window.location.hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "" || window.location.protocol === "file:";
    }

    /**
     * Похоже ли значение на адрес локальной разработки.
     *
     * Такой адрес, сохранённый в настройках панели, ломает ВСЮ панель: браузер
     * обращается к localhost того компьютера, где открыт сайт, получает отказ и
     * любая функция (списки, сохранение сервера, загрузка мода) выглядит сломанной.
     * Поэтому на публичном сайте адрес localhost игнорируем, а на локальной странице
     * он по-прежнему разрешён — это удобно для разработки.
     */
    function isLoopback(value) {
        return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(String(value || ""));
    }

    function allowValue(value) {
        if (!value) return "";
        if (isLoopback(value) && !isLocalPage()) return "";
        return value;
    }

    function fromStorage() {
        try {
            return allowValue(normalize(window.localStorage.getItem(STORAGE_KEY)));
        } catch (error) {
            return "";
        }
    }

    var API = {
        resolve: function () {
            return allowValue(fromQuery())
                || fromStorage()
                || normalize(window.TWISTX_API_URL)
                || (isLocalPage() ? "" : normalize(window.location.origin))
                || "http://localhost:8787";
        },
        /** Лежит ли в настройках адрес, который не подходит для этой страницы. */
        hasStaleLoopback: function () {
            var stored = "";
            try { stored = normalize(window.localStorage.getItem(STORAGE_KEY)); } catch (error) { stored = ""; }
            return Boolean(stored) && isLoopback(stored) && !isLocalPage();
        },
        set: function (value) {
            var normalized = normalize(value);
            try {
                if (normalized) window.localStorage.setItem(STORAGE_KEY, normalized);
                else window.localStorage.removeItem(STORAGE_KEY);
            } catch (error) { /* приватный режим — настройка просто не сохранится */ }
            return normalized;
        },
        isFromQuery: function () {
            return !!fromQuery();
        },
        defaultUrl: function () {
            return normalize(window.TWISTX_API_URL);
        }
    };

    window.TwistXConfig = API;
})();
