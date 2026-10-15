const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const { createApp, isValidPhoneNumber } = require('../index');

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
  assert.deepEqual(response.body, {
    success: true,
    message: 'FCM message accepted by Firebase.',
    messageId: 'projects/test/messages/123',
  });
  assert.deepEqual(sentMessage, {
    token: 'test-token',
    data: {
      type: 'dial_request',
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
  assert.equal(JSON.stringify(response.body).includes('private Firebase'), false);
  assert.equal(JSON.stringify(response.body).includes('secret-token'), false);
});

test('phone validation accepts international formatting and rejects too many digits', () => {
  assert.equal(isValidPhoneNumber('+91 (98765) 43210'), true);
  assert.equal(isValidPhoneNumber('+1234567890123456'), false);
});
