# gitarchy

## Backend (FastAPI, :8000)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env             # Windows: Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
pytest                           # tests
```

## Frontend (Next.js, :3000)
```bash
cd frontend
npm install
cp .env.example .env.local       # NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
npm run dev
npm run test:e2e                 # Playwright (needs backend running; first: npx playwright install chromium)
```

## Spark worker (Colab)
Set `WORKER_TOKEN` in `backend/.env`, then run `backend/colab_worker/gitarchey_colab_worker.ipynb` in Colab.
