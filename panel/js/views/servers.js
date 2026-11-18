/** Servers: список серверов, создание, изменение, удаление и переход к сборкам. */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;
    var State = window.TwistXState;

    var LOADERS = ["vanilla", "forge", "fabric", "quilt", "neoforge"];
    var STATUSES = ["ONLINE", "OFFLINE", "MAINTENANCE"];

    function loaderOptions(selected) {
        return LOADERS.map(function (name) {
            return '<option value="' + name + '"' + (name === selected ? " selected" : "") + '>' + name + '</option>';
        }).join("");
    }

    function statusOptions(selected) {
        return STATUSES.map(function (name) {
            return '<option value="' + name + '"' + (name === selected ? " selected" : "") + '>' + name + '</option>';
        }).join("");
    }

    /** Форма сервера — одна и та же для создания и редактирования. */
    function serverForm(server) {
        var s = server || {};
        return ''
            + '<label class="field"><span>Название *</span>'
            + '  <input type="text" name="name" value="' + UI.esc(s.name || "") + '" placeholder="Survival" required></label>'
            + '<label class="field"><span>Описание</span>'
            + '  <input type="text" name="description" value="' + UI.esc(s.description || "") + '" placeholder="Выживание с друзьями"></label>'
            + '<label class="field"><span>Иконка (emoji или URL)</span>'
            + '  <input type="text" name="icon" value="' + UI.esc(s.icon || "") + '" placeholder="🌲"></label>'
            + '<div class="form-row-3">'
            + '  <label class="field"><span>Minecraft version</span>'
            + '    <input type="text" name="minecraftVersion" value="' + UI.esc(s.minecraft_version || "") + '" placeholder="1.20.1"></label>'
            + '  <label class="field"><span>Loader</span>'
            + '    <select name="loader">' + loaderOptions(s.loader || "vanilla") + '</select></label>'
            + '  <label class="field"><span>Loader version</span>'
            + '    <input type="text" name="loaderVersion" value="' + UI.esc(s.loader_version || "") + '" placeholder="47.3.0"></label>'
            + '</div>'
            + '<div class="form-row-3">'
            + '  <label class="field"><span>Server address *</span>'
            + '    <input type="text" name="serverAddress" value="' + UI.esc(s.server_address || "") + '" placeholder="survival.twistx.net" required></label>'
            + '  <label class="field"><span>Port</span>'
            + '    <input type="number" name="serverPort" value="' + UI.esc(s.server_port || 25565) + '" min="1" max="65535"></label>'
            + '  <label class="field"><span>Status</span>'
            + '    <select name="status">' + statusOptions(s.status || "OFFLINE") + '</select></label>'
            + '</div>'
            + '<label class="field" style="display:flex;align-items:center;gap:8px">'
            + '  <input type="checkbox" name="enabled" style="width:auto"' + ((s.enabled === undefined || s.enabled) ? " checked" : "") + '>'
            + '  <span style="margin:0">Сервер виден игрокам в лаунчере</span></label>';
    }

    function openCreate(onDone) {
        UI.modal({
            title: "Создать сервер",
            body: serverForm(null),
            footer: '<button type="button" class="btn" data-act="cancel">Отмена</button>'
                + '<button type="button" class="btn btn-primary" data-act="save">Создать</button>',
            onMount: function (root, close) {
                root.querySelector('[data-act="cancel"]').addEventListener("click", close);
                var save = root.querySelector('[data-act="save"]');
                save.addEventListener("click", async function () {
                    var form = UI.readForm(root);
                    if (!form.name || form.name.trim().length < 2) return UI.notify.warn("Введите название сервера");
                    if (!form.serverAddress || !form.serverAddress.trim()) return UI.notify.warn("Введите адрес сервера");
                    UI.setBusy(save, true, "Создание...");
                    try {
                        await Api.createServer({
                            name: form.name.trim(),
                            description: form.description,
                            icon: form.icon,
                            minecraftVersion: form.minecraftVersion,
                            loader: form.loader,
                            loaderVersion: form.loaderVersion,
                            serverAddress: form.serverAddress.trim(),
                            serverPort: Number(form.serverPort) || 25565,
                        });
                        UI.notify.success("Сервер создан");
                        close();
                        onDone();
                    } catch (error) {
                        UI.notify.fromError(error);
                    } finally {
                        UI.setBusy(save, false);
                    }
                });
            },
        });
    }

    function openEdit(server, onDone) {
        UI.modal({
            title: "Настройки сервера",
            body: serverForm(server),
            footer: '<button type="button" class="btn" data-act="cancel">Отмена</button>'
                + '<button type="button" class="btn btn-primary" data-act="save">Сохранить</button>',
            onMount: function (root, close) {
                root.querySelector('[data-act="cancel"]').addEventListener("click", close);
                var save = root.querySelector('[data-act="save"]');
                save.addEventListener("click", async function () {
                    var form = UI.readForm(root);
                    if (!form.name || form.name.trim().length < 2) return UI.notify.warn("Введите название сервера");
                    UI.setBusy(save, true, "Сохранение...");
                    try {
                        await Api.updateServer(server.id, {
                            name: form.name.trim(),
                            description: form.description,
                            icon: form.icon,
                            minecraftVersion: form.minecraftVersion,
                            loader: form.loader,
                            loaderVersion: form.loaderVersion,
                            serverAddress: form.serverAddress.trim(),
                            serverPort: Number(form.serverPort) || 25565,
                            status: form.status,
                            enabled: !!form.enabled,
                        });
                        UI.notify.success("Сервер обновлён");
                        close();
                        onDone();
                    } catch (error) {
                        UI.notify.fromError(error);
                    } finally {
                        UI.setBusy(save, false);
                    }
                });
            },
        });
    }

    function card(server, reload) {
        var build = server.current_build_id ? ("#" + server.current_build_id) : "нет";
        return '<div class="card server-card" data-id="' + UI.esc(server.id) + '">'
            + '  <div class="server-card-head">'
            + '    <div>'
            + '      <h4 class="server-name">' + UI.esc(server.icon || "🎮") + ' ' + UI.esc(server.name) + '</h4>'
            + '      <p class="server-desc">' + UI.esc(server.description || "Без описания") + '</p>'
            + '    </div>'
            + '    ' + UI.statusBadge(server.status)
            + '  </div>'
            + '  <div class="server-meta">'
            + '    <div><span class="k">Minecraft</span><span class="v">' + UI.esc(server.minecraft_version || "—") + '</span></div>'
            + '    <div><span class="k">Loader</span><span class="v">' + UI.esc((server.loader || "vanilla") + (server.loader_version ? " " + server.loader_version : "")) + '</span></div>'
            + '    <div><span class="k">Build</span><span class="v">' + UI.esc(build) + '</span></div>'
            + '    <div><span class="k">Players</span><span class="v">' + UI.esc((server.players_current || 0) + " / " + (server.players_max || 0)) + '</span></div>'
            + '    <div style="grid-column:1/-1"><span class="k">Address</span><span class="v mono">' + UI.esc((server.server_address || "—") + ":" + (server.server_port || 25565)) + '</span></div>'
            + '  </div>'
            + '  <div class="server-card-actions">'
            + '    <button type="button" class="btn btn-sm btn-primary" data-act="manage">Manage</button>'
            + '    <button type="button" class="btn btn-sm" data-act="edit">Настроить</button>'
            + '    <button type="button" class="btn btn-sm btn-danger" data-act="delete">Удалить</button>'
            + (server.enabled ? '' : ' ' + UI.badge("скрыт", "neutral"))
            + '  </div>'
            + '</div>';
    }

    window.TwistXViews = window.TwistXViews || {};
    window.TwistXViews.servers = {
        title: "Servers",
        actions: function () {
            return '<button type="button" class="btn btn-sm btn-primary" id="createServer">+ Create server</button>';
        },
        mount: async function (container, actionBar) {
            async function load() {
                container.innerHTML = UI.loading("Загрузка серверов...");
                var data;
                try {
                    data = await Api.servers();
                } catch (error) {
                    container.innerHTML = UI.empty("Не удалось загрузить серверы", error.message);
                    return;
                }

                var servers = (data && data.servers) || [];
                if (servers.length === 0) {
                    container.innerHTML = UI.empty(
                        "Серверов пока нет",
                        "Создайте первый сервер, затем соберите его сборку через TwistX Build Tool.",
                        '<button type="button" class="btn btn-primary" id="createServerEmpty">+ Create server</button>'
                    );
                    var emptyBtn = container.querySelector("#createServerEmpty");
                    if (emptyBtn) emptyBtn.addEventListener("click", function () { openCreate(load); });
                    return;
                }

                container.innerHTML = '<div class="grid grid-cards">' + servers.map(function (s) {
                    return card(s, load);
                }).join("") + '</div>';

                container.querySelectorAll(".server-card").forEach(function (node) {
                    var id = Number(node.dataset.id);
                    var server = servers.filter(function (s) { return Number(s.id) === id; })[0];

                    node.querySelector('[data-act="manage"]').addEventListener("click", function () {
                        State.setServer(id);
                        State.setBuild(server.current_build_id || null);
                        window.location.hash = "#/builds";
                    });

                    node.querySelector('[data-act="edit"]').addEventListener("click", function () {
                        openEdit(server, load);
                    });

                    node.querySelector('[data-act="delete"]').addEventListener("click", async function () {
                        var ok = await UI.confirm(
                            "Удалить сервер?",
                            "Сервер «" + server.name + "» и все его сборки будут удалены. Файлы сборок в хранилище останутся и потребуют отдельной очистки. Действие необратимо.",
                            "Удалить сервер"
                        );
                        if (!ok) return;
                        try {
                            await Api.deleteServer(id);
                            UI.notify.success("Сервер удалён");
                            load();
                        } catch (error) {
                            UI.notify.fromError(error);
                        }
                    });
                });
            }

            var create = actionBar.querySelector("#createServer");
            if (create) create.addEventListener("click", function () { openCreate(load); });
            await load();
        },
    };
})();
