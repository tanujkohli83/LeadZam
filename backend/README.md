# LeadZam Phase 4 Backend

This is a local assessment backend for sending a data-only FCM `dial_request` to the LeadZam Android app. It is intentionally not a production-authenticated service. The separate Phase 5 dashboard is documented in `../web-dashboard/README.md` and the repository root `README.md`.

## Setup in Windows PowerShell

From this directory:

```powershell
npm install
Copy-Item .env.example .env
```

Create a Firebase Admin service-account key from Firebase Console: Project settings → Service accounts → Generate new private key. Store the downloaded JSON outside this repository, then set `GOOGLE_APPLICATION_CREDENTIALS` in `.env` to its absolute path. Copy the current FCM registration token from the Android app into `FCM_TOKEN`. Never commit either the service-account JSON or `.env`.

Run the automated tests:

```powershell
npm test
```

Start the local server:

```powershell
npm start
# or, during development:
npm run dev
```

The default port is `3000`; set `PORT` to override it. `CORS_ORIGIN` accepts a comma-separated list and defaults to the local Vite origins used by the dashboard.

## API

Health check:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Request a call:

```powershell
$body = @{
  phoneNumber = '+919876543210'
  contactName = 'Rahul Sharma'
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/dial `
  -ContentType 'application/json' `
  -Body $body
```

The backend sends this data-only FCM message:

```json
{
  "type": "dial_request",
  "phoneNumber": "+919876543210",
  "contactName": "Rahul Sharma"
}
```

All data values are strings, and Android priority is `high`. A successful response means Firebase accepted the message; it does not claim that the device received or displayed it.
