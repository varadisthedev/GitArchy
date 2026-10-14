"""Allow-listed Spark tasks. The backend sends only a task NAME + validated params + a bounded dataset;
nothing in this module executes code received over the wire.

Every Spark closure is a lambda/nested function defined inside the task (cloudpickle ships those by value),
so executors never need to import this file - important for Colab and Windows.
"""
import math
import re
from typing import Callable

Progress = Callable[[int, str], None]


class TaskError(Exception):
    """User-facing failure (bad data shape etc.); message is sent to the backend."""


def _commits(dataset: dict) -> list[dict]:
    rows = dataset.get("commits") or []
    if not rows:
        raise TaskError("dataset has no commits")
    return rows


def _slices(n: int) -> int:
    return max(1, min(8, n // 500 + 1))


# --------------------------------------------------------------------------- RDD / MapReduce
def commit_activity_rdd(spark, params: dict, dataset: dict, progress: Progress) -> dict:
    """map -> reduceByKey: commits / additions / deletions grouped by author, day or hour."""
    rows = _commits(dataset)
    mode = params.get("group_by", "author")
    if mode not in ("author", "day", "hour"):
        raise TaskError("bad group_by")
    progress(10, "parallelize")
    rdd = spark.sparkContext.parallelize(rows, _slices(len(rows)))
    keyed = rdd.map(lambda r: (
        r["author"] if mode == "author" else r["date"][:10] if mode == "day" else r["date"][11:13],
        (1, r["additions"], r["deletions"])))
    progress(40, "reduceByKey")
    totals = keyed.reduceByKey(lambda a, b: (a[0] + b[0], a[1] + b[1], a[2] + b[2])).collect()
    out = sorted(({"key": k, "commits": v[0], "additions": v[1], "deletions": v[2]} for k, v in totals),
                 key=lambda d: (-d["commits"], d["key"]))
    return {"group_by": mode, "groups": out[:200], "total_commits": len(rows)}


_STOP = {"the", "and", "for", "with", "this", "that", "from", "into", "add", "update", "not", "are", "was", "use"}


def message_terms_mapreduce(spark, params: dict, dataset: dict, progress: Progress) -> dict:
    """Classic word count: flatMap -> map -> reduceByKey -> top-N."""
    rows = _commits(dataset)
    top_n = int(params.get("top_n", 20))
    stop = _STOP
    progress(10, "parallelize")
    rdd = spark.sparkContext.parallelize([r["message"] for r in rows], _slices(len(rows)))
    words = rdd.flatMap(lambda m: re.findall(r"[a-z][a-z0-9_]{2,}", m.lower())).filter(lambda w: w not in stop)
    progress(40, "reduceByKey")
    counts = words.map(lambda w: (w, 1)).reduceByKey(lambda a, b: a + b)
    top = counts.takeOrdered(top_n, key=lambda kv: (-kv[1], kv[0]))
    return {"top_terms": [{"term": w, "count": c} for w, c in top], "messages": len(rows)}


# --------------------------------------------------------------------------- Spark SQL / DataFrame
def file_stats_sql(spark, params: dict, dataset: dict, progress: Progress) -> dict:
    """DataFrame + Spark SQL: file-type churn per extension and per-repository totals."""
    rows = _commits(dataset)
    top_n = int(params.get("top_n", 20))
    progress(10, "build DataFrames")
    flat = [(e, n, r["sha"]) for r in rows for e, n in r["extensions"].items()]
    if not flat:
        raise TaskError("no file changes in dataset")
    ext_df = spark.createDataFrame(flat, ["ext", "files", "sha"])
    ext_df.createOrReplaceTempView("file_changes")
    progress(40, "spark sql")
    by_ext = spark.sql(
        "SELECT ext, SUM(files) AS files, COUNT(DISTINCT sha) AS commits FROM file_changes "
        f"GROUP BY ext ORDER BY files DESC, ext ASC LIMIT {top_n}").collect()
    progress(70, "dataframe agg")
    from pyspark.sql import functions as F
    commits_df = spark.createDataFrame([(r["repo_id"], r["additions"], r["deletions"], r["files_changed"])
                                        for r in rows], ["repo", "additions", "deletions", "files_changed"])
    per_repo = (commits_df.groupBy("repo").agg(F.count("*").alias("commits"), F.sum("additions").alias("additions"),
                                               F.sum("deletions").alias("deletions"),
                                               F.avg("files_changed").alias("avg_files_per_commit"))
                .orderBy(F.desc("commits"), "repo").collect())
    return {"by_extension": [{"ext": r["ext"], "files": int(r["files"]), "commits": int(r["commits"])} for r in by_ext],
            "by_repo": [{"repo_id": r["repo"], "commits": int(r["commits"]), "additions": int(r["additions"]),
                         "deletions": int(r["deletions"]), "avg_files_per_commit": round(float(r["avg_files_per_commit"]), 2)}
                        for r in per_repo]}


# --------------------------------------------------------------------------- MLlib
def repo_clustering_kmeans(spark, params: dict, dataset: dict, progress: Progress) -> dict:
    """K-Means over per-repository activity features (scaled)."""
    from pyspark.ml.clustering import KMeans
    from pyspark.ml.evaluation import ClusteringEvaluator
    from pyspark.ml.feature import StandardScaler, VectorAssembler
    from pyspark.sql import functions as F
    repos = dataset.get("repos") or []
    k = int(params.get("k", 3))
    if len(repos) < k:
        raise TaskError("need at least k repositories")
    cols = ["commits", "additions", "deletions", "files_changed", "authors"]
    progress(10, "features")
    df = spark.createDataFrame([(r["repo_id"], *[float(r[c]) for c in cols]) for r in repos], ["repo_id", *cols])
    feats = VectorAssembler(inputCols=cols, outputCol="raw").transform(df)
    scaled = StandardScaler(inputCol="raw", outputCol="features", withMean=True, withStd=True).fit(feats).transform(feats)
    progress(40, "kmeans")
    model = KMeans(k=k, seed=int(params.get("seed", 42)), maxIter=int(params.get("max_iter", 20)),
                   featuresCol="features").fit(scaled)
    pred = model.transform(scaled)
    silhouette = None
    try:
        silhouette = float(ClusteringEvaluator(featuresCol="features").evaluate(pred))
    except Exception:  # needs >= 2 non-empty clusters
        pass
    progress(80, "summarise")
    summary = pred.groupBy("prediction").agg(F.count("*").alias("size"), *[F.avg(c).alias(c) for c in cols]).orderBy("prediction").collect()
    members: dict[int, list[str]] = {}
    for r in pred.select("repo_id", "prediction").collect():
        members.setdefault(int(r["prediction"]), []).append(r["repo_id"])
    return {"k": k, "silhouette": silhouette, "training_cost": float(model.summary.trainingCost),
            "clusters": [{"cluster": int(s["prediction"]), "size": int(s["size"]), "repo_ids": members[int(s["prediction"])],
                          "mean": {c: round(float(s[c]), 2) for c in cols}} for s in summary]}


_FIX = re.compile(r"\b(fix|fixes|fixed|bug|patch|hotfix)\b")


def commit_classification_logreg(spark, params: dict, dataset: dict, progress: Progress) -> dict:
    """Logistic Regression: predict whether a commit is a bug-fix (by message) from its size features."""
    from pyspark.ml.classification import LogisticRegression
    from pyspark.ml.evaluation import BinaryClassificationEvaluator, MulticlassClassificationEvaluator
    from pyspark.ml.feature import StandardScaler, VectorAssembler
    rows = _commits(dataset)
    if len(rows) < 20:
        raise TaskError("need at least 20 commits")
    frac = float(params.get("train_fraction", 0.7))
    pattern = _FIX
    progress(10, "features")
    data = [(1.0 if pattern.search(r["message"].lower()) else 0.0, float(r["additions"]), float(r["deletions"]),
             float(r["files_changed"]), float(len(r["message"])), math.log1p(r["additions"] + r["deletions"]))
            for r in rows]
    positives = sum(d[0] for d in data)
    if positives == 0 or positives == len(data):
        raise TaskError("only one class present (no variation between fix / non-fix commits)")
    cols = ["additions", "deletions", "files_changed", "msg_len", "log_churn"]
    df = spark.createDataFrame(data, ["label", *cols])
    feats = VectorAssembler(inputCols=cols, outputCol="raw").transform(df)
    scaled = StandardScaler(inputCol="raw", outputCol="features").fit(feats).transform(feats)
    train, test = scaled.randomSplit([frac, 1 - frac], seed=int(params.get("seed", 42)))
    progress(50, "train")
    model = LogisticRegression(maxIter=50, featuresCol="features", labelCol="label").fit(train)
    pred = model.transform(test)
    n_test = pred.count()
    acc = MulticlassClassificationEvaluator(labelCol="label", metricName="accuracy").evaluate(pred) if n_test else None
    auc = None
    try:
        auc = float(BinaryClassificationEvaluator(labelCol="label").evaluate(pred))
    except Exception:
        pass
    return {"label": "fix_commit", "n_train": train.count(), "n_test": n_test, "positive_rate": round(positives / len(data), 4),
            "accuracy": acc, "auc": auc, "features": cols,
            "coefficients": [round(float(c), 4) for c in model.coefficients], "intercept": round(float(model.intercept), 4)}


TASKS: dict[str, Callable] = {
    "commit_activity_rdd": commit_activity_rdd,
    "message_terms_mapreduce": message_terms_mapreduce,
    "file_stats_sql": file_stats_sql,
    "repo_clustering_kmeans": repo_clustering_kmeans,
    "commit_classification_logreg": commit_classification_logreg,
}
