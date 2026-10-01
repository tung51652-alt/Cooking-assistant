"""Web-search adapter used only as an exploratory fallback."""

from __future__ import annotations


def search_recipe_web(query: str, max_results: int = 5) -> list[dict[str, str]]:
    """Return normalized search results without exposing provider details."""

    from ddgs import DDGS

    with DDGS() as ddgs:
        return [
            {
                "title": result.get("title", ""),
                "snippet": result.get("body", ""),
                "url": result.get("href", ""),
            }
            for result in ddgs.text(
                query,
                region="vn-vi",
                safesearch="moderate",
                max_results=max_results,
            )
        ]