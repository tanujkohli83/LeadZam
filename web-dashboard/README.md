# LeadZam CRM Dashboard — Phase 5

A small React, Vite, and TypeScript dashboard for the LeadZam click-to-call workflow. It uses mock leads, loads the safe list of registered Android devices, sends requests to the local backend, and polls the backend's in-memory request history. Firebase credentials and Android FCM tokens stay on the backend.

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

The dashboard checks `GET /health` on load, loads `GET /api/devices`, shows the selected friendly device name and availability, disables a lead's Call button while its request is in progress, and polls `GET /api/requests` for status updates. It displays `Sending`, `Accepted`, `Received`, `Dialer opened`, `Dismissed`, and `Failed` where applicable. `Accepted` means Firebase accepted the message for sending; it does not claim that the Android device received the message or completed a call.

Each submission includes an in-memory retry key. If a request times out or has an ambiguous Firebase result, `Retry` checks the same request and preserves the selected device instead of silently sending a second request. Permanent validation, stale-token, and unavailable-device errors are not automatically retried. A new explicit attempt is created only after the user clicks again.

If no Android device is registered, the dashboard preserves the original `FCM_TOKEN` fallback and labels the target as the default configured device. Device registrations are held only in backend memory and reset when the backend restarts. A stale or unavailable selected device is reported as an error and must be registered again from Android.

The displayed request history is in-memory backend state and resets when the backend restarts. History polling errors are shown without exposing Firebase credentials or registration tokens.

The lead list is intentionally mocked for the internship assessment. No database, authentication, deployment, or real CRM integration is included in this phase.
