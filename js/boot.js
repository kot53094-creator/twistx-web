(function () {
    const TWISTX_URL = {
        home: "./index.html",
        download: "./download.html",
        skins: "./skins.html",
        rules: "./rules.html",
        auth: "./auth.html",
        profile: "./profile.html",
    };

    window.app = {
        user: null,
        serverIp: "play.twistx.net",
        navigate(route) {
            let r = route;
            if (r === "profile" && !window.app.user) r = "auth";
            if (r === "auth" && window.app.user) r = "profile";
            window.location.href = TWISTX_URL[r] || "./index.html";
        },
        copyIP(ip) {
            const t = ip || "play.twistx.net";
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(t).catch(() => window.prompt("Скопируй IP:", t));
            } else {
                window.prompt("Скопируй IP:", t);
            }
        },
        toggleHeroSkinAnim() {},
        refreshSkinsGallery() {
            const hint = document.getElementById("skinsGalleryHint");
            if (hint) hint.innerText = "Открой сайт через npm run start → http://localhost:3000";
        },
        switchAuthTab(tab) {
            document.querySelectorAll(".auth-tab").forEach((x) => x.classList.remove("active"));
            document.querySelectorAll(".auth-form").forEach((x) => x.classList.remove("active"));
            const tabs = document.querySelectorAll(".auth-tab");
            if (tab === "login") {
                tabs[0]?.classList.add("active");
                document.getElementById("loginForm")?.classList.add("active");
            } else {
                tabs[1]?.classList.add("active");
                document.getElementById("registerForm")?.classList.add("active");
            }
        },
        toggleSkinAnimation() {},
        logout() {},
        sendPasswordReset() {},
        showToast(msg) {
            const pool = document.getElementById("toastPool");
            if (!pool) {
                alert(msg);
                return;
            }
            const toast = document.createElement("div");
            toast.className = "toast";
            toast.textContent = msg;
            pool.appendChild(toast);
            setTimeout(() => toast.remove(), 2500);
        },
    };

    if (location.protocol === "file:") {
        const show = () => {
            if (document.getElementById("twistx-file-protocol-banner")) return;
            const bar = document.createElement("div");
            bar.id = "twistx-file-protocol-banner";
            bar.className = "file-protocol-banner";
            bar.setAttribute("role", "alert");
            bar.innerHTML =
                "<strong>Открыто как файл (file://)</strong> — так не работают API, Firebase и <strong>3D (WebGL)</strong>. Запусти: <code>cd website</code> → <code>npm run start</code> → <strong>http://localhost:3000</strong> (отдельные страницы: /download.html, /auth.html…)";
            document.body.insertBefore(bar, document.body.firstChild);
        };
        if (document.body) show();
        else document.addEventListener("DOMContentLoaded", show);
    }
})();
