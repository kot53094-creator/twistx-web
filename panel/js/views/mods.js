/**
 * Mods: моды выбранной сборки (файлы каталога mods/).
 *
 * Состав сборки целиком собирается в TwistX Build Tool — здесь администратор
 * дорабатывает уже созданную сборку: добавляет, заменяет и удаляет отдельные моды.
 */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;
    var Picker = window.TwistXPicker;

    var MODS_DIR = "mods";

    function isMod(file) {
        return String(file.path || "").toLowerCase().indexOf(MODS_DIR + "/") === 0;
    }

    function modName(path) {
        return String(path).slice(MODS_DIR.length + 1);
    }

    function uploadMod(button, buildId, fileName, file, onDone) {
        var targetPath = MODS_DIR + "/" + fileName;
        UI.sha256Hex(file).then(function (hash) {
            return Api.uploadFile(buildId, targetPath, hash, file);
        }).then(function () {
            UI.notify.success("Мод добавлен: " + fileName);
            onDone();
        }).catch(function (error) {
            UI.notify.fromError(error, "Не удалось добавить мод " + fileName);
            onDone();
        }).finally(function () {
            UI.setBusy(button, false);
        });
    }

    function openAddMod(buildId, reload) {
        UI.modal({
            title: "Добавить мод в сборку",
            body: ''
                + '<label class="field"><span>Файл мода (.jar) *</span>'
                + '  <input type="file" name="file" accept=".jar" required></label>'
                + '<label class="field"><span>Имя в сборке</span>'
                + '  <input type="text" name="fileName" placeholder="оставьте пустым — взять имя файла"></label>'
                + '<p class="hint">Файл попадёт в <b>mods/</b> выбранной сборки. SHA-256 считается автоматически '
                + 'и проверяется API. Если мод с таким именем уже есть в сборке, он будет заменён.</p>',
            footer: '<button type="button" class="btn" data-act="cancel">Отмена</button>'
                + '<button type="button" class="btn btn-primary" data-act="add">Добавить</button>',
            onMount: function (root, close) {
                root.querySelector('[data-act="cancel"]').addEventListener("click", close);
                var add = root.querySelector('[data-act="add"]');
                add.addEventListener("click", function () {
                    var form = UI.readForm(root);
                    var fileInput = root.querySelector('[name="file"]');
                    var file = fileInput.files && fileInput.files[0];
                    if (!file) return UI.notify.warn("Выберите файл мода");
                    if (!/\.jar$/i.test(file.name)) return UI.notify.warn("Мод должен быть .jar файлом");

                    var name = String(form.fileName || "").trim() || file.name;
                    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
                        return UI.notify.warn("Недопустимое имя файла");
                    }
                    if (!/\.jar$/i.test(name)) name += ".jar";

                    UI.setBusy(add, true, "Загрузка...");
                    close();
                    uploadMod(add, buildId, name, file, reload);
                });
            },
        });
    }

    window.TwistXViews = window.TwistXViews || {};
    window.TwistXViews.mods = {
        title: "Mods",
        actions: function () {
            return '<button type="button" class="btn btn-sm btn-primary" id="addMod">+ Add mod</button>';
        },
        mount: async function (container, actionBar) {
            var context;
            try {
                context = await Picker.resolve();
            } catch (error) {
                container.innerHTML = UI.empty("Не удалось загрузить данные", error.message);
                return;
            }

            if (!context.buildId) {
                container.innerHTML = UI.empty(
                    "Для этого сервера нет сборок",
                    "Добавлять моды можно только в существующую сборку.",
                    '<button type="button" class="btn btn-primary" id="goBuilds">Перейти в Builds</button>'
                );
                var go = container.querySelector("#goBuilds");
                if (go) go.addEventListener("click", function () { window.location.hash = "#/builds"; });
                return;
            }

            async function load() {
                container.innerHTML = Picker.html(context) + UI.loading("Загрузка модов...");
                Picker.bind(container, context, load);

                var data;
                try {
                    data = await Api.files(context.buildId);
                } catch (error) {
                    container.innerHTML = Picker.html(context) + UI.empty("Не удалось загрузить моды", error.message);
                    Picker.bind(container, context, load);
                    return;
                }

                var mods = ((data && data.files) || []).filter(isMod);
                var totalSize = mods.reduce(function (sum, f) { return sum + (Number(f.size) || 0); }, 0);

                var body;
                if (mods.length === 0) {
                    body = UI.empty(
                        "В сборке нет модов",
                        "Добавьте мод или соберите сборку целиком через TwistX Build Tool.",
                        '<button type="button" class="btn btn-primary" id="addModEmpty">+ Add mod</button>'
                    );
                } else {
                    body = '<div class="table-wrap"><table>'
                        + '<thead><tr><th style="width:38px"></th><th>Мод</th><th class="text-right">Size</th><th>SHA-256</th><th></th></tr></thead>'
                        + '<tbody>' + mods.map(function (mod) {
                            return '<tr data-file-id="' + UI.esc(mod.id) + '" data-path="' + UI.esc(mod.path) + '">'
                                + '<td class="text-accent" style="color:var(--accent)">✓</td>'
                                + '<td class="mono">' + UI.esc(modName(mod.path)) + '</td>'
                                + '<td class="text-right nowrap">' + UI.esc(UI.bytes(mod.size)) + '</td>'
                                + '<td class="mono text-faint" title="' + UI.esc(mod.sha256) + '">'
                                + UI.esc(String(mod.sha256 || "").slice(0, 16)) + '…</td>'
                                + '<td class="row-actions">'
                                + '<button type="button" class="btn btn-sm" data-act="replace">Replace</button>'
                                + '<button type="button" class="btn btn-sm btn-danger" data-act="delete">Удалить</button>'
                                + '</td></tr>';
                        }).join("") + '</tbody></table></div>';
                }

                container.innerHTML = Picker.html(context)
                    + '<div class="card" style="margin-bottom:18px"><div style="display:flex;gap:24px;flex-wrap:wrap">'
                    + '  <div><span class="text-faint" style="font-size:11px;display:block">Модов в сборке</span>'
                    + '    <b style="font-size:20px">' + mods.length + '</b></div>'
                    + '  <div><span class="text-faint" style="font-size:11px;display:block">Суммарный объём</span>'
                    + '    <b style="font-size:20px">' + UI.esc(UI.bytes(totalSize)) + '</b></div>'
                    + '</div></div>'
                    + body;

                Picker.bind(container, context, load);

                var addModEmpty = container.querySelector("#addModEmpty");
                if (addModEmpty) addModEmpty.addEventListener("click", function () { openAddMod(context.buildId, load); });

                container.querySelectorAll("tbody tr").forEach(function (row) {
                    var modPath = row.dataset.path;
                    var fileId = Number(row.dataset.fileId);

                    var replaceBtn = row.querySelector('[data-act="replace"]');
                    if (replaceBtn) {
                        replaceBtn.addEventListener("click", function () {
                            UI.pickFile(".jar").then(function (file) {
                                if (!file) return;
                                UI.setBusy(replaceBtn, true, "...");
                                uploadMod(replaceBtn, context.buildId, modName(modPath), file, load);
                            });
                        });
                    }

                    var deleteBtn = row.querySelector('[data-act="delete"]');
                    if (deleteBtn) {
                        deleteBtn.addEventListener("click", async function () {
                            var ok = await UI.confirm(
                                "Удалить мод из сборки?",
                                modName(modPath) + " будет исключён из сборки. Игроки получат сборку без этого мода после публикации.",
                                "Удалить мод"
                            );
                            if (!ok) return;
                            try {
                                await Api.deleteFile(fileId);
                                UI.notify.success("Мод удалён из сборки");
                                load();
                            } catch (error) { UI.notify.fromError(error); }
                        });
                    }
                });
            }

            var add = actionBar.querySelector("#addMod");
            if (add) add.addEventListener("click", function () { openAddMod(context.buildId, load); });

            await load();
        },
    };
})();
