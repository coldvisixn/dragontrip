# Установка DRAGONTRIP на Kali Linux

Готовый пакет: `dragontrip_0.2.0_amd64.deb` (около 28,2 MiB). Архитектура — x86_64.

Скачайте артефакт **dragontrip-linux-amd64** из [сборки GitHub Actions](https://github.com/coldvisixn/dragontrip/actions/runs/38792713976), распакуйте его и найдите `dragontrip_0.2.0_amd64.deb` в `src-tauri/target/release/bundle/deb/`. Рядом находится файл SHA-256. Откройте терминал в папке с пакетом:

```bash
sudo apt update
sudo apt install ./dragontrip_0.2.0_amd64.deb nmap whatweb httpx-toolkit ffuf
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

Пакет прошёл нативные проверки Ubuntu и установку через apt, запуск из меню и полный сценарий Nmap/графа на официальном Kali Rolling с XFWM в контейнере (4 GB RAM, 2 CPU). Пользовательская VirtualBox VM ещё требует отдельной ручной проверки. Полный отчёт и измерения: [VALIDATION.md](VALIDATION.md).

Сборка из исходников описана в [README.md](../README.md).

Фаза 2: профили, очередь, рекомендации и ограничения описаны в [PHASE2.md](PHASE2.md). WhatWeb, ProjectDiscovery httpx и ffuf устанавливаются системными пакетами; Python-программа httpx не заменяет httpx-toolkit.
