"""State contract for the minimal recipe web-search graph."""

from __future__ import annotations

import operator
from typing import Annotated, TypedDict


class CookingState(TypedDict, total=False):
    """Small state surface for the first LangGraph prototype."""

    query: str
    needs_search: bool
    search_attempted: bool
    sources: list[dict[str, str]]
    messages: Annotated[list[dict[str, str]], operator.add]
    answer: str