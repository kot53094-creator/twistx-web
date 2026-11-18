/**
 * Раздел «Двухфакторная защита» в личном кабинете.
 *
 * Секрет и резервные коды приходят из API, поэтому страница только показывает их
 * и вызывает нужные адреса. Раздел добавляется скриптом, чтобы не править
 * разметку профиля и не зависеть от её структуры.
 */
(function () {
    "use strict";

    const api = async (path, body) => {
        const res = await fetch(path, {
            method: body === undefined ? "GET" : "POST",
            credentials: "same-origin",
            headers: body === undefined ? {} : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    };

    const row = (label, value) => {
        const box = document.createElement("div");
        box.style.cssText = "margin:8px 0;word-break:break-all;";
        box.innerHTML = '<span style="opacity:.65">' + label + ':</span> <b style="font-family:monospace">' + value + "</b>";
        return box;
    };

    const note = (text, color) => {
        const box = document.createElement("div");
        box.style.cssText = "margin:10px 0;font-size:13px;color:" + (color || "var(--text-dim,#9aa4b2)");
        box.textContent = text;
        return box;
    };

    const button = (label, primary) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText =
            "margin:6px 8px 0 0;padding:8px 14px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,.18);" +
            (primary ? "background:#5865f2;color:#fff;border-color:#5865f2;" : "background:transparent;color:inherit;");
        return b;
    };

    const build = (user) => {
        const section = document.createElement("div");
        section.className = "settings-card";
        section.style.cssText = "margin-top:16px;padding:16px;border:1px solid rgba(255,255,255,.12);border-radius:12px;";

        const title = document.createElement("h3");
        title.textContent = "Двухфакторная защита";
        title.style.cssText = "margin:0 0 6px;font-size:17px;";
        section.appendChild(title);

        const state = document.createElement("div");
        state.style.cssText = "font-size:14px;margin-bottom:8px;";
        state.textContent = user.twoFactorEnabled
            ? "Статус: включена — при входе на сайт нужен код из приложения."
            : "Статус: выключена — вход по одному паролю.";
        section.appendChild(state);

        const body = document.createElement("div");
        section.appendChild(body);

        const hint = document.createElement("div");
        hint.style.cssText = "font-size:12px;opacity:.6;margin-top:10px;";
        hint.textContent = "Лаунчер код не спрашивает — защита только для входа на сайт. Резервные коды показываются один раз.";
        section.appendChild(hint);

        // --- включение ---
        const startEnable = async () => {
            body.innerHTML = "";
            const res = await api("/api/auth/2fa/setup", {});
            if (!res.ok) {
                body.appendChild(note(res.data.message || "Не удалось получить секрет", "#ff6b6b"));
                return;
            }
            body.appendChild(note("1. Добавьте этот секрет в приложение (Google Authenticator, Aegis, 1Password):"));
            body.appendChild(row("Секрет", res.data.secret));
            body.appendChild(row("Ссылка", res.data.otpauth));
            body.appendChild(note("2. Затем введите код из приложения, чтобы включить защиту:"));

            const input = document.createElement("input");
            input.type = "text";
            input.inputMode = "numeric";
            input.placeholder = "123456";
            input.maxLength = 11;
            input.style.cssText = "padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;width:140px;";
            body.appendChild(input);

            const confirm = button("Включить", true);
            confirm.addEventListener("click", async () => {
                const res2 = await api("/api/auth/2fa/enable", { code: input.value.trim() });
                if (!res2.ok) {
                    body.appendChild(note(res2.data.message || "Код не подошёл", "#ff6b6b"));
                    return;
                }
                body.innerHTML = "";
                body.appendChild(note("Готово. Сохраните резервные коды — они показываются один раз:", "#4ade80"));
                (res2.data.recoveryCodes || []).forEach((code) => body.appendChild(row("Код", code)));
                startDisable();
            });
            body.appendChild(confirm);
        };

        // --- отключение ---
        const startDisable = () => {
            body.innerHTML = "";
            body.appendChild(note("Чтобы отключить защиту, введите код из приложения или резервный код:"));
            const input = document.createElement("input");
            input.type = "text";
            input.inputMode = "numeric";
            input.placeholder = "123456";
            input.maxLength = 11;
            input.style.cssText = "padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;width:140px;";
            body.appendChild(input);

            const off = button("Отключить", true);
            off.addEventListener("click", async () => {
                const res = await api("/api/auth/2fa/disable", { code: input.value.trim() });
                body.appendChild(note(res.ok ? "Защита отключена" : res.data.message || "Код не подошёл", res.ok ? "#4ade80" : "#ff6b6b"));
                if (res.ok) setTimeout(() => window.location.reload(), 1200);
            });
            body.appendChild(off);
        };

        if (user.twoFactorEnabled) {
            startDisable();
        } else {
            const on = button("Включить двухфакторку", true);
            on.addEventListener("click", startEnable);
            body.appendChild(on);
        }

        return section;
    };

    const mount = async () => {
        const res = await api("/api/auth/me");
        if (!res.ok || !res.data.user) return;

        const anchor = document.getElementById("passwordStatus");
        const card = anchor && anchor.closest("form") ? anchor.closest("form").parentElement : null;
        const section = build(res.data.user);

        if (card && card.parentElement) card.insertAdjacentElement("afterend", section);
        else {
            const container = document.querySelector("#appContent .container") || document.querySelector("#appContent");
            if (container) container.appendChild(section);
        }
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
})();
