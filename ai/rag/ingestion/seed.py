"""Idempotent, offline initializer. Existing corrupt versions require a new corpus version."""
import os

from ai.rag.ingestion.bundle import Bundle
from ai.rag.retrieval.store import Store


def main():
    bundle = Bundle(os.getenv("RECIPES_BUNDLE_DIR", "/opt/cooklens/recipes"))
    store = Store(os.getenv("QDRANT_URL", "http://qdrant:6333"), bundle)
    try:
        store.seed()
        print(f"Recipe index ready: {len(bundle.points)} records; {bundle.versions['corpus_version']}")
    finally:
        store.close()


if __name__ == "__main__":
    main()
