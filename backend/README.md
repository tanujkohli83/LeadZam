# LeadZam Phase 4 Backend

This is a local assessment backend for registering Android devices, sending a data-only FCM `dial_request`, and tracking the latest acknowledgement for each request. Device registrations and request history are intentionally in memory; this is not a production-authenticated service. The separate dashboard is documented in `../web-dashboard/README.md` and the repository root `README.md`.

## Setup in Windows PowerShell

From this directory:

```powershell
npm install
Copy-Item .env.example .env
```

Create a Firebase Admin service-account key from Firebase Console: Project settings → Service accounts → Generate new private key. Store the downloaded JSON outside this repository, then set `GOOGLE_APPLICATION_CREDENTIALS` in `.env` to its absolute path. The existing `FCM_TOKEN` variable remains the fallback for the original single-device workflow. The Android app also registers its current token and friendly name with the running backend; those registrations disappear when the backend restarts. Never commit either the service-account JSON or `.env`.

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
  # Optional: target one registered Android device.
  # deviceId = 'android-office'
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/dial `
  -ContentType 'application/json' `
  -Body $body
```

The dashboard may also include an optional `clientRequestId` containing 1–100 letters, numbers, hyphens, or underscores. Reusing that key after a timeout checks the original in-memory request and prevents a duplicate FCM send. A key cannot be reused for another device target.

The backend sends this data-only FCM message:

```json
{
  "type": "dial_request",
  "requestId": "generated-uuid",
  "phoneNumber": "+919876543210",
  "contactName": "Rahul Sharma"
}
```

All data values are strings, and Android priority is `high`. A successful response means Firebase accepted the message for sending; it does not mean that Android received it.

The successful response includes the generated `requestId`, `status: "accepted"`, and safe target-device metadata. The backend keeps the latest 100 request records in memory. The history is reset whenever the backend process restarts.

### Device registration

The Android app registers its stable local device ID, friendly name, and current FCM registration token with:

```text
POST /api/devices/register
```

The registration body contains `deviceId`, `deviceName`, and `registrationToken`. The response contains only device metadata; the registration token is never returned. Device names must be 1–80 characters and device IDs must contain only letters, numbers, hyphens, or underscores.

List safe device metadata:

```powershell
Invoke-RestMethod http://localhost:3000/api/devices
```

The list includes availability, last-seen time, and the default device ID, but never includes FCM registration tokens. If no device has registered, `/api/dial` continues using the configured `FCM_TOKEN` fallback. When registered devices exist, an omitted `deviceId` uses the first registered device as the in-memory default.

Stale Firebase registration tokens mark the selected device unavailable and return HTTP `410 device_unavailable`. Registering the device again with its current token marks it available. FCM failures include safe `retryable` and `ambiguous` fields; an ambiguous send result should be checked with the same `clientRequestId` rather than automatically sending a second message.

Retrieve history:

```powershell
Invoke-RestMethod http://localhost:3000/api/requests
```

Android acknowledgement:

```json
{
  "status": "received"
}
```

Send that body to `POST /api/requests/:requestId/ack`. Supported Android statuses are `received`, `dialer_opened`, `dismissed`, and `failed`. The backend rejects unknown request IDs and out-of-order transitions. Repeating the current status is idempotent. A `dialer_opened` status means Android successfully launched `ACTION_DIAL`; it never means that a phone call was completed.
