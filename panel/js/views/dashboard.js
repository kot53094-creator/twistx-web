/** Dashboard: сводка по серверам, сборкам и последние действия администратора. */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;

    var ACTION_LABELS = {
        "login": "Вход в панель",
        "server.create": "Создан сервер",
        "server.update": "Изменён сервер",
        "server.delete": "Удалён сервер",
        "build.create": "Создана сборка",
        "build.publish": "Опубликована сборка",
        "build.rollback": "Откат сборки",
        "build.delete": "Удалена сборка",
        "file.create": "Добавлен файл",
        "file.upload": "Загружен файл",
        "file.delete": "Удалён файл",
        "news.create": "Создана новость",
        "news.update": "Изменена новость",
        "news.delete": "Удалена новость",
    };

    function statCard(value, label, accent) {
        return '<div class="card">'
            + '<div class="stat-value' + (accent ? " stat-accent" : "") + '">' + UI.esc(value) + '</div>'
            + '<div class="stat-label">' + UI.esc(label) + '</div>'
            + '</div>';
    }

    function renderActivity(items) {
        if (!items || items.length === 0) {
            return UI.empty("Пока нет событий", "Действия администратора появятся здесь.");
        }
        var rows = items.map(function (item) {
            var label = ACTION_LABELS[item.action] || item.action;
            return '<tr>'
                + '<td class="nowrap">' + UI.esc(UI.timeAgo(item.createdAt)) + '</td>'
                + '<td><b>' + UI.esc(label) + '</b>'
                + (item.details ? ' <span class="text-dim">' + UI.esc(item.details) + '</span>' : '')
                + '</td>'
                + '<td class="text-dim nowrap">' + UI.esc(item.actor || "—") + '</td>'
                + '</tr>';
        }).join("");
        return '<div class="table-wrap"><table>'
            + '<thead><tr><th>Когда</th><th>Действие</th><th>Кто</th></tr></thead>'
            + '<tbody>' + rows + '</tbody></table></div>';
    }

    function renderBuilds(items) {
        if (!items || items.length === 0) {
            return UI.empty("Сборок пока нет", "Создайте сборку на странице Builds или загрузите её через TwistX Build Tool.");
        }
        var rows = items.map(function (build) {
            var kind = build.status === "published" ? "published" : "draft";
            return '<tr>'
                + '<td><b>' + UI.esc(build.serverName || "—") + '</b></td>'
                + '<td class="mono">' + UI.esc(build.version) + '</td>'
                + '<td>' + UI.badge(build.status, kind) + '</td>'
                + '<td class="text-dim nowrap">' + UI.esc(build.publishedAt ? UI.date(build.publishedAt) : "—") + '</td>'
                + '</tr>';
        }).join("");
        return '<div class="table-wrap"><table>'
            + '<thead><tr><th>Сервер</th><th>Версия</th><th>Статус</th><th>Опубликована</th></tr></thead>'
            + '<tbody>' + rows + '</tbody></table></div>';
    }

    window.TwistXViews = window.TwistXViews || {};
    window.TwistXViews.dashboard = {
        title: "Dashboard",
        actions: function () {
            return '<button type="button" class="btn btn-sm" id="refreshDashboard">Обновить</button>';
        },
        mount: async function (container, actionBar) {
            async function load() {
                container.innerHTML = UI.loading("Загрузка сводки...");
                var data;
                try {
                    data = await Api.dashboard();
                } catch (error) {
                    container.innerHTML = UI.empty("Не удалось загрузить дашборд", error.message);
                    return;
                }

                container.innerHTML = ''
                    + '<div class="grid grid-stats">'
                    + statCard(data.serversOnline + " / " + data.servers, "Online servers", true)
                    + statCard(data.playersOnline, "Players online", true)
                    + statCard(data.builds, "Builds (" + data.drafts + " черновиков)")
                    + statCard(data.files, "Files")
                    + statCard(data.news, "Опубликованных новостей")
                    + '</div>'
                    + '<div class="section-title"><h3>Latest builds</h3></div>'
                    + renderBuilds(data.latestBuilds)
                    + '<div class="section-title"><h3>Recent activity</h3></div>'
                    + renderActivity(data.recentActivity);
            }

            var refresh = actionBar.querySelector("#refreshDashboard");
            if (refresh) refresh.addEventListener("click", load);
            await load();
        },
    };
})();
