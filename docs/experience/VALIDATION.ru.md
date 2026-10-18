# Проверки и границы свидетельств

Дата: 18 октября 2026. Рабочая версия поверх `1a5e60d`, не опубликованный release-пакет. Тестовые проекты изолированы через временный XDG_DATA_HOME. Реальные сетевые проверки выполняются только против собственного loopback HTTP-сервера; импортируются fixture-файлы репозитория.

## Среда

- Debian GNU/Linux 13, Linux 6.18.55, x86_64; виртуальная машина KVM, доступны 3 vCPU AMD EPYC 9V74 и около 9.7 GiB RAM, swap отсутствует.
- Node 24.19.0, Python 3.12 (.venv), Chromium 154.0.8037.57.
- Native: Docker Debian 13, GTK 3 / WebKitGTK 2.54.0, Xvfb, tauri-driver/WebKitWebDriver; release-бинарник Tauri и замороженный Python sidecar. Настоящий IPC, настоящий WebView, не браузерный shim. Для headless-контейнера использован `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` только в тестовом окружении.
- Это не Kali/VirtualBox с 4 GiB, не физический GPU и не проверка установки итогового `.deb`. Сборка `tauri build --no-bundle` подтверждает работу приложения, но не заменяет release/install acceptance.

## Выполненные проверки

| Проверка | Результат / что проверялось |
|---|---|
| `npm run check` | 138 backend tests PASS, 1 live test по умолчанию skipped; 48 frontend tests PASS; lint, formatting, TypeScript, production bundle, cargo fmt, хеши vendored GTK patch |
| Отдельный live Nmap test | `DRAGONTRIP_LIVE_TEST=1 ... pytest tests/test_nmap_live.py -q`: PASS, реальный Nmap → SQLite |
| `tests/test_experience.py` | Повтор и конкурентный запуск, receipt после рестарта, изменившийся план/scope, реальная отмена дочернего процесса, частичный XML/JSONL, сбой проекции, принадлежность web-контекста проекту, goal CAS, архив и performance preferences |
| `App.test.tsx`, `Recon.test.tsx` | Поздний успешный/ошибочный ответ старого проекта, дубли редактора, сохранение выбора, ожидание backend-плана, отдельные разрешения, сохранение request_id при повторе и новый ID при изменении |
| `experience-journey.cjs` | Полный путь из UI до ретеста, перезапуска и повторного импорта; проверки данных API, 2 настоящих разрешённых запуска (Nmap/httpx), 13 объектов, сохранённый ретест и пустая очередь после рестарта |
| `browser-smoke.cjs` | Реальный Nmap, SQLite, Inspector, перенос узла мышью и координатами, создание связи, reload |
| `navigation-smoke.cjs` | 7 основных пунктов, страницы раздела, deep links, клавиатура/фокус, Back, compact sidebar, command palette |
| `research-smoke.cjs` | Scope, preview/apply/dedupe импорта, web endpoint, оригинальное доказательство, связанная заметка, reload |
| `investigation-smoke.cjs` | Связанные записи, задача, восстановление и конфликт черновиков, restart, удалённый источник, компактные темы |
| `workspace-smoke.cjs` | Объекты, knowledge, paths, finding, Vault, attachments, поиск, appearance, viewport, зашифрованный перенос проекта |
| `planning-smoke.cjs` | Задачи, фильтры и связи, overview, отчёты/export, restart |
| `experience-layout.cjs` | 12 кадров: graph/web × dark/light × 1000×650, 1366×768, 1920×1080; runtime errors отсутствуют, document horizontal overflow отсутствует |
| Native full smoke | PASS: Tauri IPC, packaged backend, настоящий Nmap/WhatWeb, XML/JSON export, drag/manual edge, Markdown/screenshot, Timeline/search, обе темы, Vault reveal/hide, encrypted archive import, restart и фильтры истории |
| Native research | PASS: scope, Burp items/issues preview/import, vhosts/methods, просмотр и private export источника, связанная заметка, dedupe и restart |
| Native navigation/layout | PASS: навигация, связанная заметка, compact sidebar/restart, обе темы на 1000×650/1366×768/1920×1080; фактический viewport совпал с запрошенным, overflow отсутствует |
| Upgrade исходной версии | База schema 0005, созданная кодом `1a5e60d`, открыта новым frozen backend; 0006 применена, goal изначально пуст, записи/ретест/evidence/Vault/черновик сохранены; импорт старого v5 и экспорт нового v6 проходят |

Проверка upgrade использовала исходный код старой рабочей версии в отдельном временном каталоге, не меняя текущий checkout. Кэшированный старый бинарник в `.build-tools/release-check` оказался несовместим с retest endpoint тестового сценария (404); его запуск не считается успешной проверкой опубликованного релиза. Для release остаётся прогнать отдельно опубликованные 0.8/0.9 пакеты на целевой ОС.

Содержательные assertions сохранены. Сценарии адаптированы к новым точкам входа и обязательному ожиданию проверенного плана. Исправлен старый browser selector: для Position on map сначала необходимо раскрыть Graph position. Нативный скрипт также ожидает разрешённый checkbox, а не кликает в disabled control.

## Скриншоты и демонстрация

[До](screenshots/before/) и [после](screenshots/after/) сняты на одинаковых Nmap/Burp fixtures и выбранных объектах; JSON measurements хранит размеры основной области. Скриншоты демонстрации — реальный полный UI-сценарий, а не макеты. [Открыть демонстрацию](demo/index.html); [результат сценария](demo/result.json). Это пошаговый проигрыватель снимков с подписями, не непрерывная видеозапись.

Нативные снимки и измерения находятся отдельно в [native](native/). Файл layout.json указывает фактический WebView viewport и запрошенный размер окна: оконная рамка может уменьшать viewport. Chromium viewport соответствует указанному размеру точно.

## Нагрузка и стоимость интерфейса

[graph-profile.json](validation/graph-profile.json) содержит по одному проходу для Low/Medium/High на 100, 300 и 1000 ручных узлах без сетевой активности. Production frontend, Chromium, viewport 1366×768, Python backend. Измеряются открытие графа, compact response size, JS heap, backend RSS, интервалы requestAnimationFrame во время перетаскивания; после drag проверяется сохранённая координата.

Финальный browser-проход выполнен после завершения сборки и остальных проверок. Для 1000 объектов:

| Профиль | Открытие, ms | RAF median / p95, ms | Backend RSS, MiB | Compact response, KiB |
|---|---:|---:|---:|---:|
| Low | 1022 | 17 / 17 | 90 | 265 |
| Medium | 1006 | 17 / 17 | 90 | 265 |
| High | 1018 | 17 / 17 | 91 | 265 |

Это не пользовательский benchmark и не полное потребление памяти приложения: JS heap не включает native browser memory, backend RSS не включает Chromium. RAF interval не равен input latency. Нет сравнения с исходной версией на идентичной нагрузке; вывод об ускорении не делается. Сохранились виртуализация, отсутствие minimap при >500 узлах и bounded API payload. Native профиль отдельно учитывает дерево процессов, но Xvfb и WebDriver искажают CPU/frame timings. В сохранённом native-проходе на 100/300 узлах PSS составил 655/756 MiB, медиана RAF 22/25 ms и p95 112/184 ms. Эти выбросы не позволяют обещать плавные 60 fps в нативном окружении; нужен отдельный замер на целевой Kali и сравнение Low/Medium при той же нагрузке. Параллельная работа сборки/тестов влияла на первые browser-замеры; в итоговом JSON сохранён отдельный проход после их завершения. Native-проход не изолировался от прочих тестов и не используется для сравнения профилей.

## Воспроизведение

```bash
npm ci
.venv/bin/pip install -r backend/requirements-lock.txt
PATH=/home/agent/.cargo/bin:$PATH npm run check
npm run build
npx vite preview --config frontend/vite.config.ts --port 1420 --host 127.0.0.1
# В другом терминале, с установленными Nmap и ProjectDiscovery httpx:
node scripts/experience-journey.cjs
SCREENSHOT_DIR=docs/experience/screenshots/after node scripts/experience-layout.cjs
PROFILE_OUTPUT=docs/experience/validation/graph-profile.json node scripts/profile-graph.cjs
DRAGONTRIP_LIVE_TEST=1 .venv/bin/python -m pytest tests/test_nmap_live.py -q
```

Не запускать два loopback smoke на одном host одновременно: они используют порт 8080. Тест по ошибке параллельно с journey получил `Address already in use`; после последовательного запуска live Nmap прошёл.

Native (после сборки sidecar и Tauri, с GTK/WebKit, Xvfb, tauri-driver, scrot, xdotool):

```bash
DRAGONTRIP_VALIDATION_DIR="$PWD/docs/experience/native" \
  xvfb-run -a -s '-screen 0 1920x1080x24' dbus-run-session -- \
  python3 scripts/native-navigation-smoke.py src-tauri/target/release/dragontrip
```

## Остаточные ограничения

- Нужны наблюдения с реальными пользователями; экспертный аудит не доказывает понятность терминов и скорость работы.
- Нет возобновления внутри внешнего процесса; retry запускает новую попытку после просмотра плана. Wordlist для одиночного ffuf после остановки нужно задать заново; сохранённый workflow хранит собственный список.
- После аварии raw artifact сохраняется, автоматическая проекция не выполняется; можно экспортировать и импортировать поддерживаемый формат либо явно повторить запуск.
- Ретест сохраняет ручной результат и историю; автоматического diff произвольных HTTP-тел/скриншотов не добавлено.
- Receipt scan API и launch lock рассчитаны на один backend-процесс desktop. Старый клиент без request_id сохраняет старое поведение.
- Неполные WhatWeb/ffuf JSON могут сохраняться только как raw evidence. Лимит 16 MiB исключает сохранение неограниченного вывода.
- Предупреждение Vite о смешанном static/dynamic import Evidence и существующие warnings vendored GLib остаются; проверки не ослаблены ради их скрытия.
