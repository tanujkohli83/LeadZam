const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const {
  classifyFcmError,
  createApp,
  isValidPhoneNumber,
} = require('../index');

const quietLogger = {
  error() {},
};

test('GET /health returns service status without exposing secrets', async () => {
  const app = createApp({
    env: {},
    sendMessage: async () => 'unused',
    logger: quietLogger,
  });

  const response = await request(app).get('/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: 'ok',
    service: 'leadzam-backend',
    firebase: {
      credentialsConfigured: false,
      tokenConfigured: false,
    },
  });
  assert.equal(JSON.stringify(response.body).includes('FCM_TOKEN'), false);
});

test('POST /api/dial rejects a missing phone number', async () => {
  const app = createApp({ env: {}, sendMessage: async () => 'unused', logger: quietLogger });
  const response = await request(app).post('/api/dial').send({ contactName: 'Rahul Sharma' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'invalid_request');
});

test('POST /api/dial rejects an invalid phone number', async () => {
  const app = createApp({ env: {}, sendMessage: async () => 'unused', logger: quietLogger });
  const response = await request(app).post('/api/dial').send({ phoneNumber: 'abc' });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /valid phone number/);
});

test('POST /api/dial rejects malformed JSON', async () => {
  const app = createApp({ env: {}, sendMessage: async () => 'unused', logger: quietLogger });
  const response = await request(app)
    .post('/api/dial')
    .set('Content-Type', 'application/json')
    .send('{"phoneNumber":');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'invalid_json');
});

test('POST /api/dial reports missing Firebase configuration', async () => {
  const app = createApp({ env: { FCM_TOKEN: 'test-token' }, logger: quietLogger });
  const response = await request(app).post('/api/dial').send({ phoneNumber: '+919876543210' });

  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'firebase_not_configured');
});

test('POST /api/dial reports an invalid Firebase credential path', async () => {
  const app = createApp({
    env: {
      FCM_TOKEN: 'test-token',
      GOOGLE_APPLICATION_CREDENTIALS: 'missing-service-account.json',
    },
    logger: quietLogger,
  });
  const response = await request(app).post('/api/dial').send({ phoneNumber: '+919876543210' });

  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'firebase_not_configured');
});

test('POST /api/dial sends a data-only high-priority FCM message', async () => {
  let sentMessage;
  const app = createApp({
    env: {
      FCM_TOKEN: 'test-token',
      GOOGLE_APPLICATION_CREDENTIALS: 'test-service-account.json',
    },
    sendMessage: async (message) => {
      sentMessage = message;
      return 'projects/test/messages/123';
    },
    logger: quietLogger,
  });

  const response = await request(app).post('/api/dial').send({
    phoneNumber: ' +91 98765-43210 ',
    contactName: 'Rahul Sharma',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'FCM message accepted by Firebase.');
  assert.equal(response.body.messageId, 'projects/test/messages/123');
  assert.match(response.body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(response.body.status, 'accepted');
  assert.deepEqual(sentMessage, {
    token: 'test-token',
    data: {
      type: 'dial_request',
      requestId: response.body.requestId,
      phoneNumber: '+91 98765-43210',
      contactName: 'Rahul Sharma',
    },
    android: {
      priority: 'high',
    },
  });
  assert.equal('notification' in sentMessage, false);
});

test('POST /api/dial uses a fallback contact name', async () => {
  let sentMessage;
  const app = createApp({
    env: { FCM_TOKEN: 'test-token', GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async (message) => {
      sentMessage = message;
      return 'message-id';
    },
    logger: quietLogger,
  });

  const response = await request(app).post('/api/dial').send({ phoneNumber: '+919876543210' });

  assert.equal(response.status, 200);
  assert.equal(sentMessage.data.contactName, 'Unknown Contact');
});

test('POST /api/dial hides Firebase send failures', async () => {
  const app = createApp({
    env: { FCM_TOKEN: 'secret-token', GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async () => {
      const error = new Error('private Firebase details');
      error.code = 'messaging/invalid-argument';
      throw error;
    },
    logger: quietLogger,
  });

  const response = await request(app).post('/api/dial').send({ phoneNumber: '+919876543210' });

  assert.equal(response.status, 502);
  assert.equal(response.body.error, 'fcm_send_failed');
  assert.match(response.body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(response.body.status, 'failed');
  assert.equal(JSON.stringify(response.body).includes('private Firebase'), false);
  assert.equal(JSON.stringify(response.body).includes('secret-token'), false);
});

test('POST /api/dial records failed configuration requests', async () => {
  const app = createApp({ env: {}, logger: quietLogger });
  const response = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'firebase_not_configured');
  assert.match(response.body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(response.body.status, 'failed');

  const history = await request(app).get('/api/requests');
  assert.equal(history.body.count, 1);
  assert.equal(history.body.requests[0].status, 'failed');
});

test('device registration returns safe metadata without exposing the token', async () => {
  const app = createApp({ env: {}, sendMessage: async () => 'unused', logger: quietLogger });
  const registrationToken = 'device-token-for-test';

  const registration = await request(app)
    .post('/api/devices/register')
    .send({
      deviceId: 'android-office',
      deviceName: 'Office Android',
      registrationToken,
    });

  assert.equal(registration.status, 200);
  assert.equal(registration.body.success, true);
  assert.deepEqual(registration.body.device, {
    deviceId: 'android-office',
    deviceName: 'Office Android',
    available: true,
    isDefault: true,
    registeredAt: registration.body.device.registeredAt,
    lastSeenAt: registration.body.device.lastSeenAt,
  });
  assert.equal(JSON.stringify(registration.body).includes(registrationToken), false);

  const devices = await request(app).get('/api/devices');
  assert.equal(devices.status, 200);
  assert.equal(devices.body.count, 1);
  assert.equal(devices.body.defaultDeviceId, 'android-office');
  assert.equal(JSON.stringify(devices.body).includes(registrationToken), false);
});

test('device registration rejects invalid IDs, names, and tokens', async () => {
  const app = createApp({ env: {}, sendMessage: async () => 'unused', logger: quietLogger });
  const invalidRegistrations = [
    { deviceId: 'contains/slash', deviceName: 'Office Android', registrationToken: 'token' },
    { deviceId: 'android-office', deviceName: '   ', registrationToken: 'token' },
    { deviceId: 'android-office', deviceName: 'Office Android', registrationToken: '' },
  ];

  for (const body of invalidRegistrations) {
    const response = await request(app).post('/api/devices/register').send(body);
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'invalid_device_registration');
  }

  const devices = await request(app).get('/api/devices');
  assert.equal(devices.body.count, 0);
});

test('re-registering a device replaces its token and restores availability', async () => {
  const app = createApp({ env: {}, sendMessage: async () => 'unused', logger: quietLogger });

  const first = await request(app).post('/api/devices/register').send({
    deviceId: 'android-office',
    deviceName: 'Office Android',
    registrationToken: 'first-registration-token',
  });
  const second = await request(app).post('/api/devices/register').send({
    deviceId: 'android-office',
    deviceName: 'Updated Office Android',
    registrationToken: 'second-registration-token',
  });

  assert.equal(first.body.device.isDefault, true);
  assert.equal(second.status, 200);
  assert.equal(second.body.device.deviceName, 'Updated Office Android');
  assert.equal(second.body.device.available, true);
  assert.equal(second.body.device.isDefault, true);

  const devices = await request(app).get('/api/devices');
  assert.equal(devices.body.count, 1);
  assert.equal(devices.body.devices[0].deviceName, 'Updated Office Android');
  assert.equal(devices.body.devices[0].available, true);
  assert.equal(JSON.stringify(devices.body).includes('first-registration-token'), false);
  assert.equal(JSON.stringify(devices.body).includes('second-registration-token'), false);
});

test('dial requests can target a registered device and record its name', async () => {
  let sentMessage;
  const app = createApp({
    env: { GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async (message) => {
      sentMessage = message;
      return 'targeted-message-id';
    },
    logger: quietLogger,
  });

  await request(app).post('/api/devices/register').send({
    deviceId: 'android-home',
    deviceName: 'Home Android',
    registrationToken: 'home-device-token',
  });
  await request(app).post('/api/devices/register').send({
    deviceId: 'android-office',
    deviceName: 'Office Android',
    registrationToken: 'office-device-token',
  });

  const response = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    contactName: 'Targeted Lead',
    deviceId: 'android-office',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.device, {
    deviceId: 'android-office',
    deviceName: 'Office Android',
  });
  assert.equal(sentMessage.token, 'office-device-token');

  const history = await request(app).get('/api/requests');
  assert.equal(history.body.requests[0].deviceId, 'android-office');
  assert.equal(history.body.requests[0].deviceName, 'Office Android');
});

test('omitting deviceId routes to the default registered device and rejects unknown devices', async () => {
  const sentTokens = [];
  const app = createApp({
    env: { GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async (message) => {
      sentTokens.push(message.token);
      return `message-${sentTokens.length}`;
    },
    logger: quietLogger,
  });

  await request(app).post('/api/devices/register').send({
    deviceId: 'android-first',
    deviceName: 'First Android',
    registrationToken: 'first-device-token',
  });
  await request(app).post('/api/devices/register').send({
    deviceId: 'android-second',
    deviceName: 'Second Android',
    registrationToken: 'second-device-token',
  });

  const defaultResponse = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    contactName: 'Default Target Lead',
  });
  assert.equal(defaultResponse.status, 200);
  assert.deepEqual(defaultResponse.body.device, {
    deviceId: 'android-first',
    deviceName: 'First Android',
  });

  const unknownResponse = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    deviceId: 'android-missing',
  });
  assert.equal(unknownResponse.status, 404);
  assert.equal(unknownResponse.body.error, 'device_not_found');
  assert.deepEqual(sentTokens, ['first-device-token']);
});

test('legacy FCM_TOKEN fallback is used when no devices are registered', async () => {
  let sentMessage;
  const app = createApp({
    env: {
      FCM_TOKEN: 'legacy-device-token',
      GOOGLE_APPLICATION_CREDENTIALS: 'test.json',
    },
    sendMessage: async (message) => {
      sentMessage = message;
      return 'legacy-message-id';
    },
    logger: quietLogger,
  });

  const response = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    contactName: 'Legacy Lead',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.device.deviceId, null);
  assert.equal(response.body.device.deviceName, 'Default configured device');
  assert.equal(sentMessage.token, 'legacy-device-token');

  const history = await request(app).get('/api/requests');
  assert.equal(history.body.requests[0].deviceId, null);
  assert.equal(history.body.requests[0].deviceName, 'Default configured device');
  assert.equal(JSON.stringify(history.body).includes('legacy-device-token'), false);
});

test('stale registered devices become unavailable without exposing token details', async () => {
  const app = createApp({
    env: { GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async () => {
      const error = new Error('token details must stay private');
      error.code = 'messaging/registration-token-not-registered';
      throw error;
    },
    logger: quietLogger,
  });

  await request(app).post('/api/devices/register').send({
    deviceId: 'android-stale',
    deviceName: 'Stale Android',
    registrationToken: 'stale-device-token',
  });

  const response = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    deviceId: 'android-stale',
  });

  assert.equal(response.status, 410);
  assert.equal(response.body.error, 'device_unavailable');
  assert.equal(JSON.stringify(response.body).includes('token details'), false);
  assert.equal(JSON.stringify(response.body).includes('stale-device-token'), false);

  const devices = await request(app).get('/api/devices');
  assert.equal(devices.body.devices[0].available, false);
});

test('a stale device recovers after re-registration with a current token', async () => {
  let shouldFail = true;
  let sentToken;
  const app = createApp({
    env: { GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async (message) => {
      sentToken = message.token;
      if (shouldFail) {
        const error = new Error('stale token details');
        error.code = 'messaging/registration-token-not-registered';
        throw error;
      }
      return 'recovered-message-id';
    },
    logger: quietLogger,
  });

  const registration = {
    deviceId: 'android-recover',
    deviceName: 'Recovery Android',
    registrationToken: 'old-registration-token',
  };
  await request(app).post('/api/devices/register').send(registration);

  const failed = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    deviceId: registration.deviceId,
  });
  assert.equal(failed.status, 410);

  const unavailable = await request(app).get('/api/devices');
  assert.equal(unavailable.body.devices[0].available, false);

  shouldFail = false;
  await request(app).post('/api/devices/register').send({
    ...registration,
    registrationToken: 'current-registration-token',
  });
  const recovered = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    deviceId: registration.deviceId,
  });

  assert.equal(recovered.status, 200);
  assert.equal(sentToken, 'current-registration-token');
  const available = await request(app).get('/api/devices');
  assert.equal(available.body.devices[0].available, true);
  assert.equal(JSON.stringify(available.body).includes('current-registration-token'), false);
});

test('request IDs are unique and request history stays credential-free', async () => {
  const app = createApp({
    env: {
      FCM_TOKEN: 'history-device-token',
      GOOGLE_APPLICATION_CREDENTIALS: 'private-service-account.json',
    },
    sendMessage: async () => 'history-message-id',
    logger: quietLogger,
  });

  const first = await request(app).post('/api/dial').send({ phoneNumber: '+919876543210' });
  const second = await request(app).post('/api/dial').send({ phoneNumber: '+919876543211' });
  assert.notEqual(first.body.requestId, second.body.requestId);

  const history = await request(app).get('/api/requests');
  const historyJson = JSON.stringify(history.body);
  assert.equal(history.status, 200);
  assert.equal(history.body.count, 2);
  assert.equal(historyJson.includes('history-device-token'), false);
  assert.equal(historyJson.includes('private-service-account.json'), false);
  assert.equal(historyJson.includes('registrationToken'), false);
});

test('acknowledgements validate order, known IDs, and duplicate events', async () => {
  const app = createApp({
    env: {
      FCM_TOKEN: 'test-token',
      GOOGLE_APPLICATION_CREDENTIALS: 'test.json',
    },
    sendMessage: async () => 'message-id',
    logger: quietLogger,
  });

  const created = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    contactName: 'Acknowledgement Lead',
  });
  const requestId = created.body.requestId;

  const outOfOrder = await request(app)
    .post(`/api/requests/${requestId}/ack`)
    .send({ status: 'dialer_opened' });
  assert.equal(outOfOrder.status, 409);
  assert.equal(outOfOrder.body.error, 'invalid_status_transition');

  const received = await request(app)
    .post(`/api/requests/${requestId}/ack`)
    .send({ status: 'received' });
  assert.equal(received.status, 200);
  assert.equal(received.body.status, 'received');
  assert.equal(received.body.idempotent, false);

  const duplicate = await request(app)
    .post(`/api/requests/${requestId}/ack`)
    .send({ status: 'received' });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.idempotent, true);

  const dialerOpened = await request(app)
    .post(`/api/requests/${requestId}/ack`)
    .send({ status: 'dialer_opened' });
  assert.equal(dialerOpened.status, 200);
  assert.equal(dialerOpened.body.status, 'dialer_opened');

  const staleDismiss = await request(app)
    .post(`/api/requests/${requestId}/ack`)
    .send({ status: 'dismissed' });
  assert.equal(staleDismiss.status, 409);

  const history = await request(app).get('/api/requests');
  assert.equal(history.status, 200);
  assert.equal(history.body.count, 1);
  assert.equal(history.body.requests[0].requestId, requestId);
  assert.equal(history.body.requests[0].status, 'dialer_opened');

  const unknown = await request(app)
    .post('/api/requests/unknown-request-id/ack')
    .send({ status: 'received' });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, 'request_not_found');

  const invalidStatus = await request(app)
    .post(`/api/requests/${requestId}/ack`)
    .send({ status: 'completed' });
  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.body.error, 'invalid_acknowledgement');

  const duplicateTerminal = await request(app)
    .post(`/api/requests/${requestId}/ack`)
    .send({ status: 'dialer_opened' });
  assert.equal(duplicateTerminal.status, 200);
  assert.equal(duplicateTerminal.body.idempotent, true);
});

test('a fresh backend instance starts with empty history and device state', async () => {
  const firstApp = createApp({
    env: { FCM_TOKEN: 'instance-token', GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async () => 'instance-message-id',
    logger: quietLogger,
  });
  await request(firstApp).post('/api/devices/register').send({
    deviceId: 'android-instance',
    deviceName: 'Instance Android',
    registrationToken: 'instance-device-token',
  });
  const created = await request(firstApp).post('/api/dial').send({ phoneNumber: '+919876543210' });

  const secondApp = createApp({
    env: {},
    sendMessage: async () => 'unused',
    logger: quietLogger,
  });
  const history = await request(secondApp).get('/api/requests');
  const devices = await request(secondApp).get('/api/devices');
  const acknowledgement = await request(secondApp)
    .post(`/api/requests/${created.body.requestId}/ack`)
    .send({ status: 'received' });

  assert.equal(history.body.count, 0);
  assert.equal(devices.body.count, 0);
  assert.equal(acknowledgement.status, 404);
});

test('phone validation accepts international formatting and rejects too many digits', () => {
  assert.equal(isValidPhoneNumber('+91 (98765) 43210'), true);
  assert.equal(isValidPhoneNumber('+1234567890123456'), false);
});

test('FCM failures are classified into permanent, transient, and ambiguous outcomes', () => {
  assert.deepEqual(classifyFcmError({ code: 'messaging/registration-token-not-registered' }), {
    statusCode: 410,
    error: 'device_unavailable',
    message: 'The selected Android device token is stale. Register the device again.',
    retryable: false,
    ambiguous: false,
  });
  assert.equal(classifyFcmError({ code: 'messaging/server-unavailable' }).retryable, true);
  assert.equal(classifyFcmError({ code: 'messaging/server-unavailable' }).ambiguous, true);
  assert.equal(classifyFcmError({ code: 'messaging/invalid-argument' }).retryable, false);
  assert.equal(classifyFcmError({ code: 'messaging/mismatched-credential' }).statusCode, 503);
  assert.equal(classifyFcmError({ code: 'unexpected-error' }).ambiguous, true);
});

test('client request ID prevents duplicate FCM sends and safely replays acceptance', async () => {
  let sendCount = 0;
  const app = createApp({
    env: { FCM_TOKEN: 'test-token', GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async () => {
      sendCount += 1;
      return 'idempotent-message-id';
    },
    logger: quietLogger,
  });

  const first = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    clientRequestId: 'dashboard-request-1',
  });
  const replay = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    clientRequestId: 'dashboard-request-1',
  });

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.requestId, first.body.requestId);
  assert.equal(sendCount, 1);
});

test('client request ID rejects a different device target on replay', async () => {
  const app = createApp({
    env: { GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async () => 'idempotent-device-message-id',
    logger: quietLogger,
  });

  await request(app).post('/api/devices/register').send({
    deviceId: 'android-one',
    deviceName: 'Android One',
    registrationToken: 'device-one-token',
  });
  await request(app).post('/api/devices/register').send({
    deviceId: 'android-two',
    deviceName: 'Android Two',
    registrationToken: 'device-two-token',
  });

  const first = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    deviceId: 'android-one',
    clientRequestId: 'dashboard-request-2',
  });
  const conflict = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    deviceId: 'android-two',
    clientRequestId: 'dashboard-request-2',
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'idempotency_key_conflict');
});

test('transient FCM errors are reported as retryable without exposing details', async () => {
  const app = createApp({
    env: { FCM_TOKEN: 'test-token', GOOGLE_APPLICATION_CREDENTIALS: 'test.json' },
    sendMessage: async () => {
      const error = new Error('private transport detail');
      error.code = 'messaging/server-unavailable';
      throw error;
    },
    logger: quietLogger,
  });

  const response = await request(app).post('/api/dial').send({
    phoneNumber: '+919876543210',
    clientRequestId: 'dashboard-request-3',
  });

  assert.equal(response.status, 502);
  assert.equal(response.body.retryable, true);
  assert.equal(response.body.ambiguous, true);
  assert.equal(JSON.stringify(response.body).includes('private transport detail'), false);
});
