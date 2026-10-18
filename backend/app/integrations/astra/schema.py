"""Versioned, additive CQL migrations. Nothing here ever DROPs a table.

The keyspace must already exist (Astra DB does not allow CREATE KEYSPACE over CQL;
create the database/keyspace in the Astra console). To change schema, append a new
migration - never edit or reorder an applied one.
"""

MIGRATIONS: list[tuple[int, str, list[str]]] = [
    (1, "initial schema", [
        # --- users: email claim table + canonical table -------------------
        """CREATE TABLE IF NOT EXISTS users_by_email (
            email text PRIMARY KEY, user_id uuid)""",
        """CREATE TABLE IF NOT EXISTS users_by_id (
            user_id uuid PRIMARY KEY, email text, display_name text, password_hash text,
            avatar_url text, avatar_public_id text, created_at timestamp)""",
        # --- repositories -------------------------------------------------
        """CREATE TABLE IF NOT EXISTS repositories_by_id (
            repo_id uuid PRIMARY KEY, owner_id uuid, name text, description text,
            visibility text, default_branch text, created_at timestamp, updated_at timestamp)""",
        # name uniqueness per owner is enforced by LWT on this table's primary key
        """CREATE TABLE IF NOT EXISTS repositories_by_owner (
            owner_id uuid, name text, repo_id uuid, PRIMARY KEY ((owner_id), name))""",
        """CREATE TABLE IF NOT EXISTS members_by_repo (
            repo_id uuid, user_id uuid, role text, added_at timestamp,
            PRIMARY KEY ((repo_id), user_id))""",
        """CREATE TABLE IF NOT EXISTS repos_by_member (
            user_id uuid, repo_id uuid, role text, PRIMARY KEY ((user_id), repo_id))""",
        # --- git metadata indexes (Git remains the source of truth) -------
        """CREATE TABLE IF NOT EXISTS branches_by_repo (
            repo_id uuid, name text, head_sha text, created_by uuid, created_at timestamp,
            PRIMARY KEY ((repo_id), name))""",
        """CREATE TABLE IF NOT EXISTS commits_by_repo (
            repo_id uuid, committed_at timestamp, sha text, branch text, author_id uuid,
            author_name text, message text,
            PRIMARY KEY ((repo_id), committed_at, sha)) WITH CLUSTERING ORDER BY (committed_at DESC, sha ASC)""",
        # --- activity: month-bucketed to bound partition size --------------
        """CREATE TABLE IF NOT EXISTS events_by_repo (
            repo_id uuid, bucket text, event_id timeuuid, type text, actor_id uuid, data text,
            PRIMARY KEY ((repo_id, bucket), event_id)) WITH CLUSTERING ORDER BY (event_id DESC)""",
        """CREATE TABLE IF NOT EXISTS activity_by_user (
            user_id uuid, bucket text, event_id timeuuid, repo_id uuid, type text, data text,
            PRIMARY KEY ((user_id, bucket), event_id)) WITH CLUSTERING ORDER BY (event_id DESC)""",
        """CREATE TABLE IF NOT EXISTS notifications_by_user (
            user_id uuid, bucket text, notification_id timeuuid, type text, data text, read boolean,
            PRIMARY KEY ((user_id, bucket), notification_id)) WITH CLUSTERING ORDER BY (notification_id DESC)""",
        # --- token revocation (rows expire via TTL) ------------------------
        """CREATE TABLE IF NOT EXISTS revoked_tokens (jti text PRIMARY KEY, revoked_at timestamp)""",
        # --- analytics ----------------------------------------------------
        """CREATE TABLE IF NOT EXISTS analytics_jobs_by_id (
            job_id uuid PRIMARY KEY, user_id uuid, task_type text, params text, repo_ids text,
            status text, attempts int, error text, result text, metrics text,
            created_at timestamp, updated_at timestamp, started_at timestamp, finished_at timestamp)""",
        """CREATE TABLE IF NOT EXISTS analytics_jobs_by_user (
            user_id uuid, created_at timestamp, job_id uuid,
            PRIMARY KEY ((user_id), created_at, job_id)) WITH CLUSTERING ORDER BY (created_at DESC, job_id ASC)""",
        # small, bounded set of non-terminal jobs, reloaded on API restart
        """CREATE TABLE IF NOT EXISTS analytics_open_jobs (
            bucket int, job_id uuid, PRIMARY KEY ((bucket), job_id))""",
        """CREATE TABLE IF NOT EXISTS analytics_results_by_repo (
            repo_id uuid, finished_at timestamp, job_id uuid, task_type text, summary text,
            PRIMARY KEY ((repo_id), finished_at, job_id)) WITH CLUSTERING ORDER BY (finished_at DESC, job_id ASC)""",
    ]),
    (2, "github identities", [
        # one GitHub account <-> one Gitarchey user. The claim table makes sign-in a single-partition read
        # and stops two users binding the same GitHub account.
        """CREATE TABLE IF NOT EXISTS users_by_github_id (
            github_id bigint PRIMARY KEY, user_id uuid)""",
        # the OAuth token lives only here, so get_user() on every authenticated request never loads it
        """CREATE TABLE IF NOT EXISTS github_identity_by_user (
            user_id uuid PRIMARY KEY, github_id bigint, login text, access_token text, scope text,
            avatar_url text, connected_at timestamp)""",
    ]),
    (3, "remember where an imported repository came from", [
        # Git data lives on the instance's disk, which is ephemeral on most hosts. Without the origin
        # recorded here a wiped disk leaves a repository that can never be rebuilt, only deleted.
        """ALTER TABLE repositories_by_id ADD source text""",
    ]),
    (4, "durable copy of each repository in object storage", [
        # Git needs a filesystem, so the instance's disk holds a working copy and object storage holds
        # the truth. These say which object and what it should hash to.
        """ALTER TABLE repositories_by_id ADD storage_key text""",
        """ALTER TABLE repositories_by_id ADD storage_sha text""",
        """ALTER TABLE repositories_by_id ADD storage_at timestamp""",
    ]),
    (5, "platform survey", [
        # github_identity_by_user is keyed by user_id, so nothing could answer "who has connected?".
        # One bounded partition does, in the shape analytics_open_jobs already uses.
        """CREATE TABLE IF NOT EXISTS github_users (
            bucket int, user_id uuid, login text, PRIMARY KEY ((bucket), user_id))""",
        # the survey is one heavy global job; its newest result is cached so the page is never blank
        """CREATE TABLE IF NOT EXISTS platform_survey (
            bucket int PRIMARY KEY, job_id uuid, result text, measured_at timestamp)""",
    ]),
    (6, "survey history", [
        # Supersedes platform_survey, which kept only the newest row and so could never be charted
        # over time. Clustered newest-first, in one bounded partition: a survey is a manual act, so
        # this grows by a row per run, not per request.
        """CREATE TABLE IF NOT EXISTS platform_survey_history (
            bucket int, measured_at timestamp, job_id uuid, result text,
            PRIMARY KEY ((bucket), measured_at))
            WITH CLUSTERING ORDER BY (measured_at DESC)""",
    ]),
]

VERSION_TABLE = """CREATE TABLE IF NOT EXISTS schema_migrations (
    version int PRIMARY KEY, description text, applied_at timestamp)"""


def migrate(session) -> list[int]:
    """Apply pending migrations in order. Returns versions applied."""
    session.execute(VERSION_TABLE)
    done = {r["version"] for r in session.execute("SELECT version FROM schema_migrations")}
    applied = []
    for version, desc, stmts in MIGRATIONS:
        if version in done:
            continue
        for s in stmts:
            session.execute(s)
        session.execute(
            "INSERT INTO schema_migrations (version, description, applied_at) VALUES (%s, %s, toTimestamp(now()))",
            (version, desc))
        applied.append(version)
    return applied
