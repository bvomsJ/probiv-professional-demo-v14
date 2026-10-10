#!/usr/bin/env python3
"""Browser (Chromium/Playwright) regression suite for the PROBIV.CC demo.
Usage: python3 tests/run_browser_tests.py BASE_URL [--only T01,T02] [--out results.json] [--file-dir DIR]
Every test runs in a fresh browser context (fresh localStorage). Console errors, page errors,
failed requests and HTTP >= 400 responses are collected per page and fail the test that caused them.
"""
import sys, json, time, base64, re, os, tempfile, traceback
from playwright.sync_api import sync_playwright

args = sys.argv[1:]
BASE = args[0].rstrip("/")
ONLY = None; OUT = None; FILE_DIR = None
if "--only" in args: ONLY = set(args[args.index("--only") + 1].split(","))
if "--out" in args: OUT = args[args.index("--out") + 1]
if "--file-dir" in args: FILE_DIR = args[args.index("--file-dir") + 1]

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==")
TESTS = []
def test(tid, title):
    def deco(fn):
        TESTS.append((tid, title, fn)); return fn
    return deco

class Env:
    def __init__(self, browser): self.browser = browser; self.ctxs = []
    def ctx(self, w=1280, h=900):
        c = self.browser.new_context(viewport={"width": w, "height": h}, accept_downloads=True); self.ctxs.append(c); return c
    def page(self, ctx):
        p = ctx.new_page(); p.errs = []; p.dialogs = []
        p.on("console", lambda m: p.errs.append("console.error: " + m.text) if m.type == "error" else None)
        p.on("pageerror", lambda e: p.errs.append("pageerror: " + str(e)))
        p.on("requestfailed", lambda r: p.errs.append("requestfailed: " + r.url) if "ERR_ABORTED" not in str(r.failure) else None)
        p.on("response", lambda r: p.errs.append("HTTP %d: %s" % (r.status, r.url)) if r.status >= 400 else None)
        def on_dialog(d): p.dialogs.append(d.message); d.accept()
        p.on("dialog", on_dialog)
        return p
    def close(self):
        for c in self.ctxs:
            try: c.close()
            except Exception: pass

def goto(p, path, wait=True):
    p.goto(BASE + "/" + path, wait_until="load")
    p.wait_for_timeout(150)

def ev(p, js): return p.evaluate(js)
def login_user(p, name, pw="pw123"):
    goto(p, "login.html"); p.fill("#login", name); p.fill("#pass", pw); p.click("#loginBtn"); p.wait_for_load_state("load"); p.wait_for_timeout(250)
def login_admin(p, ret="admin.html"):
    goto(p, "login.html?return=" + ret); p.fill("#login", "admin"); p.fill("#pass", "DEMO-ADMIN-2026"); p.click("#loginBtn"); p.wait_for_url(re.compile(r"admin\.html")); p.wait_for_timeout(400)
def txt(p): return p.inner_text("body")
def check(cond, msg):
    if not cond: raise AssertionError(msg)

@test("T01", "Все публичные страницы открываются без JS/Console/Network ошибок")
def t01(env):
    p = env.page(env.ctx())
    for path in ["index.html", "category.html?id=1", "thread.html?id=101", "search.html?q=гарант", "login.html", "register.html", "invite.html", "rules.html", "help.html"]:
        goto(p, path)
    login_user(p, "Alex22"); goto(p, "profile.html?id=2"); goto(p, "profile.html?id=999")
    check(not p.errs, "; ".join(sorted(set(p.errs))[:6]))

@test("T02", "Главная: колонки, список, табы, разделы, статистика, теги")
def t02(env):
    p = env.page(env.ctx()); goto(p, "index.html")
    n = lambda sel: ev(p, "document.querySelectorAll(%s).length" % json.dumps(sel))
    check(n(".ref-thread") >= 5, "центральный список пуст")
    check(n("#newUsers .user-line") >= 10, "новые пользователи не отрисованы")
    check(n("#categories .category-row") == ev(p, "DEMO_DB.categories.length"), "разделы на главной: %s" % n("#categories .category-row"))
    check(n("#rightRecent .ref-mini") > 0 and n("#rightRecommended .ref-reco") > 0, "правая колонка пуста")
    check(n("#forumStats a") == 4 and n("#tagCloud a") > 0, "статистика/теги")
    p.click("#refTabTopics")
    check(n(".ref-thread") == ev(p, "DEMO_DB.threads.length"), "вкладка «Новые темы»")
    check(not p.errs, "; ".join(p.errs[:4]))

@test("T03", "Профиль: гость видит запрос входа, а не данные")
def t03(env):
    p = env.page(env.ctx()); goto(p, "profile.html?id=2")
    check("Профиль доступен участникам" in txt(p) and "Alex22" not in p.inner_text("#profilePage"), "гость получил профиль")

@test("T04", "Профиль: корректный ID, неверные ID не подменяются другим пользователем")
def t04(env):
    p = env.page(env.ctx()); login_user(p, "Alex22")
    goto(p, "profile.html?id=2"); check("Alex22" in p.inner_text("#profilePage"), "профиль #2 не загрузился")
    goto(p, "profile.html?id=5"); check("Sofia" in p.inner_text("#profilePage"), "профиль #5")
    bad = []
    for v in ["999", "abc", "", "0x2", "1e0", "-1", "0", "2.5", "02"]:
        goto(p, "profile.html?id=" + v)
        if "Пользователь отсутствует" not in p.inner_text("#profilePage"): bad.append("id=%r показал %r" % (v, p.inner_text("#profilePage")[:40].replace("\n", " ")))
    check(not bad, "; ".join(bad))
    goto(p, "profile.html"); check("Alex22" in p.inner_text("#profilePage"), "без id должен открываться собственный профиль")

@test("T05", "Приглашение даёт чтение закрытых тем, но не личность reagent")
def t05(env):
    p = env.page(env.ctx()); goto(p, "invite.html"); p.fill("#inviteCode", "DEMO-2026"); p.click("text=Активировать приглашение"); p.wait_for_timeout(1200)
    uid = ev(p, "localStorage.getItem('PROBIV_USER_ID')")
    check(uid is None, "после приглашения установлен PROBIV_USER_ID=%s (подмена пользователя)" % uid)
    tid = ev(p, "DEMO_DB.threads.find(t=>t.guestAccess==='invite').id")
    goto(p, "thread.html?id=%s" % tid); check("Просмотр доступен только участникам" not in txt(p), "закрытая тема не открылась после приглашения")
    p.fill("#replyText", "попытка"); p.click("text=Отправить ответ"); p.wait_for_timeout(500)
    check("login.html" in p.url, "гость по приглашению смог писать/не перенаправлен на вход")

@test("T06", "Приглашение: неверный/пустой код отклоняется")
def t06(env):
    p = env.page(env.ctx()); goto(p, "invite.html")
    p.fill("#inviteCode", "WRONG"); p.click("text=Активировать приглашение"); check("не найден" in p.inner_text("#msg"), "неверный код принят")
    p.fill("#inviteCode", ""); p.click("text=Активировать приглашение"); check(ev(p, "localStorage.getItem('PROBIV_MEMBER')") is None, "пустой код создал сессию")

@test("T07", "Регистрация, дубликаты, пароль, logout, повторный вход, перезагрузка")
def t07(env):
    p = env.page(env.ctx()); n0 = None
    def reg(name, pw, code):
        goto(p, "register.html"); p.fill("#name", name); p.fill("#pass", pw); p.fill("#code", code); p.click("#registerBtn"); p.wait_for_timeout(700)
    goto(p, "index.html"); n0 = ev(p, "DEMO_DB.users.length")
    reg("alex22", "secret1", "DEMO-2026"); check("занято" in p.inner_text("#msg"), "дубликат имени (регистр) принят")
    reg("Новый_Юзер", "secret1", "BAD"); check("код приглашения" in p.inner_text("#msg"), "неверный код принят")
    reg("Ab", "secret1", "DEMO-2026"); check("минимум" in p.inner_text("#msg") or "от 3" in p.inner_text("#msg"), "короткое имя принято")
    reg("<b>x</b>", "secret1", "DEMO-2026"); check(ev(p, "DEMO_DB.users.length") == n0, "имя с HTML принято")
    reg("Новый_Юзер", "secret1", "DEMO-2026"); p.wait_for_url(re.compile(r"index\.html"))
    check(ev(p, "DEMO_DB.users.length") == n0 + 1, "аккаунт не создан")
    check(ev(p, "DEMO_DB.invites[0].uses") == 1, "счётчик приглашения")
    goto(p, "index.html"); goto(p, "index.html")
    check(ev(p, "DEMO_DB.users.length") == n0 + 1, "дубли после перезагрузки")
    check(ev(p, "!!currentUser() && currentUser().name") == "Новый_Юзер", "сессия не сохранилась")
    check(ev(p, "!!DEMO_DB.users.at(-1).passHash"), "пароль не сохранён (хеш)")
    p.click("[data-logout-link]"); p.wait_for_timeout(500)
    check(ev(p, "localStorage.getItem('PROBIV_USER_ID')") is None and ev(p, "localStorage.getItem('PROBIV_MEMBER')") is None, "logout не очистил состояние")
    login_user(p, "Новый_Юзер", "wrongpw"); check("login.html" in p.url and "Неверный пароль" in p.inner_text("#loginMsg"), "неверный пароль принят")
    login_user(p, "Новый_Юзер", "secret1"); check("login.html" not in p.url, "верный пароль отклонён")

@test("T08", "Тема: ответ увеличивает счётчики ровно на 1, просмотры, сохранение")
def t08(env):
    p = env.page(env.ctx()); login_user(p, "Alex22"); goto(p, "thread.html?id=101")
    a0 = ev(p, "getThread(101).answers"); posts0 = ev(p, "getThread(101).posts.length"); up0 = ev(p, "getUser(2).posts"); v0 = ev(p, "getThread(101).views")
    p.fill("#replyText", "Тестовый ответ <b>x</b>"); p.click("text=Отправить ответ"); p.wait_for_timeout(400)
    check(ev(p, "getThread(101).answers") == a0 + 1, "answers: было %s стало %s" % (a0, ev(p, "getThread(101).answers")))
    check(ev(p, "getThread(101).posts.length") == posts0 + 1 and ev(p, "getUser(2).posts") == up0 + 1, "посты/пользователь")
    check("<b>x</b>" in p.inner_text(".post:last-of-type .post-text"), "HTML не экранирован")
    goto(p, "thread.html?id=101"); check(ev(p, "getThread(101).posts.length") == posts0 + 1, "ответ не пережил перезагрузку")
    check(ev(p, "getThread(101).views") == v0 + 1, "просмотры: было %s стало %s" % (v0, ev(p, "getThread(101).views")))
    check(ev(p, "getThread(101).posts.at(-1).user") == 2, "ответ записан от другого пользователя")

@test("T09", "Реакции: лайк/снятие, гость перенаправляется")
def t09(env):
    p = env.page(env.ctx()); goto(p, "thread.html?id=101"); p.click(".post-actions button >> nth=0"); p.wait_for_timeout(300)
    check("login.html" in p.url, "гость смог поставить реакцию")
    login_user(p, "Alex22"); goto(p, "thread.html?id=101"); l0 = ev(p, "getThread(101).posts[0].likes")
    p.click(".post-actions button >> nth=0"); p.wait_for_timeout(200); check(ev(p, "getThread(101).posts[0].likes") == l0 + 1, "лайк")
    p.click(".post-actions button >> nth=0"); p.wait_for_timeout(200); check(ev(p, "getThread(101).posts[0].likes") == l0, "снятие лайка")

@test("T10", "Доступ к закрытым темам и несуществующие ID тем")
def t10(env):
    p = env.page(env.ctx()); tid = None; goto(p, "index.html"); tid = ev(p, "DEMO_DB.threads.find(t=>t.guestAccess==='invite').id")
    goto(p, "thread.html?id=%s" % tid); check("Просмотр доступен только участникам" in txt(p), "гость видит закрытую тему")
    p.click(".gate-link >> nth=1"); p.wait_for_load_state("load"); check("return=" in p.url, "нет return-параметра")
    p.fill("#login", "Alex22"); p.fill("#pass", "x"); p.click("#loginBtn"); p.wait_for_url(re.compile(r"thread\.html"))
    check("Просмотр доступен только участникам" not in txt(p), "после входа тема закрыта")
    for v in ["99999", "abc", "", "0x65", "-1"]:
        goto(p, "thread.html?id=" + v); check("Такой темы нет" in txt(p), "id=%r: %s" % (v, txt(p)[:50]))
    goto(p, "thread.html"); check("Такой темы нет" in txt(p), "без id")

@test("T11", "Раздел: загрузка, неверные ID, пагинация, создание темы, закрытый раздел, целостность")
def t11(env):
    p = env.page(env.ctx()); goto(p, "category.html?id=2"); check("Гарант-Сервис" in p.inner_text("#categoryPage"), "раздел 2")
    for v in ["999", "abc", "", "0x2", "-1"]:
        goto(p, "category.html?id=" + v); check("Такого раздела нет" in txt(p), "id=%r" % v)
    goto(p, "category.html?id=7&page=999"); check(".active-page" and p.locator(".active-page").count() == 1, "пагинация")
    goto(p, "category.html?id=2"); p.fill("#newTitle", "Гостевая"); p.fill("#newText", "x"); p.click("#createTopicBtn"); p.wait_for_timeout(400)
    check("login.html" in p.url, "гость создал тему")
    login_user(p, "Alex22"); goto(p, "category.html?id=2"); n0 = ev(p, "DEMO_DB.threads.length"); max0 = ev(p, "Math.max(...DEMO_DB.threads.map(t=>t.id))")
    p.fill("#newTitle", "Тестовая тема <i>1</i>"); p.fill("#newText", "Текст"); p.click("#createTopicBtn"); p.wait_for_url(re.compile(r"thread\.html"))
    check(ev(p, "DEMO_DB.threads.length") == n0 + 1 and ev(p, "DEMO_DB.threads[0].id") == max0 + 1, "уникальный id")
    check("<i>1</i>" in p.inner_text("h1"), "заголовок не экранирован")
    goto(p, "category.html?id=2"); p.fill("#newTitle", "тестовая тема <i>1</i>"); p.fill("#newText", "x"); p.click("#createTopicBtn"); p.wait_for_timeout(300)
    check(ev(p, "DEMO_DB.threads.length") == n0 + 1, "дубликат названия создан")
    goto(p, "category.html?id=9"); p.fill("#newTitle", "Закрытая тест"); p.fill("#newText", "тело"); p.click("#createTopicBtn"); p.wait_for_url(re.compile(r"thread\.html"))
    check(ev(p, "DEMO_DB.threads[0].guestAccess") == "invite", "тема в закрытом разделе открыта для гостей")
    bad = ev(p, """(()=>{const u=new Set(DEMO_DB.users.map(x=>x.id)),c=new Set(DEMO_DB.categories.map(x=>x.name)),ids=DEMO_DB.threads.map(t=>t.id);const e=[];
      if(new Set(ids).size!==ids.length)e.push('dup thread ids');DEMO_DB.threads.forEach(t=>{if(!u.has(t.author))e.push('author '+t.id);if(!c.has(t.category))e.push('cat '+t.id);t.posts.forEach(p=>{if(!u.has(p.user))e.push('post user '+t.id)})});return e})()""")
    check(not bad, str(bad)); check(not p.errs, "; ".join(p.errs[:3]))

@test("T12", "Поиск: кириллица, регистр, пустой, спецсимволы, type=, утечка закрытых тем")
def t12(env):
    p = env.page(env.ctx()); goto(p, "search.html?q=гарант"); a = p.locator("#results .list-row").count(); check(a > 0, "кириллица")
    goto(p, "search.html?q=ГАРАНТ"); check(p.locator("#results .list-row").count() == a, "регистр")
    goto(p, "search.html"); check("Введите поисковый запрос" in p.inner_text("#results"), "пустой запрос")
    for q in ["<script>window.__x=1</script>", "%", "\\", "((", "'\"><img src=x onerror=window.__x=1>"]:
        goto(p, "search.html?q=" + q)
        check(ev(p, "window.__x") is None, "XSS через q=%s" % q)
    check("Ничего не найдено" in p.inner_text("#results"), "спецсимволы")
    for t, expect in [("users", ev(p, "DEMO_DB.users.length")), ("threads", ev(p, "DEMO_DB.threads.length"))]:
        goto(p, "search.html?type=" + t); check(p.locator("#results .list-row").count() == expect, "type=%s: %d" % (t, p.locator("#results .list-row").count()))
    goto(p, "search.html?type=reputation"); check(p.locator("#results .list-row").count() > 0, "type=reputation")
    word = ev(p, """(()=>{const t=DEMO_DB.threads.find(t=>t.guestAccess==='invite');t.posts[0].text='секретныйтокен'+t.id;saveDB();return 'секретныйтокен'+t.id})()""")
    goto(p, "search.html?q=" + word); check(p.locator("#results .list-row").count() == 0, "гость находит текст закрытой темы")
    check(not p.errs, "; ".join(p.errs[:3]))

@test("T13", "Админка недоступна гостю; вход возвращает на admin.html")
def t13(env):
    p = env.page(env.ctx()); goto(p, "admin.html"); check("login.html" in p.url and "return=" in p.url, "гость не перенаправлен: " + p.url)
    check(p.locator("#adminPanel").count() == 0, "панель отрисована гостю")
    login_user(p, "Alex22"); goto(p, "admin.html"); check("login.html" in p.url, "обычный участник попал в админку")
    login_admin(p); check(p.locator("#adminPanel").count() == 1, "админ-панель не открылась")
    goto(p, "index.html?preview=1"); check(ev(p, "isPreviewMode()") is True, "preview для админа")
    p2 = env.page(env.ctx()); goto(p2, "index.html?preview=1"); check(ev(p2, "isPreviewMode()") is False, "preview=1 без админа включил режим")
    p3 = env.page(env.ctx()); goto(p3, "login.html?return=https://evil.example/x"); p3.fill("#login", "Alex22"); p3.fill("#pass", "x"); p3.click("#loginBtn"); p3.wait_for_timeout(700)
    check(p3.url.startswith(BASE), "open redirect: " + p3.url)

@test("T14", "Админка: все вкладки открываются без ошибок и отрисовывают редакторы")
def t14(env):
    p = env.page(env.ctx()); login_admin(p)
    tabs = ev(p, "[...document.querySelectorAll('[data-tab]')].map(b=>b.dataset.tab)"); empty = []
    for t in tabs:
        p.click('[data-tab="%s"]' % t); p.wait_for_timeout(250)
        if len(p.inner_text("#adminPanel").strip()) < 10: empty.append(t)
    check(len(tabs) >= 20, "вкладок найдено %d" % len(tabs)); check(not empty, "пустые вкладки: %s" % empty); check(not p.errs, "; ".join(sorted(set(p.errs))[:5]))
    p.info = "вкладок: %d" % len(tabs)

@test("T15", "Админка → шапка: сохранение, перезагрузка, публичная страница, повторное открытие")
def t15(env):
    p = env.page(env.ctx()); login_admin(p); p.click('[data-tab="homeHeader"]'); p.fill("#bhTitle", "TESTLOGO"); p.fill("#bhFooter", "ФУТЕР-ТЕСТ"); p.fill("#bhBg", "#336699")
    p.click("text=Сохранить шапку"); p.wait_for_timeout(300)
    goto(p, "index.html"); check(p.inner_text(".logo") == "TESTLOGO", "логотип")
    check("ФУТЕР-ТЕСТ" in p.inner_text("footer"), "футер"); check(ev(p, "getComputedStyle(document.body).backgroundColor") == "rgb(51, 102, 153)", "фон-цвет")
    goto(p, "thread.html?id=101"); check(p.inner_text(".logo") == "TESTLOGO", "логотип на другой странице")
    goto(p, "admin.html"); p.click('[data-tab="homeHeader"]'); check(p.input_value("#bhTitle") == "TESTLOGO", "повторное открытие")

@test("T16", "Админка: удалённые данные не воскресают (обычный режим и предпросмотр)")
def t16(env):
    p = env.page(env.ctx()); login_admin(p); title = ev(p, "getThread(125).title"); n0 = ev(p, "DEMO_DB.threads.length")
    ev(p, "deleteTopic(125)"); p.wait_for_timeout(300)
    check(ev(p, "DEMO_DB.threads.length") == n0 - 1, "не удалилась")
    goto(p, "index.html?preview=1"); p.click("#refTabTopics"); check(title not in p.inner_text("#referenceThreads"), "тема воскресла в предпросмотре")
    check(ev(p, "!!getThread(125)") is False, "preview DB содержит удалённую тему")
    goto(p, "index.html"); goto(p, "index.html"); check(ev(p, "!!getThread(125)") is False, "тема воскресла после перезагрузки")
    login_admin(p); ev(p, "deleteUser(36)") if ev(p, "!!getUser(36)") else None
    goto(p, "index.html"); check(ev(p, "!!getUser(36)") is False, "пользователь воскрес")

@test("T17", "Резервная копия: экспорт без секретов, импорт восстанавливает точно, битый файл отклоняется")
def t17(env):
    p = env.page(env.ctx()); login_admin(p); p.click('[data-tab="tools"]') if p.locator('[data-tab="tools"]').count() else None
    ev(p, "goTab(document.querySelector('[data-tab]') && [...document.querySelectorAll('[data-tab]')].map(b=>b.dataset.tab).find(t=>/tool|backup|system/i.test(t)) || 'tools')"); p.wait_for_timeout(300)
    with p.expect_download() as d: ev(p, "exportDB()")
    path = d.value.path(); data = json.load(open(path, encoding="utf-8"))
    check("adminAuth" not in data and "DEMO-ADMIN" not in json.dumps(data), "в резервной копии есть учётные данные админа")
    n = len(data["threads"]); check(n >= 25, "экспорт неполный")
    data["threads"] = [t for t in data["threads"] if t["id"] != 125]; data["hotTopics"] = [h for h in data["hotTopics"] if h["title"] != "x"]
    tmp = os.path.join(tempfile.gettempdir(), "probiv_import_test.json"); json.dump(data, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    ev(p, "goTab('tools')"); p.wait_for_timeout(200); p.set_input_files("#importFile", tmp); p.click("text=Импортировать"); p.wait_for_load_state("load"); p.wait_for_timeout(500)
    check(ev(p, "DEMO_DB.threads.length") == n - 1 and ev(p, "!!getThread(125)") is False, "импорт не точен: тем %s" % ev(p, "DEMO_DB.threads.length"))
    bad = os.path.join(tempfile.gettempdir(), "bad.json"); open(bad, "w").write("{not json")
    login_admin(p); ev(p, "goTab('tools')"); p.wait_for_timeout(200); p.dialogs.clear(); p.set_input_files("#importFile", bad); p.click("text=Импортировать"); p.wait_for_timeout(300)
    check(p.dialogs and "JSON" in p.dialogs[-1], "битый файл не отклонён: %s" % p.dialogs)
    check(ev(p, "DEMO_DB.threads.length") == n - 1, "битый файл изменил данные")
    ev(p, "resetDemo()"); p.wait_for_load_state("load"); p.wait_for_timeout(400); check(ev(p, "DEMO_DB.threads.length") == 25, "сброс не вернул демо-данные")

@test("T18", "XSS: страницы правил/помощи, названия тем, ответы, поиск")
def t18(env):
    p = env.page(env.ctx()); login_admin(p); p.click('[data-tab="pages"]') if p.locator('[data-tab="pages"]').count() else ev(p, "goTab('pages')"); p.wait_for_timeout(200)
    evil = '<p>ok-текст</p><img src=x onerror="window.__pwn=1"><script>window.__pwn=2</script><a href="javascript:window.__pwn=3">link</a><b onclick="window.__pwn=4">bold</b>'
    ev(p, "document.getElementById('rulesText').value=%s;savePage('rules')" % json.dumps(evil)); p.wait_for_timeout(200)
    goto(p, "rules.html"); p.wait_for_timeout(300); check(ev(p, "window.__pwn") is None, "исполнился код: %s" % ev(p, "window.__pwn"))
    check("ok-текст" in p.inner_text("#managedPage"), "безопасный HTML потерян")
    check(ev(p, "document.querySelectorAll('#managedPage script,#managedPage [onerror],#managedPage [onclick]').length") == 0, "в DOM остались опасные узлы")
    check(ev(p, "(document.querySelector('#managedPage a')||{getAttribute:()=>null}).getAttribute('href')") in (None, ""), "javascript: ссылка сохранена")
    ev(p, "document.getElementById('rulesText')") if False else None
    goto(p, "register.html"); p.fill("#name", "Xss Tester"); p.fill("#pass", "abc"); p.fill("#code", "DEMO-2026"); p.click("#registerBtn"); p.wait_for_url(re.compile(r"index\.html"))
    goto(p, "category.html?id=2"); p.fill("#newTitle", '<img src=x onerror=window.__pwn=5>'); p.fill("#newText", '<script>window.__pwn=6</script>'); p.click("#createTopicBtn"); p.wait_for_url(re.compile(r"thread\.html")); p.wait_for_timeout(300)
    check(ev(p, "window.__pwn") is None, "XSS в теме/сообщении"); goto(p, "index.html"); goto(p, "search.html?q=img"); check(ev(p, "window.__pwn") is None, "XSS в списках/поиске")

@test("T19", "Медиа и рекламные слоты: загрузка, размещение, публичное отображение, удаление, лимит")
def t19(env):
    p = env.page(env.ctx()); login_admin(p); ev(p, "goTab('media')"); p.wait_for_timeout(300)
    slots = ["topAd", "hero1", "hero2", "sidebar", "globalTop", "globalBottom", "bottom1", "bottom2", "bottom3", "bottom4", "threadBefore", "threadAfter"]
    for s in slots:
        p.set_input_files("#mediaFile", {"name": s + ".png", "mimeType": "image/png", "buffer": PNG}); p.fill("#mediaName", "m-" + s); p.select_option("#mediaSlot", s); ev(p, "addMedia()"); p.wait_for_timeout(350)
        ev(p, "goTab('media')"); p.wait_for_timeout(150)
    check(ev(p, "DEMO_DB.media.length") == len(slots), "загружено %d" % ev(p, "DEMO_DB.media.length"))
    goto(p, "index.html"); sel = {"topAd": ".ad.a img", "hero1": ".ad.b img", "hero2": ".ad.c img", "sidebar": ".sidebar-media img", "globalTop": ".global-slot img",
        "globalBottom": ".global-slot img", "bottom1": "[data-home-media-slot=bottom1] img", "bottom2": "[data-home-media-slot=bottom2] img", "bottom3": "[data-home-media-slot=bottom3] img", "bottom4": "[data-home-media-slot=bottom4] img"}
    missing = [k for k, v in sel.items() if p.locator(v).count() == 0]
    goto(p, "thread.html?id=101")
    if p.locator(".media-slot img").count() < 2: missing += ["threadBefore/After"]
    goto(p, "rules.html")
    if p.locator(".global-slot img").count() < 2: missing += ["globalTop+Bottom на внутренней странице"]
    check(not missing, "слоты не отображаются на сайте: %s" % sorted(set(missing)))
    big = os.path.join(tempfile.gettempdir(), "big.png"); open(big, "wb").write(PNG + b"\0" * (2 * 1024 * 1024))
    goto(p, "admin.html"); ev(p, "goTab('media')"); p.wait_for_timeout(200); n = ev(p, "DEMO_DB.media.length"); p.dialogs.clear(); p.set_input_files("#mediaFile", big); ev(p, "addMedia()"); p.wait_for_timeout(500)
    check(ev(p, "DEMO_DB.media.length") == n and p.dialogs, "файл больше лимита принят без сообщения")
    ev(p, "deleteMedia(DEMO_DB.media[0].id)"); p.wait_for_timeout(200); check(ev(p, "DEMO_DB.media.length") == n - 1, "удаление медиа")
    check(not p.errs, "; ".join(sorted(set(p.errs))[:4]))

@test("T20", "Визуальный редактор баннеров: создание, все позиции, размеры, сохранение")
def t20(env):
    p = env.page(env.ctx()); login_admin(p); ev(p, "goTab('media')"); p.set_input_files("#mediaFile", {"name": "a.png", "mimeType": "image/png", "buffer": PNG}); p.select_option("#mediaSlot", "none"); ev(p, "addMedia()"); p.wait_for_timeout(300)
    ev(p, "goTab('ads')"); p.wait_for_timeout(300)
    ev(p, "document.getElementById('newAdMedia').value=DEMO_DB.media[0].id;document.getElementById('newAdPosition').value='afterCategories';document.getElementById('newAdWidth').value=50;document.getElementById('newAdHeight').value=60"); ev(p, "createVisualAd()"); p.wait_for_timeout(400)
    check(ev(p, "DEMO_DB.ads.length") == 1, "баннер не создан")
    goto(p, "index.html"); el = p.locator(".visual-home-ad"); check(el.count() == 1, "баннер не показан на главной")
    check(ev(p, "document.querySelector('[data-home-media-anchor=afterCategories] .visual-home-ad')!==null"), "позиция не применена")
    box = el.bounding_box(); check(abs(box["height"] - 60) < 6, "высота %s" % box["height"])
    goto(p, "admin.html"); ev(p, "goTab('ads')"); p.wait_for_timeout(300); check(ev(p, "DEMO_DB.ads[0].height") == 60, "после перезагрузки данные потеряны")
    positions = ["pageTop", "beforeHot", "afterHot", "afterRecent", "afterPinned", "afterNormal", "beforeCategories", "afterCategories", "sidebarTop", "sidebarAfterUsers", "sidebarAfterStats", "pageBottom", "topAd", "hero1", "hero2", "sidebar", "bottom1", "bottom2", "bottom3", "bottom4"]
    hidden = []
    for pos in positions:
        ev(p, "DEMO_DB.ads[0].position=%s;DEMO_DB.ads[0].slot=%s;saveDB()" % (json.dumps(pos), json.dumps(pos))); goto(p, "index.html")
        if p.locator(".visual-home-ad").count() != 1: hidden.append(pos)
    check(not hidden, "баннер не отображается в позициях, которые предлагает редактор: %s" % hidden)
    goto(p, "index.html?preview=1"); check(ev(p, "document.querySelectorAll('.visual-home-ad').length") == 1, "в предпросмотре баннер не виден")
    check(not p.errs, "; ".join(sorted(set(p.errs))[:4]))

@test("T21", "Целостность данных при удалении раздела/пользователя/темы и миграция не дублирует записи")
def t21(env):
    p = env.page(env.ctx()); login_admin(p); n_users = ev(p, "DEMO_DB.users.length")
    ev(p, "deleteSection(4)"); p.wait_for_timeout(200)
    ev(p, "deleteUser(6)"); p.wait_for_timeout(200)
    bad = ev(p, """(()=>{const u=new Set(DEMO_DB.users.map(x=>x.id)),c=new Set(DEMO_DB.categories.map(x=>x.name));const e=[];DEMO_DB.threads.forEach(t=>{if(!u.has(t.author))e.push('author '+t.id);if(!c.has(t.category))e.push('cat '+t.id);t.posts.forEach(p=>{if(!u.has(p.user))e.push('post '+t.id)})});DEMO_DB.recent.forEach(r=>{if(!u.has(r.author))e.push('recent '+r.title)});return e})()""")
    check(not bad, str(bad))
    for _ in range(3): goto(p, "index.html")
    check(ev(p, "DEMO_DB.users.length") == n_users - 1 and ev(p, "!!getUser(6)") is False, "данные изменились при перезагрузке")
    old = ev(p, "JSON.stringify(DEMO_DB)"); ev(p, "localStorage.setItem('PROBIV_DB_VERSION','v3')"); goto(p, "index.html")
    check(ev(p, "DEMO_DB.users.length") >= n_users - 1, "миграция потеряла пользователей")
    check(len(set(ev(p, "DEMO_DB.users.map(u=>u.id)"))) == ev(p, "DEMO_DB.users.length"), "миграция создала дубликаты ID")

@test("T22", "Устойчивость к повреждённому хранилищу")
def t22(env):
    p = env.page(env.ctx()); goto(p, "index.html")
    for bad in ["{broken", "null", "[]", "\"str\"", '{"threads":null,"users":"x","categories":5}']:
        ev(p, "localStorage.setItem('PROBIV_DEMO_DB',%s)" % json.dumps(bad)); p.errs.clear(); goto(p, "index.html")
        check(p.locator(".ref-thread").count() >= 0 and not [e for e in p.errs if "pageerror" in e], "ломается на %r: %s" % (bad, p.errs[:2]))
    ev(p, "localStorage.setItem('PROBIV_USER_ID','9999');localStorage.setItem('PROBIV_MEMBER','1')"); goto(p, "profile.html?id=2")
    check("Профиль доступен участникам" in txt(p), "мёртвая сессия считается входом")

@test("T23", "Logout очищает состояние; защищённые страницы снова закрыты")
def t23(env):
    p = env.page(env.ctx()); login_admin(p); goto(p, "index.html"); p.click("[data-logout-link]"); p.wait_for_timeout(500)
    keys = ev(p, "[localStorage.getItem('PROBIV_MEMBER'),localStorage.getItem('PROBIV_USER_ID'),sessionStorage.getItem('PROBIV_ADMIN'),sessionStorage.getItem('PROBIV_ADMIN_SESSION')]")
    check(keys == [None] * 4, "остатки сессии: %s" % keys); goto(p, "admin.html"); check("login.html" in p.url, "админка открыта после logout")
    goto(p, "profile.html?id=2"); check("Профиль доступен участникам" in txt(p), "профиль открыт после logout")

@test("T24", "Адаптивность: нет горизонтального скролла от 320 до 1920 px")
def t24(env):
    bad = []; shots = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens"); os.makedirs(shots, exist_ok=True)
    for w in [320, 375, 768, 1024, 1280, 1920]:
        p = env.page(env.ctx(w, 900)); login_user(p, "Alex22")
        for path in ["index.html", "thread.html?id=101", "category.html?id=2", "profile.html?id=3", "search.html?q=a", "login.html", "register.html", "rules.html", "admin.html"]:
            if path == "admin.html": login_admin(p)
            else: goto(p, path)
            p.wait_for_timeout(100)
            if path == "admin.html": p.wait_for_timeout(300)
            over = ev(p, "document.documentElement.scrollWidth-document.documentElement.clientWidth")
            if over > 1: bad.append("%dpx %s +%dpx" % (w, path, over))
        if w in (320, 1280, 1920):
            goto(p, "index.html"); p.screenshot(path=os.path.join(shots, "index_%d.png" % w), full_page=False)
    check(not bad, "; ".join(bad[:12]))

@test("T25", "Клавиатура и доступность: фокус виден, элементы управления достижимы")
def t25(env):
    p = env.page(env.ctx()); goto(p, "login.html"); p.keyboard.press("Tab"); focused = []
    for _ in range(12):
        focused.append(ev(p, "document.activeElement.tagName+':'+(document.activeElement.id||document.activeElement.textContent.trim().slice(0,12))")); p.keyboard.press("Tab")
    check(any("login" in f for f in focused) and any("loginBtn" in f for f in focused), "поля формы недостижимы с клавиатуры: %s" % focused)
    p.fill("#login", "Alex22"); p.fill("#pass", "x"); p.press("#pass", "Enter"); p.wait_for_url(re.compile(r"index\.html")); 
    outline = ev(p, "(()=>{const a=document.querySelector('.nav a');a.focus();const s=getComputedStyle(a);return [s.outlineStyle,s.outlineWidth,s.boxShadow]})()")
    check(outline[0] != "none" or outline[2] != "none", "у ссылок нет видимого фокуса (outline=%s)" % outline)

@test("T26", "Производительность: 3000 тем")
def t26(env):
    p = env.page(env.ctx()); goto(p, "index.html")
    ev(p, """(()=>{const base=DEMO_DB.threads[3];for(let i=0;i<3000;i++){DEMO_DB.threads.push(Object.assign(JSON.parse(JSON.stringify(base)),{id:5000+i,title:'Массовая тема '+i}))}saveDB()})()""")
    t0 = time.time(); goto(p, "index.html"); dt1 = time.time() - t0; check(dt1 < 4, "главная %.1fs" % dt1)
    t0 = time.time(); goto(p, "category.html?id=%s" % ev(p, "DEMO_DB.threads[3].category && DEMO_DB.categories.find(c=>c.name===DEMO_DB.threads[3].category).id")); dt2 = time.time() - t0; check(dt2 < 4, "раздел %.1fs" % dt2)
    t0 = time.time(); goto(p, "search.html?q=массовая"); dt3 = time.time() - t0; check(dt3 < 4, "поиск %.1fs" % dt3)
    p.info = "index %.2fs, category %.2fs, search %.2fs" % (dt1, dt2, dt3)

@test("T27", "Запуск через file:// без ошибок")
def t27(env):
    check(FILE_DIR, "NOT RUN: не передан --file-dir")
    p = env.page(env.ctx()); p.goto("file://%s/index.html" % FILE_DIR, wait_until="load"); p.wait_for_timeout(300)
    check(p.locator(".ref-thread").count() >= 5, "главная пуста по file://"); p.goto("file://%s/thread.html?id=101" % FILE_DIR, wait_until="load")
    check(p.locator(".post").count() >= 1, "тема по file://"); check(not p.errs, "; ".join(sorted(set(p.errs))[:4]))

def main():
    rows = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for tid, title, fn in TESTS:
            if ONLY and tid not in ONLY: continue
            env = Env(browser); t0 = time.time(); status = "PASS"; note = ""
            try:
                fn(env)
                note = getattr(env, "note", "")
            except AssertionError as e:
                status = "NOT RUN" if str(e).startswith("NOT RUN") else "FAIL"; note = str(e)[:400]
            except Exception as e:
                status = "FAIL"; note = ("EXC " + type(e).__name__ + ": " + str(e).splitlines()[0])[:400]
            finally:
                env.close()
            rows.append({"id": tid, "title": title, "status": status, "note": note, "sec": round(time.time() - t0, 1)})
            print("%-4s %-8s %s%s" % (tid, status, title, ("  → " + note) if note else ""), flush=True)
        browser.close()
    if OUT: json.dump(rows, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    p = sum(r["status"] == "PASS" for r in rows); print("\nИТОГО: %d PASS / %d FAIL / %d NOT RUN" % (p, sum(r["status"] == "FAIL" for r in rows), sum(r["status"] == "NOT RUN" for r in rows)))
    sys.exit(0 if all(r["status"] != "FAIL" for r in rows) else 1)

if __name__ == "__main__": main()
