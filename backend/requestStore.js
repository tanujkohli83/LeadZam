const crypto = require('node:crypto');

const REQUEST_STATUS = Object.freeze({
  SENDING: 'sending',
  ACCEPTED: 'accepted',
  RECEIVED: 'received',
  DIALER_OPENED: 'dialer_opened',
  DISMISSED: 'dismissed',
  FAILED: 'failed',
});

const ACKNOWLEDGEMENT_STATUSES = new Set([
  REQUEST_STATUS.RECEIVED,
  REQUEST_STATUS.DIALER_OPENED,
  REQUEST_STATUS.DISMISSED,
  REQUEST_STATUS.FAILED,
]);

const ALLOWED_TRANSITIONS = {
  [REQUEST_STATUS.SENDING]: new Set([
    REQUEST_STATUS.ACCEPTED,
    REQUEST_STATUS.FAILED,
  ]),
  [REQUEST_STATUS.ACCEPTED]: new Set([
    REQUEST_STATUS.RECEIVED,
    REQUEST_STATUS.DISMISSED,
    REQUEST_STATUS.FAILED,
  ]),
  [REQUEST_STATUS.RECEIVED]: new Set([
    REQUEST_STATUS.DIALER_OPENED,
    REQUEST_STATUS.DISMISSED,
    REQUEST_STATUS.FAILED,
  ]),
  [REQUEST_STATUS.DIALER_OPENED]: new Set(),
  [REQUEST_STATUS.DISMISSED]: new Set(),
  [REQUEST_STATUS.FAILED]: new Set(),
};

function cloneRecord(record) {
  return record ? { ...record } : null;
}

function createRequestStore({
  maxEntries = 100,
  idFactory = crypto.randomUUID,
  now = () => Date.now(),
} = {}) {
  const records = new Map();
  const recordsByClientRequestId = new Map();
  const clientRequestIdsByRequestId = new Map();

  function save(record) {
    records.set(record.requestId, record);
    while (records.size > maxEntries) {
      const oldestRequestId = records.keys().next().value;
      const oldest = records.get(oldestRequestId);
      records.delete(oldestRequestId);
      const clientRequestId = clientRequestIdsByRequestId.get(oldestRequestId);
      if (clientRequestId) {
        recordsByClientRequestId.delete(clientRequestId);
        clientRequestIdsByRequestId.delete(oldestRequestId);
      }
    }
  }

  function create({
    phoneNumber,
    contactName,
    deviceId = null,
    deviceName = null,
    clientRequestId = null,
  }) {
    const timestampMs = now();
    const record = {
      requestId: idFactory(),
      phoneNumber,
      contactName,
      deviceId,
      deviceName,
      status: REQUEST_STATUS.SENDING,
      createdAt: new Date(timestampMs).toISOString(),
      updatedAt: new Date(timestampMs).toISOString(),
    };
    save(record);
    if (clientRequestId) {
      recordsByClientRequestId.set(clientRequestId, record.requestId);
      clientRequestIdsByRequestId.set(record.requestId, clientRequestId);
    }
    return cloneRecord(record);
  }

  function transition(requestId, status, { messageId, internal = false } = {}) {
    if (!internal && !ACKNOWLEDGEMENT_STATUSES.has(status)) {
      return { ok: false, reason: 'invalid_status', record: null };
    }

    const record = records.get(requestId);
    if (!record) return { ok: false, reason: 'not_found', record: null };

    if (record.status === status) {
      return { ok: true, idempotent: true, record: cloneRecord(record) };
    }

    if (!ALLOWED_TRANSITIONS[record.status]?.has(status)) {
      return { ok: false, reason: 'invalid_transition', record: cloneRecord(record) };
    }

    record.status = status;
    record.updatedAt = new Date(now()).toISOString();
    if (messageId) record.messageId = messageId;
    save(record);
    return { ok: true, idempotent: false, record: cloneRecord(record) };
  }

  function get(requestId) {
    return cloneRecord(records.get(requestId));
  }

  function getByClientRequestId(clientRequestId) {
    const requestId = recordsByClientRequestId.get(clientRequestId);
    return requestId ? cloneRecord(records.get(requestId)) : null;
  }

  function list() {
    return [...records.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneRecord);
  }

  return {
    acknowledge: (requestId, status) => transition(requestId, status),
    create,
    get,
    getByClientRequestId,
    list,
    markAccepted: (requestId, messageId) =>
      transition(requestId, REQUEST_STATUS.ACCEPTED, { messageId, internal: true }),
    markFailed: (requestId) => transition(requestId, REQUEST_STATUS.FAILED),
  };
}

module.exports = {
  ACKNOWLEDGEMENT_STATUSES,
  ALLOWED_TRANSITIONS,
  REQUEST_STATUS,
  createRequestStore,
};
