# Установка DRAGONTRIP на Kali Linux

Готовый пакет: `dragontrip_0.1.1_amd64.deb` (около 28,2 MiB). Архитектура — x86_64.

Скачайте пакет и откройте терминал в папке с ним:

```bash
sudo apt update
sudo apt install ./dragontrip_0.1.1_amd64.deb nmap
```

Запустите **Dragontrip** из меню приложений или командой:

```bash
dragontrip
```

Отдельно запускать Python, Vite или браузер не нужно. Backend и его Python-зависимости входят в пакет. Nmap используется из системы.

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

Пакет собран и проверен нативно на Debian 13 с WebKitGTK. Установка через apt и меню именно Kali XFCE в пользовательской VirtualBox VM ещё не проверялась. Полный отчёт и измерения: [VALIDATION.md](VALIDATION.md).

Сборка из исходников описана в [README.md](../README.md).
