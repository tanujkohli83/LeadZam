# LeadZam CRM Dashboard — Phase 5

A small React, Vite, and TypeScript dashboard for the LeadZam click-to-call workflow. It uses mock leads and sends call requests to the local Phase 4 backend. Firebase credentials and Android FCM tokens stay on the backend.

## Run locally on Windows PowerShell

Install and configure the frontend:

```powershell
cd D:\Projects\LeadZam\web-dashboard
npm install
Copy-Item .env.example .env
```

The default `.env` value is:

```text
VITE_API_BASE_URL=http://localhost:3000
```

Start both projects in separate PowerShell windows:

```powershell
# Window 1 — backend
cd D:\Projects\LeadZam\backend
npm start

# Window 2 — dashboard
cd D:\Projects\LeadZam\web-dashboard
npm run dev
```

The dashboard runs on the Vite URL shown in the terminal, normally `http://localhost:5173`. The backend runs on `http://localhost:3000` unless its `PORT` is changed. If the backend uses another port, update `VITE_API_BASE_URL` and restart Vite.

## Verification

```powershell
npm run typecheck
npm run build
npm run lint
```

The dashboard checks `GET /health` on load, shows the connection state, and disables a lead's Call button while its request is in progress. A successful response is shown as “Request accepted for sending”; it does not claim that the Android device received the message.

The lead list is intentionally mocked for the internship assessment. No database, authentication, deployment, or real CRM integration is included in this phase.
