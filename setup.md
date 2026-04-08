# Local setup

## 1) Stop anything already on port 8000

```bash
lsof -ti:8000 | xargs kill -9 2>/dev/null
```

## 2) Create venv (only needed once)

```bash
cd /Users/amod/Documents/Products/Resume_Builder
python3 -m venv .venv
```

## 3) Activate venv

```bash
source .venv/bin/activate
```

## 4) Install dependencies

```bash
pip install -U pip
pip install -r requirements.txt
```

## 5) Environment variables

All backend settings use the **`APP_`** prefix (see `src/backend/config.py`). Copy the template and edit:

```bash
cp .env.example .env
```

The **authoritative list** of variables is **`.env.example`**. Sync order in code: **primary** (Adzuna, Jooble) runs first, then **secondary** (LinkedIn, XING, Naukri Gulf). Configure at least one primary pair for broad job search.

| Variable | How to get the value |
|----------|----------------------|
| **`APP_DATABASE_URL`** | Install PostgreSQL locally or use Docker. Create a database (e.g. `resume_builder`). URL shape: `postgresql+asyncpg://USER:PASSWORD@HOST:5432/DATABASE`. User must own or have rights on that database. |
| **`APP_OPENAI_API_KEY`** | [OpenAI Platform → API keys](https://platform.openai.com/api-keys). Create a secret key and paste it. Billing must be set up for the project if required. |
| **`APP_JWT_SECRET`** | Any long random string. Generate locally, e.g. `openssl rand -hex 32`. Use a new value in production; never commit it. |
| **`APP_ADMIN_EMAILS`** | Your own email(s), comma-separated. Those accounts get `is_admin=true` when they register or on next login. |
| **`APP_JOB_SYNC_CRON`** | Five fields: minute hour day-of-month month day-of-week (UTC). Default `0 6 * * *` = daily 06:00 UTC. |
| **Primary — Adzuna** | Register at [developer.adzuna.com](https://developer.adzuna.com/signup). Copy **Application ID** and **Application Key** into `APP_ADZUNA_APP_ID` and `APP_ADZUNA_APP_KEY`. Set `APP_ADZUNA_COUNTRY` to a supported two-letter market (`gb`, `us`, `de`, … — see [Adzuna job search docs](https://developer.adzuna.com/docs/search)). `APP_ADZUNA_MAX_SEARCH_PAIRS` caps how many role×location combinations are queried per sync. |
| **Primary — Jooble** | Register at [jooble.org/api/about](https://jooble.org/api/about). Copy the API key into `APP_JOOBLE_API_KEY`. Optional: `APP_JOOBLE_PAGE`, `APP_JOOBLE_RADIUS_KM` for the [REST request body](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation). |
| **Secondary — LinkedIn** | **Not** a public “search all LinkedIn jobs” API. [LinkedIn Talent / Job Posting](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/) lists **your organization’s** postings when you have partner access. [LinkedIn Developers](https://www.linkedin.com/developers/) + OAuth; `APP_LINKEDIN_ORGANIZATION_URN` is typically `urn:li:organization:{id}`. |
| **`APP_LINKEDIN_API_VERSION`** | Monthly version header for LinkedIn REST (e.g. `202411`). |
| **Secondary — XING** | [XING E-Recruiting](https://dev.xing.com/partners/job_integration) — contract-based; OAuth token in `APP_XING_ACCESS_TOKEN`. |
| **`APP_XING_API_BASE`** | Default `https://api.xing.com`. |
| **Secondary — Naukri Gulf** | HTTPS **XML/RSS feed URL** from your InfoEdge / Naukri agreement — `APP_NAUKRI_GULF_XML_FEED_URL`. |
| **`APP_TEMPLATES_DIR`**, **`APP_OUTPUT_DIR`**, **`APP_RESUMES_DIR`** | Optional. Defaults under `storage/` relative to the project root. |

**Frontend (Vite)** — `VITE_*` variables are **not** prefixed with `APP_`. Set at least:

- **`VITE_API_BASE_URL`** — Backend origin the browser calls (e.g. `http://127.0.0.1:8000`).

## 6) Run the API

### Local Python (development)

```bash
uvicorn src.backend.main:app --reload --host 127.0.0.1 --port 8000
```

### Docker Compose (API + PostgreSQL in Docker)

Ensure `.env` exists (from `.env.example`). **`APP_DATABASE_URL` must use hostname `postgres`** (the Compose service name) and the same user, password, and database name as **`POSTGRES_USER`**, **`POSTGRES_PASSWORD`**, and **`POSTGRES_DB`**. Postgres is exposed on the host at **`POSTGRES_HOST_PORT`** (default `5432`) so you can use TablePlus or `psql` against `localhost` while the stack runs.

```bash
docker compose up --build -d
```

The API listens on host port `HOST_API_PORT` (default `8000`). Stop with `docker compose down`. Data persists in named volumes (`postgres_data`, `api_storage`).

To build only the API image: `docker build -t meridian-api .`

If startup stalls or logs **“Migration blocked”** another client holds locks on Postgres. Close TablePlus/pgAdmin tabs on this DB, stop duplicate API processes, or run as DB superuser:

```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE datname = current_database() AND state = 'idle in transaction'
  AND pid <> pg_backend_pid();
```

## Migrating an old `.env`

If you still have **`APP_CRAWL_CRON`**, rename it to **`APP_JOB_SYNC_CRON`**. Use **`APP_ADZUNA_APP_ID`** / **`APP_ADZUNA_APP_KEY`** (Adzuna dashboard) for primary search; add **`APP_JOOBLE_API_KEY`** for Jooble. Align other keys with **`.env.example`**.
