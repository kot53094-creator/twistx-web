/**
 * Users: аккаунты TwistX ID — кто зарегистрировался на сайте и в лаунчере.
 *
 * Пароли здесь показать нельзя и это не ограничение панели: в базе лежит только
 * PBKDF2-хэш, из которого исходный пароль не восстанавливается. Поэтому админ
 * может выдать игроку новый пароль (сброс) — он сразу подходит и для сайта, и
 * для лаунчера.
 */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;

    var PAGE_SIZE = 50;

    function shortUuid(uuid) {
        var value = String(uuid || "");
        return value.length > 8 ? value.slice(0, 8) + "…" : value;
    }

    function openPasswordReset(user, reload) {
        UI.modal({
            title: "Новый пароль: " + user.username,
            body: ''
                + '<p style="margin:0 0 12px;color:var(--text-dim)">Старый пароль узнать невозможно — в базе только хэш. '
                + 'Введите новый: игрок войдёт с ним и на сайте, и в лаунчере. Все текущие сессии будут завершены.</p>'
                + '<label class="field"><span>Новый пароль *</span>'
                + '  <input type="text" name="password" autocomplete="off" placeholder="минимум 8 символов, буквы и цифры"></label>',
            footer: '<button type="button" class="btn" data-act="cancel">Отмена</button>'
                + '<button type="button" class="btn btn-primary" data-act="save">Сменить пароль</button>',
            onMount: function (root, close) {
                root.querySelector('[data-act="cancel"]').addEventListener("click", close);
                var save = root.querySelector('[data-act="save"]');
                save.addEventListener("click", async function () {
                    var form = UI.readForm(root);
                    var password = String(form.password || "");
                    if (password.length < 8) return UI.notify.warn("Пароль должен быть минимум 8 символов");
                    if (!/[A-Za-zА-Яа-я]/.test(password) || !/[0-9]/.test(password)) {
                        return UI.notify.warn("Пароль должен содержать буквы и цифры");
                    }

                    UI.setBusy(save, true, "Сохранение...");
                    try {
                        await Api.setUserPassword(user.id, password);
                        UI.notify.success("Пароль обновлён. Передайте его игроку лично.");
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
    window.TwistXViews.users = {
        title: "Пользователи",
        actions: function () {
            return '<button type="button" class="btn btn-sm" id="refreshUsers">Обновить</button>';
        },
        mount: async function (container, actionBar) {
            var state = { q: "", offset: 0 };

            async function load() {
                container.innerHTML = UI.loading("Загрузка аккаунтов...");
                var data;
                try {
                    data = await Api.users({ q: state.q, limit: PAGE_SIZE, offset: state.offset });
                } catch (error) {
                    container.innerHTML = UI.empty("Не удалось загрузить аккаунты", error.message);
                    return;
                }

                var users = (data && data.users) || [];
                var total = (data && data.total) || 0;

                var head = ''
                    + '<div class="toolbar" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'
                    + '  <input type="search" id="usersSearch" placeholder="Поиск по нику или email" value="' + UI.esc(state.q) + '" style="max-width:320px">'
                    + '  <span class="text-dim">Всего аккаунтов: <b>' + UI.esc(total) + '</b></span>'
                    + '</div>';

                if (users.length === 0) {
                    container.innerHTML = head + UI.empty(
                        "Аккаунтов не найдено",
                        state.q ? "Попробуйте изменить запрос." : "Как только игроки зарегистрируются на сайте, они появятся здесь."
                    );
                    bindSearch();
                    return;
                }

                container.innerHTML = head + '<div class="table-wrap"><table>'
                    + '<thead><tr><th>Ник</th><th>Email</th><th>UUID</th><th>Регистрация</th><th>Последний вход</th><th>IP</th><th>Скин</th><th>Статус</th><th></th></tr></thead>'
                    + '<tbody>' + users.map(function (user) {
                        return '<tr data-id="' + UI.esc(user.id) + '">'
                            + '<td><b>' + UI.esc(user.username) + '</b></td>'
                            + '<td class="text-dim">' + UI.esc(user.email || "—") + '</td>'
                            + '<td class="text-dim nowrap" title="' + UI.esc(user.uuid) + '">' + UI.esc(shortUuid(user.uuid)) + '</td>'
                            + '<td class="text-dim nowrap">' + UI.esc(UI.date(user.createdAt)) + '</td>'
                            + '<td class="text-dim nowrap">' + UI.esc(user.lastLoginAt ? UI.timeAgo(user.lastLoginAt) : "не входил") + '</td>'
                            + '<td class="text-dim nowrap">' + UI.esc(user.lastIp || "—") + '</td>'
                            + '<td>' + (user.hasSkin ? UI.badge("есть", "published") : UI.badge("нет", "draft")) + '</td>'
                            + '<td>' + (user.banned ? UI.badge("забанен", "draft") : UI.badge("активен", "published")) + '</td>'
                            + '<td class="row-actions">'
                            + '<button type="button" class="btn btn-sm" data-act="password">Сбросить пароль</button>'
                            + '<button type="button" class="btn btn-sm ' + (user.banned ? "" : "btn-danger") + '" data-act="ban">'
                            + (user.banned ? "Разбанить" : "Забанить") + '</button>'
                            + '</td></tr>';
                    }).join("") + '</tbody></table></div>';

                var pages = Math.ceil(total / PAGE_SIZE);
                if (pages > 1) {
                    container.innerHTML += '<div class="toolbar" style="display:flex;gap:8px;align-items:center;margin-top:12px">'
                        + '<button type="button" class="btn btn-sm" id="usersPrev"' + (state.offset === 0 ? " disabled" : "") + '>← Назад</button>'
                        + '<span class="text-dim">Страница ' + UI.esc(Math.floor(state.offset / PAGE_SIZE) + 1) + ' из ' + UI.esc(pages) + '</span>'
                        + '<button type="button" class="btn btn-sm" id="usersNext"' + (state.offset + PAGE_SIZE >= total ? " disabled" : "") + '>Вперёд →</button>'
                        + '</div>';
                }

                bindSearch();

                var prev = container.querySelector("#usersPrev");
                if (prev) prev.addEventListener("click", function () { state.offset = Math.max(0, state.offset - PAGE_SIZE); load(); });
                var next = container.querySelector("#usersNext");
                if (next) next.addEventListener("click", function () { state.offset += PAGE_SIZE; load(); });

                container.querySelectorAll("tbody tr").forEach(function (row) {
                    var id = Number(row.dataset.id);
                    var user = users.filter(function (u) { return Number(u.id) === id; })[0];

                    row.querySelector('[data-act="password"]').addEventListener("click", function () {
                        openPasswordReset(user, load);
                    });

                    row.querySelector('[data-act="ban"]').addEventListener("click", async function () {
                        var banned = !user.banned;
                        var ok = await UI.confirm(
                            banned ? "Забанить аккаунт?" : "Разбанить аккаунт?",
                            banned
                                ? "«" + user.username + "» не сможет войти на сайт и в лаунчер, активные сессии будут завершены."
                                : "«" + user.username + "» снова сможет входить в аккаунт.",
                            banned ? "Забанить" : "Разбанить"
                        );
                        if (!ok) return;
                        try {
                            await Api.setUserBanned(id, banned);
                            UI.notify.success(banned ? "Аккаунт забанен" : "Аккаунт разбанен");
                            load();
                        } catch (error) { UI.notify.fromError(error); }
                    });
                });
            }

            function bindSearch() {
                var search = container.querySelector("#usersSearch");
                if (!search) return;
                var timer = null;
                function apply() {
                    state.q = search.value.trim();
                    state.offset = 0;
                    load();
                }
                search.addEventListener("keydown", function (event) {
                    if (event.key === "Enter") { event.preventDefault(); apply(); }
                });
                search.addEventListener("input", function () {
                    // Поиск по базе, а не по текущей странице — с небольшой задержкой.
                    clearTimeout(timer);
                    timer = setTimeout(apply, 400);
                });
            }

            var refresh = actionBar.querySelector("#refreshUsers");
            if (refresh) refresh.addEventListener("click", function () { load(); });

            await load();
        },
    };
})();
