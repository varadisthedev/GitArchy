"""Spark task correctness against pure-Python expectations. Skipped when PySpark/Java are not installed
(the API venv deliberately has neither): run it in the worker environment:

    pip install -r colab_worker/requirements.txt pytest && pytest --noconftest tests/unit/test_spark_tasks.py
"""
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

import pytest

pytest.importorskip("pyspark")
if shutil.which("java") is None:
    pytest.skip("Java not installed", allow_module_level=True)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "colab_worker"))
from tasks import TASKS, TaskError  # noqa: E402


@pytest.fixture(scope="module")
def spark():
    import os
    from pyspark.sql import SparkSession
    os.environ["PYSPARK_PYTHON"] = os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable
    s = (SparkSession.builder.master("local[2]").appName("t").config("spark.ui.enabled", "false")
         .config("spark.sql.shuffle.partitions", "2").getOrCreate())
    s.sparkContext.setLogLevel("ERROR")
    yield s
    s.stop()


def commits(n=40):
    return [{"sha": f"s{i}", "repo_id": f"r{i % 2}", "author": ["ann", "bob", "cy"][i % 3],
             "date": f"2025-01-0{1 + i % 5}T{10 + i % 10:02d}:00:00+00:00",
             "message": "fix parser bug" if i % 4 == 0 else "add feature widget", "additions": 5 + i * 3,
             "deletions": i % 7, "files_changed": 1 + i % 3, "extensions": {".py": 1 + i % 2, ".md": 1}}
            for i in range(n)]


noop = lambda p, m: None


def test_rdd_activity_matches_python(spark):
    rows = commits()
    out = TASKS["commit_activity_rdd"](spark, {"group_by": "author"}, {"commits": rows}, noop)
    got = {g["key"]: (g["commits"], g["additions"], g["deletions"]) for g in out["groups"]}
    exp = {}
    for r in rows:
        c, a, d = exp.get(r["author"], (0, 0, 0))
        exp[r["author"]] = (c + 1, a + r["additions"], d + r["deletions"])
    assert got == exp and out["total_commits"] == len(rows)
    by_day = TASKS["commit_activity_rdd"](spark, {"group_by": "day"}, {"commits": rows}, noop)
    assert {g["key"]: g["commits"] for g in by_day["groups"]} == dict(Counter(r["date"][:10] for r in rows))


def test_mapreduce_terms_matches_wordcount(spark):
    rows = commits()
    out = TASKS["message_terms_mapreduce"](spark, {"top_n": 3}, {"commits": rows}, noop)
    stop = {"the", "and", "for", "with", "this", "that", "from", "into", "add", "update", "not", "are", "was", "use"}
    exp = Counter(w for r in rows for w in re.findall(r"[a-z][a-z0-9_]{2,}", r["message"].lower()) if w not in stop)
    top = sorted(exp.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
    assert [(t["term"], t["count"]) for t in out["top_terms"]] == top


def test_sql_file_stats(spark):
    rows = commits()
    out = TASKS["file_stats_sql"](spark, {"top_n": 5}, {"commits": rows}, noop)
    py = sum(r["extensions"][".py"] for r in rows)
    assert {e["ext"]: e["files"] for e in out["by_extension"]}[".py"] == py
    assert sum(r["commits"] for r in out["by_repo"]) == len(rows)


def test_kmeans_separates_obvious_groups(spark):
    small = [{"repo_id": f"s{i}", "commits": 3 + i, "additions": 50, "deletions": 5, "files_changed": 6, "authors": 1}
             for i in range(4)]
    big = [{"repo_id": f"b{i}", "commits": 900 + i, "additions": 90000, "deletions": 9000, "files_changed": 2000, "authors": 30}
           for i in range(4)]
    out = TASKS["repo_clustering_kmeans"](spark, {"k": 2, "seed": 1, "max_iter": 20}, {"repos": small + big}, noop)
    groups = sorted(sorted(c["repo_ids"]) for c in out["clusters"])
    assert groups == [sorted(f"b{i}" for i in range(4)), sorted(f"s{i}" for i in range(4))]
    assert out["silhouette"] is not None and out["silhouette"] > 0.5
    with pytest.raises(TaskError):
        TASKS["repo_clustering_kmeans"](spark, {"k": 9}, {"repos": small}, noop)


def test_language_breakdown_matches_a_hand_count(spark):
    files = ([{"path": f"src/a{i}.py", "size": 100} for i in range(3)]
             + [{"path": "web/app.ts", "size": 400}, {"path": "web/app.css", "size": 100}]
             + [{"path": "Dockerfile", "size": 50}, {"path": "bin/tool", "size": 50}]
             + [{"path": f"pkg{i}/README.md", "size": 25} for i in range(2)])
    out = TASKS["language_breakdown"](spark, {"top_files": 3}, {"files": files}, noop)

    by = {l["language"]: l for l in out["languages"]}
    assert out["total_bytes"] == 950 and out["total_files"] == 9
    assert by["Python"]["bytes"] == 300 and by["Python"]["files"] == 3
    assert by["TypeScript"]["bytes"] == 400 and by["Dockerfile"]["bytes"] == 50
    assert by["Other"]["files"] == 1                      # bin/tool has no extension
    assert out["languages"][0]["language"] == "TypeScript"  # ordered by bytes, not file count
    assert abs(sum(l["share"] for l in out["languages"]) - 1.0) < 1e-9
    assert out["top_files"][0] == {"name": "readme.md", "count": 2, "share": 2 / 9}
    with pytest.raises(TaskError):
        TASKS["language_breakdown"](spark, {}, {"files": []}, noop)


def test_language_clustering_groups_repos_by_stack(spark):
    def tree(repo, names):
        return [{"repo_id": repo, "path": f"src/{i}{ext}", "size": 100} for i, ext in enumerate(names)]
    files = (tree("py1", [".py"] * 6) + tree("py2", [".py", ".py", ".ipynb"])
             + tree("nb1", [".ipynb"] * 5)
             + tree("js1", [".js"] * 4) + tree("js2", [".ts", ".tsx", ".js"])
             # assets and docs must not pull a repository into a cluster of its own
             + tree("js3", [".js", ".js", ".png", ".png", ".md", ".json"]))
    out = TASKS["language_clustering_kmeans"](spark, {"k": 2, "seed": 1, "max_iter": 20}, {"files": files}, noop)
    groups = sorted(sorted(c["repo_ids"]) for c in out["clusters"])
    assert groups == [["js1", "js2", "js3"], ["nb1", "py1", "py2"]]
    assert sorted(c["label"] for c in out["clusters"]) == ["JavaScript/TypeScript", "Python"]
    assert {r["repo_id"]: r["language"] for r in out["repos"]}["nb1"] == "Python"
    with pytest.raises(TaskError):
        TASKS["language_clustering_kmeans"](spark, {"k": 9}, {"files": files}, noop)
    with pytest.raises(TaskError):
        TASKS["language_clustering_kmeans"](spark, {}, {"files": []}, noop)
