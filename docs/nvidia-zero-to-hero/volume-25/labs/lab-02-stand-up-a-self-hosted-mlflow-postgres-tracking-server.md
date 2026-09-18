---
title: Lab 02 — Stand Up a Self-Hosted MLflow + Postgres Tracking Server
description: Build the Docker Compose stack, hit the real psycopg2 dependency bug, fix it, and prove tracked data survives a full container recreation.
sidebar_position: 21
tags: [lab, mlflow, docker-compose, postgres]
---

# Lab 02 — Stand Up a Self-Hosted MLflow + Postgres Tracking Server

## 1. Objective
Deploy a self-hosted MLflow tracking server backed by Postgres, fix the real dependency bug the official image ships with, and prove — via a full teardown and recreation — that logged data actually persists.

## 2. Target Audience
MLOps Engineers standing up experiment tracking for the first time, especially anyone who's only used MLflow's zero-config SQLite default.

## 3. Prerequisites
- A GPU node (or any Docker host) with Docker and Docker Compose installed.
- Completed Lab 01, or an equivalent host with a persistent, mounted volume available (e.g., `/data/mlops`).

## 4. Architecture Diagram
```mermaid
flowchart LR
    Client[Training script] -->|HTTP| MLflow[MLflow tracking server]
    MLflow -->|SQL| PG[(Postgres — backend store)]
    MLflow -->|file writes| FS[/mlflow-artifacts on persistent volume/]
    PG -->|data dir| FS2[/postgres data dir on same persistent volume/]
```

## 5. Environment Setup
```bash
mkdir -p ~/banknifty_bigmove_ml/infra && cd ~/banknifty_bigmove_ml/infra
sudo mkdir -p /data/mlops/{postgres,mlflow-artifacts}
sudo chown -R $USER:$USER /data/mlops
```

## 6. Execution Specifications

**Purpose:** Define the stack.
**Command:** Create `docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: mlflow
      POSTGRES_PASSWORD: ${MLFLOW_DB_PASSWORD}
      POSTGRES_DB: mlflow
    volumes:
      - /data/mlops/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mlflow"]
  mlflow:
    build: { context: ., dockerfile: Dockerfile.mlflow }
    depends_on:
      postgres: { condition: service_healthy }
    command: >
      mlflow server --backend-store-uri postgresql://mlflow:${MLFLOW_DB_PASSWORD}@postgres:5432/mlflow
      --default-artifact-root /mlflow-artifacts --host 0.0.0.0 --port 5000
    volumes:
      - /data/mlops/mlflow-artifacts:/mlflow-artifacts
    ports:
      - "127.0.0.1:5000:5000"
```
Create `Dockerfile.mlflow`:
```dockerfile
FROM ghcr.io/mlflow/mlflow:v2.16.0
RUN pip install --no-cache-dir psycopg2-binary
```
Create `.env`:
```bash
echo "MLFLOW_DB_PASSWORD=$(openssl rand -hex 20)" > .env
chmod 600 .env
```

**Purpose:** Bring the stack up and hit the real dependency bug.
**Command:**
```bash
docker compose up -d
docker compose logs mlflow --tail 15
```
**Expected Evidence (if you skip the Dockerfile.mlflow step and use the plain image instead):**
```text
ModuleNotFoundError: No module named 'psycopg2'
```
**Explanation:** The official MLflow image doesn't bundle every backend database driver — Postgres support needs `psycopg2` specifically. This lab's `Dockerfile.mlflow` fixes it before you even hit the error, but understanding *why* the error would happen without it is the actual lesson.
**Common Failure:** If you did use the custom image and still see this error, confirm `docker-compose.yml` uses `build:` for the `mlflow` service, not `image: ghcr.io/mlflow/mlflow:...` directly.

**Purpose:** Verify the server is actually reachable.
**Command:**
```bash
curl -s -o /dev/null -w "MLflow HTTP status: %{http_code}\n" http://localhost:5000/
```
**Expected Evidence:** `MLflow HTTP status: 200`

## 7. Expected Evidence
A logged run is visible via the MLflow UI (through an SSH tunnel — see Step 9) or the Python client, and — critically — still visible after a full `docker compose down && docker compose up -d`.

## 8. Explanation of Behavior
`docker compose down` removes the containers entirely, not just stops them. If logged data only survived because of some in-container cache, this would lose it. Because the actual data lives in Postgres's data directory and the artifact files, both on the persistent volume mounted from the host, the data survives the containers being destroyed and recreated from scratch.

## 9. Performance Benchmarking
Log 50 runs in a loop and time it:
```bash
time python3 -c "
import mlflow, time
mlflow.set_tracking_uri('http://localhost:5000')
for i in range(50):
    with mlflow.start_run():
        mlflow.log_metric('i', i)
"
```
Expect each run's overhead to be dominated by HTTP round-trip latency, not Postgres write time — if this feels slow, check network latency to the tracking server before suspecting the database.

## 10. Common Failures
- `psycopg2` missing (Step 6, above).
- MLflow container starting before Postgres is actually ready to accept connections — prevented here by the `depends_on: condition: service_healthy` clause, not just a plain `depends_on`.
- Forgetting `127.0.0.1:` in the port mapping, accidentally exposing the tracking server publicly.

## 11. Safe Failure Injection
**Action:** Log a run, then run `docker compose down` (full removal, not just `stop`) followed by `docker compose up -d`.
**Expected Result:** The stack comes back up, and the previously logged run is still queryable — this is the actual persistence proof, not a hypothetical.

```bash
python3 -c "
import mlflow
mlflow.set_tracking_uri('http://localhost:5000')
with mlflow.start_run() as run:
    mlflow.log_param('smoke_test', True)
    print('run_id:', run.info.run_id)
"
docker compose down
docker compose up -d
sleep 5
python3 -c "
import mlflow
mlflow.set_tracking_uri('http://localhost:5000')
run = mlflow.get_run('<the run_id printed above>')
print('still here:', run.data.params)
"
```

## 12. Recovery Steps
If the stack fails to come back up after `down`/`up`, check `docker compose logs postgres` first — a corrupted data directory (rare, but possible from an unclean shutdown) is the most likely cause, and would need restoring from a backup of `/data/mlops/postgres`.

## 13. Troubleshooting Guide
- `curl` to port 5000 fails from your laptop: you need an SSH tunnel (`ssh -L 5000:localhost:5000 <user>@<host>`), since the port is intentionally bound to `127.0.0.1` on the server, not exposed publicly.
- Runs logged before a crash seem to be missing: check whether the artifact store path and the backend store are both actually on the persistent volume, not accidentally left on the container's own ephemeral filesystem.

## 14. Validation
Confirm nested runs work (needed for Lab 04/05's fold-based logging):
```bash
python3 -c "
import mlflow
mlflow.set_tracking_uri('http://localhost:5000')
with mlflow.start_run() as parent:
    for i in range(3):
        with mlflow.start_run(nested=True):
            mlflow.log_metric('fold_metric', i * 0.1)
    print('parent run_id:', parent.info.run_id)
"
```
Then confirm the 3 child runs are queryable via `MlflowClient.search_runs(filter_string=f\"tags.mlflow.parentRunId = '<parent_id>'\")`.

## 15. Real-World Pitfalls
- Using MLflow's SQLite default "to start simple" and only discovering its concurrent-write limitations once multiple training processes log simultaneously — Postgres from day one avoids this migration later.
- Not setting a real password in `.env` (or committing it to version control) — treat it like any other production credential.

## 16. Cleanup Procedures
```bash
docker compose down
# To fully wipe test data (NOT for a real tracking server you want to keep):
sudo rm -rf /data/mlops/postgres/* /data/mlops/mlflow-artifacts/*
```

## 17. Knowledge Check
- Why does `docker compose down` (not `stop`) followed by `up` prove persistence in a way that a simple restart doesn't?
- Why does the backend store need a database like Postgres instead of a plain file, while the artifact store is fine as plain files?
- What's the actual mechanism that lets `MlflowClient` find all fold-children of a specific parent run?

## 18. Additional References
- [MLflow Tracking Server documentation](https://mlflow.org/docs/latest/tracking.html)
- Chapter 04 — Experiment Tracking with MLflow
