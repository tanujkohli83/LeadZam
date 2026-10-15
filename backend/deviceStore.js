const DEFAULT_DEVICE_NAME = 'Android device';
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function cloneRecord(record) {
  return record ? { ...record } : null;
}

function isValidDeviceId(deviceId) {
  return typeof deviceId === 'string' && DEVICE_ID_PATTERN.test(deviceId.trim());
}

function isValidDeviceName(deviceName) {
  return (
    typeof deviceName === 'string' &&
    deviceName.trim().length >= 1 &&
    deviceName.trim().length <= 80
  );
}

function isValidRegistrationToken(registrationToken) {
  return (
    typeof registrationToken === 'string' &&
    registrationToken.trim().length >= 1 &&
    registrationToken.trim().length <= 4096
  );
}

function toPublicDevice(record, defaultDeviceId) {
  if (!record) return null;
  return {
    deviceId: record.deviceId,
    deviceName: record.deviceName,
    available: record.available,
    registeredAt: record.registeredAt,
    lastSeenAt: record.lastSeenAt,
    isDefault: record.deviceId === defaultDeviceId,
  };
}

function createDeviceStore({
  now = () => Date.now(),
} = {}) {
  const records = new Map();
  let defaultDeviceId = null;

  function register({ deviceId, deviceName, registrationToken }) {
    const timestamp = new Date(now()).toISOString();
    const existing = records.get(deviceId);
    const record = {
      deviceId,
      deviceName,
      registrationToken,
      available: true,
      registeredAt: existing?.registeredAt || timestamp,
      lastSeenAt: timestamp,
    };

    records.set(deviceId, record);
    if (!defaultDeviceId) defaultDeviceId = deviceId;
    return toPublicDevice(record, defaultDeviceId);
  }

  function get(deviceId) {
    return cloneRecord(records.get(deviceId));
  }

  function list() {
    return [...records.values()]
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .map((record) => toPublicDevice(record, defaultDeviceId));
  }

  function resolveTarget(deviceId) {
    if (deviceId) return get(deviceId);
    if (defaultDeviceId) return get(defaultDeviceId);
    return null;
  }

  function markUnavailable(deviceId) {
    const record = records.get(deviceId);
    if (!record) return null;
    record.available = false;
    return toPublicDevice(record, defaultDeviceId);
  }

  return {
    get,
    getDefaultDeviceId: () => defaultDeviceId,
    list,
    markUnavailable,
    register,
    resolveTarget,
  };
}

module.exports = {
  DEFAULT_DEVICE_NAME,
  createDeviceStore,
  isValidDeviceId,
  isValidDeviceName,
  isValidRegistrationToken,
};
