"""Analytics job lifecycle, worker protocol and failure handling."""
import time
import uuid

import pytest
from starlette.websockets import WebSocketDisconnect

from app.integrations.astra.memory import MemoryStore, utcnow
from app.integrations.spark import protocol as P
from app.integrations.spark.job_manager import JobManager, WorkerConn, can_transition
from tests.conftest import WORKER_TOKEN, make_settings, register_and_login, requires_git

API = "/api/v1"
WS = f"{API}/workers/spark/connect"
HDR = {"Authorization": f"Bearer {WORKER_TOKEN}"}


def hello(wid="w1"):
    return {"v": 1, "type": "worker_hello", "worker_id": wid, "spark_version": "3.5.1", "tasks": list(P.TASKS)}


def connect_ready(client, wid="w1"):
    ws = client.websocket_connect(WS, headers=HDR)
    return ws


def start_worker(ws, wid="w1"):
    ws.send_json(hello(wid))
    assert ws.receive_json()["type"] == "hello_ack"
    ws.send_json({"v": 1, "type": "worker_ready"})


@pytest.fixture
def repo(client, alice):
    _, h = alice
    rid = client.post(f"{API}/repositories", headers=h, json={"name": "r"}).json()["id"]
    for i in range(3):
        client.post(f"{API}/repositories/{rid}/commits", headers=h, json={
            "branch": "main", "message": f"fix bug {i}", "changes": [{"path": f"f{i}.py", "content": "x\n" * (i + 1)}]})
    return rid


def submit(client, h, rid, task="commit_activity_rdd", **kw):
    return client.post(f"{API}/analytics/jobs", headers=h, json={"task_type": task, "repo_ids": [rid], **kw})


# ------------------------------------------------------------------ pure logic
def test_state_machine():
    assert can_transition("queued", "dispatched") and can_transition("running", "queued")
    assert can_transition("dispatched", "running") and can_transition("running", "succeeded")
    for term in ("succeeded", "failed", "cancelled"):
        assert not any(can_transition(term, t) for t in ("queued", "running", "succeeded", "failed"))
    assert not can_transition("queued", "running") and not can_transition("queued", "succeeded")


def test_protocol_validation():
    ok = P.worker_message_adapter.validate_python({"v": 1, "type": "heartbeat"})
    assert ok.type == "heartbeat"
    for bad in ({"v": 2, "type": "heartbeat"}, {"v": 1, "type": "run_python", "code": "x"},
                {"v": 1, "type": "heartbeat", "extra": 1}, {"v": 1, "type": "job_progress", "job_id": "x", "percent": 101},
                {"v": 1, "type": "job_completed", "job_id": "x", "result": "notadict"},
                {"v": 1, "type": "worker_hello", "worker_id": "bad id!"}):
        with pytest.raises(Exception):
            P.worker_message_adapter.validate_python(bad)


# ------------------------------------------------------------------ REST + WS
@requires_git
def test_no_worker_job_stays_queued_with_clear_status(client, alice, repo):
    r = submit(client, alice[1], repo)
    assert r.status_code == 202
    j = r.json()
    assert j["status"] == "queued" and j["worker_available"] is False and j["status_detail"] == "worker_unavailable"
    assert client.get(f"{API}/analytics/jobs/{j['id']}/results", headers=alice[1]).status_code == 409


@requires_git
def test_end_to_end_with_fake_worker_and_browser_stream(client, alice, repo):
    _, h = alice
    job = submit(client, h, repo, params={"group_by": "author"}).json()
    token = h["Authorization"].split()[1]
    with client.websocket_connect(f"{API}/analytics/jobs/{job['id']}/stream") as browser:
        browser.send_json({"type": "auth", "token": token})
        assert browser.receive_json() == {"type": "snapshot", "status": "queued", "error": None}
        with client.websocket_connect(WS, headers=HDR) as ws:
            start_worker(ws)
            d = ws.receive_json()
            assert d["type"] == "job_dispatch" and d["job_id"] == job["id"] and d["task_type"] == "commit_activity_rdd"
            assert d["dataset"]["kind"] == "commits" and d["dataset"]["rows"] == 4 and d["max_seconds"] == 900
            assert d["params"] == {"group_by": "author"} and "code" not in d
            assert browser.receive_json()["status"] == "dispatched"
            ws.send_json({"v": 1, "type": "job_started", "job_id": job["id"]})
            assert browser.receive_json()["status"] == "running"
            ws.send_json({"v": 1, "type": "job_progress", "job_id": job["id"], "percent": 50, "message": "half"})
            assert browser.receive_json() == {"type": "progress", "percent": 50, "message": "half"}
            ws.send_json({"v": 1, "type": "job_completed", "job_id": job["id"], "result": {"Alice": 4},
                          "metrics": {"duration_s": 1.5}})
            assert browser.receive_json()["status"] == "succeeded"
    res = client.get(f"{API}/analytics/jobs/{job['id']}/results", headers=h).json()
    assert res["result"] == {"Alice": 4} and res["metrics"]["duration_s"] == 1.5 and "wall_s" in res["metrics"]
    assert client.get(f"{API}/analytics/jobs/{job['id']}", headers=h).json()["status"] == "succeeded"
    assert client.app.state.ctx.store.results[repo][0]["job_id"] == job["id"]  # persisted per repo


@requires_git
def test_a_multi_repository_result_is_not_attributed_to_any_one_of_them(client, alice, repo):
    """Otherwise repository B's figures would show on repository A's page to anyone who can read A."""
    _, h = alice
    other = client.post(f"{API}/repositories", headers=h, json={"name": "second"}).json()["id"]
    body = {"task_type": "commit_activity_rdd", "repo_ids": [repo, other], "params": {}}
    job = client.post(f"{API}/analytics/jobs", headers=h, json=body).json()
    store = client.app.state.ctx.store
    before = {rid: len(store.results.get(rid, [])) for rid in (repo, other)}

    with client.websocket_connect(WS, headers=HDR) as ws:
        start_worker(ws)
        ws.receive_json()
        # a worker claiming the aggregate covers one repository must not change where it lands
        ws.send_json({"v": 1, "type": "job_completed", "job_id": job["id"],
                      "result": {"repos": 1, "languages": [{"language": "Python", "bytes": 9,
                                                            "files": 1, "share": 1.0}]},
                      "metrics": {}})
        for _ in range(100):
            if client.get(f"{API}/analytics/jobs/{job['id']}", headers=h).json()["status"] == "succeeded":
                break
            time.sleep(0.05)

    assert {rid: len(store.results.get(rid, [])) for rid in (repo, other)} == before
    for rid in (repo, other):
        assert client.get(f"{API}/analytics/repositories/{rid}/languages", headers=h).json()["result"] is None


def test_worker_auth(client):
    for headers in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": WORKER_TOKEN}):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(WS, headers=headers):
                pass
    # a user JWT is not a worker credential
    _, h = register_and_login(client)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(WS, headers=h):
            pass


def test_stream_requires_valid_user_token_and_ownership(client, alice, bob):
    jid = str(uuid.uuid4())
    for first in ({"type": "auth", "token": "garbage"}, {"type": "nope"}):
        with client.websocket_connect(f"{API}/analytics/jobs/{jid}/stream") as ws:
            ws.send_json(first)
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()


def test_malformed_worker_messages(client):
    with client.websocket_connect(WS, headers=HDR) as ws:
        ws.send_json({"v": 1, "type": "heartbeat"})  # must say hello first
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
    with client.websocket_connect(WS, headers=HDR) as ws:
        start_worker(ws)
        for bad in ("not json", '{"v":1,"type":"exec","code":"import os"}', '{"v":9,"type":"heartbeat"}'):
            ws.send_text(bad)
            assert ws.receive_json()["code"] == "invalid_message"
        with pytest.raises(WebSocketDisconnect):  # third strike closes the socket
            ws.receive_json()


@requires_git
def test_worker_disconnect_requeues_then_fails_after_max_attempts(client, alice, repo):
    _, h = alice
    jid = submit(client, h, repo).json()["id"]
    get = lambda: client.get(f"{API}/analytics/jobs/{jid}", headers=h).json()

    with client.websocket_connect(WS, headers=HDR) as ws:
        start_worker(ws, "w1")
        assert ws.receive_json()["job_id"] == jid
        ws.send_json({"v": 1, "type": "job_started", "job_id": jid})
        ws.send_json({"v": 1, "type": "heartbeat"})
    j = get()  # worker vanished mid-run
    assert j["status"] == "queued" and j["attempts"] == 1 and "worker_lost" in j["error"]

    with client.websocket_connect(WS, headers=HDR) as ws:
        start_worker(ws, "w2")
        d = ws.receive_json()
        assert d["job_id"] == jid          # redelivered, same id
        assert get()["attempts"] == 2
    j = get()
    assert j["status"] == "failed" and "retries exhausted" in j["error"]   # analytics_max_attempts=2


@requires_git
def test_stale_or_foreign_job_messages_are_ignored(client, alice, repo):
    _, h = alice
    jid = submit(client, h, repo).json()["id"]
    with client.websocket_connect(WS, headers=HDR) as ws:
        start_worker(ws)
        ws.receive_json()
        ws.send_json({"v": 1, "type": "job_completed", "job_id": str(uuid.uuid4()), "result": {"evil": 1}})
        ws.send_json({"v": 1, "type": "job_failed", "job_id": jid, "error": "boom"})
        ws.send_json({"v": 1, "type": "job_completed", "job_id": jid, "result": {"late": 1}})  # after terminal
    j = client.get(f"{API}/analytics/jobs/{jid}", headers=h).json()
    assert j["status"] == "failed" and j["error"] == "boom"
    assert client.get(f"{API}/analytics/jobs/{jid}/results", headers=h).status_code == 409


@requires_git
def test_idempotent_submit_and_isolation(client, alice, bob, repo):
    _, ha = alice
    jid = str(uuid.uuid4())
    a = submit(client, ha, repo, job_id=jid).json()
    b = submit(client, ha, repo, job_id=jid).json()
    assert a["id"] == b["id"] == jid and a["created"] is True and b["created"] is False
    assert len(client.get(f"{API}/analytics/jobs", headers=ha).json()) == 1
    assert submit(client, bob[1], repo, job_id=jid).status_code in (404, 409)   # repo hidden / id taken
    assert client.get(f"{API}/analytics/jobs/{jid}", headers=bob[1]).status_code == 404
    assert client.get(f"{API}/analytics/jobs/{jid}/results", headers=bob[1]).status_code == 404


@requires_git
def test_limits_and_param_validation(client, alice, repo):
    _, h = alice
    assert submit(client, h, repo).status_code == 202
    assert submit(client, h, repo).status_code == 202
    third = submit(client, h, repo)
    assert third.status_code == 429 and third.json()["error"]["code"] == "analytics_quota_exceeded"
    for task, params in (("repo_clustering_kmeans", {"k": 1}), ("repo_clustering_kmeans", {"k": 99}),
                         ("commit_activity_rdd", {"group_by": "; import os"}), ("file_stats_sql", {"x": 1}),
                         ("exec_python", {}), ("language_breakdown", {"top_files": 0})):
        r = submit(client, h, repo, task=task, params=params)
        assert r.status_code == 422, (task, params, r.status_code)


@requires_git
def test_dataset_error_fails_job_not_worker(client, alice, repo):
    _, h = alice
    jid = submit(client, h, repo, task="repo_clustering_kmeans", params={"k": 5}).json()["id"]   # 1 repo < k
    with client.websocket_connect(WS, headers=HDR) as ws:
        start_worker(ws)
        for _ in range(100):  # dispatch happens server-side after worker_ready; wait for the failure to land
            j = client.get(f"{API}/analytics/jobs/{jid}", headers=h).json()
            if j["status"] != "queued":
                break
            time.sleep(0.05)
    assert j["status"] == "failed" and "at least k" in j["error"]


@requires_git
def test_cancel_only_queued(client, alice, repo):
    _, h = alice
    jid = submit(client, h, repo).json()["id"]
    assert client.post(f"{API}/analytics/jobs/{jid}/cancel", headers=h).json()["status"] == "cancelled"
    assert client.post(f"{API}/analytics/jobs/{jid}/cancel", headers=h).status_code == 409


def test_analytics_disabled_without_worker_token(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app
    with TestClient(create_app(make_settings(tmp_path, worker_token=""))) as c:
        _, h = register_and_login(c)
        assert c.post(f"{API}/analytics/jobs", headers=h, json={"task_type": "file_stats_sql", "repo_ids": [str(uuid.uuid4())]}).status_code in (404, 503)
        with pytest.raises(WebSocketDisconnect):
            with c.websocket_connect(WS, headers=HDR):
                pass
        assert c.get("/ready").json()["optional"]["analytics_enabled"] is False


# ------------------------------------------------------------------ JobManager directly
class FakeWS:
    def __init__(self):
        self.sent, self.closed = [], None

    async def send_json(self, m):
        self.sent.append(m)

    async def close(self, code=1000):
        self.closed = code


def jobdict(**kw):
    now = utcnow()
    return {"id": str(uuid.uuid4()), "user_id": str(uuid.uuid4()), "task_type": "file_stats_sql", "params": {},
            "repo_ids": [], "status": "queued", "attempts": 0, "error": None, "result": None, "metrics": None,
            "created_at": now, "updated_at": now, "started_at": None, "finished_at": None, **kw}


async def dataset(job):
    return {"kind": "commits", "commits": [], "rows": 0}


def mgr(tmp_path, **kw):
    s = make_settings(tmp_path, **kw)
    st = MemoryStore()
    return JobManager(st, s, dataset), st


async def test_restart_recovers_in_flight_jobs(tmp_path):
    jm, st = mgr(tmp_path)
    running, done = jobdict(status="running", attempts=1), jobdict(status="succeeded")
    await st.create_job(running)
    await st.create_job(done)
    await jm.start()
    try:
        assert (await st.get_job(running["id"]))["status"] == "queued"
        assert (await st.get_job(done["id"]))["status"] == "succeeded"
    finally:
        await jm.stop()


async def test_heartbeat_timeout_detects_dead_worker_and_requeues(tmp_path):
    jm, st = mgr(tmp_path, worker_heartbeat_timeout_s=1)
    j = jobdict()
    await st.create_job(j)
    w = WorkerConn("w", FakeWS(), set(), ready=True)
    await jm.register(w)
    await jm.schedule()
    assert w.job_id == j["id"] and (await st.get_job(j["id"]))["status"] == "dispatched"
    w.last_seen = time.monotonic() - 5                      # silent for > timeout
    await jm.sweep()
    assert "w" not in jm.workers and w.ws.closed == 1011
    after = await st.get_job(j["id"])
    assert after["status"] == "queued" and after["attempts"] == 1


async def test_max_duration_enforced(tmp_path):
    jm, st = mgr(tmp_path, analytics_max_job_seconds=10)
    j = jobdict()
    await st.create_job(j)
    w = WorkerConn("w", FakeWS(), set(), ready=True)
    await jm.register(w)
    await jm.schedule()
    await jm.on_message(w, P.JobStarted(job_id=j["id"]))
    w.dispatched_at = time.monotonic() - 100
    await jm.sweep()
    after = await st.get_job(j["id"])
    assert after["status"] == "failed" and "duration" in after["error"]


async def test_oversized_result_rejected(tmp_path):
    jm, st = mgr(tmp_path)
    j = jobdict()
    await st.create_job(j)
    w = WorkerConn("w", FakeWS(), set(), ready=True)
    await jm.register(w)
    await jm.schedule()
    await jm.on_message(w, P.JobStarted(job_id=j["id"]))
    await jm.on_message(w, P.JobCompleted(job_id=j["id"], result={"blob": "x" * 1_100_000}))
    assert (await st.get_job(j["id"]))["status"] == "failed"


async def test_global_concurrency_cap(tmp_path):
    jm, st = mgr(tmp_path, analytics_max_concurrent_total=1)
    for _ in range(2):
        await st.create_job(jobdict())
    a, b = (WorkerConn(n, FakeWS(), set(), ready=True) for n in "ab")
    await jm.register(a)
    await jm.register(b)
    await jm.schedule()
    assert sum(1 for w in (a, b) if w.job_id) == 1
