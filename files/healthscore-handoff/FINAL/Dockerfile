# HealthScore Engine — production container
# Targets Google Cloud Run / Fargate / fly.io / any stateless container platform.
# See ../04_ENGINE_DEPLOYMENT.md for full deployment guide.

FROM python:3.11-slim

# Install dependencies in their own layer for build cache
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy engine code
COPY engine.py healthscore_library.py healthscore_content.py pctile.json server.py ./

# Run as non-root user
RUN useradd -m -u 1000 healthscore && chown -R healthscore:healthscore /app
USER healthscore

# Cloud Run / equivalent platforms set $PORT — we honor it but default to 8080
ENV PORT=8080
EXPOSE 8080

# Health check (Cloud Run / Kubernetes will hit /health for liveness)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health', timeout=2)" || exit 1

# Gunicorn with Uvicorn workers — standard FastAPI production pattern
# -w 2: two worker processes per container (CPU-light workload; scale horizontally)
# --timeout 30: kill workers that hang on a single request
CMD ["sh", "-c", "gunicorn server:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT} -w 2 --timeout 30 --access-logfile -"]
