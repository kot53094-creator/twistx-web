/**
 * Общее состояние панели: выбранный сервер и сборка.
 *
 * Между вкладками (Servers → Builds → Files → Mods) сохраняется контекст
 * «какой сервер и какая сборка сейчас открыты», чтобы администратор не выбирал
 * их заново на каждой странице. Состояние живёт в sessionStorage.
 */
(function () {
    "use strict";

    var KEY = "twistx.context";

    function read() {
        try {
            var raw = window.sessionStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (error) {
            return {};
        }
    }

    function write(context) {
        try { window.sessionStorage.setItem(KEY, JSON.stringify(context)); } catch (error) { /* игнорируем */ }
    }

    var TwistXState = {
        serverId: function () {
            var value = read().serverId;
            return value === undefined || value === null ? null : Number(value);
        },
        buildId: function () {
            var value = read().buildId;
            return value === undefined || value === null ? null : Number(value);
        },
        setServer: function (id) {
            var context = read();
            context.serverId = id === null || id === undefined ? null : Number(id);
            // Смена сервера сбрасывает сборку: она принадлежала предыдущему серверу.
            if (id === null || id === undefined) context.buildId = null;
            write(context);
            return context;
        },
        setBuild: function (id) {
            var context = read();
            context.buildId = id === null || id === undefined ? null : Number(id);
            write(context);
            return context;
        },
        clear: function () {
            write({});
        },
    };

    window.TwistXState = TwistXState;
})();
