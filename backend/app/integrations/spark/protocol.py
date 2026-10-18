"""Versioned JSON protocol between the API and a Spark worker (Colab), plus the allow-list of task types.

The worker only ever receives a task *name*, validated params and a bounded dataset. No code is ever sent.
"""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

PROTOCOL_VERSION = 1
TERMINAL = {"succeeded", "failed", "cancelled"}
OPEN = {"queued", "dispatched", "running"}

# ---------------------------------------------------------------- task allow-list


class _P(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ActivityParams(_P):
    group_by: Literal["author", "day", "hour"] = "author"


class TermsParams(_P):
    top_n: int = Field(20, ge=1, le=100)


class FileStatsParams(_P):
    top_n: int = Field(20, ge=1, le=100)


class KMeansParams(_P):
    k: int = Field(3, ge=2, le=10)
    max_iter: int = Field(20, ge=1, le=50)
    seed: int = Field(42, ge=0, le=2**31 - 1)


class LanguagesParams(_P):
    top_files: int = Field(10, ge=1, le=50)


class SurveyParams(_P):
    top_n: int = Field(12, ge=3, le=30)


# task_type -> (params model, dataset kind)
TASKS: dict[str, tuple[type[BaseModel], str]] = {
    "commit_activity_rdd": (ActivityParams, "commits"),       # map + reduceByKey (RDD)
    "message_terms_mapreduce": (TermsParams, "commits"),      # flatMap + map + reduceByKey (RDD)
    "file_stats_sql": (FileStatsParams, "commits"),           # DataFrame + Spark SQL
    "repo_clustering_kmeans": (KMeansParams, "repos"),        # MLlib KMeans
    "language_breakdown": (LanguagesParams, "files"),        # RDD map + reduceByKey over the tree
    "platform_survey": (SurveyParams, "survey"),             # RDD map + reduceByKey, every repository at once
}
# Scope is the whole platform, not a chosen set of repositories, and the result is aggregate only.
GLOBAL_TASKS = {"platform_survey"}
TaskType = Literal["commit_activity_rdd", "message_terms_mapreduce", "file_stats_sql",
                   "repo_clustering_kmeans", "language_breakdown", "platform_survey"]

# ---------------------------------------------------------------- messages


class _Msg(BaseModel):
    model_config = ConfigDict(extra="forbid")
    v: Literal[1] = PROTOCOL_VERSION


# worker -> server
class WorkerHello(_Msg):
    type: Literal["worker_hello"] = "worker_hello"
    worker_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    spark_version: str = Field("", max_length=32)
    python_version: str = Field("", max_length=32)
    tasks: list[str] = Field(default_factory=list, max_length=20)


class WorkerReady(_Msg):
    type: Literal["worker_ready"] = "worker_ready"


class JobStarted(_Msg):
    type: Literal["job_started"] = "job_started"
    job_id: str


class JobProgress(_Msg):
    type: Literal["job_progress"] = "job_progress"
    job_id: str
    percent: int = Field(ge=0, le=100)
    message: str = Field("", max_length=200)


class JobCompleted(_Msg):
    type: Literal["job_completed"] = "job_completed"
    job_id: str
    result: dict[str, Any]
    metrics: dict[str, Any] = Field(default_factory=dict)


class JobFailed(_Msg):
    type: Literal["job_failed"] = "job_failed"
    job_id: str
    error: str = Field(max_length=500)


class Heartbeat(_Msg):
    type: Literal["heartbeat"] = "heartbeat"


class WorkerShutdown(_Msg):
    type: Literal["worker_shutdown"] = "worker_shutdown"


WorkerMessage = Annotated[
    WorkerHello | WorkerReady | JobStarted | JobProgress | JobCompleted | JobFailed | Heartbeat | WorkerShutdown,
    Field(discriminator="type")]
worker_message_adapter: TypeAdapter = TypeAdapter(WorkerMessage)


# server -> worker (built as plain dicts; kept here so the contract lives in one place)
def hello_ack(heartbeat_interval_s: float) -> dict:
    return {"v": PROTOCOL_VERSION, "type": "hello_ack", "heartbeat_interval_s": heartbeat_interval_s}


def job_dispatch(job_id: str, task_type: str, params: dict, dataset: dict, max_seconds: int) -> dict:
    return {"v": PROTOCOL_VERSION, "type": "job_dispatch", "job_id": job_id, "task_type": task_type,
            "params": params, "dataset": dataset, "max_seconds": max_seconds}


def server_heartbeat() -> dict:
    return {"v": PROTOCOL_VERSION, "type": "heartbeat"}


def protocol_error(code: str) -> dict:
    return {"v": PROTOCOL_VERSION, "type": "error", "code": code}
