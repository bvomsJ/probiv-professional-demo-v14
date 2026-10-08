/* PROBIV.CC DEMO CORE v9
   Synthetic/local-only forum UI. No real accounts, transactions or external operations.
*/
(function () {
  "use strict";

  const DEMO_DB_VERSION = "v9";

  function storageForCurrentPage() {
    try {
      return isPreviewMode() ? sessionStorage : localStorage;
    } catch (e) {
      return localStorage;
    }
  }

  function safeLocalUrl(raw, fallback) {
    const value = String(raw || "").trim();
    if (!value) return fallback;
    try {
      const u = new URL(value, location.href);
      const sameOrigin = u.origin === location.origin;
      const localFile = u.protocol === "file:" && location.protocol === "file:";
      if (!sameOrigin && !localFile) return fallback;
      if (u.protocol !== "http:" && u.protocol !== "https:" && !localFile) return fallback;
      return u.href;
    } catch (e) {
      return fallback;
    }
  }

  function safeHref(raw, fallback = "#") {
    const value = String(raw || "").trim();
    if (!value) return fallback;
    try {
      const u = new URL(value, location.href);
      if (!["http:", "https:"].includes(u.protocol)) return fallback;
      if (u.origin === location.origin) return u.href;
      return u.href;
    } catch (e) {
      return fallback;
    }
  }

  window.getMedia = function (id) {
    return (DEMO_DB.media || []).find(function (m) {
      return String(m.id) === String(id);
    });
  };

  window.renderMedia = function (ids, cls = "media-stack") {
    const arr = (Array.isArray(ids) ? ids : [])
      .map(window.getMedia)
      .filter(function (m) {
        return m && m.enabled !== false;
      });

    if (!arr.length) return "";

    return `<div class="${esc(cls)}">${arr.map(function (m) {
      const tag = String(m.type || "").startsWith("video/")
        ? `<video src="${esc(m.src)}" controls loop preload="metadata"></video>`
        : `<img src="${esc(m.src)}" alt="${esc(m.alt || m.name || "")}" loading="lazy">`;
      const href = m.href ? safeHref(m.href, "") : "";
      return `<div class="media-item">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${tag}</a>` : tag}</div>`;
    }).join("")}</div>`;
  };

  window.mediaSlot = function (slot, cls = "media-slot") {
    const ids = (DEMO_DB.site && DEMO_DB.site.mediaSlots && DEMO_DB.site.mediaSlots[slot]) || [];
    return renderMedia(ids, cls);
  };

  window.getUser = function (id) {
    return (DEMO_DB.users || []).find(function (u) {
      return Number(u.id) === Number(id);
    });
  };

  window.displayUser = function (id) {
    return getUser(id) || {
      id: 0,
      name: "Удалённый пользователь",
      role: "—",
      rating: 0,
      posts: 0,
      likes: 0,
      dislikes: 0,
      avatar: "?",
      color: "#777",
      online: false,
      awards: [],
      bio: "Профиль отсутствует в синтетической базе.",
      status: "Удалён",
      usdt: 0,
      guarant: 0,
      deposits: 0,
      joined: "—"
    };
  };

  window.getThread = function (id) {
    return (DEMO_DB.threads || []).find(function (t) {
      return Number(t.id) === Number(id);
    });
  };

  window.esc = function (s) {
    return String(s ?? "").replace(/[&<>"']/g, function (m) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[m];
    });
  };

  window.avatar = function (u, cls = "avatar") {
    u = u || {};
    return `<div class="${esc(cls)}" style="background:${esc(u.color || "#65745c")}">${esc(u.avatar || "?")}</div>`;
  };

  window.q = function (n) {
    return new URLSearchParams(location.search).get(n);
  };

  window.fmt = function (n) {
    return new Intl.NumberFormat("ru-RU").format(Number(n) || 0);
  };

  window.isPreviewMode = function () {
    return new URLSearchParams(location.search).get("preview") === "1" && isAdmin();
  };

  window.saveDB = function () {
    try {
      const storage = storageForCurrentPage();
      storage.setItem("PROBIV_DEMO_DB", JSON.stringify(DEMO_DB));
      storage.setItem("PROBIV_DB_VERSION", DEMO_DB_VERSION);
      return true;
    } catch (e) {
      console.error(e);
      alert("Не удалось сохранить данные. Возможно, локальное хранилище браузера переполнено.");
      return false;
    }
  };

  window.saveDemoDB = window.saveDB;

  window.isMember = function () {
    const flag = localStorage.getItem("PROBIV_MEMBER") === "1";
    const uid = Number(localStorage.getItem("PROBIV_USER_ID"));
    const valid = uid > 0 && !!getUser(uid);

    if (flag && !valid) {
      localStorage.removeItem("PROBIV_MEMBER");
      localStorage.removeItem("PROBIV_USER_ID");
      localStorage.removeItem("PROBIV_INVITE_CODE");
      return false;
    }

    return flag && valid;
  };

  window.isAdmin = function () {
    const ok =
      sessionStorage.getItem("PROBIV_ADMIN_SESSION") === "DEMO-ADMIN-AUTH" &&
      sessionStorage.getItem("PROBIV_ADMIN") === "1";

    if (!ok) {
      sessionStorage.removeItem("PROBIV_ADMIN");
      sessionStorage.removeItem("PROBIV_ADMIN_SESSION");
    }

    return ok;
  };

  window.requireAdmin = function () {
    if (!isAdmin()) {
      sessionStorage.removeItem("PROBIV_ADMIN");
      sessionStorage.removeItem("PROBIV_ADMIN_SESSION");
      location.href = "login.html?return=" + encodeURIComponent(location.href);
      return false;
    }
    return true;
  };

  window.currentUser = function () {
    return getUser(Number(localStorage.getItem("PROBIV_USER_ID")));
  };

  window.profileHref = function (id) {
    if (!isMember()) {
      return "login.html?return=" + encodeURIComponent(location.href);
    }
    return "profile.html?id=" + encodeURIComponent(Number(id));
  };

  window.authReturn = function (fallback = "index.html") {
    const raw = q("return");
    if (!raw) return fallback;
    return safeLocalUrl(raw, fallback);
  };

  window.logout = function () {
    localStorage.removeItem("PROBIV_MEMBER");
    localStorage.removeItem("PROBIV_INVITE_CODE");
    localStorage.removeItem("PROBIV_USER_ID");
    sessionStorage.removeItem("PROBIV_ADMIN");
    sessionStorage.removeItem("PROBIV_ADMIN_SESSION");
    sessionStorage.removeItem("PROBIV_PREVIEW_DB");
    location.href = "index.html";
  };

  window.setMember = function (code) {
    code = String(code || "").trim();

    const invites = Array.isArray(DEMO_DB.invites) ? DEMO_DB.invites : [];
    const x = invites.find(function (i) {
      return i.active && i.code === code && (!i.maxUses || i.uses < i.maxUses);
    });

    if (!x) return false;

    if (isMember() && localStorage.getItem("PROBIV_INVITE_CODE") === code) {
      return true;
    }

    x.uses = (x.uses || 0) + 1;

    if (!getUser(Number(localStorage.getItem("PROBIV_USER_ID")))) {
      const fallback = (DEMO_DB.users || [])[0];
      if (fallback) localStorage.setItem("PROBIV_USER_ID", String(fallback.id));
    }

    localStorage.setItem("PROBIV_MEMBER", "1");
    localStorage.setItem("PROBIV_INVITE_CODE", code);
    saveDB();
    return true;
  };

  window.authLinks = function () {
    document.querySelectorAll("[data-auth]").forEach(function (el) {
      if (isMember()) {
        const u = currentUser() || displayUser(0);
        el.innerHTML =
          `<span class="auth-state">Участник</span> · ` +
          `<a href="${esc(profileHref(u.id))}">Профиль</a> · ` +
          `<a href="#" data-logout-link>Выйти</a>`;
        const logoutLink = el.querySelector("[data-logout-link]");
        if (logoutLink) {
          logoutLink.addEventListener("click", function (e) {
            e.preventDefault();
            logout();
          });
        }
      } else {
        el.innerHTML =
          `<a href="login.html?return=${encodeURIComponent(location.href)}">Вход</a> · ` +
          `<a href="register.html?return=${encodeURIComponent(location.href)}">Регистрация</a>`;
      }
    });
  };

  window.canGuestRead = function (t) {
    return !!t && (isPreviewMode() || t.guestAccess !== "invite" || isMember());
  };

  window.gatePage = function (t) {
    if (!t) return false;
    if (canGuestRead(t)) return true;

    const host = document.getElementById("threadPage");
    if (!host) return false;

    host.innerHTML =
      `<div class="page-panel access-gate">` +
      `<div class="lock-icon">🔒</div>` +
      `<div class="demo-label">ДЕМО-ДОСТУП</div>` +
      `<h1>Просмотр доступен только участникам</h1>` +
      `<p>Эта синтетическая тема закрыта для гостей. Для демонстрации необходимо войти или активировать код приглашения.</p>` +
      `<div class="gate-note"><b>Доступ:</b> вход в демонстрационный аккаунт или регистрация по приглашению.</div>` +
      `<div class="gate-actions">` +
      `<a class="gold-btn gate-link" href="invite.html?return=${encodeURIComponent(location.href)}">Код приглашения</a>` +
      `<a class="small-btn gate-link" href="login.html?return=${encodeURIComponent(location.href)}">Войти</a>` +
      `</div>` +
      `<div class="meta" style="margin-top:15px">Все сведения на этой странице синтетические.</div>` +
      `</div>`;

    return false;
  };

  window.reactToPost = function (threadId, postIndex, type) {
    if (!isMember()) {
      location.href = "login.html?return=" + encodeURIComponent(location.href);
      return;
    }

    if (!["like", "dislike"].includes(type)) return;

    const t = getThread(threadId);
    if (!t || !t.posts || !t.posts[postIndex]) return;

    const uid = Number(localStorage.getItem("PROBIV_USER_ID"));
    const p = t.posts[postIndex];
    const author = getUser(p.user);

    p.reactions = p.reactions || {};
    const previous = p.reactions[uid] || null;

    if (previous === type) {
      p.reactions[uid] = null;
      const key = type === "like" ? "likes" : "dislikes";
      p[key] = Math.max(0, (p[key] || 0) - 1);
      if (author) author[key] = Math.max(0, (author[key] || 0) - 1);
    } else {
      if (previous) {
        const oldKey = previous === "like" ? "likes" : "dislikes";
        p[oldKey] = Math.max(0, (p[oldKey] || 0) - 1);
        if (author) author[oldKey] = Math.max(0, (author[oldKey] || 0) - 1);
      }

      p.reactions[uid] = type;
      const key = type === "like" ? "likes" : "dislikes";
      p[key] = (p[key] || 0) + 1;
      if (author) author[key] = (author[key] || 0) + 1;
    }

    saveDB();
    if (typeof window.renderThread === "function") window.renderThread();
    else location.reload();
  };

  window.threadRow = function (t) {
    const u = displayUser(t.author);
    const tag =
      t.pinned ? '<span class="tag">ВАЖНО</span>' :
      t.category === "Полезное" ? '<span class="tag gold">Полезное</span>' : "";

    return `<a class="thread-row" href="thread.html?id=${encodeURIComponent(t.id)}">
      ${avatar(u)}
      <div class="thread-main">
        <div class="thread-title">${tag}${esc(t.title)}</div>
        <div class="meta"><span class="author-link" data-profile-id="${u.id}">${esc(u.name)}</span> · ${esc(t.date)} · ${esc(t.category)}</div>
      </div>
      <div class="stats"><span>Ответы: ${fmt(t.answers)}</span><span>Просмотры: ${fmt(t.views)}</span></div>
      <div class="date">${esc(t.date)}</div>
      <div class="mini">${esc(u.avatar || "?")}</div>
    </a>`;
  };

  function bindProfileLinks(root) {
    (root || document).querySelectorAll("[data-profile-id]").forEach(function (el) {
      if (el.__profileBound) return;
      el.__profileBound = true;
      el.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        location.href = profileHref(this.dataset.profileId);
      });
    });
  }

  window.renderVisualAds = function () {
    const ads = (DEMO_DB.ads || [])
      .filter(function (a) {
        return a.enabled !== false && a.mediaId;
      })
      .slice()
      .sort(function (a, b) {
        return (Number(a.order) || 0) - (Number(b.order) || 0);
      });

    const anchors = {};
    document.querySelectorAll("[data-home-media-anchor]").forEach(function (el) {
      anchors[el.dataset.homeMediaAnchor] = el;
    });

    document.querySelectorAll(".visual-home-ad").forEach(function (x) {
      x.remove();
    });

    ads.forEach(function (a) {
      const anchor = anchors[a.position || a.slot || "pageTop"];
      if (!anchor) return;

      const m = getMedia(a.mediaId);
      if (!m || m.enabled === false) return;

      const wrap = document.createElement("div");
      wrap.className = "visual-home-ad";
      wrap.dataset.adId = a.id;
      wrap.style.width = Math.max(1, Math.min(100, Number(a.width) || 100)) + "%";
      wrap.style.maxWidth = Number(a.maxWidth) > 0 ? Number(a.maxWidth) + "px" : "";
      wrap.style.height = Number(a.height) > 0 ? Number(a.height) + "px" : "auto";
      wrap.style.margin =
        a.align === "left" ? "8px 0" :
        a.align === "right" ? "8px 0 8px auto" :
        "8px auto";

      const frame = document.createElement("div");
      frame.className = "visual-home-frame";
      frame.style.height = Number(a.height) > 0 ? Number(a.height) + "px" : "auto";

      const isVideo = String(m.type || "").startsWith("video/");
      const tag = document.createElement(isVideo ? "video" : "img");
      tag.src = m.src;
      tag.alt = m.alt || m.name || "";
      tag.style.width = "100%";
      tag.style.height = Number(a.height) > 0 ? "100%" : "auto";
      tag.style.objectFit = "contain";

      if (isVideo) {
        tag.controls = true;
        tag.loop = true;
        tag.preload = "metadata";
      }

      frame.appendChild(tag);
      wrap.appendChild(frame);

      if (a.label) {
        const cap = document.createElement("div");
        cap.className = "visual-home-caption";
        cap.textContent = a.label;
        wrap.appendChild(cap);
      }

      const href = m.href ? safeHref(m.href, "") : "";
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.display = "block";
        link.appendChild(wrap);
        anchor.appendChild(link);
      } else {
        anchor.appendChild(wrap);
      }
    });

    if (isPreviewMode()) enableVisualBuilder();
  };

    window.enableVisualBuilder = function () {
    if (window.__visualBuilderBound) {
      document.querySelectorAll(".visual-home-ad").forEach(bindVisualAd);
      return;
    }
    window.__visualBuilderBound = true;

    const style = document.createElement("style");
    style.textContent =
      `[data-home-media-anchor]{position:relative;min-height:18px;border:1px dashed rgba(46,120,180,.45);background:rgba(90,160,210,.05);margin:4px 0}` +
      `[data-home-media-anchor]:before{content:'↕ ПЕРЕТАЩИ БАННЕР СЮДА';display:block;text-align:center;font:10px Arial;color:#3478a7;padding:3px;opacity:.75}` +
      `.visual-home-ad{position:relative;cursor:grab;outline:2px solid rgba(44,115,170,.55);outline-offset:2px;box-sizing:border-box}` +
      `.visual-home-ad:after{content:'↘ ИЗМЕНИТЬ РАЗМЕР';position:absolute;right:0;bottom:0;background:#3478a7;color:white;font:9px Arial;padding:3px 5px;cursor:nwse-resize}` +
      `.visual-home-ad.builder-drag{opacity:.65;cursor:grabbing}` +
      `.visual-home-ad .visual-home-frame{overflow:hidden}` +
      `.visual-home-ad img,.visual-home-ad video{max-width:100%;display:block}`;
    document.head.appendChild(style);

    document.querySelectorAll(".visual-home-ad").forEach(function (ad) {
      if (ad.__builder) return;
      ad.__builder = true;

      let sx = 0, sy = 0, sw = 0, sh = 0, mode = "drag";

      ad.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        ad.setPointerCapture(e.pointerId);
        const r = ad.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; sw = r.width; sh = r.height;
        mode = (e.clientX > r.right - 22 && e.clientY > r.bottom - 22) ? "resize" : "drag";
        ad.classList.add("builder-drag");
      });

      ad.addEventListener("pointermove", function (e) {
        if (!ad.hasPointerCapture(e.pointerId)) return;
        const a = (DEMO_DB.ads || []).find(function (x) {
          return Number(x.id) === Number(ad.dataset.adId);
        });
        if (!a) return;

        if (mode === "resize") {
          const parent = ad.parentElement.getBoundingClientRect();
          const nw = Math.max(40, Math.min(parent.width, sw + (e.clientX - sx)));
          a.width = Math.round((nw / parent.width) * 100);
          a.height = Math.max(0, Math.round(sh + (e.clientY - sy)));
          ad.style.width = a.width + "%";
          ad.style.height = a.height + "px";
          const fr = ad.querySelector(".visual-home-frame");
          if (fr) fr.style.height = a.height + "px";
        } else {
          let best = null, dist = Infinity;
          document.querySelectorAll("[data-home-media-anchor]").forEach(function (z) {
            const r = z.getBoundingClientRect();
            const d = Math.abs(e.clientY - (r.top + r.height / 2));
            if (d < dist) { dist = d; best = z; }
          });
          if (best) {
            a.position = best.dataset.homeMediaAnchor;
            a.slot = a.position;
            best.appendChild(ad);
          }
        }
      });

      ad.addEventListener("pointerup", function (e) {
        if (!ad.hasPointerCapture(e.pointerId)) return;
        ad.releasePointerCapture(e.pointerId);
        ad.classList.remove("builder-drag");
        const a = (DEMO_DB.ads || []).find(function (x) {
          return Number(x.id) === Number(ad.dataset.adId);
        });
        if (a) {
          sessionStorage.setItem("PROBIV_PREVIEW_DB", JSON.stringify(DEMO_DB));
          window.parent && window.parent !== window &&
            window.parent.postMessage({
              type: "probiv-ad-change",
              id: a.id,
              changes: {
                width: a.width,
                height: a.height,
                position: a.position,
                align: a.align,
                order: a.order
              }
            }, "*");
        }
      });
    });
  };

   function recentEntryToThread(entry) {
    if (!entry) return null;
    if (entry.threadId !== undefined && entry.threadId !== null && entry.threadId !== "") {
      const byId = (DEMO_DB.threads || []).find(function (t) {
        return Number(t.id) === Number(entry.threadId);
      });
      if (byId) return byId;
    }
    return (DEMO_DB.threads || []).find(function (t) {
      return t.title === entry.title;
    });
  }

  function topicHrefByEntry(entry) {
    const t = recentEntryToThread(entry);
    return t
      ? `thread.html?id=${encodeURIComponent(t.id)}`
      : `search.html?q=${encodeURIComponent(entry.title || "")}`;
  }

  function renderRecentLegacy() {
    const recent = document.getElementById("recentTopics");
    if (!recent) return;

    recent.innerHTML = (DEMO_DB.recent || []).map(function (x) {
      return `<a class="recent-row" href="${topicHrefByEntry(x)}">
        <span>${x.pinned ? "📌" : "»"}</span>
        <div><b>${esc(x.title)}</b><small>${esc(displayUser(x.author).name)} · ${esc(x.date)}</small></div>
        <em>💬 ${fmt(x.answers)}</em>
      </a>`;
    }).join("");
  }

  function renderHotLegacy() {
    const hot = document.getElementById("hotTopics");
    if (!hot) return;

    hot.innerHTML = (DEMO_DB.hotTopics || []).map(function (x) {
      const t = (DEMO_DB.threads || []).find(function (t0) {
        return t0.title === x.title;
      });
      const href = t
        ? `thread.html?id=${encodeURIComponent(t.id)}`
        : `search.html?q=${encodeURIComponent(x.title || "")}`;

      return `<a class="hot-row" href="${href}">
        <span class="mini-tag">${esc(x.tag || "Новое")}</span>
        <div><b>${esc(x.title)}</b><small>${esc(displayUser(x.author).name)} · ${fmt(x.answers)} ответов · ${fmt(x.views)} просмотров</small></div>
      </a>`;
    }).join("");
  }

  function renderNewUsers() {
    const users = document.getElementById("newUsers");
    if (!users) return;

    users.innerHTML = (DEMO_DB.users || []).slice().reverse().slice(0, 28).map(function (u) {
      return `<a href="${esc(profileHref(u.id))}" class="user-line">
        ${avatar(u, "tiny-avatar")}
        <span>${esc(u.name)}</span>
        <i>${u.online ? "●" : "○"}</i>
      </a>`;
    }).join("");

    bindProfileLinks(users);
  }

  function renderForumStats() {
    const stat = document.getElementById("forumStats");
    if (!stat) return;

    stat.innerHTML =
      `<a href="search.html?type=threads"><b>${fmt(DEMO_DB.stats.topics)}</b><span>Темы</span></a>` +
      `<a href="search.html?type=messages"><b>${fmt(DEMO_DB.stats.messages)}</b><span>Сообщения</span></a>` +
      `<a href="search.html?type=users"><b>${fmt(DEMO_DB.stats.users)}</b><span>Пользователи</span></a>` +
      `<a href="search.html?type=reputation"><b>${fmt(DEMO_DB.stats.reputation)}</b><span>Репутация</span></a>`;
  }

  function renderCategories() {
    const categories = document.getElementById("categories");
    if (!categories) return;

    categories.innerHTML = (DEMO_DB.categories || []).map(function (c) {
      const lastThread = (DEMO_DB.threads || []).filter(function (t) {
        return t.category === c.name;
      }).sort(function (a, b) {
        return Number(b.id) - Number(a.id);
      })[0];

      const lastUser = lastThread ? displayUser(lastThread.author).name : "—";
      return `<a class="category-row" href="category.html?id=${encodeURIComponent(c.id)}">
        <div><h3>${esc(c.name)}</h3><p>${esc(c.description || "")}</p><span class="meta">Темы: ${fmt(c.topics)} · Сообщения: ${fmt(c.messages)}</span></div>
        <div class="cat-last">Последняя тема<br><b>${esc(lastThread ? lastThread.title : "Нет тем")}</b><br><span>${esc(lastUser)}</span></div>
      </a>`;
    }).join("");
  }

  function renderLegacyContainers() {
    const pin = document.getElementById("pinned");
    if (pin) pin.innerHTML = (DEMO_DB.threads || []).filter(function (t) { return t.pinned; }).map(threadRow).join("");

    const normal = document.getElementById("normal");
    if (normal) normal.innerHTML = (DEMO_DB.threads || []).filter(function (t) { return !t.pinned; }).map(threadRow).join("");

    renderHotLegacy();
    renderRecentLegacy();
    const cloud = document.getElementById("tagCloud");
    if (cloud) {
      cloud.innerHTML = (DEMO_DB.tagCloud || []).map(function (x) {
        return `<a href="search.html?q=${encodeURIComponent(x)}">${esc(x)}</a>`;
      }).join(" ");
    }

    renderNewUsers();
    renderForumStats();
    renderCategories();

    bindProfileLinks(document);
  }

  window.renderReferenceHome = function () {
    const rowsEl = document.getElementById("referenceThreads");
    if (!rowsEl) return;

    const label = (DEMO_DB.site && DEMO_DB.site.homeLabels) || DEMO_DB.homeLabels || {};
    const centerTitle = document.getElementById("refCenterTitle");
    const newestLabel = document.getElementById("refTabRecent");
    const topicsLabel = document.getElementById("refTabTopics");
    if (centerTitle) centerTitle.textContent = label.centerLatest || "Последние сообщения";
    if (newestLabel) newestLabel.textContent = label.centerRecentTab || "Новые сообщения";
    if (topicsLabel) topicsLabel.textContent = label.centerTopicsTab || "Новые темы";

    function badge(t) {
      if (t.pinned) return '<span class="badge red">ВАЖНО</span>';
      if (t.category === "Полезное") return '<span class="badge">ПОЛЕЗНОЕ</span>';
      if (t.category === "Проверка") return '<span class="badge green">ПРОВЕРЕНО</span>';
      if (t.category === "Продам") return '<span class="badge blue">ПРОДАМ</span>';
      if (t.category === "Обмен") return '<span class="badge dark">ОБМЕН</span>';
      return "";
    }

    function rowFromThread(t, metaDate) {
      const u = displayUser(t.author);
      return `<a class="ref-thread" href="thread.html?id=${encodeURIComponent(t.id)}">
        <span class="pin">${t.pinned ? "⚑" : "»"}</span>
        <span class="rtitle">${badge(t)}${esc(t.title)}</span>
        <span class="reply-count">☏ ${fmt(t.answers || 0)}</span>
        <span class="last-date">${esc(metaDate || t.date || "Сегодня")}</span>
        <span class="last-user">${esc(u.name)}</span>
      </a>`;
    }

    function rowFromRecent(x) {
      const t = recentEntryToThread(x);
      if (t) return rowFromThread(t, x.date || t.date);

      const u = displayUser(x.author);
      return `<a class="ref-thread" href="search.html?q=${encodeURIComponent(x.title || "")}">
        <span class="pin">${x.pinned ? "⚑" : "»"}</span>
        <span class="rtitle">${x.pinned ? '<span class="badge red">ВАЖНО</span>' : ""}${esc(x.title || "Без названия")}</span>
        <span class="reply-count">☏ ${fmt(x.answers || 0)}</span>
        <span class="last-date">${esc(x.date || "Сегодня")}</span>
        <span class="last-user">${esc(u.name)}</span>
      </a>`;
    }

    const recentRows = (DEMO_DB.recent || []).slice(0, 35).map(rowFromRecent).join("");
    const topicRows = (DEMO_DB.threads || []).slice().sort(function (a, b) {
      return Number(b.id) - Number(a.id);
    }).map(function (t) {
      return rowFromThread(t, t.date);
    }).join("");

    function showMode(mode) {
      rowsEl.innerHTML = mode === "topics" ? topicRows : recentRows;
      document.querySelectorAll(".ref-tabs span").forEach(function (tab) {
        tab.classList.toggle("active", tab.dataset.mode === mode);
      });
      rowsEl.dataset.mode = mode;
    }

    document.querySelectorAll(".ref-tabs span[data-mode]").forEach(function (tab) {
      if (tab.__bound) return;
      tab.__bound = true;
      tab.addEventListener("click", function () {
        showMode(this.dataset.mode);
      });
    });

    const recentTitle = document.getElementById("refRightRecentTitle");
    const recoTitle = document.getElementById("refRecoTitle");
    const findTitle = document.getElementById("refFindTitle");
    const statsTitle = document.getElementById("refStatsTitle");
    const tagsTitle = document.getElementById("refTagsTitle");
    const usersTitle = document.getElementById("refLeftUsersTitle");
    if (recentTitle) recentTitle.textContent = label.rightRecent || "Последние сообщения";
    if (recoTitle) recoTitle.textContent = label.rightRecommended || "Рекомендуемый контент";
    if (findTitle) findTitle.textContent = label.rightFind || "⌕ Найти пользователя";
    if (statsTitle) statsTitle.textContent = label.rightStats || "▥ Статистика форума";
    if (tagsTitle) tagsTitle.textContent = label.rightTags || "☁ Теги";
    if (usersTitle) usersTitle.innerHTML = esc(label.leftUsers || "Новые пользователи") + " <span>⌄</span>";

    const rec = document.getElementById("rightRecent");
    if (rec) {
      rec.innerHTML = (DEMO_DB.recent || []).slice(0, 7).map(function (x) {
        return `<a class="ref-mini" href="${topicHrefByEntry(x)}">
          <span class="mini-avatar">${esc(displayUser(x.author).avatar || "?")}</span>
          <span><b>${esc(x.title)}</b><small>${esc(displayUser(x.author).name)} · ${esc(x.date || "Сегодня")}</small></span>
        </a>`;
      }).join("");
    }

    const reco = document.getElementById("rightRecommended");
    if (reco) {
      reco.innerHTML = (DEMO_DB.hotTopics || []).slice(0, 5).map(function (x) {
        const t = (DEMO_DB.threads || []).find(function (t0) { return t0.title === x.title; });
        const href = t
          ? `thread.html?id=${encodeURIComponent(t.id)}`
          : `search.html?q=${encodeURIComponent(x.title || "")}`;
        return `<a class="ref-reco" href="${href}">
          <b><span class="reco-tag">${esc(x.tag || "Новое")}</span>${esc(x.title)}</b>
          <small>${esc(displayUser(x.author).name)} · Ответы: ${fmt(x.answers || 0)}</small>
        </a>`;
      }).join("");
    }

    renderNewUsers();
    renderForumStats();
    showMode(rowsEl.dataset.mode === "topics" ? "topics" : "recent");
    bindProfileLinks(document);
  };

  window.renderHome = function () {
    renderLegacyContainers();

    if (document.getElementById("referenceThreads")) {
      renderReferenceHome();
    }

    renderVisualAds();

    document.querySelectorAll("[data-home-media-slot]").forEach(function (el) {
      el.innerHTML = mediaSlot(el.dataset.homeMediaSlot);
    });

    authLinks();
    bindManagedLinks();
    bindProfileLinks(document);
  };

  window.bindManagedLinks = function () {
    const links = DEMO_DB.links || {};

    document.querySelectorAll("[data-link-key]").forEach(function (a) {
      const key = a.dataset.linkKey;
      const cfg = links[key];
      if (!cfg) return;

      const strong = a.querySelector("strong");
      if (strong) {
        Array.from(a.childNodes).filter(function (n) {
          return n.nodeType === 3;
        }).forEach(function (n) {
          n.remove();
        });
        a.appendChild(document.createTextNode(cfg.label || ""));
      } else {
        a.textContent = cfg.label || "";
      }

      a.href = safeLocalUrl(cfg.href, "#");

      if (cfg.auth && !isMember()) {
        a.href = "login.html?return=" + encodeURIComponent(location.href);
      }
    });

    document.querySelectorAll("[data-demo-link]").forEach(function (a) {
      if (a.__bound) return;
      a.__bound = true;
      a.addEventListener("click", function (e) {
        e.preventDefault();
        location.href = safeLocalUrl(a.dataset.demoLink, "help.html");
      });
    });
  };

  window.auditAnchors = function () {
    document.querySelectorAll("a[href]").forEach(function (a) {
      const href = (a.getAttribute("href") || "").trim();
      if (!href && !a.hasAttribute("data-allow-empty-href")) {
        a.href = "help.html";
      }
    });
  };

  window.applySiteConfig = function () {
    const site = DEMO_DB.site || {};

    document.querySelectorAll(".logo").forEach(function (x) {
      x.textContent = site.title || "PROBIV.CC";
    });
    document.querySelectorAll(".tagline").forEach(function (x) {
      x.textContent = site.subtitle || "";
    });
    document.querySelectorAll(".network-ad").forEach(function (x) {
      x.textContent = site.networkAd || site.topAd || "DEMO";
    });
    document.querySelectorAll(".demo-strip").forEach(function (x) {
      x.textContent = site.demoLabel || "ДЕМО · СИНТЕТИЧЕСКИЕ ДАННЫЕ";
    });
    document.querySelectorAll("footer").forEach(function (x) {
      x.textContent = site.footer || "ДЕМО-ФОРУМ";
    });

    if (site.background) {
      document.body.style.backgroundImage =
        'linear-gradient(rgba(237,231,218,.10),rgba(237,231,218,.10)),url("' +
        String(site.background).replace(/"/g, "") + '")';
    }

        document.querySelectorAll(".ref-title").forEach(function (el) {
      const key = el.dataset.homeLabel;
      const labels = (DEMO_DB.site && DEMO_DB.site.homeLabels) || DEMO_DB.homeLabels || {};
      if (key && labels[key]) {
        el.textContent = labels[key];
      }
    });

    const ads = document.querySelectorAll(".ad");
    if (ads[0]) {
      ads[0].textContent = site.topAd || site.heroBanners?.[0] || ads[0].textContent;
      if (site.mediaSlots && site.mediaSlots.topAd) ads[0].innerHTML += mediaSlot("topAd");
    }
    if (ads[1]) ads[1].innerHTML = esc(site.heroBanners?.[0] || "");
    if (ads[2]) ads[2].innerHTML = esc(site.heroBanners?.[1] || "");
    if (ads[3]) ads[3].innerHTML = esc(site.heroBanners?.[2] || "");

    document.querySelectorAll("[data-media-slot]").forEach(function (el) {
      el.innerHTML = mediaSlot(el.dataset.mediaSlot);
    });

    if (document.querySelector("[data-home-media-anchor]")) renderVisualAds();
  };

  window.startSite = function () {
    applySiteConfig();
    authLinks();
    bindManagedLinks();
    auditAnchors();
    renderHome();

    document.querySelectorAll('[data-link-key="admin"],a[href="admin.html"]').forEach(function (a) {
      a.style.display = isAdmin() ? "" : "none";
    });

    document.querySelectorAll('[data-link-key="profile"]').forEach(function (a) {
      a.href = isMember()
        ? "profile.html?id=" + encodeURIComponent(currentUser().id)
        : "login.html?return=" + encodeURIComponent(location.href);
    });
  };

  document.addEventListener("DOMContentLoaded", startSite);
})();
