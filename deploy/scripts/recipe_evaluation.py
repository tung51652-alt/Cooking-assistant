"""Run the fixed retrieval evaluation inside a recipes container, without host ports."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def evaluate_in_container(container):
    evaluator = (ROOT / 'ai/rag/evaluation/evaluate.py').read_text()
    queries = (ROOT / 'ai/rag/evaluation/queries.json').read_text()
    code = ("import tempfile,json; from pathlib import Path\n" +
            "namespace={'__name__':'acceptance_evaluation'}\n" +
            f"exec({evaluator!r},namespace)\n" +
            "with tempfile.TemporaryDirectory() as directory:\n" +
            " path=Path(directory)/'queries.json'\n" + f" path.write_text({queries!r})\n" +
            " print(json.dumps(namespace['evaluate']('http://127.0.0.1:8001',path)))\n")
    return json.loads(subprocess.check_output(['docker', 'exec', container, 'python', '-c', code]))
