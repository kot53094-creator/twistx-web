/** Builds: сборки выбранного сервера — публикация, откат, удаление, состав файлов. */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;
    var State = window.TwistXState;

    async function loadServers() {
        var data = await Api.servers();
        return (data && data.servers) || [];
    }

    function openNewBuild(serverId, onDone) {
        UI.modal({
            title: "Новая сборка",
            body: ''
                + '<label class="field"><span>Версия *</span>'
                + '  <input type="text" name="version" placeholder="1.0.5" required></label>'
                + '<div class="form-row">'
                + '  <label class="field"><span>Minecraft version</span><input type="text" name="minecraftVersion" placeholder="1.20.1"></label>'
                + '  <label class="field"><span>Loader</span><input type="text" name="loader" placeholder="forge"></label>'
                + '</div>'
                + '<label class="field"><span>Loader version</span><input type="text" name="loaderVersion" placeholder="47.3.0"></label>'
                + '<label class="field"><span>Changelog</span><textarea name="changelog" placeholder="Добавлен новый мод"></textarea></label>'
                + '<p class="hint">Сборка создаётся как черновик. Файлы загружаются через TwistX Build Tool '
                + 'или на странице Files, после чего сборку можно опубликовать.</p>',
            footer: '<button type="button" class="btn" data-act="cancel">Отмена</button>'
                + '<button type="button" class="btn btn-primary" data-act="save">Создать черновик</button>',
            onMount: function (root, close) {
                root.querySelector('[data-act="cancel"]').addEventListener("click", close);
                var save = root.querySelector('[data-act="save"]');
                save.addEventListener("click", async function () {
                    var form = UI.readForm(root);
                    if (!form.version || !/^[0-9A-Za-z._-]{1,64}$/.test(form.version.trim())) {
                        return UI.notify.warn("Версия: латиница, цифры, точка, дефис, подчёркивание");
                    }
                    UI.setBusy(save, true, "Создание...");
                    try {
                        var created = await Api.createBuild({
                            serverId: serverId,
                            version: form.version.trim(),
                            minecraftVersion: form.minecraftVersion,
                            loader: form.loader || "vanilla",
                            loaderVersion: form.loaderVersion,
                            changelog: form.changelog,
                        });
                        UI.notify.success("Сборка " + form.version.trim() + " создана");
                        close();
                        if (created && created.id) State.setBuild(created.id);
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

    function openChangelog(build) {
        UI.modal({
            title: "Сборка " + build.version,
            body: '<pre class="mono" style="white-space:pre-wrap;margin:0;color:var(--text-dim)">'
                + UI.esc(build.changelog || "Changelog не заполнен") + '</pre>',
            footer: '<button type="button" class="btn" data-act="close">Закрыть</button>',
            onMount: function (root, close) {
                root.querySelector('[data-act="close"]').addEventListener("click", close);
            },
        });
    }

    function buildRow(build, currentBuildId, reload) {
        var isCurrent = Number(build.id) === Number(currentBuildId);
        var statusKind = build.status === "published" ? "published" : "draft";
        return '<tr>'
            + '<td class="mono"><b>' + UI.esc(build.version) + '</b>'
            + (isCurrent ? ' ' + UI.badge("CURRENT", "current") : '') + '</td>'
            + '<td>' + UI.esc(build.minecraftVersion || "—") + '</td>'
            + '<td>' + UI.esc((build.loader || "vanilla") + (build.loaderVersion ? " " + build.loaderVersion : "")) + '</td>'
            + '<td class="text-right">' + UI.esc(build.fileCount || 0) + '</td>'
            + '<td class="text-right nowrap">' + UI.esc(UI.bytes(build.totalSize)) + '</td>'
            + '<td>' + UI.badge(build.status, statusKind) + '</td>'
            + '<td class="text-dim nowrap">' + UI.esc(build.publishedAt ? UI.date(build.publishedAt) : "—") + '</td>'
            + '<td class="row-actions">'
            + (build.status === "published" && !isCurrent
                ? '<button type="button" class="btn btn-sm" data-act="rollback">Rollback</button>'
                : '')
            + (build.status !== "published"
                ? '<button type="button" class="btn btn-sm btn-primary" data-act="publish">Publish</button>'
                : '')
            + '<button type="button" class="btn btn-sm" data-act="files">Files</button>'
            + '<button type="button" class="btn btn-sm btn-danger" data-act="delete">Удалить</button>'
            + '</td>'
            + '</tr>';
    }

    window.TwistXViews = window.TwistXViews || {};
    window.TwistXViews.builds = {
        title: "Builds",
        actions: function () {
            return '<button type="button" class="btn btn-sm" id="newBuild">+ Новая сборка</button>';
        },
        mount: async function (container, actionBar) {
            var servers;
            try {
                servers = await loadServers();
            } catch (error) {
                container.innerHTML = UI.empty("Не удалось загрузить серверы", error.message);
                return;
            }

            if (servers.length === 0) {
                container.innerHTML = UI.empty("Сначала создайте сервер", "Сборки принадлежат серверу.", 
                    '<button type="button" class="btn btn-primary" id="goServers">Перейти в Servers</button>');
                var go = container.querySelector("#goServers");
                if (go) go.addEventListener("click", function () { window.location.hash = "#/servers"; });
                return;
            }

            var selectedId = State.serverId();
            if (!selectedId || !servers.some(function (s) { return Number(s.id) === Number(selectedId); })) {
                selectedId = Number(servers[0].id);
                State.setServer(selectedId);
            }

            function serverSwitcher() {
                return '<label class="field" style="max-width:320px;margin-bottom:0"><span>Сервер</span>'
                    + '<select id="serverSelect">'
                    + servers.map(function (s) {
                        return '<option value="' + s.id + '"' + (Number(s.id) === Number(selectedId) ? " selected" : "") + '>'
                            + UI.esc(s.name) + '</option>';
                    }).join("")
                    + '</select></label>';
            }

            async function load() {
                container.innerHTML = UI.loading("Загрузка сборок...");
                var data;
                try {
                    data = await Api.builds(selectedId);
                } catch (error) {
                    container.innerHTML = UI.empty("Не удалось загрузить сборки", error.message);
                    return;
                }

                var builds = (data && data.builds) || [];
                var currentBuildId = data ? data.currentBuildId : null;
                var current = builds.filter(function (b) { return Number(b.id) === Number(currentBuildId); })[0];

                var header = '<div class="card" style="margin-bottom:18px"><div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap">'
                    + serverSwitcher()
                    + '<div style="display:flex;gap:24px;flex-wrap:wrap">'
                    + '  <div><span class="k text-faint" style="font-size:11px;display:block">Current build</span>'
                    + '    <b class="mono">' + UI.esc(current ? current.version : "не опубликована") + '</b></div>'
                    + '  <div><span class="k text-faint" style="font-size:11px;display:block">Всего сборок</span>'
                    + '    <b>' + UI.esc(builds.length) + '</b></div>'
                    + '</div></div></div>';

                if (builds.length === 0) {
                    container.innerHTML = header + UI.empty(
                        "Сборок пока нет",
                        "Создайте черновик здесь или соберите сборку через TwistX Build Tool.",
                        '<button type="button" class="btn btn-primary" id="newBuildEmpty">+ Новая сборка</button>'
                    );
                    bindSwitcher();
                    var emptyBtn = container.querySelector("#newBuildEmpty");
                    if (emptyBtn) emptyBtn.addEventListener("click", function () { openNewBuild(selectedId, load); });
                    return;
                }

                container.innerHTML = header
                    + '<div class="table-wrap"><table>'
                    + '<thead><tr><th>Version</th><th>Minecraft</th><th>Loader</th><th class="text-right">Files</th>'
                    + '<th class="text-right">Size</th><th>Status</th><th>Published</th><th></th></tr></thead>'
                    + '<tbody>' + builds.map(function (b) { return buildRow(b, currentBuildId, load); }).join("") + '</tbody>'
                    + '</table></div>'
                    + '<p class="hint">Rollback возвращает игрокам ранее опубликованную сборку — она снова становится текущей. '
                    + 'Clients скачают только изменившиеся файлы.</p>';

                bindSwitcher();

                container.querySelectorAll("tbody tr").forEach(function (row, index) {
                    var build = builds[index];
                    row.querySelectorAll("[data-act]").forEach(function (button) {
                        button.addEventListener("click", async function () {
                            var act = button.dataset.act;

                            if (act === "publish") {
                                var ok = await UI.confirm(
                                    "Опубликовать сборку " + build.version + "?",
                                    "Игроки начнут получать эту сборку при следующем запуске лаунчера.",
                                    "Publish"
                                );
                                if (!ok) return;
                                try {
                                    await Api.publishBuild(build.id);
                                    UI.notify.success("Сборка " + build.version + " опубликована");
                                    load();
                                } catch (error) { UI.notify.fromError(error); }
                            }

                            if (act === "rollback") {
                                var okRollback = await UI.confirm(
                                    "Откатить игроков на " + build.version + "?",
                                    "Эта сборка снова станет текущей. Текущая сборка останется в истории.",
                                    "Rollback"
                                );
                                if (!okRollback) return;
                                try {
                                    await Api.rollbackBuild(build.id);
                                    UI.notify.success("Игроки получают сборку " + build.version);
                                    load();
                                } catch (error) { UI.notify.fromError(error); }
                            }

                            if (act === "files") {
                                State.setBuild(build.id);
                                window.location.hash = "#/files";
                            }

                            if (act === "delete") {
                                var okDelete = await UI.confirm(
                                    "Удалить сборку " + build.version + "?",
                                    "Сборка и её список файлов будут удалены. Файлы в хранилище останутся. Действие необратимо.",
                                    "Удалить сборку"
                                );
                                if (!okDelete) return;
                                try {
                                    await Api.deleteBuild(build.id);
                                    UI.notify.success("Сборка удалена");
                                    load();
                                } catch (error) { UI.notify.fromError(error); }
                            }
                        });
                    });
                });
            }

            function bindSwitcher() {
                var select = container.querySelector("#serverSelect");
                if (!select) return;
                select.addEventListener("change", function () {
                    selectedId = Number(select.value);
                    State.setServer(selectedId);
                    State.setBuild(null);
                    load();
                });
            }

            var newBuild = actionBar.querySelector("#newBuild");
            if (newBuild) newBuild.addEventListener("click", function () { openNewBuild(selectedId, load); });

            await load();
        },
    };
})();
