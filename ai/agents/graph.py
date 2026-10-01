"""Minimal LangGraph workflow for recipe web-search fallback."""

from __future__ import annotations

from collections.abc import Callable
from typing import Literal

from langgraph.graph import END, START, StateGraph

from ai.agents.state import CookingState
from ai.agents.tools.web_search import search_recipe_web

SearchFn = Callable[[str], list[dict[str, str]]]


def _has_uncertain_language(query: str) -> bool:
    signals = ("lạ", "không rõ", "mơ hồ", "hiếm", "đặc sản")
    normalized_query = query.casefold()
    return any(signal in normalized_query for signal in signals)


def classify_query(state: CookingState) -> dict:
    """Use an explicit caller decision or a conservative uncertainty gate."""

    needs_search = state.get("needs_search")
    if needs_search is None:
        needs_search = _has_uncertain_language(state.get("query", ""))
    return {"needs_search": needs_search, "search_attempted": False}


def route_query(state: CookingState) -> Literal["search_recipe_web", "answer_directly"]:
    return "search_recipe_web" if state.get("needs_search") else "answer_directly"


def answer_directly(state: CookingState) -> dict:
    query = state.get("query", "").strip()
    answer = (
        f"Chưa tìm kiếm web cho yêu cầu '{query}'. "
        "Cần kết nối recipe corpus đã được kiểm chứng để trả lời công thức."
    )
    return {"answer": answer, "messages": [{"role": "assistant", "content": answer}]}


def build_graph(searcher: SearchFn = search_recipe_web):
    """Build and compile the graph with an injectable search implementation."""

    def search_node(state: CookingState) -> dict:
        if state.get("search_attempted"):
            return {"sources": [], "search_attempted": True}

        results = searcher(state.get("query", ""))
        return {"sources": results, "search_attempted": True}

    def format_search_results(state: CookingState) -> dict:
        sources = state.get("sources", [])
        if not sources:
            answer = "Không tìm thấy nguồn recipe phù hợp; chưa thể xác nhận công thức."
        else:
            lines = ["Kết quả tham khảo, chưa phải recipe corpus đã kiểm chứng:"]
            lines.extend(
                f"- {source.get('title', 'Untitled')}: {source.get('url', '')}"
                for source in sources
            )
            answer = "\n".join(lines)
        return {"answer": answer, "messages": [{"role": "assistant", "content": answer}]}

    workflow = StateGraph(CookingState)
    workflow.add_node("classify_query", classify_query)
    workflow.add_node("search_recipe_web", search_node)
    workflow.add_node("answer_directly", answer_directly)
    workflow.add_node("format_search_results", format_search_results)
    workflow.add_edge(START, "classify_query")
    workflow.add_conditional_edges(
        "classify_query",
        route_query,
        ["search_recipe_web", "answer_directly"],
    )
    workflow.add_edge("search_recipe_web", "format_search_results")
    workflow.add_edge("format_search_results", END)
    workflow.add_edge("answer_directly", END)
    return workflow.compile()


graph = build_graph()