FROM python:3.12.15-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    RECIPES_BUNDLE_DIR=/opt/cooklens/recipes \
    EMBEDDING_MODEL_DIR=/opt/cooklens/models/multilingual-e5-small \
    TORCH_NUM_THREADS=4 \
    OMP_NUM_THREADS=4 \
    MKL_NUM_THREADS=4

WORKDIR /app
COPY ai/rag/requirements.txt /tmp/recipes-requirements.txt
RUN python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.14.1 \
    && python -m pip install --no-cache-dir -r /tmp/recipes-requirements.txt \
    && rm /tmp/recipes-requirements.txt

COPY ai/rag/api/*.py /app/ai/rag/api/
COPY ai/rag/embeddings/*.py /app/ai/rag/embeddings/
COPY ai/rag/ingestion/*.py /app/ai/rag/ingestion/
COPY ai/rag/retrieval/*.py /app/ai/rag/retrieval/
COPY data/recipes/validate.py /app/data/recipes/validate.py
RUN mkdir -p /opt/cooklens/recipes /opt/cooklens/models/multilingual-e5-small /opt/cooklens/notices \
    && chmod 0755 /opt/cooklens /opt/cooklens/recipes /opt/cooklens/models /opt/cooklens/models/multilingual-e5-small /opt/cooklens/notices
COPY --chmod=0444 deploy/artifacts/staging/embedding/config.json deploy/artifacts/staging/embedding/model.safetensors deploy/artifacts/staging/embedding/tokenizer.json deploy/artifacts/staging/embedding/tokenizer_config.json deploy/artifacts/staging/embedding/special_tokens_map.json deploy/artifacts/staging/embedding/sentencepiece.bpe.model /opt/cooklens/models/multilingual-e5-small/
COPY --chmod=0444 deploy/artifacts/staging/recipes/*.json /opt/cooklens/recipes/
COPY deploy/artifacts/embedding-model-v1.md deploy/artifacts/notices/multilingual-e5-LICENSE.txt data/recipes/README.md data/recipes/AUTHORSHIP.md /opt/cooklens/notices/

USER 10001:10001
EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8001/health/ready', timeout=2)"
CMD ["python", "-m", "uvicorn", "ai.rag.api.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--no-access-log"]
