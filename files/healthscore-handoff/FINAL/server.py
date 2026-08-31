"""
HealthScore Engine — FastAPI wrapper

Exposes POST /score that accepts a questionnaire payload and returns the
content package produced by build_page_content.

See ../04_ENGINE_DEPLOYMENT.md for deployment instructions and the
HTTP contract.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field

from engine import score as engine_score
from healthscore_content import build_page_content

# ----------------------------- setup -----------------------------

ENGINE_VERSION = "1.0.0"
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "")   # set to a shared secret in prod

# Load percentile lookup table once at process start
_PCTILE_PATH = Path(__file__).parent / "pctile.json"
with _PCTILE_PATH.open() as f:
    PERCENTILES: Dict[str, int] = json.load(f)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("healthscore")

app = FastAPI(
    title="MattaNutra HealthScore Engine",
    version=ENGINE_VERSION,
    description="Deterministic scoring + content layer for the HealthScore page.",
)


# ----------------------------- schema ----------------------------

class Answers(BaseModel):
    """
    Questionnaire answers. Most fields are optional with sensible defaults
    so partial submissions still score; required fields are flagged.
    """
    # Demographics
    age: str                                                      # required: "18-25" | "26-35" | "36-45" | "46-55" | "56-65" | "66+"
    sex: Optional[str] = None                                      # "male" | "female"
    country: str = "Thailand"
    reproStatus: Optional[str] = None                              # "pregnant" | "breastfeeding" | "none"
    menopause: Optional[str] = None                                # "pre" | "peri" | "post" | "none"
    flow: Optional[str] = None

    # Goals & symptoms (drive the goal-linked pillar weighting + symptom multiplier)
    goals: List[str] = Field(default_factory=list)                 # e.g., ["energy","heart","fitness"]
    symptoms: List[str] = Field(default_factory=list)              # e.g., ["fatigue","sleep","brainfog"]

    # Lifestyle pillars
    energy: str = "ok"                                             # "drained" | "low" | "ok" | "good" | "excellent"
    sleepHrs: str = "7-8"                                          # "<5" | "5-6" | "6-7" | "7-8" | "8+"
    stress: str = "moderate"                                       # "verylow" | "low" | "moderate" | "high" | "extreme"
    activity: str = "moderate"                                     # "sitting" | "light" | "moderate" | "active" | "athlete"
    diet: str = "balanced"                                         # "processed" | "balanced" | "whole" | "mediterranean" | "vegan" | etc.

    # Food specifics
    f_fish: Optional[str] = None                                   # "never" | "rare" | "once" | "often"
    f_fruitveg: Optional[str] = None                               # "rare" | "1-2" | "3+"
    f_legumes: Optional[str] = None
    protein: Optional[str] = None                                  # "<1" | "1-1.5" | "1.5-2" | "2+"

    # Habits
    smoking: str = "never"                                         # "never" | "former" | "occasional" | "daily"
    alcohol: str = "none"                                          # "none" | "1-3" | "4-7" | "8+"
    caffeine: str = "1-2"                                          # "0" | "1-2" | "3" | "4+"
    sunscreen: str = "occasional"
    sun: str = "15-30"                                             # minutes/day outdoors

    # Medications & supplements
    meds: str = "no"                                               # "yes" | "no"
    medTypes: List[str] = Field(default_factory=list)              # ["statin","ppi","metformin","ssri",...]
    supplements: str = "none"                                      # "none" | "basic" | "advanced"

    # Optional verification data (Layer 2)
    vo2: Optional[float] = None                                    # cardiorespiratory fitness (mL/kg/min)
    hrv: Optional[float] = None                                    # heart rate variability (ms)
    lab_vitd: Optional[float] = None
    lab_b12: Optional[float] = None
    lab_ferritin: Optional[float] = None
    lab_hba1c: Optional[float] = None
    lab_o3: Optional[float] = None                                 # omega-3 index
    lab_homo: Optional[float] = None

    digestion: Optional[str] = None

    class Config:
        extra = "allow"     # forward compatibility — unknown fields ignored, don't 422


class ScoreRequest(BaseModel):
    first_name: Optional[str] = ""
    answers: Answers


# ----------------------------- routes ----------------------------

@app.post("/score")
def score_endpoint(req: ScoreRequest, x_internal_token: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Compute the HealthScore and return the full content package.

    Auth: optional shared secret via X-Internal-Token header. If
    INTERNAL_TOKEN env var is set, the header must match. If not set,
    no auth check (development).

    Returns the content package documented in 03_ENGINE_CONTRACT.md:
        { "locked": {...}, "copy": {...}, "meta": {...} }
    """
    if INTERNAL_TOKEN and x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        answers_dict = req.answers.dict()
        result = engine_score(answers_dict)
        # Look up percentile from precomputed Monte Carlo distribution
        percentile = PERCENTILES.get(str(result["final"]), 50)
        pkg = build_page_content(
            answers=answers_dict,
            result=result,
            percentile=percentile,
            first_name=req.first_name or None,
        )
        # Stamp engine version into meta so the renderer can verify
        pkg.setdefault("meta", {})["engine_version"] = ENGINE_VERSION
        return pkg

    except HTTPException:
        raise
    except Exception:
        request_id = str(uuid.uuid4())
        log.exception(f"score_endpoint failed request_id={request_id}")
        raise HTTPException(status_code=500, detail={"error": "internal", "request_id": request_id})


@app.get("/health")
def health() -> Dict[str, str]:
    """Cheap liveness probe for Cloud Run / Kubernetes."""
    return {"status": "ok", "engine_version": ENGINE_VERSION}


@app.get("/")
def root() -> Dict[str, str]:
    return {"service": "healthscore-engine", "version": ENGINE_VERSION, "docs": "/docs"}
