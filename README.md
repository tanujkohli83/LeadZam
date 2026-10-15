# LeadZam Click-to-Call

LeadZam is a local internship-assessment project that connects a small CRM dashboard to an Android application through Firebase Cloud Messaging. A CRM user selects a mock lead and requests a call; the Android user receives the request and can open the native dialer with the number prefilled.

## Architecture and request flow

```text
React CRM dashboard
  -> POST /api/dial { phoneNumber, contactName }
  -> Express validation
  -> Firebase Admin SDK / data-only high-priority FCM
  -> MyFirebaseMessagingService on Android
  -> call-request notification and in-app request card
  -> user taps Call
  -> Android ACTION_DIAL opens the native dialer
```

The backend response means Firebase accepted the message for sending. It does not prove that an Android device received or displayed it.

## Repository structure

- `backend/` — Express API, Firebase Admin sender, environment example, and Node tests. See [backend/README.md](backend/README.md).
- `web-dashboard/` — React, Vite, and TypeScript CRM dashboard. See [web-dashboard/README.md](web-dashboard/README.md).
- `android-app/` — Kotlin/Jetpack Compose Android app, FCM service, notifications, token display, and dialer flow.
- `AI_USAGE_LOG.md` — canonical record of AI-assisted work, tests, and limitations.

## Prerequisites

The repository includes an Android Gradle wrapper, so a system Gradle installation is not required.

- Node.js and npm. The documented verification environment used Node `v24.18.1` and npm `11.16.0`.
- Android Studio with an Android SDK, an emulator or Android device with Google Play services, and a JDK compatible with the Android toolchain.
- Discovered Android project versions: Gradle wrapper `9.6.0`, Android Gradle Plugin `9.4.1`, Kotlin `2.2.10`, compile/target SDK `37`, and minimum SDK `24`. Java source/target compatibility is `11`; the recorded Gradle verification used JDK 21.
- A Firebase project with Android app package `com.example.leadzam` for device testing.

## Firebase and environment setup

Never place Firebase Admin credentials, FCM registration tokens, or private keys in source control.

### Android Firebase configuration

1. In Firebase Console, register the Android app with package name `com.example.leadzam`.
2. Download that app's `google-services.json` and place it at `android-app/app/google-services.json`. This local file is ignored by the repository security rules.
3. Build and install the app using the Android commands below.
4. Launch the app and grant notification permission on Android 13 or later.
5. Copy the FCM registration token shown by the app.

### Backend configuration

From `backend/`, create a local `.env` from `.env.example` and replace only the placeholders:

```powershell
cd D:\Projects\LeadZam\backend
Copy-Item .env.example .env
```

Required variables:

```text
GOOGLE_APPLICATION_CREDENTIALS=C:\secure\firebase\leadzam-service-account.json
FCM_TOKEN=the-current-token-copied-from-the-Android-app
```

`GOOGLE_APPLICATION_CREDENTIALS` must point to a Firebase Admin service-account JSON file stored outside this repository. `FCM_TOKEN` is the current Android registration token. Optional variables are `PORT` (default `3000`) and `CORS_ORIGIN` (comma-separated allowed origins; defaults to `http://localhost:5173,http://127.0.0.1:5173`).

### Dashboard configuration

From `web-dashboard/`, create `.env` from the example:

```powershell
cd D:\Projects\LeadZam\web-dashboard
Copy-Item .env.example .env
```

Set `VITE_API_BASE_URL` to the backend origin, normally:

```text
VITE_API_BASE_URL=http://localhost:3000
```

The dashboard contains no Firebase credentials or FCM tokens.

## Run the components

Install dependencies once in each Node component:

```powershell
cd D:\Projects\LeadZam\backend
npm install

cd D:\Projects\LeadZam\web-dashboard
npm install
```

Run the backend and dashboard in separate PowerShell windows:

```powershell
# Window 1
cd D:\Projects\LeadZam\backend
npm start

# Window 2
cd D:\Projects\LeadZam\web-dashboard
npm run dev
```

The backend listens on `http://localhost:3000` by default. Vite normally serves the dashboard at `http://localhost:5173`.

Build/install the Android app from a third window:

```powershell
cd D:\Projects\LeadZam\android-app
.\gradlew.bat app:assembleDebug
.\gradlew.bat app:installDebug
```

`app:installDebug` requires a connected device or running emulator. Open the installed `LeadZam` app and copy its current FCM token into the backend `.env` before sending a real request.

## API

### `GET /health`

Returns HTTP `200` without exposing credential values:

```json
{
  "status": "ok",
  "service": "leadzam-backend",
  "firebase": {
    "credentialsConfigured": true,
    "tokenConfigured": true
  }
}
```

The two Firebase fields are booleans indicating whether the corresponding environment variables are present, not whether a live send has succeeded.

### `POST /api/dial`

Request body:

```json
{
  "phoneNumber": "+91 98765 43210",
  "contactName": "Rahul Sharma"
}
```

`phoneNumber` is required, must contain 7–15 digits, may use a leading `+`, spaces, hyphens, and parentheses, and must be 7–20 characters after trimming. `contactName` is optional, defaults to `Unknown Contact` when absent or blank, and must be at most 100 characters.

On success, the backend returns HTTP `200` with `success: true`, the message `FCM message accepted by Firebase.`, and a Firebase message ID. The sent FCM message is data-only and contains `type=dial_request`, `phoneNumber`, and `contactName`, with Android priority `high`.

Important responses implemented by the backend:

- `400 invalid_request` — invalid body, missing/invalid phone number, or invalid contact name.
- `400 invalid_json` — malformed JSON.
- `403 cors_origin_not_allowed` — browser origin is not in `CORS_ORIGIN`.
- `413 request_too_large` — request body exceeds 32 KB.
- `503 firebase_not_configured` — required configuration is missing or the service-account file is invalid/unavailable.
- `502 fcm_send_failed` — Firebase did not accept the send request.
- `500 internal_server_error` — unexpected backend failure.

## Testing and verification

Backend tests:

```powershell
cd D:\Projects\LeadZam\backend
npm test
```

Dashboard checks:

```powershell
cd D:\Projects\LeadZam\web-dashboard
npm run typecheck
npm run build
npm run lint
```

Android checks:

```powershell
cd D:\Projects\LeadZam\android-app
.\gradlew.bat app:testDebugUnitTest
.\gradlew.bat app:connectedDebugAndroidTest
```

The first Android command is host-side unit testing; the connected test requires a device/emulator. Previously recorded results in [AI_USAGE_LOG.md](AI_USAGE_LOG.md) report successful backend tests, dashboard checks/browser smoke testing, Android build, unit tests, and connected tests. Live Firebase delivery and the complete CRM-to-device flow remain dependent on the configured local credentials, current FCM token, and a connected Android test target.

## Manual end-to-end test

1. Configure Firebase, install the Android app, grant notification permission, and copy the current registration token.
2. Put the service-account path and copied token in `backend/.env`; start the backend.
3. Configure `web-dashboard/.env` with the backend URL; start Vite.
4. With the Android app in the foreground, click a lead's `Call` button in the dashboard. Confirm the backend accepts the request, the Android card shows the contact and number, `Call` opens the native dialer with the number prefilled, and `Dismiss` clears the card.
5. Put the Android app in the background and repeat the dashboard request. Confirm a call-request notification appears. Tapping the notification body should open the in-app request; tapping its `Call` action should open `ACTION_DIAL` with the number prefilled.
6. Do not interpret backend success alone as proof of device receipt. Record the actual device/emulator and Firebase results separately.

## Known limitations

- The dashboard uses mock leads; there is no database, authentication, or real CRM integration.
- The backend is a local assessment service with no production authentication, rate limiting, or deployment configuration.
- FCM registration tokens can rotate and must be refreshed in the backend environment.
- Android notification delivery, background behavior, and dialer behavior require a compatible device/emulator and appropriate notification permission.
- `npm audit --omit=dev` currently reports 8 moderate transitive vulnerabilities in the backend Firebase Admin dependency tree. The suggested forced fix is a breaking `firebase-admin` upgrade and was not applied during this review; the dashboard audit reports 0 vulnerabilities.
- The repository's current Git history already contains generated dependency/build content from earlier work; the security review does not rewrite history or remove tracked files. See the AI usage log and final Phase 7 report for the exact finding.

## AI Usage Notes

1. **Was AI used?** Yes. OpenAI Codex was used as an implementation and review assistant in the local repository workspace.
2. **What did AI assist with?** It assisted with the Android FCM/token/notification and dialer flow, the Express/Firebase Admin backend, the React dashboard, troubleshooting, documentation, and credential/Git hygiene review. The detailed prompts, files, decisions, and limitations are recorded in [AI_USAGE_LOG.md](AI_USAGE_LOG.md).
3. **What was reviewed or tested?** The repository records backend tests, dashboard typecheck/build/lint and browser smoke checks, and Android build/unit/connected-test results. Developer-provided manual evidence includes background notification arrival. Live Firebase delivery was not claimed without direct evidence.
4. **What remains limited or unverified?** The dashboard uses mock leads, the backend is local and unauthenticated, Firebase credentials remain local-only, and a fresh live CRM-to-device FCM test must be recorded separately if required for submission.
