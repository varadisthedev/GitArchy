"""Find (and with --apply, repair) inconsistencies left by crashes between non-atomic multi-table writes.

   python -m scripts.reconcile            # report only
   python -m scripts.reconcile --apply    # delete orphan claims / dangling membership rows

Checks (full scans: run occasionally, off-peak):
  users_by_email        -> user_id must exist in users_by_id            (orphan claim: delete)
  repositories_by_owner -> repo_id must exist in repositories_by_id     (orphan claim: delete)
  repos_by_member       -> repo_id must exist in repositories_by_id     (dangling: delete)
  repositories_by_id    -> bare repo directory must exist               (REPORT ONLY: data may need restoring
                                                                         from a bundle in R2; never auto-deleted)
"""
import argparse
import sys

from app.core.config import Settings
from app.integrations.astra.client import connect_sync
from app.integrations.git.storage import LocalRepositoryStorage


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    settings = Settings(database_backend="astra")
    cluster, s = connect_sync(settings)
    storage = LocalRepositoryStorage(settings.git_repos_dir)
    problems = 0
    try:
        users = {r["user_id"] for r in s.execute("SELECT user_id FROM users_by_id")}
        repos = {r["repo_id"]: r for r in s.execute("SELECT repo_id, owner_id, name FROM repositories_by_id")}
        for r in s.execute("SELECT email, user_id FROM users_by_email"):
            if r["user_id"] not in users:
                problems += 1
                print(f"orphan email claim: {r['email']}")
                if args.apply:
                    s.execute("DELETE FROM users_by_email WHERE email = %s IF user_id = %s", (r["email"], r["user_id"]))
        for r in s.execute("SELECT owner_id, name, repo_id FROM repositories_by_owner"):
            if r["repo_id"] not in repos:
                problems += 1
                print(f"orphan repo-name claim: {r['owner_id']}/{r['name']}")
                if args.apply:
                    s.execute("DELETE FROM repositories_by_owner WHERE owner_id = %s AND name = %s IF repo_id = %s",
                              (r["owner_id"], r["name"], r["repo_id"]))
        for r in s.execute("SELECT user_id, repo_id FROM repos_by_member"):
            if r["repo_id"] not in repos:
                problems += 1
                print(f"dangling membership: user {r['user_id']} -> repo {r['repo_id']}")
                if args.apply:
                    s.execute("DELETE FROM repos_by_member WHERE user_id = %s AND repo_id = %s", (r["user_id"], r["repo_id"]))
        for rid, r in repos.items():
            if not storage.exists(str(rid)):
                problems += 1
                print(f"repository has no git storage on this host: {rid} ({r['name']})  [report only]")
    finally:
        cluster.shutdown()
    print(f"{problems} issue(s) found" + (" (repairs applied where safe)" if args.apply else " (dry run)"))
    return 1 if problems and not args.apply else 0


if __name__ == "__main__":
    sys.exit(main())
