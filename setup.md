# 1) Stop anything already on port 8000
lsof -ti:8000 | xargs kill -9 2>/dev/null

# 2) Create venv (only needed once)
cd /Users/amod/Documents/Products/Resume_Builder
python3 -m venv .venv

# 3) Activate venv
source .venv/bin/activate

# 4) Install dependencies
pip install -U pip
pip install -r requirements.txt

# 5) Run the API
uvicorn src.backend.main:app --reload --host 127.0.0.1 --port 8000

# If startup stalls or logs "Migration blocked": another client holds locks on Postgres.
# Close TablePlus/pgAdmin tabs on this DB, stop duplicate API processes, or run as DB superuser:
#   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
#   WHERE datname = current_database() AND state = 'idle in transaction'
#     AND pid <> pg_backend_pid();