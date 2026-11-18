/**
 * Общий компонент выбора «сервер → сборка» для страниц Files и Mods.
 * Оба экрана работают с составом одной сборки, поэтому выбор должен вести себя
 * одинаково и восстанавливаться из состояния панели.
 */
(function () {
    "use strict";

    var UI = window.TwistXUI;
    var Api = window.TwistXApi;
    var State = window.TwistXState;

    /**
     * Загружает серверы и сборки и приводит выбор к корректному состоянию.
     * @returns {Promise<{servers:Array, builds:Array, serverId:number, buildId:number}>}
     */
    async function resolve() {
        var serversData = await Api.servers();
        var servers = (serversData && serversData.servers) || [];
        if (servers.length === 0) return { servers: [], builds: [], serverId: null, buildId: null };

        var serverId = State.serverId();
        if (!serverId || !servers.some(function (s) { return Number(s.id) === Number(serverId); })) {
            serverId = Number(servers[0].id);
            State.setServer(serverId);
        }

        var buildsData = await Api.builds(serverId);
        var builds = (buildsData && buildsData.builds) || [];
        if (builds.length === 0) return { servers: servers, builds: [], serverId: serverId, buildId: null };

        var buildId = State.buildId();
        if (!buildId || !builds.some(function (b) { return Number(b.id) === Number(buildId); })) {
            // По умолчанию открываем текущую сборку сервера — с ней чаще всего и работают.
            var current = buildsData.currentBuildId;
            buildId = (current && builds.some(function (b) { return Number(b.id) === Number(current); }))
                ? Number(current)
                : Number(builds[0].id);
            State.setBuild(buildId);
        }

        return { servers: servers, builds: builds, serverId: serverId, buildId: buildId };
    }

    function html(context) {
        var servers = context.servers || [];
        var builds = context.builds || [];
        return '<div class="card" style="margin-bottom:18px"><div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap">'
            + '<label class="field" style="max-width:280px;margin-bottom:0"><span>Сервер</span>'
            + '  <select id="pickerServer">'
            + servers.map(function (s) {
                return '<option value="' + s.id + '"' + (Number(s.id) === Number(context.serverId) ? " selected" : "") + '>'
                    + UI.esc(s.name) + '</option>';
            }).join("")
            + '  </select></label>'
            + '<label class="field" style="max-width:280px;margin-bottom:0"><span>Сборка</span>'
            + '  <select id="pickerBuild"' + (builds.length === 0 ? " disabled" : "") + '>'
            + (builds.length === 0
                ? '<option>нет сборок</option>'
                : builds.map(function (b) {
                    return '<option value="' + b.id + '"' + (Number(b.id) === Number(context.buildId) ? " selected" : "") + '>'
                        + UI.esc(b.version + " · " + b.status + " · " + b.fileCount + " файл(ов)") + '</option>';
                }).join(""))
            + '  </select></label>'
            + '</div></div>';
    }

    /**
     * Навешивает обработчики на отрисованный html().
     * @param {Function} onSelectionChange — вызывается после смены сервера или сборки
     */
    function bind(container, context, onSelectionChange) {
        var serverSelect = container.querySelector("#pickerServer");
        var buildSelect = container.querySelector("#pickerBuild");

        if (serverSelect) {
            serverSelect.addEventListener("change", function () {
                State.setServer(Number(serverSelect.value));
                State.setBuild(null);
                onSelectionChange();
            });
        }

        if (buildSelect && !buildSelect.disabled) {
            buildSelect.addEventListener("change", function () {
                State.setBuild(Number(buildSelect.value));
                onSelectionChange();
            });
        }

        void context;
    }

    window.TwistXPicker = { resolve: resolve, html: html, bind: bind };
})();
