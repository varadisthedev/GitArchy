from fastapi import APIRouter

from app.modules.activity.router import router as activity
from app.modules.analytics.router import router as analytics
from app.modules.auth.router import router as auth
from app.modules.branches.router import router as branches
from app.modules.commits.router import router as commits
from app.modules.exports.router import router as exports
from app.modules.files.router import router as files
from app.modules.github.router import router as github
from app.modules.repositories.router import router as repositories
from app.modules.users.router import router as users
from app.modules.workers.router import router as workers

api_router = APIRouter(prefix="/api/v1")
for r in (auth, users, repositories, branches, files, commits, activity, exports, analytics,
          github, workers):
    api_router.include_router(r)
