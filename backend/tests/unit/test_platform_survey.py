"""platform_survey without Spark, through the same RDD stand-in test_language_breakdown uses.

The survey is the one task whose dataset spans every user on the platform, so the test that matters
most is the negative one: nothing identifying may survive into the result.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "colab_worker"))
from tasks import TASKS, TaskError  # noqa: E402


class _RDD:
    def __init__(self, items):
        self.items = list(items)

    def map(self, f):
        return _RDD(map(f, self.items))

    def reduceByKey(self, f):
        acc = {}
        for k, v in self.items:
            acc[k] = f(acc[k], v) if k in acc else v
        return _RDD(acc.items())

    def collect(self):
        return list(self.items)


class _Spark:
    class sparkContext:  # noqa: N801 - mirrors the PySpark attribute name
        @staticmethod
        def parallelize(rows, slices=None):
            return _RDD(rows)


def noop(_pct, _text=""):
    pass


def run(dataset, **params):
    return TASKS["platform_survey"](_Spark(), params, dataset, noop)


DATASET = {
    "accounts": 3,
    "repos": [{"repo_id": "a", "visibility": "public"}, {"repo_id": "b", "visibility": "private"},
              {"repo_id": "c", "visibility": "public"}],
    "files": [{"path": "src/a.js"}, {"path": "src/b.js"}, {"path": "src/c.jsx"},
              {"path": "app.py"}, {"path": "logo.png"}, {"path": "readme.md"}],
    "messages": ["fix", "a slightly longer subject line here", "x" * 80,
                 "subject line\n\na body that must not be measured"],
}


def test_languages_are_counted_by_file_not_by_byte():
    out = run(DATASET)
    by = {g["label"]: g for g in out["languages"]}
    assert by["JavaScript"]["count"] == 3          # .js, .js, .jsx all one language
    assert by["JavaScript"]["share"] == 3 / 6
    assert by["Images"]["count"] == 1 and by["Python"]["count"] == 1


def test_visibility_splits_public_and_private():
    by = {g["label"]: g for g in run(DATASET)["visibility"]}
    assert by["public"]["count"] == 2 and by["private"]["count"] == 1
    assert abs(sum(g["share"] for g in run(DATASET)["visibility"]) - 1.0) < 1e-9


def test_message_length_measures_the_subject_not_the_body():
    by = {g["label"]: g for g in run(DATASET)["message_lengths"]}
    assert by["1-10 chars"]["count"] == 1          # "fix"
    assert by["26-50"]["count"] == 1               # the 35-char subject
    assert by["over 72"]["count"] == 1             # the 80-char one
    assert by["11-25"]["count"] == 1               # "subject line" - its body is not counted
    # every band is present even at zero, so the bar keeps a stable shape between runs
    assert [g["label"] for g in run(DATASET)["message_lengths"]] == \
           ["1-10 chars", "11-25", "26-50", "51-72", "over 72"]


def test_the_result_can_name_nobody():
    """Aggregate-only is the whole basis for counting private repositories at all."""
    out = run(DATASET)
    assert out["accounts"] == 3 and out["repos"] == 3
    flat = repr(out)
    for identifying in ("repo_id", "login", "user_id", '"a"', '"b"', '"c"'):
        assert identifying not in flat


def test_rarer_languages_fold_into_other():
    files = [{"path": f"f{i}.js"} for i in range(5)] + [{"path": "a.py"}, {"path": "b.go"}, {"path": "c.rs"}]
    by = {g["label"]: g for g in run({**DATASET, "files": files}, top_n=3)["languages"]}
    assert by["JavaScript"]["count"] == 5 and by["Other"]["count"] == 1
    assert len(by) == 4   # top 3 + Other


def test_a_platform_with_no_repositories_is_refused():
    with pytest.raises(TaskError):
        run({**DATASET, "repos": []})
