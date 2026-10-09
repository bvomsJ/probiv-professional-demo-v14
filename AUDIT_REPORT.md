# AUDIT_REPORT — PROBIV.CC

Проект: статический демо-форум (HTML/CSS/JS, `localStorage`). Supabase **не** интегрирован. Дата аудита: 09.10.2026.

## A. Аудит исходника
Файлы: 11 HTML-страниц, `data.js` (сид + загрузка/миграция), `site.js` (ядро), `style.css`, `background.png`, `README.md`,
`app.js` и `app_1_.js` (байт-в-байт одинаковые, **не подключены ни к одной странице**, старый ключ `probiv_demo_state_v3` → архив `_legacy/app.js.old`).
Данные: 36 пользователей, 25 тем, 9 разделов; битых авторов/разделов нет.

### Найденные и исправленные проблемы
| P | Проблема | Исправление |
|---|---|---|
| P0 | Активация приглашения назначала сессии личность `reagent` (users[0]) — гость мог писать от его имени | Сессия по приглашению = только чтение; `canPost()` для записи |
| P0 | Предпросмотр админки заново подмешивал сид → удалённые темы/пользователи «воскресали» | Сид-миграция не выполняется в предпросмотре; предпросмотр берёт рабочую БД |
| P0 | Импорт ставил версию `legacy-import` → сид повторно дописывался в импортированную копию | Импорт валидируется, штампуется текущей версией, восстановление точное |
| P0 | Экспорт содержал логин/пароль админа; они же читались из хранилища | `adminAuth` не экспортируется, не импортируется, не читается из storage |
| P0 | Stored-XSS: HTML «Правил/Помощи» вставлялся без очистки; `style`-цвет аватара и фон не валидировались | Allow-list санитайзер, `safeColor`, проверка фона, `safeSrc` для медиа |
| P1 | `Number(id)` принимал `0x2`, `1e0`, `02` как валидные ID | Строгий `parseId` во всех страницах |
| P1 | Пароль при регистрации не сохранялся и не проверялся при входе; имя принимало HTML | SHA-256-хеш (демо), проверка при входе, валидация имени, откат при ошибке сохранения |
| P1 | Ответ в теме сбрасывал «ответы» (19 → 3) | Инкремент +1, учёт счётчика раздела |
| P1 | Слоты медиа `hero1/hero2/sidebar/globalTop/globalBottom` не отображались нигде | Добавлены точки вывода |
| P1 | Баннеры в позициях `beforeHot/afterHot/topAd/hero*/sidebar/bottom*` молча не показывались | Реальные якоря + соответствия |
| P1 | Поиск: гость находил текст закрытых тем; ссылки статистики `?type=` ничего не делали | Исключён текст закрытых тем; реализованы списки по `type` |
| P1 | `saveDB` в предпросмотре писал не в тот ключ; квота storage не обрабатывалась (медиа 5 МБ) | Правильный ключ, откат и сообщение об ошибке, лимит 1,5 МБ |
| P1 | Enter не отправлял форму входа; тема создавалась в закрытом разделе как публичная; дубликаты названий | Исправлено |
| P2 | Блок «Рекомендуемый контент» отображался сломанным (inline-ссылки); вкладки «Новые темы» скрыты на мобильных; пустой 4-й баннер; нет фокуса; 8 дат регистрации в будущем; статические подписи про реестры; нет favicon (404) | Исправлено (CSS дописан в конец `style.css`) |

Дополнительно: `.github/workflows/pages.yml`, `.nojekyll`, `docs/SUPABASE_MIGRATION.md`, `supabase/001_schema_DRAFT.sql` (черновик, не применялся).

## Результаты тестов
### Статические проверки (`python3 tests/static_checks.py`)
| Проверка | Статус |
|---|---|
| JS syntax: site.js | PASS |
| JS syntax: data.js | PASS |
| Inline <script> syntax (11 pages) | PASS |
| Local links/resources exist (href/src) | PASS |
| No duplicate id attributes in static HTML | PASS |
| getElementById targets exist (non-admin pages) | PASS |
| Page names referenced from JS/HTML all exist | PASS |
| CSS url() resources exist | PASS |
| Seed background file exists (background.png) | PASS |
| No unescaped DB fields interpolated into innerHTML (public pages + site.js) | PASS |
| No secrets / service_role keys / private keys in the repository | PASS |
| Seed data integrity (unique IDs, authors, categories, recent/hot links) | PASS |

### Браузерные тесты (Chromium 141 / Playwright, `tests/run_browser_tests.py`)
Колонка «Исходник» — тот же итоговый набор тестов, запущенный на неизменённой загруженной версии.

| ID | Проверка | Исходник | Итог |
|---|---|---|---|
| T01 | Все публичные страницы открываются без JS/Console/Network ошибок | PASS | PASS |
| T02 | Главная: колонки, список, табы, разделы, статистика, теги | PASS | PASS |
| T03 | Профиль: гость видит запрос входа, а не данные | PASS | PASS |
| T04 | Профиль: корректный ID, неверные ID не подменяются другим пользователем | FAIL | PASS |
| T05 | Приглашение даёт чтение закрытых тем, но не личность reagent | FAIL | PASS |
| T06 | Приглашение: неверный/пустой код отклоняется | PASS | PASS |
| T07 | Регистрация, дубликаты, пароль, logout, повторный вход, перезагрузка | FAIL | PASS |
| T08 | Тема: ответ увеличивает счётчики ровно на 1, просмотры, сохранение | FAIL | PASS |
| T09 | Реакции: лайк/снятие, гость перенаправляется | PASS | PASS |
| T10 | Доступ к закрытым темам и несуществующие ID тем | FAIL | PASS |
| T11 | Раздел: загрузка, неверные ID, пагинация, создание темы, закрытый раздел, целостность | FAIL | PASS |
| T12 | Поиск: кириллица, регистр, пустой, спецсимволы, type=, утечка закрытых тем | FAIL | PASS |
| T13 | Админка недоступна гостю; вход возвращает на admin.html | PASS | PASS |
| T14 | Админка: все вкладки открываются без ошибок и отрисовывают редакторы | PASS | PASS |
| T15 | Админка → шапка: сохранение, перезагрузка, публичная страница, повторное открытие | FAIL | PASS |
| T16 | Админка: удалённые данные не воскресают (обычный режим и предпросмотр) | FAIL | PASS |
| T17 | Резервная копия: экспорт без секретов, импорт восстанавливает точно, битый файл отклоняется | FAIL | PASS |
| T18 | XSS: страницы правил/помощи, названия тем, ответы, поиск | FAIL | PASS |
| T19 | Медиа и рекламные слоты: загрузка, размещение, публичное отображение, удаление, лимит | FAIL | PASS |
| T20 | Визуальный редактор баннеров: создание, все позиции, размеры, сохранение | FAIL | PASS |
| T21 | Целостность данных при удалении раздела/пользователя/темы и миграция не дублирует записи | PASS | PASS |
| T22 | Устойчивость к повреждённому хранилищу | PASS | PASS |
| T23 | Logout очищает состояние; защищённые страницы снова закрыты | PASS | PASS |
| T24 | Адаптивность: нет горизонтального скролла от 320 до 1920 px | PASS | PASS |
| T25 | Клавиатура и доступность: фокус виден, элементы управления достижимы | FAIL | PASS |
| T26 | Производительность: 3000 тем | PASS | PASS |
| T27 | Запуск через file:// без ошибок | PASS | PASS |

Итог: исправленная версия **27/27 PASS**, исходник 13/27 PASS. Подпуть `/forum/probiv/` (GitHub Pages-подобный): T01, T02, T04, T08, T10, T13, T15 — PASS. Запуск по `file://` — PASS (T27).

## NOT RUN / не проверено
* Другие браузеры (Firefox, Safari), реальные мобильные устройства — только Chromium с эмуляцией viewport 320–1920 px.
* Перетаскивание/ресайз баннера мышью в живом предпросмотре (проверены создание, все позиции, размеры, сохранение, отображение, но не жесты).
* Масштабирование шрифтов, контраст (WCAG), экранные читалки; из доступности проверены только клавиатура и видимый фокус.
* Сравнение с вашим референс-скриншотом: самого скриншота в переданных файлах нет, поэтому геометрия проверена по описанию
  (узкая левая колонка, широкая центральная, узкая правая) и визуально по `tests/screens/`.
* Supabase: интеграции нет; SQL-черновик не выполнялся.
* Тест «подпуть» запускался на копии проекта в `/forum/probiv/`, а не на реальном github.io.

## Известные ограничения
См. раздел «Ограничения» в README.md: админ-сессия и пароли — клиентские (подделываются в консоли), демо-счётчики не вычисляемые,
данные только в браузере, удаление пользователя переназначает его контент первому другому пользователю (прежнее поведение сохранено).

## Addendum: Supabase compatibility bridge (2026-10-09)

The earlier audit above describes the original local-only archive. This updated package adds `supabase-config.js`, `supabase-adapter.js`, Supabase Auth login/signup hooks, a new `supabase/001_schema.sql`, and static migration assertions. The existing `DEMO_DB` UI model is bridged through `public.app_state`; invitation codes are kept in `public.invites` and signup validates them in a database trigger.

**Verification boundary:** local JS/HTML/data checks passed (14/14); schema static assertions passed (10/10). The PostgreSQL migration has not been executed against the live Supabase project, and real Auth/RLS/database round-trip tests were not possible from this environment. The Playwright browser suite could not launch because the Playwright Chromium executable is not installed. The bridge does not migrate every legacy forum action to normalized server-side records; this remains a compatibility stage, not a production-ready forum backend.
