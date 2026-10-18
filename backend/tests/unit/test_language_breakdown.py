"""language_breakdown without Spark.

tests/unit/test_spark_tasks.py covers the same task on a real SparkSession, but that file skips wherever
PySpark and Java aren't installed - which is everywhere except the worker. The arithmetic that decides
what the Languages bar shows is worth running on every commit, so this drives the task through a stand-in
that implements only the RDD operations it uses.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "colab_worker"))
from tasks import TASKS, TaskError  # noqa: E402


class _RDD:
    def __init__(self, items):
        self.items = list(items)

    def cache(self):
        return self

    def map(self, f):
        return _RDD(map(f, self.items))

    def reduceByKey(self, f):
        acc = {}
        for k, v in self.items:
            acc[k] = f(acc[k], v) if k in acc else v
        return _RDD(acc.items())

    def collect(self):
        return list(self.items)

    def takeOrdered(self, n, key):
        return sorted(self.items, key=key)[:n]


class _Spark:
    class sparkContext:  # noqa: N801 - mirrors the PySpark attribute name
        @staticmethod
        def parallelize(rows, slices=None):
            return _RDD(rows)


def noop(_pct, _text=""):
    pass


FILES = ([{"path": f"src/a{i}.py", "size": 100} for i in range(3)]
         + [{"path": "web/app.ts", "size": 400}, {"path": "web/app.css", "size": 100}]
         + [{"path": "Dockerfile", "size": 50}, {"path": "bin/tool", "size": 50}]
         + [{"path": f"pkg{i}/README.md", "size": 25} for i in range(2)])


def run(files, **params):
    return TASKS["language_breakdown"](_Spark(), params, {"files": files}, noop)


def test_shares_are_bytes_not_file_counts():
    out = run(FILES, top_files=3)
    by = {lang["language"]: lang for lang in out["languages"]}
    assert out["total_bytes"] == 950 and out["total_files"] == 9
    assert by["Python"] == {"language": "Python", "bytes": 300, "files": 3, "share": 300 / 950}
    # one TypeScript file outweighs three Python ones: the bar measures size, like GitHub's
    assert out["languages"][0]["language"] == "TypeScript"
    assert abs(sum(lang["share"] for lang in out["languages"]) - 1.0) < 1e-9


def test_names_what_it_can_and_admits_the_rest():
    by = {lang["language"]: lang for lang in run(FILES)["languages"]}
    assert by["Dockerfile"]["files"] == 1   # by filename, not extension
    assert by["CSS"]["bytes"] == 100
    assert by["Other"]["files"] == 1        # bin/tool: no extension, not guessed at


def test_dotfiles_are_not_read_as_extensions():
    out = run([{"path": ".gitignore", "size": 10}, {"path": "a/.env", "size": 10}])
    assert [lang["language"] for lang in out["languages"]] == ["Other"]


def test_top_files_counts_basenames_across_directories():
    out = run(FILES, top_files=2)
    assert out["top_files"][0] == {"name": "readme.md", "count": 2, "share": 2 / 9}
    assert len(out["top_files"]) == 2


def test_an_empty_tree_is_refused():
    with pytest.raises(TaskError):
        run([])
