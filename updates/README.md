# Канал обновлений TwistX Launcher

Каталог: `website/public/updates`. Файлы отсюда раздаются по адресу `/updates`
одинаково в обеих средах — локальный Express-сервер и Cloudflare Workers
(статика). Отсюда лаунчер получает обновления (electron-updater): сначала
`latest.yml`, затем сам файл сборки.

Наличие `latest.yml` здесь и есть признак «обновление опубликовано». Пока его
нет — обновлений нет ни у кого (сейчас в каталоге только этот README).

## Как выложить новую версию

1. Поднять версию в `app/frog-core/package.json` (`version`) — её читает лаунчер
   и по ней сравнивает обновления.
2. Собрать и выложить одной командой **из каталога `app`** (там лежит
   `node_modules`, без него сборка неполная):

   ```bash
   cd app
   npm run release-win        # сборка .exe + копирование в сайт
   ```

   По отдельности: `npm run build-win`, затем `npm run publish-updates`.
3. Проверить, что файлы на месте (локально или на боевом сайте):

   ```bash
   curl http://localhost:3000/updates/latest.yml
   curl https://twistx-site.twistx-launcher.workers.dev/updates/latest.yml
   ```

4. Задеплоить сайт, чтобы новые файлы уехали в статику:

   ```bash
   cd cloudflare && npx wrangler deploy
   ```

## Что должно лежать в каталоге

| Файл | Назначение |
| --- | --- |
| `latest.yml` | метаданные версии: номер, имя файла, sha512. Без него обновлений нет |
| `TwistX Launcher Setup <версия>.exe` | сам установщик (имя даёт electron-builder) |
| `*.exe.blockmap` | карта блоков для дифференциального скачивания (только изменившиеся части) |

Команда `publish-updates` дополнительно копирует файлы под постоянными именами в
`website/public/downloads` — оттуда работает кнопка «Скачать» на сайте
(`/api/downloads` перечисляет именно эти адреса):

| Постоянное имя | Что это |
| --- | --- |
| `TwistXLauncherSetup-latest.exe` | установщик (NSIS) |
| `TwistX-Launcher-v<версия>-portable.zip` | portable-архив (zip-таргет сборки) |

## Куда смотрит лаунчер

- Собранное приложение берёт адрес канала из `app-update.yml` внутри сборки
  (задаётся полем `build.publish` в `app/package.json`) — сейчас это
  `https://twistx-site.twistx-launcher.workers.dev/updates`.
- Адрес можно переопределить без пересборки: в `config.json` пользователя
  (`%APPDATA%\twistx-launcher\config.json` в Windows) поле `updateUrl`,
  например `http://localhost:3000/updates`.
- Проверка обновлений идёт при запуске и каждые 30 минут; файл скачивается
  автоматически и устанавливается при выходе из лаунчера (либо сразу — по кнопке
  в интерфейсе).

## Где настраивается сборка

Конфигурация electron-builder живёт в `app/package.json` (секция `build`) —
это корень приложения, где установлены зависимости (`main` указывает на
`frog-core/app.js`). Сборка обязательно запускается из `app`, иначе в пакет не
попадёт `node_modules` и лаунчер не запустится.
