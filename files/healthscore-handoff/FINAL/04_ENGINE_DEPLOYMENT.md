# Engine Deployment — Self-Hosted

The HealthScore engine ships as **Python source code** that MattaNutra IT will deploy as a backend microservice. This document covers the recommended stack, the HTTP endpoint contract, deployment options, observability, and the test/versioning workflow.

**Recommendation in one sentence**: containerize with the provided Dockerfile, deploy on Cloud Run or any equivalent stateless container platform, expose `POST /score`, treat it as a black box that takes questionnaire answers and returns the JSON content package documented in `03_ENGINE_CONTRACT.md`.

---

## 1. Stack

| Component | Choice | Reason |
|---|---|---|
| Language | Python 3.11+ | The engine is written in modern Python; type hints + `match` statements rely on 3.10+ |
| HTTP framework | FastAPI 0.110+ | Async, automatic OpenAPI/Swagger, schema validation via Pydantic, minimal boilerplate |
| ASGI server | Uvicorn (dev) / Uvicorn-workers under Gunicorn (prod) | Standard FastAPI deployment pattern |
| Container base | `python:3.11-slim` | Smaller image (~120MB), reproducible, no buildpack magic |
| Schema validation | Pydantic v2 | Bundled with FastAPI; validates request payloads and response shapes |

**Do NOT use Flask.** FastAPI's Pydantic validation catches malformed questionnaire payloads at the boundary; with Flask you'd have to write that yourself. FastAPI is also faster at the routing layer and gives you free API docs at `/docs`.

**Do NOT port to TypeScript / Node.** The Python engine has been Monte-Carlo-calibrated with a 20K-profile simulation. The percentile lookup table (`pctile.json`) and the multiplier weights are tuned to a specific implementation. A TS port has to be validated against thousands of test cases to confirm identical outputs; this is days of work for ~zero benefit. Run Python as a microservice and let your TS/Node frontend or API gateway call it.

---

## 2. File structure

The `engine/` folder of this package contains everything needed:

```
engine/
├── engine.py                    # 5-layer scoring model
├── healthscore_library.py       # content library (goal phrases, forbidden, etc.)
├── healthscore_content.py       # build_page_content
├── pctile.json                  # percentile lookup table (DO NOT regenerate)
├── server.py                    # FastAPI wrapper
├── requirements.txt             # pinned dependencies
├── Dockerfile                   # production container
├── test_engine.py               # snapshot tests
└── fixtures/
    ├── priya_answers.json       # input fixture for snapshot test
    ├── priya_expected.json      # expected output
    ├── marcus_answers.json
    └── marcus_expected.json
```

`server.py` is a thin (~80 line) FastAPI app exposing `POST /score`. The actual scoring logic stays in `engine.py` and `healthscore_content.py`.

---

## 3. The HTTP endpoint

### `POST /score`

**Request body** (`application/json`):

```json
{
  "first_name": "Marcus",                       // string, may be omitted/empty
  "answers": {
    "age": "46-55",
    "sex": "male",
    "country": "Singapore",
    "goals": ["energy", "heart", "fitness"],
    "symptoms": ["fatigue", "sleep", "brainfog"],
    "energy": "low",
    "sleepHrs": "6-7",
    "stress": "high",
    "activity": "light",
    "diet": "balanced",
    "f_fish": "rare",
    "meds": "yes",
    "medTypes": ["statin"],
    "supplements": "basic",
    "sunscreen": "daily",
    "sun": "15-30"
    // ... plus optional lab fields (lab_vitd, lab_b12, etc.) and wearable (vo2, hrv)
  }
}
```

The full input schema for `answers` is defined as a Pydantic model in `server.py` (see source). Unknown fields are accepted and ignored (forward compatibility); required fields are validated and return 422 if missing.

**Response body** (`application/json`):

The content package described in `03_ENGINE_CONTRACT.md` — `{ locked, copy, meta }`.

**Response codes**:

| Code | Meaning | Body |
|---|---|---|
| 200 | Score computed successfully | Content package JSON |
| 422 | Request schema validation failed | FastAPI's standard validation error object |
| 500 | Engine raised an unexpected exception | `{ "error": "internal", "request_id": "..." }` — full traceback logged server-side |

**Latency budget**: 5–15ms per request once the process is warm. Cold start (Cloud Run) adds 300–800ms; mitigate with min-instances=1 if the questionnaire-to-page latency budget is tight.

**Idempotency**: yes, fully. Same answers in → same output every time. Safe to retry.

**Authentication**: this service should sit behind your existing API gateway and **not be exposed to the public internet directly**. The questionnaire frontend calls your backend; your backend calls `/score`. A simple shared secret in an `X-Internal-Token` header is sufficient at this scale.

---

## 4. `server.py` — the FastAPI wrapper

A complete, working `server.py` is included in `engine/server.py`. Sketch:

```python
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from engine import compute_score
from healthscore_content import build_page_content
import logging, uuid, os

app = FastAPI(title="HealthScore Engine", version="1.0.0")
log = logging.getLogger("healthscore")
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "")

class Answers(BaseModel):
    # ... all questionnaire fields with types and defaults
    age: str
    sex: str
    goals: List[str]
    # ... (see source for complete schema)

class ScoreRequest(BaseModel):
    first_name: Optional[str] = ""
    answers: Answers

@app.post("/score")
def score(req: ScoreRequest, x_internal_token: Optional[str] = Header(None)):
    if INTERNAL_TOKEN and x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        result = compute_score(req.answers.dict())
        pkg = build_page_content(
            answers=req.answers.dict(),
            result=result,
            first_name=req.first_name or None,
        )
        return pkg
    except Exception as e:
        request_id = str(uuid.uuid4())
        log.exception(f"score failed request_id={request_id}")
        raise HTTPException(status_code=500, detail={"error": "internal", "request_id": request_id})

@app.get("/health")
def health():
    return {"status": "ok", "engine_version": "1.0.0"}
```

The `/health` endpoint is required for Cloud Run / Kubernetes liveness probes; return cheap and fast.

---

## 5. `requirements.txt`

```
fastapi==0.110.0
uvicorn[standard]==0.27.0
gunicorn==21.2.0
pydantic==2.6.0
```

**Pin the versions.** FastAPI/Pydantic minor versions occasionally introduce schema changes that affect validation behavior. Pinning keeps the engine deterministic across deploys.

---

## 6. `Dockerfile`

```dockerfile
FROM python:3.11-slim

# Install dependencies in their own layer for caching
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy engine code
COPY engine.py healthscore_library.py healthscore_content.py pctile.json server.py ./

# Non-root user
RUN useradd -m -u 1000 healthscore && chown -R healthscore:healthscore /app
USER healthscore

# Cloud Run / container platforms set $PORT
ENV PORT=8080
EXPOSE 8080

# Gunicorn with uvicorn workers — production pattern
CMD ["sh", "-c", "gunicorn server:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT} -w 2 --timeout 30"]
```

Two workers per container is appropriate for Cloud Run's typical CPU allocation. Scale horizontally (more containers) rather than vertically (more workers per container) — the engine is CPU-light but benefits from process-level isolation.

---

## 7. Deployment options

In rough order of how well they fit this workload:

### 7a. Google Cloud Run (recommended)
- Stateless container, scales to zero, pay-per-request
- Cold start ~500ms; `min-instances=1` eliminates cold starts at ~$5/month
- Deploy: `gcloud run deploy healthscore --source ./engine --region asia-southeast1`
- Set env var `INTERNAL_TOKEN` for the shared-secret check

### 7b. AWS ECS / Fargate
- Equivalent to Cloud Run if you're AWS-centric
- A bit more configuration overhead (task definitions, ALB)
- Same Dockerfile works

### 7c. fly.io
- Simpler than the above; deploy with `flyctl launch`
- Good fit if you want a single global edge deployment
- Use `fly secrets set INTERNAL_TOKEN=...`

### 7d. Self-hosted Kubernetes
- Overkill for one service at this scale, but fine if you already have a cluster
- Standard Deployment + Service + HPA on CPU

### 7e. Direct on a VPS (DigitalOcean, Hetzner)
- Cheapest. Run the container under systemd or Docker Compose with a reverse proxy (Caddy, Nginx)
- Adds operational overhead (patching, logs, restarts) — only if you're already doing this for other services

**For Thailand-resident customers, prefer `asia-southeast1` (Singapore) over US regions** — saves ~150ms round-trip on the questionnaire→score→page render path.

---

## 8. Observability

Three things to log per request:

1. **Request ID + response code + latency** — standard access log
2. **`locked.score`, `locked.band`, `meta.relativity_mode`, `meta.finding_count`** — to track score distribution and detect calibration drift over time
3. **Any `Exception` raised inside `compute_score` or `build_page_content`** — with the input answers attached (be careful with PII — strip `first_name` from logs)

Recommended: a daily dashboard showing the score distribution (histogram of `locked.score`) and the modal band. If the modal band shifts away from "Good with a clear gap" by more than 5 percentage points week-over-week, something has drifted (either the customer population or the engine itself).

**Do not log full questionnaire answers in plain text.** They contain medication info, medical conditions, and lifestyle details that are PII under most jurisdictions. If you need them for debugging, hash the customer ID and store the answers in a separate, access-controlled store with retention limits.

---

## 9. Snapshot tests

The `engine/test_engine.py` file runs the engine against fixture inputs (Priya, Marcus, plus 6 calibration personas) and asserts the outputs match expected JSON. **Run this in CI on every push** that touches `engine.py`, `healthscore_content.py`, `healthscore_library.py`, or `pctile.json`.

```bash
cd engine
python -m pytest test_engine.py -v
```

Expected output: all 8 fixtures pass. If a test fails, **do not regenerate the expected output to silence it** — investigate first. A failing snapshot test means an engine change is silently moving customer scores, which has commercial impact.

To **deliberately update** a snapshot after an intentional engine change:

```bash
python test_engine.py --update-snapshots
git diff engine/fixtures/  # review every byte of the diff
git add engine/fixtures/
```

Be explicit in the commit message about *why* the snapshots changed.

---

## 10. Versioning

`meta.engine_version` is set in `engine.py` as a module constant. Bump it whenever:

- **Minor** (`1.0.0` → `1.1.0`): scoring rules change, weights adjusted, new content variants added. Customer scores may shift.
- **Major** (`1.0.0` → `2.0.0`): JSON schema changes — new fields in `locked` or `copy`, removed fields, renamed fields. Coordinate with the page renderer; consider maintaining a `/score/v1` endpoint alongside `/score` during transition.
- **Patch** (`1.0.0` → `1.0.1`): bug fix that doesn't change any output for valid inputs.

Log `meta.engine_version` on every response and pin it in your snapshot tests.

---

## 11. The Excel workbook — clarification

`HealthScore_Engine_v2.xlsx` was attached for reference. It is the **calibration documentation**, not a runtime input. The workbook exists so non-technical stakeholders can inspect the formula structure (which questionnaire answer contributes how much to which pillar, with the multipliers and weights visible) without reading Python.

- **The engine does NOT read the Excel file at runtime.** All weights and rules are encoded in `engine.py`.
- **Do not port the Excel formulas into the production code.** The Python is the source of truth; the Excel is a visualization of it.
- **If the Excel is ever updated**, the Python must be updated to match — but the Python is authoritative if they ever drift.

---

## 12. End-to-end flow

Production data flow for a single customer:

1. Customer completes questionnaire frontend
2. Frontend POSTs answers to your backend's `/api/finish-questionnaire` endpoint
3. Your backend POSTs to the engine service at `/score` with `X-Internal-Token` header
4. Engine returns content package JSON (`{ locked, copy, meta }`) in ~10ms
5. **(V1)** Backend renders the HealthScore template with the JSON as the data context and returns the HTML
6. **(V2)** Backend optionally calls `polish(content_package)` (see `07_PERSONALIZATION_LAYER.md`) before rendering
7. Backend serves the rendered HTML to the browser at `/healthscore/{customer_id}`

Steps 4 and 6 are the engine's responsibilities. Steps 5 and 7 are the page renderer's responsibility. The contract between them is the JSON schema in `03_ENGINE_CONTRACT.md`.
