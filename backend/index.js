require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const admin = require('firebase-admin');

const DEFAULT_PORT = 3000;
const DEFAULT_CONTACT_NAME = 'Unknown Contact';
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

class BackendConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackendConfigError';
    this.code = 'CONFIGURATION_ERROR';
  }
}

function isValidPhoneNumber(phoneNumber) {
  if (typeof phoneNumber !== 'string') return false;

  const trimmed = phoneNumber.trim();
  if (trimmed.length < 7 || trimmed.length > 20) return false;
  if (!/^\+?[0-9\s\-()]{7,20}$/.test(trimmed)) return false;

  const digitCount = [...trimmed].filter((character) => /[0-9]/.test(character)).length;
  return digitCount >= 7 && digitCount <= 15;
}

function validateDialRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'phoneNumber')) {
    return { error: 'phoneNumber is required.' };
  }

  if (!isValidPhoneNumber(body.phoneNumber)) {
    return {
      error: 'phoneNumber must be a valid phone number with 7 to 15 digits.',
    };
  }

  if (
    body.contactName !== undefined &&
    body.contactName !== null &&
    typeof body.contactName !== 'string'
  ) {
    return { error: 'contactName must be a string when provided.' };
  }

  const contactName = body.contactName?.trim() || DEFAULT_CONTACT_NAME;
  if (contactName.length > 100) {
    return { error: 'contactName must be 100 characters or fewer.' };
  }

  return {
    value: {
      phoneNumber: body.phoneNumber.trim(),
      contactName,
    },
  };
}

function resolveCredentialPath(credentialsPath) {
  const trimmedPath = credentialsPath?.trim();
  if (!trimmedPath) {
    throw new BackendConfigError(
      'GOOGLE_APPLICATION_CREDENTIALS is not configured.',
    );
  }

  const resolvedPath = path.isAbsolute(trimmedPath)
    ? trimmedPath
    : path.resolve(process.cwd(), trimmedPath);

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new BackendConfigError(
      'The GOOGLE_APPLICATION_CREDENTIALS file could not be found.',
    );
  }

  return resolvedPath;
}

function readServiceAccount(credentialsPath) {
  const resolvedPath = resolveCredentialPath(credentialsPath);
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    if (
      !serviceAccount.project_id ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error('Service-account fields are incomplete.');
    }
    return serviceAccount;
  } catch (error) {
    if (error instanceof BackendConfigError) throw error;
    throw new BackendConfigError(
      'The GOOGLE_APPLICATION_CREDENTIALS file is not a valid Firebase service-account JSON file.',
    );
  }
}

function createFirebaseMessageSender({ env = process.env, adminSdk = admin } = {}) {
  let messaging;

  return async function sendMessage(message) {
    if (!messaging) {
      const serviceAccount = readServiceAccount(env.GOOGLE_APPLICATION_CREDENTIALS);
      const firebaseApp =
        adminSdk.apps && adminSdk.apps.length > 0
          ? adminSdk.apps[0]
          : adminSdk.initializeApp({
              credential: adminSdk.credential.cert(serviceAccount),
            });
      messaging = adminSdk.messaging(firebaseApp);
    }

    return messaging.send(message);
  };
}

function parseCorsOrigins(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Set(DEFAULT_CORS_ORIGINS);
  }
  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function createCorsMiddleware(origins) {
  return (req, res, next) => {
    const requestOrigin = req.headers.origin;

    // Requests without an Origin header include curl and PowerShell checks.
    if (!requestOrigin) return next();
    if (!origins.has(requestOrigin)) {
      return res.status(403).json({
        error: 'cors_origin_not_allowed',
        message: 'The request origin is not allowed for local development.',
      });
    }

    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  };
}

function createApp({ env = process.env, sendMessage, logger = console } = {}) {
  const app = express();
  const messageSender = sendMessage || createFirebaseMessageSender({ env });

  app.use(createCorsMiddleware(parseCorsOrigins(env.CORS_ORIGIN)));
  app.use(express.json({ limit: '32kb', strict: true }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'leadzam-backend',
      firebase: {
        credentialsConfigured: Boolean(env.GOOGLE_APPLICATION_CREDENTIALS),
        tokenConfigured: Boolean(env.FCM_TOKEN),
      },
    });
  });

  app.post('/api/dial', async (req, res) => {
    const validation = validateDialRequest(req.body);
    if (validation.error) {
      return res.status(400).json({
        error: 'invalid_request',
        message: validation.error,
      });
    }

    const token = env.FCM_TOKEN?.trim();
    if (!token || !env.GOOGLE_APPLICATION_CREDENTIALS) {
      return res.status(503).json({
        error: 'firebase_not_configured',
        message: 'Firebase Admin credentials and FCM_TOKEN must be configured.',
      });
    }

    const { phoneNumber, contactName } = validation.value;
    const fcmMessage = {
      token,
      data: {
        type: 'dial_request',
        phoneNumber,
        contactName,
      },
      android: {
        priority: 'high',
      },
    };

    try {
      const messageId = await messageSender(fcmMessage);
      return res.status(200).json({
        success: true,
        message: 'FCM message accepted by Firebase.',
        messageId,
      });
    } catch (error) {
      const statusCode = error?.code === 'CONFIGURATION_ERROR' ? 503 : 502;
      logger.error('FCM send failed.', error?.code || 'unknown_error');
      return res.status(statusCode).json({
        error: statusCode === 503 ? 'firebase_not_configured' : 'fcm_send_failed',
        message:
          statusCode === 503
            ? 'Firebase Admin credentials are invalid or unavailable.'
            : 'Firebase could not accept the call request.',
      });
    }
  });

  app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({
        error: 'invalid_json',
        message: 'Request body contains malformed JSON.',
      });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'request_too_large',
        message: 'Request body must be 32 KB or smaller.',
      });
    }
    return next(error);
  });

  app.use((error, req, res, next) => {
    logger.error('Unhandled backend error.', error?.code || 'unknown_error');
    return res.status(500).json({
      error: 'internal_server_error',
      message: 'The backend could not process the request.',
    });
  });

  return app;
}

function getPort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

if (require.main === module) {
  const port = getPort(process.env.PORT);
  const app = createApp();
  app.listen(port, () => {
    console.log(`LeadZam backend listening on http://localhost:${port}`);
  });
}

module.exports = {
  DEFAULT_CONTACT_NAME,
  createApp,
  createFirebaseMessageSender,
  getPort,
  isValidPhoneNumber,
  validateDialRequest,
};
