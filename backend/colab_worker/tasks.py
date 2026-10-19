"""Allow-listed Spark tasks. The backend sends only a task NAME + validated params + a bounded dataset;
nothing in this module executes code received over the wire.

Every Spark closure is a lambda/nested function defined inside the task (cloudpickle ships those by value),
so executors never need to import this file - important for Colab and Windows.
"""

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


# --------------------------------------------------------------------------- languages
# extension -> language, or -> asset category for the things a repository carries but isn't written in.
# Assets are named rather than lumped into "Other": measured in BYTES, a handful of PNGs or fonts
# outweighs every source file, and a bar that calls that 84% "Other" explains nothing. Anything still
# unrecognised - and every extensionless or dotfile - stays "Other", which is honest about the limit.
LANGUAGES = {
    ".py": "Python", ".ipynb": "Jupyter Notebook", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin", ".go": "Go", ".rs": "Rust",
    ".c": "C", ".h": "C", ".cpp": "C++", ".cc": "C++", ".cxx": "C++", ".hpp": "C++",
    ".cs": "C#", ".rb": "Ruby", ".php": "PHP", ".swift": "Swift", ".m": "Objective-C",
    ".scala": "Scala", ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell", ".ps1": "PowerShell",
    ".sql": "SQL", ".r": "R", ".lua": "Lua", ".dart": "Dart", ".ex": "Elixir", ".exs": "Elixir",
    ".pl": "Perl", ".hs": "Haskell", ".clj": "Clojure", ".erl": "Erlang", ".vue": "Vue",
    ".svelte": "Svelte", ".html": "HTML", ".htm": "HTML", ".css": "CSS", ".scss": "SCSS",
    ".sass": "SCSS", ".less": "Less", ".md": "Markdown", ".mdx": "Markdown", ".rst": "reStructuredText",
    ".json": "JSON", ".yaml": "YAML", ".yml": "YAML", ".toml": "TOML", ".xml": "XML",
    ".ini": "INI", ".cfg": "INI", ".tf": "Terraform", ".proto": "Protocol Buffers",
    ".dockerfile": "Dockerfile", ".gradle": "Gradle", ".cmake": "CMake", ".vim": "Vim Script",
    # --- more languages -------------------------------------------------
    ".psm1": "PowerShell", ".psd1": "PowerShell", ".bat": "Batch", ".cmd": "Batch",
    ".ksh": "Shell", ".csh": "Shell", ".mts": "TypeScript", ".cts": "TypeScript",
    ".fs": "F#", ".fsi": "F#", ".fsx": "F#", ".vb": "Visual Basic", ".jl": "Julia",
    ".ml": "OCaml", ".mli": "OCaml", ".elm": "Elm", ".nim": "Nim", ".cr": "Crystal",
    ".zig": "Zig", ".nix": "Nix", ".sol": "Solidity", ".groovy": "Groovy", ".rkt": "Racket",
    ".scm": "Scheme", ".lisp": "Lisp", ".el": "Emacs Lisp", ".tcl": "Tcl", ".awk": "Awk",
    ".asm": "Assembly", ".s": "Assembly", ".f90": "Fortran", ".f95": "Fortran", ".pas": "Pascal",
    ".mk": "Makefile", ".graphql": "GraphQL", ".gql": "GraphQL", ".prisma": "Prisma",
    ".astro": "Astro", ".styl": "Stylus", ".hbs": "Handlebars", ".ejs": "EJS", ".pug": "Pug",
    ".twig": "Twig", ".liquid": "Liquid", ".tex": "TeX", ".adoc": "AsciiDoc",
    ".jsonc": "JSON", ".json5": "JSON", ".tfvars": "Terraform", ".puml": "PlantUML",
    ".mermaid": "Mermaid", ".mmd": "Mermaid", ".dot": "Graphviz", ".http": "HTTP", ".rest": "HTTP",
    # --- assets: carried by the repository, not written in ---------------
    ".png": "Images", ".jpg": "Images", ".jpeg": "Images", ".gif": "Images", ".bmp": "Images",
    ".ico": "Images", ".webp": "Images", ".avif": "Images", ".tiff": "Images", ".tif": "Images",
    ".heic": "Images", ".psd": "Images", ".svg": "Images",
    ".woff": "Fonts", ".woff2": "Fonts", ".ttf": "Fonts", ".otf": "Fonts", ".eot": "Fonts",
    ".mp4": "Video", ".webm": "Video", ".mov": "Video", ".avi": "Video", ".mkv": "Video", ".m4v": "Video",
    ".mp3": "Audio", ".wav": "Audio", ".ogg": "Audio", ".flac": "Audio", ".m4a": "Audio", ".aac": "Audio",
    ".zip": "Archives", ".tar": "Archives", ".gz": "Archives", ".tgz": "Archives", ".bz2": "Archives",
    ".xz": "Archives", ".7z": "Archives", ".rar": "Archives", ".jar": "Archives", ".war": "Archives",
    ".pdf": "Documents", ".doc": "Documents", ".docx": "Documents", ".xls": "Documents",
    ".xlsx": "Documents", ".ppt": "Documents", ".pptx": "Documents", ".odt": "Documents", ".rtf": "Documents",
    ".csv": "Data", ".tsv": "Data", ".parquet": "Data", ".avro": "Data", ".orc": "Data",
    ".db": "Data", ".sqlite": "Data", ".sqlite3": "Data", ".npy": "Data", ".npz": "Data",
    ".feather": "Data", ".arrow": "Data", ".dta": "Data", ".sas7bdat": "Data",
    # trained models and serialised objects: the heavy, uncountable half of an ML repository
    ".pkl": "Models", ".pickle": "Models", ".joblib": "Models", ".h5": "Models", ".hdf5": "Models",
    ".onnx": "Models", ".pt": "Models", ".pth": "Models", ".pb": "Models", ".ckpt": "Models",
    ".safetensors": "Models", ".gguf": "Models", ".ggml": "Models", ".tflite": "Models",
    ".mlmodel": "Models", ".caffemodel": "Models", ".weights": "Models", ".pmml": "Models",
    ".sav": "Models", ".model": "Models", ".vec": "Models", ".bst": "Models",
    ".exe": "Binaries", ".dll": "Binaries", ".so": "Binaries", ".dylib": "Binaries", ".wasm": "Binaries",
    ".pyc": "Binaries", ".pyo": "Binaries", ".class": "Binaries", ".o": "Binaries", ".bin": "Binaries",
    ".txt": "Text", ".log": "Text",
    ".map": "Source maps", ".lock": "Lockfiles",
    ".example": "Config", ".properties": "Config", ".conf": "Config",
}
# named by filename rather than extension
FILENAME_LANGUAGES = {"dockerfile": "Dockerfile", "makefile": "Makefile", "cmakelists.txt": "CMake",
                      "rakefile": "Ruby", "gemfile": "Ruby", "vagrantfile": "Ruby"}


def _classifier():
    """A path -> language function, built fresh so cloudpickle ships it BY VALUE.

    A module-level function would be pickled by reference and executors would have to import this
    file - the one thing the module docstring forbids. A closure returned from here is anonymous to
    the pickler, so the lookup tables travel with it.
    """
    langs, by_name = LANGUAGES, FILENAME_LANGUAGES

    def classify(path):
        name = path.rsplit("/", 1)[-1].lower()
        if name in by_name:
            return by_name[name]
        dot = name.rfind(".")
        return langs.get(name[dot:], "Other") if dot > 0 else "Other"

    return classify


def language_breakdown(spark, params, dataset, progress) -> dict:
    """map -> reduceByKey over the file tree: bytes and file counts per language, plus common filenames."""
    rows = dataset.get("files") or []
    if not rows:
        raise TaskError("dataset has no files")
    top_files = int(params.get("top_files", 10))
    classify = _classifier()
    progress(10, "parallelize")
    rdd = spark.sparkContext.parallelize(rows, _slices(len(rows))).cache()
    progress(35, "reduceByKey (languages)")
    totals = (rdd.map(lambda f: (classify(f["path"]), (int(f["size"]), 1)))
              .reduceByKey(lambda a, b: (a[0] + b[0], a[1] + b[1])).collect())
    total_bytes = sum(v[0] for _, v in totals)
    total_files = sum(v[1] for _, v in totals)
    languages = sorted(({"language": k, "bytes": v[0], "files": v[1], "share": v[0] / (total_bytes or 1)}
                        for k, v in totals), key=lambda d: -d["bytes"])

    progress(70, "reduceByKey (filenames)")
    names = (rdd.map(lambda f: (f["path"].rsplit("/", 1)[-1].lower(), 1))
             .reduceByKey(lambda a, b: a + b)
             .takeOrdered(top_files, key=lambda kv: (-kv[1], kv[0])))
    return {"total_bytes": total_bytes, "total_files": total_files,
            "repos": len({f.get("repo_id") for f in rows}),
            "languages": languages,
            "top_files": [{"name": k, "count": c, "share": c / (total_files or 1)} for k, c in names]}


# --------------------------------------------------------------------------- language clustering
# Languages that belong to one stack. Clustering on raw per-language shares would put a notebook
# repository as far from a .py one as from a .js one - every one-hot share vector is equidistant -
# so a repository's features are shares per FAMILY, and .py + .ipynb land in the same column.
FAMILIES = {
    "Python": ("Python", "Jupyter Notebook"),
    "JavaScript/TypeScript": ("JavaScript", "TypeScript", "Vue", "Svelte", "Astro"),
    "JVM": ("Java", "Kotlin", "Scala", "Groovy", "Clojure"),
    "C/C++": ("C", "C++", "Objective-C", "Assembly"),
    ".NET": ("C#", "F#", "Visual Basic"),
    "Shell": ("Shell", "PowerShell", "Batch", "Awk", "Makefile", "CMake", "Gradle"),
    "Web markup": ("HTML", "CSS", "SCSS", "Less", "Stylus", "Handlebars", "EJS", "Pug", "Twig", "Liquid"),
    "Lisp": ("Lisp", "Scheme", "Racket", "Emacs Lisp"),
    "Functional ML": ("OCaml", "Haskell", "Elm", "Erlang", "Elixir"),
}
# What a repository CARRIES rather than is written in. Counting these would cluster by asset mix:
# two unrelated repositories that both ship a lot of PNGs are not the same stack.
NOT_CODE = {"Images", "Fonts", "Video", "Audio", "Archives", "Documents", "Data", "Models",
            "Binaries", "Text", "Source maps", "Lockfiles", "Config", "JSON", "YAML", "TOML",
            "XML", "INI", "Markdown", "reStructuredText", "AsciiDoc", "TeX", "Other",
            "PlantUML", "Mermaid", "Graphviz", "HTTP", "Vim Script"}


def _family():
    """language -> family, or None for anything that isn't source. Closure so cloudpickle ships the
    tables by value (same reason as _classifier)."""
    by_lang = {lang: fam for fam, langs in FAMILIES.items() for lang in langs}
    not_code = NOT_CODE

    def family(language):
        return None if language in not_code else by_lang.get(language, language)

    return family


def language_clustering_kmeans(spark, params: dict, dataset: dict, progress: Progress) -> dict:
    """K-Means over each repository's language mix: repositories written in the same stack group up.

    Features are the shares of a repository's source files per language family - unscaled, because a
    share is already a 0-1 fraction and standardising would blow a rare language up to the weight of
    the one the repository is actually written in.
    """
    from pyspark.ml.clustering import KMeans
    from pyspark.ml.evaluation import ClusteringEvaluator
    from pyspark.ml.feature import VectorAssembler
    from pyspark.sql import functions as F
    rows = dataset.get("files") or []
    if not rows:
        raise TaskError("dataset has no files")
    k = int(params.get("k", 3))
    classify, family = _classifier(), _family()
    progress(10, "map -> reduceByKey (languages per repository)")
    counted = (spark.sparkContext.parallelize(rows, _slices(len(rows)))
               .map(lambda f: ((f.get("repo_id"), family(classify(f["path"]))), 1))
               .filter(lambda kv: kv[0][1] is not None)
               .reduceByKey(lambda a, b: a + b).collect())
    per_repo: dict[str, dict[str, int]] = {}
    for (repo_id, fam), c in counted:
        per_repo.setdefault(repo_id, {})[fam] = c
    if len(per_repo) < k:
        raise TaskError("need at least k repositories with recognised source files")

    langs = sorted({f for d in per_repo.values() for f in d})
    dominant = {rid: min(d, key=lambda f: (-d[f], f)) for rid, d in per_repo.items()}
    progress(40, "kmeans")
    feature_rows = [(rid, dominant[rid], *[d.get(f, 0) / sum(d.values()) for f in langs])
                    for rid, d in per_repo.items()]
    df = spark.createDataFrame(feature_rows, ["repo_id", "dominant", *langs])
    feats = VectorAssembler(inputCols=langs, outputCol="features").transform(df)
    model = KMeans(k=k, seed=int(params.get("seed", 42)), maxIter=int(params.get("max_iter", 20)),
                   featuresCol="features").fit(feats)
    pred = model.transform(feats)
    silhouette = None
    try:
        silhouette = float(ClusteringEvaluator(featuresCol="features").evaluate(pred))
    except Exception:  # needs >= 2 non-empty clusters
        pass

    progress(80, "summarise")
    # the table shows the families that actually carry the dataset; the rest would be columns of 0.0
    shown = sorted(langs, key=lambda f: -sum(d.get(f, 0) for d in per_repo.values()))[:6]
    summary = (pred.groupBy("prediction").agg(F.count("*").alias("size"), *[F.avg(c).alias(c) for c in langs])
               .orderBy("prediction").collect())
    members: dict[int, list[str]] = {}
    for r in pred.select("repo_id", "prediction").collect():
        members.setdefault(int(r["prediction"]), []).append(r["repo_id"])
    clusters = []
    for s in summary:
        cid = int(s["prediction"])
        ids = members[cid]
        tally = {}
        for rid in ids:
            tally[dominant[rid]] = tally.get(dominant[rid], 0) + 1
        clusters.append({"cluster": cid, "size": int(s["size"]),
                         "label": min(tally, key=lambda f: (-tally[f], f)),
                         "repo_ids": ids,
                         "mean": {f: round(float(s[f]) * 100, 1) for f in shown}})
    return {"k": k, "silhouette": silhouette, "training_cost": float(model.summary.trainingCost),
            "languages": shown, "clusters": clusters,
            "repos": [{"repo_id": rid, "language": dominant[rid],
                       "share": per_repo[rid][dominant[rid]] / sum(per_repo[rid].values())}
                      for rid in sorted(per_repo, key=lambda r: dominant[r])]}


# --------------------------------------------------------------------------- platform survey
# Message-length bands. Ordinal, so they keep this order in the result rather than sorting by size.
_BANDS = [(10, "1-10 chars"), (25, "11-25"), (50, "26-50"), (72, "51-72"), (10 ** 9, "over 72")]


def platform_survey(spark, params, dataset, progress) -> dict:
    """The heavy one: three reduceByKey passes over every repository on the platform at once.

    Aggregate only. The dataset carries no user, login or repository name, so nothing here can
    attribute a count to a person - which is what lets a private repository be counted without its
    existence being disclosed.
    """
    repos = dataset.get("repos") or []
    files = dataset.get("files") or []
    messages = dataset.get("messages") or []
    if not repos:
        raise TaskError("no repositories to survey")
    top_n = int(params.get("top_n", 12))
    classify = _classifier()
    bands = _BANDS
    sc = spark.sparkContext

    def shares(pairs):
        total = sum(c for _, c in pairs) or 1
        return [{"label": k, "count": c, "share": c / total} for k, c in pairs]

    progress(10, "languages: map -> reduceByKey")
    langs = (sc.parallelize(files, _slices(len(files)))
             .map(lambda f: (classify(f["path"]), 1))
             .reduceByKey(lambda a, b: a + b).collect()) if files else []
    ranked = sorted(langs, key=lambda kv: (-kv[1], kv[0]))
    head, tail = ranked[:top_n], ranked[top_n:]
    if tail:
        head.append(("Other", sum(c for _, c in tail)))

    progress(45, "visibility: map -> reduceByKey")
    vis = (sc.parallelize(repos, _slices(len(repos)))
           .map(lambda r: (r["visibility"], 1))
           .reduceByKey(lambda a, b: a + b).collect())

    progress(75, "commit subjects: map -> reduceByKey")
    # the subject line is the one git conventions measure; a body would swamp the distribution
    counted = (sc.parallelize(messages, _slices(len(messages)))
               .map(lambda m: (next(label for limit, label in bands
                                    if len((m.splitlines() or [""])[0]) <= limit), 1))
               .reduceByKey(lambda a, b: a + b).collect()) if messages else []
    by_band = dict(counted)

    return {"accounts": int(dataset.get("accounts") or 0),
            "repos": len(repos), "files": len(files), "commits": len(messages),
            "languages": shares(head),
            "visibility": shares(sorted(vis, key=lambda kv: (-kv[1], kv[0]))),
            "message_lengths": shares([(label, by_band.get(label, 0)) for _, label in bands])}


TASKS: dict[str, Callable] = {
    "commit_activity_rdd": commit_activity_rdd,
    "message_terms_mapreduce": message_terms_mapreduce,
    "file_stats_sql": file_stats_sql,
    "repo_clustering_kmeans": repo_clustering_kmeans,
    "language_breakdown": language_breakdown,
    "language_clustering_kmeans": language_clustering_kmeans,
    "platform_survey": platform_survey,
}
