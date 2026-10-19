"""Measure fixed recipe queries without treating draft review or missing coverage as accepted."""
import argparse
import json
from pathlib import Path

import httpx


def evaluate(url, queries):
    specification = json.loads(queries.read_text())
    positives = hit1 = hit3 = empty = cross_dish = 0
    reciprocal_rank = 0.
    with httpx.Client(base_url=url, timeout=5, trust_env=False) as client:
        for case in specification["cases"]:
            response = client.post("/search", json={"confirmed_dish": case["confirmed_dish"], "query": case["query"], "top_k": 3})
            response.raise_for_status()
            recipes = response.json()["recipes"]
            cross_dish += sum(r["normalized_dish"] != case["confirmed_dish"] for r in recipes)
            expected = set(case["relevant_ids"])
            if not expected:
                if recipes:
                    raise ValueError("Uncovered dish unexpectedly returned a recipe")
                empty += 1
                continue
            positives += 1
            ranks = [i for i,r in enumerate(recipes, 1) if r["id"] in expected]
            if ranks:
                best = min(ranks)
                hit1 += best == 1
                hit3 += best <= 3
                reciprocal_rank += 1 / best
    if cross_dish:
        raise ValueError("Recipe search crossed the confirmed-dish filter")
    return {"queries": len(specification["cases"]), "positive_queries": positives,
            "truthful_empty_queries": empty, "hit_at_1": hit1 / positives,
            "hit_at_3": hit3 / positives, "mrr": reciprocal_rank / positives,
            "cross_dish_results": cross_dish, "review_status": specification["review_status"],
            "acceptance_gate_met": False,
            "limitation": "Agent-authored draft; independent review and full coverage remain open. Most covered dishes have one candidate, so these metrics are not release acceptance."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8001")
    parser.add_argument("--queries", type=Path, default=Path(__file__).with_name("queries.json"))
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = evaluate(args.url, args.queries)
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output)
    print(output, end="")
