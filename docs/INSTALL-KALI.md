# Установка DRAGONTRIP на Kali Linux

Текущая версия — `0.4.0`, архитектура x86_64. Локально собранный пакет находится в `src-tauri/target/release/bundle/deb/dragontrip_0.4.0_amd64.deb`; рядом — `dragontrip_0.4.0_amd64.deb.sha256`. Новая версия пока не опубликована в старом артефакте 0.2.0. После запуска нового CI пакет будет доступен в артефакте **dragontrip-linux-amd64** [workflow](https://github.com/coldvisixn/dragontrip/actions/workflows/linux.yml).

Скопируйте пакет и файл SHA-256 на Kali, затем откройте терминал в этой папке:

```bash
sha256sum --check dragontrip_0.4.0_amd64.deb.sha256
sudo apt update
sudo apt install ./dragontrip_0.4.0_amd64.deb nmap whatweb httpx-toolkit ffuf
```

Запустите **Dragontrip** из меню приложений или командой:

```bash
dragontrip
```

Отдельно запускать Python, Vite или браузер не нужно. Backend и его Python-зависимости входят в пакет. Nmap, WhatWeb, ProjectDiscovery httpx и ffuf используются из системы.

Первый сценарий:

1. Создайте проект `HTB Lab`.
2. Нажмите **Start scan**, укажите один IPv4-адрес и подтвердите разрешённый scope.
3. После реального сканирования откройте Service в графе и проверьте Inspector / Source evidence.
4. Переместите узел, добавьте Custom node и соедините узлы за круглые handles.
5. Закройте приложение и откройте повторно — проект, координаты и связи должны сохраниться.

Данные: `${XDG_DATA_HOME:-~/.local/share}/dragontrip/`. Удаление пакета сохраняет проекты:

```bash
sudo apt remove dragontrip
```

Версия 0.4.0 собрана и проверяется в Debian-контейнере с настоящим Tauri/WebKit. Исторические результаты 0.2.0 на Kali не являются проверкой нового пакета. Состояние нового выпуска и измерения: [PHASE4.md](PHASE4.md); предыдущие результаты: [VALIDATION.md](VALIDATION.md). Проверка вашей VirtualBox VM остаётся отдельной.

Сборка из исходников описана в [README.md](../README.md).

Фаза 2: профили, очередь, рекомендации и ограничения описаны в [PHASE2.md](PHASE2.md). WhatWeb, ProjectDiscovery httpx и ffuf устанавливаются системными пакетами; Python-программа httpx не заменяет httpx-toolkit.

После установки:

- Нажмите кастомную ноду → **Edit object**, чтобы задать тип, описание, статус и теги.
- **Notes / Findings** поддерживают Markdown и вложения, **Attack Paths** — упорядоченные ручные цепочки.
- **Evidence**, **Timeline** и **Project search** собирают материалы и историю проекта.
- **Credentials Vault** хранит секреты под мастер-паролем. Не забудьте его: восстановления нет.
- **Projects → Project portability** переносит проекты с доказательствами. Учётные данные включаются только явно, с отдельным паролем архива.
- В **Settings** задаются оформление, детализация карты и пути к инструментам. **Ctrl+K** открывает палитру команд, **Ctrl+Shift+F** — поиск по знаниям.

Перед обновлением сделайте резервную копию всей папки данных при закрытом приложении. Миграции сохраняют существующие проекты; старый бинарник 0.2.0 после обновления базы использовать не следует.
