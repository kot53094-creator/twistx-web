/**
 * Кнопка «Админка» в шапке сайта — только для аккаунтов с ролью admin.
 *
 * Роль приходит из /api/auth/me (поле isAdmin). Кнопка не «спрятана стилями»
 * и не удаляется потом: она вообще не создаётся для обычного игрока, поэтому
 * в разметке её нет и подсмотреть нечего.
 */
(function () {
    "use strict";

    var PANEL_URL = "./panel/";

    function addButton() {
        var nav = document.querySelector("ul.nav-links-center");
        if (!nav || nav.querySelector("[data-admin-link]")) return;

        var item = document.createElement("li");
        item.setAttribute("data-admin-link", "1");

        var link = document.createElement("a");
        link.href = PANEL_URL;
        link.textContent = "Админка";
        link.style.color = "#ffcc4d";
        link.style.fontWeight = "700";
        link.title = "Панель управления TwistX";

        item.appendChild(link);
        nav.appendChild(item);
    }

    function checkRole() {
        fetch("/api/auth/me", { credentials: "same-origin" })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                var user = data && data.user;
                if (user && user.isAdmin) addButton();
            })
            .catch(function () { /* гость или оффлайн — просто нет кнопки */ });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", checkRole);
    } else {
        checkRole();
    }
})();
