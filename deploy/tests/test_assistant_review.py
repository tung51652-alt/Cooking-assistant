"""Review pages must preserve evidence without executing model HTML or pregrading."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from render_assistant_review import render


class AssistantReviewTests(unittest.TestCase):
    def report(self):
        return {'calls':[{'id':str(i),'answer':'</script><script>alert(1)</script>'} for i in range(50)]}

    def test_embedded_model_html_is_data_and_round_trips(self):
        report=self.report()
        output=render(report,{'1':'<img src=x onerror=alert(1)>'})
        payload=output.split('<script id="review-data" type="application/json">',1)[1].split('</script>',1)[0]
        self.assertNotIn('<script>',payload)
        self.assertNotIn('<img',payload)
        self.assertEqual(json.loads(payload)['report'],report)
        self.assertNotIn('innerHTML',output)
        self.assertIn("connect-src 'none'",output)

    def test_judgments_start_unset_and_export_requires_human_acknowledgment(self):
        output=render(self.report())
        self.assertIn('values[field]=null',output)
        self.assertIn('id="export" disabled',output)
        self.assertIn('complete!==50',output)
        self.assertIn("!document.getElementById('attest').checked",output)
        self.assertNotIn('fetch(',output)
        self.assertNotIn('XMLHttpRequest',output)

    def test_incomplete_or_duplicate_case_sets_cannot_be_rendered_as_acceptance(self):
        report=self.report();report['calls'].pop()
        with self.assertRaises(ValueError):render(report)
        report=self.report();report['calls'][-1]['id']='0'
        with self.assertRaises(ValueError):render(report)


if __name__=='__main__':unittest.main()
