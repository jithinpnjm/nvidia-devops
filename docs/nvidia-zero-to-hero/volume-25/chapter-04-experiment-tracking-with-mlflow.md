---
title: Chapter 04 — Experiment Tracking with MLflow
description: Tracking server vs. backend store vs. artifact store, nested runs for cross-validation, a real self-hosted Docker Compose stack, and a real dependency bug fixed on first boot.
sidebar_position: 5
tags: [mlflow, experiment-tracking, docker-compose, postgres, mlops]
---

# Chapter 04: Experiment Tracking with MLflow

| Chapter metadata | Value |
|---|---|
| Volume | 25 — MLOps Engineering |
| Difficulty | Intermediate |
| Estimated reading time | 50 minutes |
| Primary audience | MLOps Engineers, ML Engineers who've lost track of "which run was the good one" |
| Core question | How do you make every training run's parameters, metrics, and artifacts permanently queryable, instead of living in a terminal scrollback or a person's memory? |

## WHY

Chapter 1 named the failure mode directly: a small number of training runs produced contradictory answers, and without a record of exactly what each run's configuration and results were, there was no way to tell noise from signal after the fact. Experiment tracking is the practice of making that record automatic and structural — every run logs itself, without relying on a human to remember to write it down.

## Beginner's Primer: The Death of the Spreadsheet

Before MLOps existed, if a Data Scientist wanted to improve an AI model, they would change a variable (e.g., Learning Rate = 0.01), run the script, wait 4 hours, and get a result (Accuracy = 85%). They would open an Excel spreadsheet, type `Learning Rate: 0.01 | Accuracy: 85%` and then try again. 

This manual process is a disaster. 
Data Scientists forget to update the spreadsheet. They overwrite the old model file. When the team manager asks, *"Hey, what hyperparameters did we use for that really good model from last Tuesday?"*, the Data Scientist has no idea.

**MLflow** kills the spreadsheet.
It is an automated "Flight Data Recorder" for AI training.
You add 3 lines of code to your PyTorch script. From that moment on, MLflow automatically intercepts every single parameter (Batch Size, Learning Rate), every metric (Loss, Accuracy per epoch), and every artifact (the final Model Weights). It pushes all this data to a central database. 

Months later, you can open the MLflow web dashboard, search for *"Show me the training run from last Tuesday,"* and instantly download the exact model weights and see the exact parameters used to generate them.

## WHAT

MLflow's tracking system has three logically separate pieces, and understanding why they're separate is the key to configuring it correctly:

| Component | What it stores | This project's choice |
|---|---|---|
| **Tracking server** | The API/UI process that receives and serves logged data | A Docker container on the Nebius VM |
| **Backend store** | Structured data — params, metrics, run metadata, tags | Postgres (not the SQLite default) |
| **Artifact store** | Large files — model checkpoints, CSVs, plots | A directory on the persistent volume from Chapter 2 |

A common beginner mistake is treating "MLflow" as one thing. It's a client library (`import mlflow`) plus a server, and the server's two storage backends can be swapped independently — this project uses Postgres for structured data specifically because SQLite (MLflow's zero-config default) doesn't handle concurrent writers well, and a real training pipeline with parallel fold runs is exactly a concurrent-writer scenario.

## HOW

### Step 1 — The Docker Compose stack

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: mlflow
      POSTGRES_PASSWORD: ${MLFLOW_DB_PASSWORD}
      POSTGRES_DB: mlflow
    volumes:
      - /data/mlops/postgres:/var/lib/postgresql/data   # <- Chapter 2's persistent volume
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mlflow"]

  mlflow:
    build: { context: ., dockerfile: Dockerfile.mlflow }   # <- see the bug below
    depends_on:
      postgres: { condition: service_healthy }
    command: >
      mlflow server
      --backend-store-uri postgresql://mlflow:${MLFLOW_DB_PASSWORD}@postgres:5432/mlflow
      --default-artifact-root /mlflow-artifacts
      --host 0.0.0.0 --port 5000
    volumes:
      - /data/mlops/mlflow-artifacts:/mlflow-artifacts
    ports:
      - "127.0.0.1:5000:5000"   # bound to localhost only — never public
```

Two design choices worth calling out explicitly:

1. **`depends_on` with a healthcheck condition, not just a plain dependency.** MLflow's server tries to connect to Postgres on startup; without waiting for Postgres to report actually-ready (not just "container started"), the server would race Postgres's own init process and fail intermittently.
2. **Port binding to `127.0.0.1:5000`, not `0.0.0.0:5000` on the host.** The tracking server itself binds `0.0.0.0` *inside* the container (so Docker's network can reach it), but the host-side port mapping is loopback-only — the only way to reach the UI from a laptop is an SSH tunnel (Lab 02), never a public port.

### Step 2 — A real dependency bug, found on first boot

Bringing the stack up the first time:

```bash
docker compose up -d
docker compose logs mlflow --tail 15
```

Real error:

```text
File ".../sqlalchemy/dialects/postgresql/psycopg2.py", line 690, in import_dbapi
    import psycopg2
ModuleNotFoundError: No module named 'psycopg2'
```

**Diagnosis:** The official `ghcr.io/mlflow/mlflow` image supports many backend store types, but doesn't bundle every possible database driver — Postgres support requires `psycopg2` specifically, and it isn't preinstalled.

**Fix — a two-line custom image on top of the official one, rather than switching away from Postgres:**

```dockerfile
FROM ghcr.io/mlflow/mlflow:v2.16.0
RUN pip install --no-cache-dir psycopg2-binary
```

And point `docker-compose.yml`'s `mlflow` service at `build:` instead of `image:`. Rebuild and re-verify:

```bash
docker compose up -d --build
curl -s -o /dev/null -w "MLflow HTTP status: %{http_code}\n" http://localhost:5000/
# MLflow HTTP status: 200
```

### Step 3 — Prove persistence, don't just trust it

The entire point of Postgres-over-SQLite and a persistent volume is that tracking data survives a container restart. **Assert this directly rather than assuming the configuration is correct:**

```bash
# Log a real run
docker exec infra-mlflow-1 python3 -c "
import mlflow
mlflow.set_tracking_uri('http://localhost:5000')
mlflow.set_experiment('smoke_test')
with mlflow.start_run() as run:
    mlflow.log_param('smoke_test', True)
    mlflow.log_metric('ok', 1.0)
    print('logged run_id:', run.info.run_id)
"

# Fully tear down and recreate the containers (not just restart — recreate)
docker compose down
docker compose up -d

# Confirm the SAME run is still queryable
docker exec infra-mlflow-1 python3 -c "
import mlflow
mlflow.set_tracking_uri('http://localhost:5000')
run = mlflow.get_run('<run_id_from_above>')
print('FOUND run:', run.info.run_id, run.data.params, run.data.metrics)
"
# FOUND run: a35b8be929014baeb97120e0e0dcfbf5 {'smoke_test': 'True'} {'ok': 1.0}
```

`docker compose down` deletes the containers entirely (not just stops them) — if the run were still findable only because of an in-memory cache or a container that never actually restarted, this test would have caught it. It didn't; the data survived because it's genuinely on the persistent volume, not container-local.

### Step 4 — Nested runs for cross-validation

A single training configuration evaluated across 7 walk-forward folds needs 7 sets of metrics, plus one aggregate. MLflow's nested-run feature maps directly onto this:

```python
with mlflow.start_run(run_name="tcn_lb120_seed0") as parent_run:
    mlflow.log_params({"model": "tcn", "lookback": 120, "seed": 0, ...})

    for fold in folds:
        with mlflow.start_run(run_name=f"fold{fold.fold_id}", nested=True):
            mlflow.log_params({"fold_id": fold.fold_id, ...})
            fold_metrics = train_and_eval_fold(...)
            mlflow.log_metrics(fold_metrics.as_flat_dict())

    # aggregate mean/std/MIN across all fold children, logged on the PARENT
    mlflow.log_metrics({"pr_auc_mean": ..., "pr_auc_std": ..., "pr_auc_min": ...})
```

The parent/child relationship is what later lets the promotion gate (Chapter 9) query "all fold children of this specific configuration" programmatically via `MlflowClient.search_runs(filter_string=f"tags.mlflow.parentRunId = '{parent_run_id}'")` — this is the actual mechanism, not a manual spreadsheet of fold results.

## WHEN

Log to MLflow (or an equivalent tracker) from literally the first training run of a project, not "once things get serious" — the entire value is having a complete history, and there's no way to retroactively create logs for runs that already happened untracked. Nested runs specifically are worth the small extra complexity whenever a "result" is actually an aggregate over multiple evaluations (folds, seeds, or both) — which for time-series and any small-data problem, it always should be (Chapter 6).

## TRADEOFFS

| Backend store | Concurrent writers | Setup cost | This project's choice |
|---|---|---|---|
| SQLite (default) | Poor — file-locking contention | Zero | No |
| Postgres | Good | One extra container + a dependency bug to fix (see above) | Yes |

| Artifact store | Setup cost | Scales to |
|---|---|---|
| Local disk on the tracking server (this project) | Zero extra infra | One node's worth of storage |
| S3-compatible object storage | Needs credentials/bucket setup | Effectively unlimited, multi-node |

## PRODUCTION

In production, the biggest addition beyond this chapter's single-node setup is the **Model Registry** — MLflow's mechanism for promoting a specific logged run's model artifact to a named, versioned, stage-tracked entity (`Staging` → `Production`). This project deliberately hasn't called `mlflow.register_model()` yet, because Chapter 9's promotion gate is the thing that decides *whether* a run is even eligible to be registered — registering happens only after the gate passes, never before.

## TROUBLESHOOTING

### Scenario 1: MLflow server fails to start with a database driver error

Covered in full above (Step 2) — the general pattern (an official image supporting a backend type in code, but not bundling every driver) is worth recognizing beyond just Postgres: MySQL backend stores hit the analogous `pymysql`/`mysqlclient` gap.

### Scenario 2: A run reachable from `mlflow ui` locally can't be found from a different machine

**Symptom:** `mlflow.get_run(run_id)` succeeds when run from inside the same Docker network as the server, but fails with a connection error from a laptop.

**Diagnosis:** `MLFLOW_TRACKING_URI` on the calling machine either isn't set, or points at `localhost` when there's no active SSH tunnel forwarding that port.

**Evidence vs. Proof:** A connection-refused error is evidence of a network reachability problem specifically, not a data problem — it happens before MLflow's own logic (auth, run lookup) ever runs.

**Resolution:**
```bash
# On the laptop, in a separate terminal, keep this tunnel open:
ssh -i ~/.ssh/nvidia-lab jithin@<vm-ip> -L 5000:localhost:5000
# Then, for any script/shell that needs to reach it:
export MLFLOW_TRACKING_URI=http://localhost:5000
```

## Interview Preparation

**Conceptual:** "Why does MLflow separate the 'backend store' from the 'artifact store' instead of just storing everything one way?"

**Model Answer:** "They have fundamentally different access patterns and size profiles. The backend store holds small, structured, frequently-queried data — parameters, metrics, tags — that benefits from a real relational database's indexing and concurrent-write handling, especially once you're running nested runs across many folds in parallel. The artifact store holds large, opaque blobs — model checkpoints, CSVs, plots — that are written once and read rarely, which is exactly the access pattern object storage or a plain filesystem is good at and a relational database is bad at. Forcing both into one system would mean either bloating a database with binary blobs it's not optimized for, or losing the queryability of structured metrics by shoving them into a file store. Separating them lets each half use the storage technology suited to its actual access pattern."

**Architecture:** "Design an MLflow setup for a team where five people need to log experiments concurrently, and results must survive any single machine being wiped."

**Model Answer:** "I'd run the tracking server as a shared service, not on anyone's individual machine, with Postgres (not SQLite) as the backend store specifically because concurrent writers from five people's training runs need real transaction handling. Artifacts would go to S3 or equivalent object storage rather than local disk, so 'any single machine being wiped' — including the tracking server's own host — doesn't lose historical run data, as long as the database and object store are backed up independently of that host. I'd also put the tracking server itself behind authentication rather than this project's SSH-tunnel-only approach, since a genuine multi-user team needs per-user access control that a single-tunnel setup doesn't provide."

**Troubleshooting:** "Nested runs for a 7-fold cross-validation are logging correctly, but querying 'all fold children of run X' via the API returns zero results. What do you check?"

**Model Answer:** "First, whether the child runs were actually started with `nested=True` inside the parent's `with mlflow.start_run()` context — omitting that flag, or starting the child run outside the parent's context manager entirely, means MLflow never sets the `mlflow.parentRunId` tag that the query filter depends on. Second, I'd check the exact filter string syntax — `tags.mlflow.parentRunId = '<id>'` requires the parent run's ID as a literal string match, so a subtly wrong ID (e.g., confusing a fold child's own run ID with the parent's) would silently return nothing rather than erroring. Third, I'd query without any filter first, list all runs in the experiment, and manually inspect one child's tags to confirm the parent-child relationship is actually being recorded as expected before assuming the query logic itself is broken."

## Architecture Summary

Experiment Tracking (MLflow) replaces the error-prone manual spreadsheets of Data Scientists with a programmatic, centralized Flight Data Recorder. To scale across a team, Platform Engineers must decouple the architecture: the MLflow Tracking Server processes the incoming HTTP traffic, PostgreSQL (Backend Store) handles concurrent writes for thousands of training parameters/metrics, and AWS S3 (Artifact Store) securely stores the massive multi-gigabyte `.safetensors` model weights.

```mermaid
flowchart TD
    subgraph Experiment_Tracking_Architecture["MLflow Tracking Pipeline"]
        direction TB
        
        subgraph Compute_Node["GPU Training Worker"]
            Script[PyTorch Training Script <br/> mlflow.log_params()]
            Weights[(Model Weights)]
        end
        
        subgraph MLflow_Server["MLflow Tracking Server"]
            API[MLflow REST API]
            UI[Web Dashboard]
        end
        
        subgraph Backend["PostgreSQL Database (Backend Store)"]
            Params[Structured Data: <br/> Hyperparams, Git Hash, Metrics]
        end
        
        subgraph S3["AWS S3 Bucket (Artifact Store)"]
            Blobs[Unstructured Blobs: <br/> .safetensors, TensorBoard logs]
        end
        
        Script -->|Logs HTTP API| API
        API -->|Writes| Params
        Script -->|Uploads directly| Blobs
        UI <==> API
    end
```

## Related Chapters

- **Previous:** [Chapter 3 — Data Versioning with DVC](./chapter-03-data-versioning-with-dvc.md)
- **Next:** [Chapter 5 — Data Ingestion and Cleaning Pipeline Design](./chapter-05-data-ingestion-and-cleaning-pipeline-design.md)
- **Related:** [Chapter 9 — The Model Promotion Gate](./chapter-09-the-model-promotion-gate-governance-before-the-registry.md) — queries exactly the nested-run structure this chapter builds
