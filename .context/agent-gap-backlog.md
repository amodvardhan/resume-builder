# Agent gap backlog — Meridian

Use this with `.context/requirements.md` and `.context/architecture-global.md`. Prefer small, verifiable PRs.

## Closed in repo (reference for agents)

| Gap | What changed |
|-----|----------------|
| **CORS wildcard + credentials** | `APP_CORS_ORIGINS` in `config.py` (default local Vite URLs). `main.py` uses wildcard only with `allow_credentials=False`. Documented in `.env.example`. |
| **Match scoring ignored relocation context** | `job_matcher._build_match_search_context()` feeds profile `country` + `job_preferences` (target countries, locations, industry, keywords, experience level) into the LangChain prompt so India/EU-style market fit can affect `role_fit_score` and narrative (no legal advice). |
| **Lightweight CRM on matches** | `job_matches.notes`, `job_matches.next_follow_up_at`; list/detail responses include them; `PATCH /dashboard/matches/{id}` accepts any of `status`, `notes`, `next_follow_up_at` (partial updates via `exclude_unset`). Dashboard: expanded card has pipeline stage, follow-up datetime, notes; filters include reviewing / interviewing / rejected / dismissed. |
| **Application ↔ match link + Kanban** | `applications.job_match_id` FK (optional); `POST .../tailor/confirm` accepts `job_match_id`; Compose prefill from match passes it; History shows **Pipeline** badge. Dashboard **Kanban** view (columns by stage, up to `per_page` 100). `GET /dashboard/matches` allows `per_page` up to 200. |

## High priority (P1 relocation product)

| Item | Notes |
|------|--------|
| **Structured relocation fields** | Optional JSONB on `job_preferences` or user profile: sponsorship need, citizenship ISO, relocation intent enum. Requires migration + API + Preferences UI + matcher already accepts free-form context — extend `_build_match_search_context`. |
| **EU vs India document presets** | Template variants or generation flags (date format, length norms) — see REQ-008–011 patterns. |
| **REQ-017 admin crawl sources** | DB-backed `job_crawl_sources`, admin APIs, seed from `job_sources.py` — large; see requirements §REQ-017. |

## Medium priority (robustness)

| Item | Notes |
|------|--------|
| **Observability** | Structured logs for crawl/sync failures, last-success timestamps exposed to UI. |
| **LLM guardrails** | Per-user or global daily caps on tailor + match calls; idempotency for retries. |
| **Contract tests** | OpenAPI or pytest checks that `src/frontend/src/types/api.ts` matches Pydantic responses. |

## PRD checkboxes

Many lines in `.context/requirements.md` still use `[ ]` — verify feature-by-feature against the app and tests; treat unchecked items as **verification debt**, not necessarily missing code.
