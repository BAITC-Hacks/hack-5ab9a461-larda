# Запуск Larda через Docker

Запускайте из корня проекта, а не из каталога `docs`. Конфигурация `compose.yaml` поднимает PostgreSQL, Go API и frontend/nginx. Настройки AI и ключ читаются из существующего `.env`; файл не нужно перезаписывать.

## На этой машине

Проверено: Docker Compose установлен, конфигурация корректна. У пользователя нет доступа к `/var/run/docker.sock`, поэтому команды Docker ниже выполняются через `sudo` в пользовательском терминале. Пароль вводится только в терминале.

Порты 3000 и 8080 заняты предыдущим локальным демо. Для Docker используем свободные 3001 (frontend), 8081 (API), 5433 (PostgreSQL):

```bash
cd /home/shindenis/programming-projects/hackalem/hack-5ab9a461-larda
sudo env WEB_PORT=3001 HTTP_PORT=8081 POSTGRES_PORT=5433 \
  CORS_ORIGINS=http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173 \
  docker compose up --build -d --wait
```

Открыть **http://localhost:3001**.

Для разработки фронта отдельно: `API_PROXY_TARGET=http://127.0.0.1:8081 npm run dev`, адрес `http://localhost:5173`. В команде выше разрешены оба frontend-адреса. Если оставить только 3001 в `CORS_ORIGINS`, отправка форм из Vite на 5173 получит `403 origin is not allowed`.

Проверить:

```bash
sudo docker compose ps
curl http://localhost:3001/healthz
```

Ожидаемый ответ health: `{"status":"ok"}`. Доступность API не доказывает работоспособность внешней модели: её проверяют созданием задачи и завершением AI-задания. Если `AI_MODE=openai`, backend требует настроенный ключ; для явного демо без внешней модели добавьте `AI_MODE=fallback` после `sudo env` в команде запуска.

## Если запуск не прошёл

```bash
sudo docker compose logs --tail=80 api
sudo docker compose logs --tail=80 db web
```

Если Docker сообщает, что daemon недоступен:

```bash
sudo systemctl start docker
```

После исправления повторите полную команду запуска с портами и CORS выше. Значения из `env` действуют только для этой команды; при следующем `up` их нужно указать снова.

## Остановка

```bash
sudo docker compose stop
```

Не используйте `down -v`, если хотите сохранить БД. Docker использует собственный volume `larda_postgres_data`; данные прежнего Podman-контейнера автоматически туда не переносятся. Старый локальный запуск и его volume этой командой не изменяются.

Docker уже запущен пользователем на 3001/8081/5433. Через него успешно проверены два внешних AI-задания: вопросы и генерация карточки. Для применения обновлений frontend/API и списка CORS выполните полную команду `up --build` выше; простой `restart` не обновит код и переменные. Агент не может пересоздать Docker-контейнеры без интерактивного sudo в пользовательском терминале. Подробнее о режиме ИИ: [AI_CONNECTION.md](AI_CONNECTION.md).
