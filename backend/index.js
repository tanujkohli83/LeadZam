require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const admin = require('firebase-admin');
const { createRequestStore, REQUEST_STATUS } = require('./requestStore');
const {
  createDeviceStore,
  isValidDeviceId,
  isValidDeviceName,
  isValidRegistrationToken,
} = require('./deviceStore');

const DEFAULT_PORT = 3000;
const DEFAULT_CONTACT_NAME = 'Unknown Contact';
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const LEGACY_DEVICE_ID = null;
const LEGACY_DEVICE_NAME = 'Default configured device';
const STALE_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);
const TRANSIENT_FCM_ERROR_CODES = new Set([
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/quota-exceeded',
]);
const CONFIGURATION_FCM_ERROR_CODES = new Set([
  'messaging/authentication-error',
  'messaging/mismatched-credential',
  'messaging/third-party-auth-error',
  'messaging/invalid-apns-credentials',
]);
const PERMANENT_FCM_ERROR_CODES = new Set([
  'messaging/invalid-argument',
  'messaging/invalid-recipient',
]);
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

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

  if (body.deviceId !== undefined && !isValidDeviceId(body.deviceId)) {
    return { error: 'deviceId must contain 1 to 100 letters, numbers, hyphens, or underscores.' };
  }

  if (body.clientRequestId !== undefined && !isValidClientRequestId(body.clientRequestId)) {
    return { error: 'clientRequestId must contain 1 to 100 letters, numbers, hyphens, or underscores.' };
  }

  return {
    value: {
      phoneNumber: body.phoneNumber.trim(),
      contactName,
      deviceId: body.deviceId?.trim() || null,
      clientRequestId: body.clientRequestId?.trim() || null,
    },
  };
}

function validateDeviceRegistration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  if (!isValidDeviceId(body.deviceId)) {
    return { error: 'deviceId must contain 1 to 100 letters, numbers, hyphens, or underscores.' };
  }

  if (!isValidDeviceName(body.deviceName)) {
    return { error: 'deviceName must be between 1 and 80 characters.' };
  }

  if (!isValidRegistrationToken(body.registrationToken)) {
    return { error: 'registrationToken must be provided.' };
  }

  return {
    value: {
      deviceId: body.deviceId.trim(),
      deviceName: body.deviceName.trim(),
      registrationToken: body.registrationToken.trim(),
    },
  };
}

function isStaleTokenError(error) {
  return STALE_TOKEN_ERROR_CODES.has(error?.code);
}

function isTransientFcmError(error) {
  return (
    TRANSIENT_FCM_ERROR_CODES.has(error?.code) ||
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH'].includes(error?.code)
  );
}

function classifyFcmError(error) {
  if (isStaleTokenError(error)) {
    return {
      statusCode: 410,
      error: 'device_unavailable',
      message: 'The selected Android device token is stale. Register the device again.',
      retryable: false,
      ambiguous: false,
    };
  }

  if (error?.code === 'CONFIGURATION_ERROR' || CONFIGURATION_FCM_ERROR_CODES.has(error?.code)) {
    return {
      statusCode: 503,
      error: 'firebase_not_configured',
      message: 'Firebase Admin credentials are invalid or unavailable.',
      retryable: false,
      ambiguous: false,
    };
  }

  if (PERMANENT_FCM_ERROR_CODES.has(error?.code)) {
    return {
      statusCode: 502,
      error: 'fcm_send_failed',
      message: 'Firebase rejected the call request configuration.',
      retryable: false,
      ambiguous: false,
    };
  }

  if (isTransientFcmError(error)) {
    return {
      statusCode: 502,
      error: 'fcm_send_failed',
      message: 'Firebase is temporarily unavailable. Retry the same request to check its status.',
      retryable: true,
      ambiguous: true,
    };
  }

  return {
    statusCode: 502,
    error: 'fcm_send_failed',
    message: 'Firebase could not accept the call request. Retry the same request to check its status.',
    retryable: false,
    ambiguous: true,
  };
}

function isValidClientRequestId(clientRequestId) {
  return (
    typeof clientRequestId === 'string' &&
    CLIENT_REQUEST_ID_PATTERN.test(clientRequestId.trim())
  );
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

function createApp({
  env = process.env,
  sendMessage,
  logger = console,
  requestStore = createRequestStore(),
  deviceStore = createDeviceStore(),
} = {}) {
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

  app.get('/api/requests', (req, res) => {
    const requests = requestStore.list();
    return res.json({
      requests,
      count: requests.length,
    });
  });

  app.get('/api/devices', (req, res) => {
    const devices = deviceStore.list();
    return res.json({
      devices,
      count: devices.length,
      defaultDeviceId: deviceStore.getDefaultDeviceId(),
    });
  });

  app.post('/api/devices/register', (req, res) => {
    const validation = validateDeviceRegistration(req.body);
    if (validation.error) {
      return res.status(400).json({
        error: 'invalid_device_registration',
        message: validation.error,
      });
    }

    const device = deviceStore.register(validation.value);
    return res.status(200).json({
      success: true,
      device,
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

    const { phoneNumber, contactName, deviceId, clientRequestId } = validation.value;
    const registeredTarget = deviceStore.resolveTarget(deviceId);

    if (deviceId && !registeredTarget) {
      return res.status(404).json({
        error: 'device_not_found',
        message: 'The selected Android device is not registered with this backend.',
      });
    }

    const target = registeredTarget
      ? {
          token: registeredTarget.registrationToken,
          deviceId: registeredTarget.deviceId,
          deviceName: registeredTarget.deviceName,
        }
      : {
          token: env.FCM_TOKEN?.trim(),
          deviceId: LEGACY_DEVICE_ID,
          deviceName: LEGACY_DEVICE_NAME,
        };

    const existingRequest = clientRequestId
      ? requestStore.getByClientRequestId(clientRequestId)
      : null;

    if (existingRequest) {
      if (existingRequest.deviceId !== target.deviceId) {
        return res.status(409).json({
          error: 'idempotency_key_conflict',
          message: 'The retry key is already associated with a different Android device.',
          requestId: existingRequest.requestId,
          status: existingRequest.status,
          retryable: false,
          ambiguous: false,
        });
      }

      if (existingRequest.status === REQUEST_STATUS.ACCEPTED) {
        return res.json({
          success: true,
          message: 'FCM message was already accepted by Firebase.',
          messageId: existingRequest.messageId,
          requestId: existingRequest.requestId,
          status: REQUEST_STATUS.ACCEPTED,
          device: {
            deviceId: existingRequest.deviceId,
            deviceName: existingRequest.deviceName,
          },
        });
      }

      if (existingRequest.status === REQUEST_STATUS.SENDING) {
        return res.status(409).json({
          error: 'request_in_progress',
          message: 'The previous request is still being processed. Retry to check its status.',
          requestId: existingRequest.requestId,
          status: existingRequest.status,
          retryable: true,
          ambiguous: true,
        });
      }

      return res.status(409).json({
        error: 'request_already_finished',
        message: 'The previous request already has a final status. Start a new request if needed.',
        requestId: existingRequest.requestId,
        status: existingRequest.status,
        retryable: false,
        ambiguous: false,
      });
    }

    const request = requestStore.create({
      phoneNumber,
      contactName,
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      clientRequestId,
    });

    if (registeredTarget && !registeredTarget.available) {
      requestStore.markFailed(request.requestId);
      return res.status(410).json({
        error: 'device_unavailable',
        message: 'The selected Android device is unavailable. Register it again before sending.',
        requestId: request.requestId,
        status: REQUEST_STATUS.FAILED,
        retryable: false,
        ambiguous: false,
      });
    }

    if (!target.token || !env.GOOGLE_APPLICATION_CREDENTIALS) {
      requestStore.markFailed(request.requestId);
      return res.status(503).json({
        error: 'firebase_not_configured',
        message: 'Firebase Admin credentials and FCM_TOKEN must be configured.',
        requestId: request.requestId,
        status: REQUEST_STATUS.FAILED,
        retryable: false,
        ambiguous: false,
      });
    }

    const fcmMessage = {
      token: target.token,
      data: {
        type: 'dial_request',
        requestId: request.requestId,
        phoneNumber,
        contactName,
      },
      android: {
        priority: 'high',
      },
    };

    try {
      const messageId = await messageSender(fcmMessage);
      requestStore.markAccepted(request.requestId, messageId);
      return res.status(200).json({
        success: true,
        message: 'FCM message accepted by Firebase.',
        messageId,
        requestId: request.requestId,
        status: REQUEST_STATUS.ACCEPTED,
        device: {
          deviceId: target.deviceId,
          deviceName: target.deviceName,
        },
      });
    } catch (error) {
      const classification = classifyFcmError(error);
      if (registeredTarget && classification.error === 'device_unavailable') {
        deviceStore.markUnavailable(registeredTarget.deviceId);
      }
      requestStore.markFailed(request.requestId);
      logger.error('FCM send failed.', error?.code || 'unknown_error');
      return res.status(classification.statusCode).json({
        error: classification.error,
        message: classification.message,
        requestId: request.requestId,
        status: REQUEST_STATUS.FAILED,
        retryable: classification.retryable,
        ambiguous: classification.ambiguous,
      });
    }
  });

  app.post('/api/requests/:requestId/ack', (req, res) => {
    if (!req.body || typeof req.body.status !== 'string') {
      return res.status(400).json({
        error: 'invalid_acknowledgement',
        message: 'status is required.',
      });
    }

    const result = requestStore.acknowledge(
      req.params.requestId,
      req.body.status.trim(),
    );

    if (result.reason === 'not_found') {
      return res.status(404).json({
        error: 'request_not_found',
        message: 'The request ID is not known to this backend instance.',
      });
    }

    if (result.reason === 'invalid_status') {
      return res.status(400).json({
        error: 'invalid_acknowledgement',
        message: 'The acknowledgement status is not supported.',
      });
    }

    if (result.reason === 'invalid_transition') {
      return res.status(409).json({
        error: 'invalid_status_transition',
        message: 'The acknowledgement is out of order for this request.',
        requestId: req.params.requestId,
        status: result.record.status,
      });
    }

    return res.json({
      success: true,
      requestId: result.record.requestId,
      status: result.record.status,
      idempotent: result.idempotent,
    });
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
  classifyFcmError,
  getPort,
  isValidPhoneNumber,
  isValidClientRequestId,
  isTransientFcmError,
  validateDialRequest,
  validateDeviceRegistration,
  isStaleTokenError,
};
