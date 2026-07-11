# City Complaints Platform

Citizens report problems via a Telegram bot (RU/KK), operators triage them
through a 3-stage workflow, management gets an analytics dashboard.

## Structure

```
backend/    Express API + Postgres + Telegram bot + file storage
frontend/   React (Vite) app: landing, employee panel, analytics
docker-compose.yml   Runs the whole stack together
```

---

## Your questions, answered

**1. Docker + Postgres for future deployment to a VPS?**
Done, both. `docker-compose.yml` now runs 4 containers: Postgres, the API,
the Telegram bot, and the frontend (built + served by nginx). SQLite was
fine for a demo, but not for real use — it's a single file with no separate
server, so it can't be shared across multiple app instances, doesn't handle
concurrent writers well under load, and complicates backups. I switched the
whole backend to Postgres (`pg` package, async queries) so it's ready to
scale and easy to back up (`pg_dump`) or move to a managed database (RDS,
Yandex Managed PostgreSQL, etc.) later without touching the code.

**2. "Другое" (Other) option on the bot**
Added as a category. If a citizen picks it, the bot asks them to type what
the problem actually is, and that text is stored in a new `category_other`
column, shown in the employee panel as "Другое: <what they typed>".

**3. Kazakh/Russian choice on the bot**
`/start` now opens with a language picker before anything else. Every bot
message after that (category names, prompts, the final confirmation) is in
the chosen language. See `backend/bot/strings.js` for the two dictionaries.

**4. How does the generated code work, and why do we need it?**
When a complaint is created, the backend generates something like `XR-74308`
— two random letters + five random digits — and checks it's not already
used before saving it (`generateCode()` in `backend/db.js`, the retry loop
is in `routes/complaints.js`). It exists so a citizen has something short
and speakable to reference their complaint by (over the phone, in a
follow-up message) without exposing internal database IDs or requiring them
to give their name/phone again to look something up. It also matches the
format visible in your reference screenshots (e.g. `ХР-74308`).

**5. Analytics**
The dashboard already had totals and per-status/per-category counts; I added:
- **Overdue count** — complaints still "in progress" past their 7-day deadline.
- **Average resolution time** (in hours) — from creation to being marked done.
- **14-day volume trend** — a small bar chart of complaints created per day.
These come from `GET /api/analytics`, computed directly in Postgres.

**6. Photo uploads to close a complaint — where do photos live?**
The employee panel now has a real file picker (not a URL field) that uploads
to `POST /api/uploads`, which writes the file to disk and returns a URL used
for `completion_photo`. Storage is abstracted in `backend/storage.js`:
- **Right now**: local disk, under `UPLOAD_DIR`, served at `/uploads/*`. In
  Docker this is a named volume (`uploads:`) so photos survive container
  restarts/rebuilds.
- **If you outgrow that**: switch to an S3-compatible bucket — AWS S3,
  Yandex Object Storage, or a self-hosted MinIO all work well from
  Kazakhstan/CIS. You'd only need to change the two functions in
  `storage.js` (`upload` middleware config and `saveBuffer`); nothing in the
  routes or frontend needs to change, since they just deal with URLs. Worth
  doing once you run more than one backend instance behind a load balancer,
  since local disk storage on one container isn't visible to the others.
- The bot also uploads the citizen's original photo the same way, through a
  separate `POST /api/uploads/bot` endpoint (secured with a shared secret
  instead of a login, since the bot isn't an employee).

---

## Running it

### Option A: Docker (recommended for a VPS)

```bash
cp .env.example .env      # fill in JWT_SECRET, TELEGRAM_BOT_TOKEN, PUBLIC_BASE_URL
docker compose up -d --build
docker compose exec backend npm run seed   # creates demo login operator/operator123
```

Frontend: `http://your-server` (port 80)
API: `http://your-server:4000/api`

To update after a code change: `docker compose up -d --build`.
To back up the database: `docker compose exec db pg_dump -U postgres complaints > backup.sql`.

### Option B: Run locally without Docker

You'll need a Postgres instance reachable from your machine.

```bash
cd backend
npm install
cp .env.example .env        # point DATABASE_URL at your Postgres
npm run seed                 # creates tables + demo login
npm start                    # API on :4000
```

In another terminal, once TELEGRAM_BOT_TOKEN is set in .env:
```bash
npm run bot
```

```bash
cd frontend
npm install
npm run dev                  # :5173, proxies /api to :4000
```

Log in with `operator` / `operator123`.

---

## What's implemented

- **Landing page**: logo, tagline, links to the bot / analytics / employee login.
- **Telegram bot**: language choice → category (including "Другое") →
  description → address → optional live location → optional photo → name →
  phone → generates a code, geocodes the address if no location was shared.
- **Employee panel**: tabs for Новая/На исполнении/Выполнена, table matching
  your reference screenshot's columns, sort-by-completion-date, CSV export.
- **Complaint detail**: map, status, region, assigned employee, deadline,
  applicant info, "Взять в работу" (starts the 7-day clock), "Закрыть
  заявку" (requires uploading a real photo before it can close).
- **Analytics dashboard**: totals, per-status/category counts, overdue
  count, average resolution time, 14-day trend, map of all complaints, CSV
  export.

## Still worth deciding before production

- **Access to the analytics panel** is currently open to anyone with the
  link, same as the employee login page — no separate management-only
  auth. Let me know if that should be locked down.
- **HTTPS/TLS**: docker-compose here is HTTP only; put it behind a reverse
  proxy (Caddy, Traefik, or nginx + Let's Encrypt) for a real domain.
- **Telegram file size**: bot photos are capped at 8MB per file (see
  `storage.js`), matching the upload limit on the employee side.

---

## Second round of changes

**1. Removed the placeholder name, split into two real accounts.**
There's no more "Тасов Жандос..." — that was just a placeholder. `npm run
seed` now creates exactly two generic accounts:
- `operator` / `operator123` → role `employee`, can log into `/panel` only.
- `analyst` / `analyst123` → role `analyst`, can log into `/analytics` only.
The backend enforces this with a `requireRole()` check on every
panel-related route (`routes/complaints.js`), and the frontend redirects
each role to the right page after login (`App.jsx`, `EmployeeLogin.jsx`).
Analytics is reachable by either account; the complaints panel is
employee-only.

**2. Analytics dashboard redesign — light theme, no dark mode.**
Rebuilt `pages/Analytics.jsx` to match the layout you shared: a map on the
left with tabs on top, and a KPI sidebar on the right with the 2×2 card
grid (Всего / Новые / В работе / Решено), a "percent resolved" progress
bar, and the average resolution time. Kept it entirely light-themed — no
dark background.

**3. Tabs: "Точки жалоб" and "Тепловая карта" only — no "Инциденты".**
The map has exactly two view modes now, toggled at the top of the map
panel. Points are colored per category (see `categoryColors.js` for the
palette, shared between the map dots and the category bars for
consistency). The heatmap uses `leaflet.heat` — see `HeatmapLayer.jsx`.

**4. Filter by category ("Проблема с водой", "с газом", "собаки" etc.)**
A "Фильтр по категориям" button toggles a chip-based multi-select panel.
Selecting/deselecting categories re-fetches everything — KPI cards,
category bars, and both map views — filtered to just those categories.
Backend support is `GET /api/analytics?categories=water,gas,...` (see
`routes/analytics.js`).

**5. Export switched from CSV to real Excel (.xlsx).**
`routes/complaints.js`'s export endpoint now builds an actual `.xlsx`
workbook with `exceljs` (column headers, bold header row) instead of a CSV
string. Both the employee panel and the analytics dashboard use it, and it
respects the same status/category filters currently applied on screen.
Since it now requires the auth header (which a plain link can't send), the
frontend fetches it as a blob and triggers the download itself — see
`api.exportExcel()` in `api.js`.

### Files touched this round
```
backend/middleware/auth.js       + requireRole()
backend/routes/complaints.js     role gating, xlsx export, category filter
backend/routes/analytics.js      multi-category filter
backend/seed.js                  two generic accounts
backend/package.json             + exceljs
frontend/src/App.jsx             role-based redirects
frontend/src/pages/EmployeeLogin.jsx   redirect by role, both demo hints
frontend/src/pages/Analytics.jsx       full redesign
frontend/src/pages/EmployeePanel.jsx   Excel export button
frontend/src/api.js              category filters, authenticated export
frontend/src/categoryColors.js   NEW - shared color palette
frontend/src/components/HeatmapLayer.jsx  NEW - leaflet.heat wrapper
frontend/src/styles.css          new analytics layout styles
frontend/src/i18n/ru.json, kk.json    new strings
frontend/package.json            + leaflet.heat
```
