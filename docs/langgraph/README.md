# LangGraph Workflow & Architecture

## Minimal prototype implemented

The first implementation is intentionally smaller than the full MVP workflow:

```text
START -> classify_query -> answer_directly -> END
                       \-> search_recipe_web -> format_search_results -> END
```

It uses an explicit `needs_search` flag when provided, otherwise a conservative
uncertainty-language check. Web search is an exploratory fallback only; results
are sources for review, not an authoritative recipe corpus. The search
implementation is injected into `build_graph()` so tests do not call the network.

Run the focused tests from the repository root after installing
`ai/requirements.txt`:

```text
python -m unittest discover -s ai/agents/tests -p "test_*.py"
```

This prototype does not yet implement CV integration, validated-corpus
retrieval, checkpointer persistence, human interrupts, or the six MVP chat
intents. Those remain follow-up work.

## Workflow MVP

```text
START → validate_image → recognize_food → confidence_gate
  ├─ đủ tin cậy → confirmed_dish
  └─ thiếu tin cậy → ask_user_confirm → confirmed_dish
confirmed_dish → retrieve_recipes → select_recipe → parse_recipe → cooking_assistant
chat_loop → intent_router → retrieve_context_or_tool → cooking_assistant
```

`confirmed_dish` là đầu vào retrieval; prediction CV chưa xác nhận không được dẫn thẳng tới recipe/câu trả lời.

## State dự kiến

```python
class CookingState(TypedDict):
    messages: list; thread_id: str; image_path: str | None
    dish_candidates: list; predicted_dish: str | None; confirmed_dish: str | None
    confidence: float | None; retrieved_recipes: list; selected_recipe: dict | None
    ingredients: list; instructions: list; current_step: int
    servings: int | None; user_constraints: dict
```

`current_step` là 0-based trong state, 1-based ở UI. `thread_id` bắt buộc để persistence đúng phiên.

## Node

| Node | Trách nhiệm | Trạng thái |
| --- | --- | --- |
| `validate_image` | Kiểm tra ảnh | Chưa làm |
| `recognize_food` | Top-K và confidence | Chưa làm |
| `confidence_gate` / `ask_user_confirm` | Route và lưu món xác nhận | Chưa làm |
| `retrieve_recipes` / `select_recipe` / `parse_recipe` | Context recipe có cấu trúc | Chưa làm |
| `intent_router` | Phân loại ý định | Chưa làm |
| `cooking_assistant` | Trả lời grounded, cập nhật state | Chưa làm |

## Intents MVP

`recipe_question`, `ingredient_substitution`, `cooking_technique`, `step_navigation`, `serving_adjustment`, `quantity_conversion`.

## Cần chốt

- [ ] Checkpointer/persistence và TTL session.
- [ ] Confidence threshold/UI confirm, chọn recipe, guardrail khi thiếu context.
- [ ] LLM/provider, logging policy và test các nhánh graph.
