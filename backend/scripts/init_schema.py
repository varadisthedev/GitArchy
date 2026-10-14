"""Apply pending CQL migrations to the configured Astra keyspace.   python -m scripts.init_schema

The keyspace must already exist (create it in the Astra console). Only additive, IF NOT EXISTS statements run.
"""
import sys

from app.core.config import Settings
from app.integrations.astra.client import connect_sync
from app.integrations.astra.schema import MIGRATIONS, migrate


def main() -> int:
    settings = Settings(database_backend="astra")  # raises with a clear message if ASTRA_* is missing
    cluster, session = connect_sync(settings)
    try:
        applied = migrate(session)
        print(f"applied migrations: {applied or 'none (already up to date)'}; latest = {MIGRATIONS[-1][0]}")
    finally:
        cluster.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
