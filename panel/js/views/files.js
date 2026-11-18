/** Files: состав сборки по каталогам — upload, replace, download, delete. */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;
    var Picker = window.TwistXPicker;

    /** Известные каталоги клиентской сборки Minecraft. */
    var KNOWN_DIRS = ["mods", "config", "resourcepacks", "shaderpacks", "scripts", "defaultconfigs", "kubejs", "tacz"];

    function dirOf(path) {
        var index = String(path).lastIndexOf("/");
        return index === -1 ? "(корень)" : path.slice(0, index);
    }

    function fileUrl(buildId, path) {
        var encoded = String(path).split("/").filter(Boolean).map(encodeURIComponent).join("/");
        return window.TwistXConfig.resolve() + "/api/files/" + buildId + "/" + encoded;
    }

    function basename(path) {
        var index = String(path).lastIndexOf("/");
        return index === -1 ? path : path.slice(index + 1);
    }

    /** Загружает один файл с прогрессом и проверкой SHA-256 на стороне API. */
    function uploadWithProgress(button, buildId, targetPath, file, onDone) {
        var progressBar = button.closest(".upload-bar");
        var bar = progressBar ? progressBar.querySelector(".progress-bar") : null;

        UI.sha256Hex(file).then(function (hash) {
            // XHR нужен для прогресса: fetch не сообщает о ходе отправки тела.
            var xhr = new XMLHttpRequest();
            var url = window.TwistXConfig.resolve()
                + "/api/admin/files/upload?buildId=" + encodeURIComponent(buildId)
                + "&path=" + encodeURIComponent(targetPath)
                + "&sha256=" + encodeURIComponent(hash);

            if (bar) bar.style.width = "0%";

            return new Promise(function (resolve, reject) {
                xhr.open("POST", url, true);
                xhr.setRequestHeader("Authorization", "Bearer " + Api.token());
                xhr.setRequestHeader("Content-Type", "application/octet-stream");

                xhr.upload.onprogress = function (event) {
                    if (bar && event.lengthComputable) {
                        bar.style.width = Math.round((event.loaded / event.total) * 100) + "%";
                    }
                };

                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300) return resolve();
                    var message = "Ошибка " + xhr.status;
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (data && data.error) message = data.error;
                    } catch (error) { /* тело не JSON */ }
                    reject(new Error(message));
                };
                xhr.onerror = function () { reject(new Error("Не удалось загрузить " + basename(targetPath))); };
                xhr.send(file);
            });
        }).then(function () {
            UI.notify.success("Загружено: " + targetPath);
            onDone();
        }).catch(function (error) {
            UI.notify.fromError(error, "Не удалось загрузить " + basename(targetPath));
            onDone();
        });
    }

    function openUpload(buildId, suggestedDir, reload) {
        var dirs = KNOWN_DIRS.slice();
        UI.modal({
            title: "Загрузить файл в сборку",
            body: ''
                + '<label class="field"><span>Каталог</span>'
                + '  <select name="dir">'
                + dirs.map(function (d) {
                    return '<option value="' + d + '"' + (d === suggestedDir ? " selected" : "") + '>' + d + '/</option>';
                }).join("")
                + '  <option value="__custom">другой...</option>'
                + '  </select></label>'
                + '<label class="field" id="customDirField" hidden><span>Свой каталог</span>'
                + '  <input type="text" name="customDir" placeholder="structures"></label>'
                + '<label class="field"><span>Файл *</span>'
                + '  <input type="file" name="file" required></label>'
                + '<label class="field"><span>Имя в сборке</span>'
                + '  <input type="text" name="fileName" placeholder="оставьте пустым — взять имя файла"></label>'
                + '<div class="upload-bar"><div class="progress"><div class="progress-bar"></div></div></div>'
                + '<p class="hint">SHA-256 считается в браузере и проверяется API: файл попадёт в сборку только при совпадении. '
                + 'Загрузка файла с путём, который уже есть в сборке, заменяет его.</p>',
            footer: '<button type="button" class="btn" data-act="cancel">Отмена</button>'
                + '<button type="button" class="btn btn-primary" data-act="upload">Загрузить</button>',
            onMount: function (root, close) {
                var dirSelect = root.querySelector('[name="dir"]');
                var customField = root.querySelector("#customDirField");
                dirSelect.addEventListener("change", function () {
                    customField.hidden = dirSelect.value !== "__custom";
                });

                root.querySelector('[data-act="cancel"]').addEventListener("click", close);

                var upload = root.querySelector('[data-act="upload"]');
                upload.addEventListener("click", async function () {
                    var form = UI.readForm(root);
                    var fileInput = root.querySelector('[name="file"]');
                    var file = fileInput.files && fileInput.files[0];
                    if (!file) return UI.notify.warn("Выберите файл");

                    var dir = form.dir === "__custom" ? String(form.customDir || "").trim() : form.dir;
                    dir = dir.replace(/^\/+|\/+$/g, "");
                    if (dir.includes("..") || dir.includes("\\")) return UI.notify.warn("Недопустимый каталог");

                    var name = String(form.fileName || "").trim() || file.name;
                    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
                        return UI.notify.warn("Недопустимое имя файла");
                    }

                    var targetPath = dir ? (dir + "/" + name) : name;
                    UI.setBusy(upload, true, "Загрузка...");
                    close();
                    uploadWithProgress(upload, buildId, targetPath, file, reload);
                });
            },
        });
    }

    window.TwistXViews = window.TwistXViews || {};
    window.TwistXViews.files = {
        title: "Files",
        actions: function () {
            return '<button type="button" class="btn btn-sm btn-primary" id="uploadFile">+ Upload file</button>';
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
                    "Создайте сборку на странице Builds или через TwistX Build Tool.",
                    '<button type="button" class="btn btn-primary" id="goBuilds">Перейти в Builds</button>'
                );
                var go = container.querySelector("#goBuilds");
                if (go) go.addEventListener("click", function () { window.location.hash = "#/builds"; });
                return;
            }

            var filterDir = "all";

            async function load() {
                container.innerHTML = Picker.html(context) + UI.loading("Загрузка файлов...");
                Picker.bind(container, context, load);

                var data;
                try {
                    data = await Api.files(context.buildId);
                } catch (error) {
                    container.innerHTML = Picker.html(context) + UI.empty("Не удалось загрузить файлы", error.message);
                    Picker.bind(container, context, load);
                    return;
                }

                var files = (data && data.files) || [];
                var dirs = {};
                files.forEach(function (f) { dirs[dirOf(f.path)] = (dirs[dirOf(f.path)] || 0) + 1; });
                var totalSize = files.reduce(function (sum, f) { return sum + (Number(f.size) || 0); }, 0);

                var visible = filterDir === "all" ? files : files.filter(function (f) { return dirOf(f.path) === filterDir; });

                var body;
                if (files.length === 0) {
                    body = UI.empty(
                        "В сборке нет файлов",
                        "Загрузите файлы вручную или соберите сборку через TwistX Build Tool.",
                        '<button type="button" class="btn btn-primary" id="uploadEmpty">+ Upload file</button>'
                    );
                } else {
                    body = '<div class="table-wrap"><table>'
                        + '<thead><tr><th>Path</th><th class="text-right">Size</th><th>SHA-256</th><th></th></tr></thead>'
                        + '<tbody>' + visible.map(function (f) {
                            return '<tr data-file-id="' + UI.esc(f.id) + '" data-path="' + UI.esc(f.path) + '">'
                                + '<td class="mono">' + UI.esc(f.path) + '</td>'
                                + '<td class="text-right nowrap">' + UI.esc(UI.bytes(f.size)) + '</td>'
                                + '<td class="mono text-faint" title="' + UI.esc(f.sha256) + '">'
                                + UI.esc(String(f.sha256 || "").slice(0, 16)) + '…</td>'
                                + '<td class="row-actions">'
                                + '<a class="btn btn-sm" href="' + UI.esc(fileUrl(context.buildId, f.path)) + '" target="_blank" rel="noopener">Download</a>'
                                + '<button type="button" class="btn btn-sm" data-act="replace">Replace</button>'
                                + '<button type="button" class="btn btn-sm btn-danger" data-act="delete">Удалить</button>'
                                + '</td></tr>';
                        }).join("") + '</tbody></table></div>';
                }

                container.innerHTML = Picker.html(context)
                    + '<div class="card" style="margin-bottom:18px"><div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;justify-content:space-between">'
                    + '  <label class="field" style="max-width:300px;margin-bottom:0"><span>Каталог</span>'
                    + '    <select id="dirFilter">'
                    + '      <option value="all"' + (filterDir === "all" ? " selected" : "") + '>все (' + files.length + ')</option>'
                    + Object.keys(dirs).sort().map(function (d) {
                        return '<option value="' + UI.esc(d) + '"' + (filterDir === d ? " selected" : "") + '>'
                            + UI.esc(d) + '/ (' + dirs[d] + ')</option>';
                    }).join("")
                    + '    </select></label>'
                    + '  <div style="display:flex;gap:24px">'
                    + '    <div><span class="text-faint" style="font-size:11px;display:block">Файлов</span><b>' + files.length + '</b></div>'
                    + '    <div><span class="text-faint" style="font-size:11px;display:block">Объём</span><b>' + UI.esc(UI.bytes(totalSize)) + '</b></div>'
                    + '  </div>'
                    + '</div></div>'
                    + body;

                Picker.bind(container, context, load);

                var dirFilterEl = container.querySelector("#dirFilter");
                if (dirFilterEl) {
                    dirFilterEl.addEventListener("change", function () {
                        filterDir = dirFilterEl.value;
                        load();
                    });
                }

                var uploadEmpty = container.querySelector("#uploadEmpty");
                if (uploadEmpty) uploadEmpty.addEventListener("click", function () { openUpload(context.buildId, "mods", load); });

                container.querySelectorAll("tbody tr").forEach(function (row) {
                    var filePath = row.dataset.path;
                    var fileId = Number(row.dataset.fileId);

                    var replaceBtn = row.querySelector('[data-act="replace"]');
                    if (replaceBtn) {
                        replaceBtn.addEventListener("click", function () {
                            UI.pickFile().then(function (file) {
                                if (!file) return;
                                uploadWithProgress(replaceBtn, context.buildId, filePath, file, load);
                            });
                        });
                    }

                    var deleteBtn = row.querySelector('[data-act="delete"]');
                    if (deleteBtn) {
                        deleteBtn.addEventListener("click", async function () {
                            var ok = await UI.confirm(
                                "Удалить файл из сборки?",
                                filePath + " будет удалён из списка файлов сборки. Объект в хранилище останется доступен другим сборкам.",
                                "Удалить файл"
                            );
                            if (!ok) return;
                            try {
                                await Api.deleteFile(fileId);
                                UI.notify.success("Файл удалён из сборки");
                                load();
                            } catch (error) { UI.notify.fromError(error); }
                        });
                    }
                });
            }

            var upload = actionBar.querySelector("#uploadFile");
            if (upload) upload.addEventListener("click", function () { openUpload(context.buildId, "mods", load); });

            await load();
        },
    };
})();
