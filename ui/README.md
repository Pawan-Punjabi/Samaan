# DataFlow UI

The React/Vite frontend for the Interactive Node-Based Data Profiling and Analytics Platform.

## Run locally

From the repository root, start the backend in one terminal:

```cmd
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, start the frontend:

```cmd
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd ui
npm ci
npm run dev -- --host 127.0.0.1
```

The landing page is served at `/`. Choose **Launch App** to open the existing workflow studio at `/app`.
The backend API should be running at `http://127.0.0.1:8000`.

## Production build

```sh
npm run build
```
