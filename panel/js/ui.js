/**
 * UI-утилиты панели: экранирование, форматирование, тосты, модальные окна,
 * подтверждения и выбор файлов. Без внешних зависимостей.
 */
(function () {
    "use strict";

    var ESCAPE_MAP = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    };

    function esc(value) {
        if (value === null || value === undefined) return "";
        return String(value).replace(/[&<>"']/g, function (ch) { return ESCAPE_MAP[ch]; });
    }

    function bytes(size) {
        var value = Number(size) || 0;
        if (value < 1024) return value + " B";
        var units = ["KB", "MB", "GB", "TB"];
        var index = -1;
        do { value /= 1024; index++; } while (value >= 1024 && index < units.length - 1);
        return value.toFixed(value >= 10 ? 1 : 2) + " " + units[index];
    }

    /**
     * Приводит время к секундам.
     *
     * В базе панели время хранится в секундах, а аккаунты сайта (TwistX ID) — в
     * миллисекундах (Date.now()). Без этой нормализации даты регистрации
     * показывались как «30.05.58686», а «последний вход» всегда был «только что».
     */
    function toSeconds(value) {
        var n = Number(value) || 0;
        if (n <= 0) return 0;
        return n > 100000000000 ? Math.floor(n / 1000) : n;
    }

    function date(value) {
        var seconds = toSeconds(value);
        if (!seconds) return "—";
        var d = new Date(seconds * 1000);
        if (isNaN(d.getTime())) return "—";
        var pad = function (n) { return String(n).padStart(2, "0"); };
        return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear()
            + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    function timeAgo(value) {
        var seconds = toSeconds(value);
        if (!seconds) return "—";
        var diff = Math.floor(Date.now() / 1000) - seconds;
        if (diff < 60) return "только что";
        if (diff < 3600) return Math.floor(diff / 60) + " мин назад";
        if (diff < 86400) return Math.floor(diff / 3600) + " ч назад";
        if (diff < 604800) return Math.floor(diff / 86400) + " дн назад";
        return date(seconds);
    }

    // ==================== TOASTS ====================
    function toast(message, kind) {
        var root = document.getElementById("toasts");
        if (!root) return;
        var el = document.createElement("div");
        el.className = "toast " + (kind || "");
        el.textContent = message;
        root.appendChild(el);
        setTimeout(function () {
            el.style.transition = "opacity .25s";
            el.style.opacity = "0";
            setTimeout(function () { el.remove(); }, 250);
        }, kind === "error" ? 6000 : 3500);
    }

    var notify = {
        success: function (m) { toast(m, "success"); },
        error: function (m) { toast(m, "error"); },
        warn: function (m) { toast(m, "warn"); },
        info: function (m) { toast(m, "info"); },
        /** Человекочитаемое сообщение вместо stack trace. */
        fromError: function (error, fallback) {
            var message = (error && error.message) ? error.message : (fallback || "Неизвестная ошибка");
            toast(message, "error");
            return message;
        },
    };

    // ==================== MODAL ====================
    var modalRoot = null;

    function ensureModalRoot() {
        if (!modalRoot) modalRoot = document.getElementById("modalRoot");
        return modalRoot;
    }

    /**
     * Открывает модальное окно.
     * @param {{title:string, body:string, footer?:string, wide?:boolean,
     *          onMount?:Function, beforeClose?:Function}} options
     * @returns {{close:Function, root:HTMLElement}}
     */
    function modal(options) {
        var opts = options || {};
        var root = ensureModalRoot();
        var backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop";
        backdrop.innerHTML = ''
            + '<div class="modal' + (opts.wide ? " modal-lg" : "") + '" role="dialog" aria-modal="true">'
            + '  <div class="modal-head">'
            + '    <h3>' + esc(opts.title || "") + '</h3>'
            + '    <button type="button" class="modal-close" aria-label="Закрыть">&times;</button>'
            + '  </div>'
            + '  <div class="modal-body">' + (opts.body || "") + '</div>'
            + (opts.footer ? '  <div class="modal-foot">' + opts.footer + '</div>' : '')
            + '</div>';

        function close() {
            if (typeof opts.beforeClose === "function" && opts.beforeClose() === false) return;
            document.removeEventListener("keydown", onKey);
            backdrop.remove();
        }

        function onKey(event) {
            if (event.key === "Escape") close();
        }

        backdrop.querySelector(".modal-close").addEventListener("click", close);
        backdrop.addEventListener("mousedown", function (event) {
            if (event.target === backdrop) close();
        });
        document.addEventListener("keydown", onKey);

        root.appendChild(backdrop);
        if (typeof opts.onMount === "function") opts.onMount(backdrop, close);

        var firstInput = backdrop.querySelector("input, select, textarea");
        if (firstInput) firstInput.focus();

        return { close: close, root: backdrop };
    }

    function confirm(title, message, confirmLabel) {
        return new Promise(function (resolve) {
            var handle = modal({
                title: title,
                body: '<p style="margin:0;color:var(--text-dim)">' + esc(message) + '</p>',
                footer: '<button type="button" class="btn" data-act="cancel">Отмена</button>'
                    + '<button type="button" class="btn btn-danger" data-act="ok">' + esc(confirmLabel || "Удалить") + '</button>',
                onMount: function (root, close) {
                    root.querySelector('[data-act="cancel"]').addEventListener("click", function () { close(); resolve(false); });
                    root.querySelector('[data-act="ok"]').addEventListener("click", function () { close(); resolve(true); });
                },
                beforeClose: function () { resolve(false); return true; },
            });
            void handle;
        });
    }

    /** Читает форму модального окна в объект по атрибутам name. */
    function readForm(scope) {
        var data = {};
        scope.querySelectorAll("[name]").forEach(function (input) {
            if (input.type === "checkbox") data[input.name] = input.checked;
            else data[input.name] = input.value;
        });
        return data;
    }

    function setBusy(button, busy, labelWhileBusy) {
        if (!button) return;
        if (busy) {
            button.dataset.label = button.textContent;
            button.disabled = true;
            button.textContent = labelWhileBusy || "Подождите...";
        } else {
            button.disabled = false;
            if (button.dataset.label) button.textContent = button.dataset.label;
        }
    }

    function badge(text, kind) {
        return '<span class="badge badge-' + esc(kind || "neutral") + '">' + esc(text) + '</span>';
    }

    function statusBadge(status) {
        var value = String(status || "OFFLINE").toUpperCase();
        return badge(value, value);
    }

    function loading(text) {
        return '<div class="loading"><div class="spinner"></div>' + esc(text || "Загрузка...") + '</div>';
    }

    function empty(title, message, actionHtml) {
        return '<div class="empty"><b>' + esc(title) + '</b>' + esc(message || "") + (actionHtml ? '<div style="margin-top:16px">' + actionHtml + '</div>' : "") + '</div>';
    }

    /** SHA-256 файла в браузере — используется при загрузке файла в сборку. */
    async function sha256Hex(blob) {
        var buffer = await blob.arrayBuffer();
        var digest = await crypto.subtle.digest("SHA-256", buffer);
        return Array.prototype.map.call(new Uint8Array(digest), function (b) {
            return b.toString(16).padStart(2, "0");
        }).join("");
    }

    function pickFile(accept) {
        return new Promise(function (resolve) {
            var input = document.createElement("input");
            input.type = "file";
            if (accept) input.accept = accept;
            input.style.display = "none";
            input.addEventListener("change", function () {
                resolve(input.files && input.files[0] ? input.files[0] : null);
                input.remove();
            });
            document.body.appendChild(input);
            input.click();
        });
    }

    window.TwistXUI = {
        esc: esc,
        bytes: bytes,
        date: date,
        timeAgo: timeAgo,
        toast: toast,
        notify: notify,
        modal: modal,
        confirm: confirm,
        readForm: readForm,
        setBusy: setBusy,
        badge: badge,
        statusBadge: statusBadge,
        loading: loading,
        empty: empty,
        sha256Hex: sha256Hex,
        pickFile: pickFile,
    };
})();
