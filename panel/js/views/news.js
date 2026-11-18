/** News: новости, которые лаунчер показывает игрокам на главном экране. */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;

    function openEditor(item, reload) {
        var isEdit = !!item;
        UI.modal({
            title: isEdit ? "Изменить новость" : "Новая новость",
            body: ''
                + '<label class="field"><span>Заголовок *</span>'
                + '  <input type="text" name="title" value="' + UI.esc(isEdit ? item.title : "") + '" required></label>'
                + '<label class="field"><span>Текст</span>'
                + '  <textarea name="text" style="min-height:120px">' + UI.esc(isEdit ? item.text : "") + '</textarea></label>'
                + '<label class="field"><span>Изображение (URL)</span>'
                + '  <input type="text" name="image" value="' + UI.esc(isEdit ? item.image : "") + '" placeholder="https://cdn.twistx.net/news/banner.webp"></label>'
                + '<label class="field" style="display:flex;align-items:center;gap:8px">'
                + '  <input type="checkbox" name="published" style="width:auto"'
                // Новую новость публикуем сразу: раньше галочка стояла снятой, новость
                // сохранялась черновиком и не появлялась у игроков — выглядело как поломка.
                + ((isEdit ? Boolean(item.published) : true) ? " checked" : "") + '>'
                + '  <span style="margin:0">Опубликовать (видна игрокам в лаунчере)</span></label>'
                + '<p class="hint">Черновик игроки не видят — новость появится в лаунчере после публикации.</p>',
            footer: '<button type="button" class="btn" data-act="cancel">Отмена</button>'
                + '<button type="button" class="btn btn-primary" data-act="save">'
                + (isEdit ? "Сохранить" : "Создать") + '</button>',
            onMount: function (root, close) {
                root.querySelector('[data-act="cancel"]').addEventListener("click", close);
                var save = root.querySelector('[data-act="save"]');
                save.addEventListener("click", async function () {
                    var form = UI.readForm(root);
                    if (!String(form.title || "").trim()) return UI.notify.warn("Введите заголовок");
                    var payload = {
                        title: String(form.title).trim(),
                        text: form.text,
                        image: form.image,
                        published: !!form.published,
                    };
                    UI.setBusy(save, true, "Сохранение...");
                    try {
                        if (isEdit) await Api.updateNews(item.id, payload);
                        else await Api.createNews(payload);
                        UI.notify.success(isEdit ? "Новость обновлена" : "Новость создана");
                        close();
                        reload();
                    } catch (error) {
                        UI.notify.fromError(error);
                    } finally {
                        UI.setBusy(save, false);
                    }
                });
            },
        });
    }

    window.TwistXViews = window.TwistXViews || {};
    window.TwistXViews.news = {
        title: "News",
        actions: function () {
            return '<button type="button" class="btn btn-sm btn-primary" id="createNews">+ News</button>';
        },
        mount: async function (container, actionBar) {
            async function load() {
                container.innerHTML = UI.loading("Загрузка новостей...");
                var data;
                try {
                    data = await Api.news();
                } catch (error) {
                    container.innerHTML = UI.empty("Не удалось загрузить новости", error.message);
                    return;
                }

                var items = (data && data.news) || [];
                if (items.length === 0) {
                    container.innerHTML = UI.empty(
                        "Новостей пока нет",
                        "Создайте первую новость — она появится в лаунчере при следующем запуске.",
                        '<button type="button" class="btn btn-primary" id="createNewsEmpty">+ News</button>'
                    );
                    var emptyBtn = container.querySelector("#createNewsEmpty");
                    if (emptyBtn) emptyBtn.addEventListener("click", function () { openEditor(null, load); });
                    return;
                }

                container.innerHTML = '<div class="table-wrap"><table>'
                    + '<thead><tr><th>Заголовок</th><th>Текст</th><th>Статус</th><th>Создана</th><th></th></tr></thead>'
                    + '<tbody>' + items.map(function (item) {
                        var preview = String(item.text || "").slice(0, 80);
                        return '<tr data-id="' + UI.esc(item.id) + '">'
                            + '<td><b>' + UI.esc(item.title) + '</b>'
                            + (item.image ? ' <span class="text-faint">🖼</span>' : '') + '</td>'
                            + '<td class="text-dim">' + UI.esc(preview) + (preview.length >= 80 ? "…" : "") + '</td>'
                            + '<td>' + (item.published ? UI.badge("опубликована", "published") : UI.badge("черновик", "draft")) + '</td>'
                            + '<td class="text-dim nowrap">' + UI.esc(UI.date(item.created_at || item.createdAt)) + '</td>'
                            + '<td class="row-actions">'
                            + '<button type="button" class="btn btn-sm" data-act="edit">Изменить</button>'
                            + '<button type="button" class="btn btn-sm" data-act="toggle">'
                            + (item.published ? "Снять" : "Опубликовать") + '</button>'
                            + '<button type="button" class="btn btn-sm btn-danger" data-act="delete">Удалить</button>'
                            + '</td></tr>';
                    }).join("") + '</tbody></table></div>';

                container.querySelectorAll("tbody tr").forEach(function (row) {
                    var id = Number(row.dataset.id);
                    var item = items.filter(function (n) { return Number(n.id) === id; })[0];

                    row.querySelector('[data-act="edit"]').addEventListener("click", function () {
                        openEditor(item, load);
                    });

                    row.querySelector('[data-act="toggle"]').addEventListener("click", async function () {
                        try {
                            await Api.updateNews(id, { published: !item.published });
                            UI.notify.success(item.published ? "Новость снята с публикации" : "Новость опубликована");
                            load();
                        } catch (error) { UI.notify.fromError(error); }
                    });

                    row.querySelector('[data-act="delete"]').addEventListener("click", async function () {
                        var ok = await UI.confirm("Удалить новость?", "«" + item.title + "» будет удалена.", "Удалить");
                        if (!ok) return;
                        try {
                            await Api.deleteNews(id);
                            UI.notify.success("Новость удалена");
                            load();
                        } catch (error) { UI.notify.fromError(error); }
                    });
                });
            }

            var create = actionBar.querySelector("#createNews");
            if (create) create.addEventListener("click", function () { openEditor(null, load); });
            await load();
        },
    };
})();
