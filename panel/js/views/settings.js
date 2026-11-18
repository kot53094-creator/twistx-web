/** Settings: адрес API, проверка соединения и сведения о текущей сессии. */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;
    var Config = window.TwistXConfig;

    window.TwistXViews = window.TwistXViews || {};
    window.TwistXViews.settings = {
        title: "Settings",
        actions: function () { return ""; },
        mount: async function (container) {
            var user = Api.user() || {};
            var current = Config.resolve();
            var fromQuery = Config.isFromQuery();

            container.innerHTML = ''
                + '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">'
                + '  <div class="card">'
                + '    <h3 class="card-title">Подключение к API</h3>'
                + '    <label class="field"><span>Адрес TwistX API</span>'
                + '      <input type="text" id="apiUrl" value="' + UI.esc(current) + '" placeholder="https://api.twistx.net"></label>'
                + '    <p class="hint">Значение по умолчанию задаётся в <b>panel/js/config.js</b> (TWISTX_API_URL). '
                + 'Сохранённое здесь значение переопределяет его в этом браузере.'
                + (fromQuery ? ' Сейчас адрес взят из параметра <b>?api=</b> в ссылке и имеет высший приоритет.' : "")
                + '    </p>'
                + '    <div style="display:flex;gap:8px;margin-top:14px">'
                + '      <button type="button" class="btn btn-primary" id="saveApi">Сохранить</button>'
                + '      <button type="button" class="btn" id="testApi">Проверить соединение</button>'
                + '      <button type="button" class="btn btn-ghost" id="resetApi">Сбросить</button>'
                + '    </div>'
                + '    <div id="apiStatus" style="margin-top:14px"></div>'
                + '  </div>'
                + '  <div class="card">'
                + '    <h3 class="card-title">Сессия</h3>'
                + '    <div class="server-meta" style="border:none;padding:0">'
                + '      <div><span class="k">Пользователь</span><span class="v">' + UI.esc(user.username || "—") + '</span></div>'
                + '      <div><span class="k">Роль</span><span class="v">' + UI.esc(user.role || "—") + '</span></div>'
                + '    </div>'
                + '    <p class="hint">Токен хранится в sessionStorage текущей вкладки и удаляется при выходе или закрытии вкладки.</p>'
                + '    <button type="button" class="btn btn-danger" id="logoutFromSettings" style="margin-top:14px">Выйти</button>'
                + '  </div>'
                + '</div>'
                + '<div class="card" style="margin-top:18px">'
                + '  <h3 class="card-title">Проверка того, что получают игроки</h3>'
                + '  <p class="hint" style="margin-top:0">Публичный manifest — это ровно те данные, которые лаунчер использует '
                + 'для установки сборки. Здесь можно убедиться, что опубликованная сборка отдаётся корректно.</p>'
                + '  <button type="button" class="btn" id="checkManifest">Показать manifest сервера</button>'
                + '  <div id="manifestResult" style="margin-top:14px"></div>'
                + '</div>';

            container.querySelector("#saveApi").addEventListener("click", function () {
                var value = container.querySelector("#apiUrl").value;
                Config.set(value);
                UI.notify.success("Адрес API сохранён");
                container.querySelector("#apiUrl").value = Config.resolve();
            });

            container.querySelector("#resetApi").addEventListener("click", function () {
                Config.set("");
                container.querySelector("#apiUrl").value = Config.resolve();
                UI.notify.info("Используется адрес по умолчанию");
            });

            container.querySelector("#testApi").addEventListener("click", async function () {
                var status = container.querySelector("#apiStatus");
                status.innerHTML = UI.loading("Проверка...");
                try {
                    var data = await Api.publicServers();
                    var count = (data && data.servers) ? data.servers.length : 0;
                    status.innerHTML = '<div class="badge badge-ONLINE">Соединение установлено</div>'
                        + '<p class="hint">API отвечает. Серверов в списке: <b>' + count + '</b>.</p>';
                } catch (error) {
                    status.innerHTML = '<div class="badge badge-OFFLINE">Нет соединения</div>'
                        + '<p class="hint">' + UI.esc(error.message) + '</p>';
                }
            });

            container.querySelector("#logoutFromSettings").addEventListener("click", function () {
                window.TwistXApp.logout();
            });

            container.querySelector("#checkManifest").addEventListener("click", async function () {
                var result = container.querySelector("#manifestResult");
                result.innerHTML = UI.loading("Загрузка...");
                try {
                    var serversData = await Api.servers();
                    var servers = (serversData && serversData.servers) || [];
                    if (servers.length === 0) {
                        result.innerHTML = '<p class="hint">Серверов нет.</p>';
                        return;
                    }
                    var target = servers[0];
                    var manifest;
                    try {
                        manifest = await Api.publicManifest(target.id);
                    } catch (error) {
                        result.innerHTML = '<p class="hint">У сервера «' + UI.esc(target.name) + '» нет опубликованной сборки. '
                            + 'Опубликуйте сборку на странице Builds.</p>';
                        return;
                    }
                    var files = manifest.files || [];
                    var totalSize = files.reduce(function (sum, f) { return sum + (Number(f.size) || 0); }, 0);
                    result.innerHTML = '<div class="table-wrap"><table>'
                        + '<tbody>'
                        + '<tr><td class="text-dim">Server</td><td class="mono">' + UI.esc(manifest.server) + '</td></tr>'
                        + '<tr><td class="text-dim">Version</td><td class="mono">' + UI.esc(manifest.version) + '</td></tr>'
                        + '<tr><td class="text-dim">Minecraft</td><td class="mono">' + UI.esc(manifest.minecraft) + '</td></tr>'
                        + '<tr><td class="text-dim">Loader</td><td class="mono">' + UI.esc(manifest.loader + " " + (manifest.loaderVersion || "")) + '</td></tr>'
                        + '<tr><td class="text-dim">Address</td><td class="mono">' + UI.esc(manifest.serverAddress + ":" + manifest.serverPort) + '</td></tr>'
                        + '<tr><td class="text-dim">Files</td><td class="mono">' + files.length + " · " + UI.esc(UI.bytes(totalSize)) + '</td></tr>'
                        + '</tbody></table></div>';
                } catch (error) {
                    result.innerHTML = '<p class="hint">' + UI.esc(error.message) + '</p>';
                }
            });
        },
    };
})();
