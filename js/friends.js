/*
 * Страница «Друзья»: поиск игроков по нику, заявки, список друзей.
 * Работает поверх /api/friends* из src/twistx-id.js (сессия в httpOnly-cookie).
 */

const TxFriends = {
    me: null,

    api: async (url, options = {}) => {
        const response = await fetch(url, {
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            ...options,
        });
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }
        if (!response.ok) {
            const message = (payload && (payload.message || payload.error)) || `HTTP ${response.status}`;
            throw new Error(message);
        }
        return payload || {};
    },

    escape: (value) => String(value === undefined || value === null ? "" : value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),

    avatar: (player) => {
        const letter = (player.username || "?").slice(0, 1);
        if (player.skin) {
            return `<div class="tx-avatar" style="background-image:url('${TxFriends.escape(player.skin)}')"></div>`;
        }
        return `<div class="tx-avatar">${TxFriends.escape(letter)}</div>`;
    },

    playerRow: (player, actionsHtml, sub) => `
        <div class="tx-player" data-id="${player.id}">
            ${TxFriends.avatar(player)}
            <div class="tx-player-info">
                <span class="tx-player-name">${TxFriends.escape(player.username)}</span>
                <span class="tx-player-sub">${TxFriends.escape(sub || "TwistX ID")}</span>
            </div>
            <div class="tx-player-actions">${actionsHtml}</div>
        </div>`,

    init: async () => {
        try {
            const me = await TxFriends.api("/api/auth/me");
            TxFriends.me = me.user || me;
            const chip = document.getElementById("txNavUser");
            if (chip && TxFriends.me && TxFriends.me.username) {
                chip.innerHTML = `Вы вошли как <a href="./profile.html">${TxFriends.escape(TxFriends.me.username)}</a>`;
            }
        } catch (error) {
            document.getElementById("txSearchResults").innerHTML = `
                <div class="tx-error">Чтобы добавлять друзей, войдите в аккаунт TwistX — <a href="./auth.html">войти</a></div>`;
            const searchBtn = document.getElementById("txFriendSearchBtn");
            if (searchBtn) searchBtn.disabled = true;
            return;
        }

        TxFriends.bindSearch();
        await TxFriends.refresh();
    },

    bindSearch: () => {
        const input = document.getElementById("txFriendSearch");
        const button = document.getElementById("txFriendSearchBtn");
        if (!input || !button) return;

        const run = () => TxFriends.search(input.value.trim());
        button.addEventListener("click", run);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") run();
        });
    },

    search: async (query) => {
        const box = document.getElementById("txSearchResults");
        if (!box) return;

        if (query.length < 2) {
            box.innerHTML = `<div class="tx-empty">Введите минимум 2 символа</div>`;
            return;
        }

        box.innerHTML = `<div class="tx-empty">Ищем…</div>`;

        try {
            const data = await TxFriends.api(`/api/friends/search?q=${encodeURIComponent(query)}`);
            const results = data.results || [];

            if (results.length === 0) {
                box.innerHTML = `<div class="tx-empty">Никого не нашли по запросу «${TxFriends.escape(query)}»</div>`;
                return;
            }

            box.innerHTML = results.map((player) => {
                let actions = `<button class="tx-mini accent" data-add="${TxFriends.escape(player.username)}">Добавить</button>`;
                if (player.relation === "friend") {
                    actions = `<span class="tx-badge-status friend">в друзьях</span>`;
                } else if (player.relation === "pending_in") {
                    actions = `<span class="tx-badge-status pending">ждёт вашего ответа</span>`;
                } else if (player.relation === "pending_out") {
                    actions = `<span class="tx-badge-status pending">заявка отправлена</span>`;
                }
                return TxFriends.playerRow(player, actions, player.uuid ? `UUID ${player.uuid.slice(0, 8)}…` : "TwistX ID");
            }).join("");

            box.querySelectorAll("[data-add]").forEach((button) => {
                button.addEventListener("click", () => TxFriends.request(button.dataset.add, button));
            });
        } catch (error) {
            box.innerHTML = `<div class="tx-error">${TxFriends.escape(error.message)}</div>`;
        }
    },

    request: async (username, button) => {
        button.disabled = true;
        button.textContent = "…";
        try {
            const data = await TxFriends.api("/api/friends/request", {
                method: "POST",
                body: JSON.stringify({ username }),
            });
            button.textContent = data.status === "accepted" ? "Уже друзья" : "Заявка отправлена";
            await TxFriends.refresh();
        } catch (error) {
            button.textContent = "Ошибка";
            button.disabled = false;
            console.warn("friend request failed", error.message);
        }
    },

    refresh: async () => {
        try {
            const data = await TxFriends.api("/api/friends");
            TxFriends.render(data);
        } catch (error) {
            console.warn("friends refresh failed", error.message);
        }
    },

    render: (data) => {
        const friends = data.friends || [];
        const incoming = data.incoming || [];
        const outgoing = data.outgoing || [];

        document.getElementById("txFriendsCount").textContent = String(friends.length);
        document.getElementById("txRequestsCount").textContent = String(incoming.length + outgoing.length);

        const friendsList = document.getElementById("txFriendsList");
        friendsList.innerHTML = friends.length === 0
            ? ""
            : friends.map((player) => TxFriends.playerRow(
                player,
                `<button class="tx-mini danger" data-remove="${player.id}">Удалить</button>`,
                "в друзьях"
            )).join("");

        friendsList.querySelectorAll("[data-remove]").forEach((button) => {
            button.addEventListener("click", async () => {
                button.disabled = true;
                try {
                    await TxFriends.api(`/api/friends/${button.dataset.remove}`, { method: "DELETE" });
                    await TxFriends.refresh();
                } catch (error) {
                    button.disabled = false;
                }
            });
        });

        const incomingBox = document.getElementById("txIncoming");
        incomingBox.innerHTML = incoming.length === 0
            ? ""
            : incoming.map((player) => TxFriends.playerRow(
                player,
                `<button class="tx-mini accent" data-accept="${player.requestId}">Принять</button>
                 <button class="tx-mini danger" data-decline="${player.requestId}">Отклонить</button>`,
                `хочет добавить вас`
            )).join("");

        incomingBox.querySelectorAll("[data-accept]").forEach((button) => {
            button.addEventListener("click", async () => {
                button.disabled = true;
                await TxFriends.api("/api/friends/accept", {
                    method: "POST",
                    body: JSON.stringify({ requestId: Number(button.dataset.accept) }),
                }).catch(() => {});
                await TxFriends.refresh();
            });
        });

        incomingBox.querySelectorAll("[data-decline]").forEach((button) => {
            button.addEventListener("click", async () => {
                button.disabled = true;
                await TxFriends.api("/api/friends/decline", {
                    method: "POST",
                    body: JSON.stringify({ requestId: Number(button.dataset.decline) }),
                }).catch(() => {});
                await TxFriends.refresh();
            });
        });

        const outgoingBox = document.getElementById("txOutgoing");
        outgoingBox.innerHTML = outgoing.length === 0
            ? ""
            : outgoing.map((player) => TxFriends.playerRow(
                player,
                `<span class="tx-badge-status pending">ожидает ответа</span>`,
                "заявка отправлена"
            )).join("");
    },
};

document.addEventListener("DOMContentLoaded", () => TxFriends.init());
