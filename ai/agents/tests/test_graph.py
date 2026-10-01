import unittest


from ai.agents.graph import build_graph


class GraphTests(unittest.TestCase):
    def test_familiar_query_does_not_search(self):
        calls = []

        def searcher(query):
            calls.append(query)
            return []

        result = build_graph(searcher).invoke({"query": "Cơm rang trứng"})

        self.assertEqual(calls, [])
        self.assertFalse(result["search_attempted"])
        self.assertIn("Chưa tìm kiếm web", result["answer"])


    def test_uncertain_query_searches_once_and_keeps_sources(self):
        calls = []

        def searcher(query):
            calls.append(query)
            return [{"title": "Recipe source", "snippet": "...", "url": "https://example.com"}]

        result = build_graph(searcher).invoke({"query": "Một món lạ miền Trung"})

        self.assertEqual(calls, ["Một món lạ miền Trung"])
        self.assertTrue(result["search_attempted"])
        self.assertEqual(result["sources"][0]["url"], "https://example.com")
        self.assertIn("https://example.com", result["answer"])


    def test_search_with_no_results_reports_uncertainty(self):
        result = build_graph(lambda _: []).invoke(
            {"query": "Món hiếm không rõ tên", "needs_search": True}
        )

        self.assertIn("chưa thể xác nhận", result["answer"])