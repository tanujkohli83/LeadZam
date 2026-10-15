import type { DeviceRecord, RequestRecord, RequestStatus } from './types';

export interface HealthResponse {
  status: string;
  service?: string;
  firebase?: {
    credentialsConfigured?: boolean;
    tokenConfigured?: boolean;
  };
}

export interface DialResponse {
  success: true;
  message: string;
  messageId?: string;
  requestId: string;
  status: 'accepted';
  device: {
    deviceId: string | null;
    deviceName: string;
  };
}

export interface DeviceListResponse {
  devices: DeviceRecord[];
  count: number;
  defaultDeviceId: string | null;
}

export interface RequestHistoryResponse {
  requests: RequestRecord[];
  count: number;
}

export type ApiErrorKind = 'network' | 'http' | 'parse';

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly ambiguous: boolean;

  constructor(
    message: string,
    kind: ApiErrorKind,
    status?: number,
    details: {
      code?: string;
      requestId?: string;
      retryable?: boolean;
      ambiguous?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
    this.code = details.code;
    this.requestId = details.requestId;
    this.retryable = details.retryable ?? false;
    this.ambiguous = details.ambiguous ?? false;
  }
}

const REQUEST_TIMEOUT_MS = 8_000;

function getErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = body.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function getErrorDetails(body: unknown) {
  if (typeof body !== 'object' || body === null) return {};
  const response = body as Record<string, unknown>;
  return {
    code: typeof response.error === 'string' ? response.error : undefined,
    requestId: typeof response.requestId === 'string' ? response.requestId : undefined,
    retryable: response.retryable === true,
    ambiguous: response.ambiguous === true,
  };
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  behavior: { ambiguousOnNetwork?: boolean } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    const rawBody = await response.text();
    let body: unknown = null;
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new ApiRequestError(
          'The backend returned a response that could not be parsed.',
          'parse',
          response.status,
        );
      }
    }

    if (!response.ok) {
      throw new ApiRequestError(
        getErrorMessage(body, `The backend returned HTTP ${response.status}.`),
        'http',
        response.status,
        getErrorDetails(body),
      );
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiRequestError(
        'The backend request timed out. Check that the backend is running.',
        'network',
        undefined,
        { ambiguous: behavior.ambiguousOnNetwork === true },
      );
    }
    throw new ApiRequestError(
      'The backend is unavailable. Start the backend and try again.',
      'network',
      undefined,
      { ambiguous: behavior.ambiguousOnNetwork === true },
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function checkBackendHealth(
  apiBaseUrl: string,
): Promise<HealthResponse> {
  const body = await requestJson<HealthResponse>(`${apiBaseUrl}/health`);
  if (!body || body.status !== 'ok') {
    throw new ApiRequestError(
      'The backend health check returned an invalid response.',
      'parse',
    );
  }
  return body;
}

export async function sendDialRequest(
  apiBaseUrl: string,
  phoneNumber: string,
  contactName: string,
  deviceId?: string,
  clientRequestId?: string,
): Promise<DialResponse> {
  const body = await requestJson<Partial<DialResponse>>(
    `${apiBaseUrl}/api/dial`,
    {
      method: 'POST',
      body: JSON.stringify({
        phoneNumber,
        contactName,
        ...(deviceId ? { deviceId } : {}),
        ...(clientRequestId ? { clientRequestId } : {}),
      }),
    },
    { ambiguousOnNetwork: true },
  );

  if (
    !body ||
    body.success !== true ||
    typeof body.message !== 'string' ||
    typeof body.requestId !== 'string' ||
    body.status !== 'accepted' ||
    !body.device ||
    typeof body.device.deviceName !== 'string' ||
    (body.device.deviceId !== null && typeof body.device.deviceId !== 'string')
  ) {
    throw new ApiRequestError(
      'The backend returned an invalid dial response.',
      'parse',
    );
  }

  return body as DialResponse;
}

export async function getRequestHistory(
  apiBaseUrl: string,
): Promise<RequestHistoryResponse> {
  const body = await requestJson<Partial<RequestHistoryResponse>>(
    `${apiBaseUrl}/api/requests`,
  );

  if (
    !body ||
    !Array.isArray(body.requests) ||
    typeof body.count !== 'number' ||
    !Number.isInteger(body.count) ||
    body.count < 0 ||
    body.count !== body.requests.length ||
    body.requests.some((request) => !isRequestRecord(request))
  ) {
    throw new ApiRequestError(
      'The backend returned an invalid request history response.',
      'parse',
    );
  }

  return body as RequestHistoryResponse;
}

export async function getDevices(apiBaseUrl: string): Promise<DeviceListResponse> {
  const body = await requestJson<Partial<DeviceListResponse>>(`${apiBaseUrl}/api/devices`);

  if (
    !body ||
    !Array.isArray(body.devices) ||
    typeof body.count !== 'number' ||
    !Number.isInteger(body.count) ||
    body.count < 0 ||
    body.count !== body.devices.length ||
    (body.defaultDeviceId !== null && typeof body.defaultDeviceId !== 'string') ||
    (body.defaultDeviceId !== null &&
      !body.devices.some((device) => device && device.deviceId === body.defaultDeviceId)) ||
    body.devices.some((device) => !isDeviceRecord(device))
  ) {
    throw new ApiRequestError(
      'The backend returned an invalid device list response.',
      'parse',
    );
  }

  return body as DeviceListResponse;
}

function isRequestRecord(value: unknown): value is RequestRecord {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<RequestRecord>;
  const statuses: RequestStatus[] = [
    'sending',
    'accepted',
    'received',
    'dialer_opened',
    'dismissed',
    'failed',
  ];
  return (
    typeof request.requestId === 'string' &&
    typeof request.phoneNumber === 'string' &&
    typeof request.contactName === 'string' &&
    (request.deviceId === null || typeof request.deviceId === 'string') &&
    typeof request.deviceName === 'string' &&
    typeof request.createdAt === 'string' &&
    typeof request.updatedAt === 'string' &&
    statuses.includes(request.status as RequestStatus)
  );
}

function isDeviceRecord(value: unknown): value is DeviceRecord {
  if (!value || typeof value !== 'object') return false;
  const device = value as Partial<DeviceRecord>;
  return (
    typeof device.deviceId === 'string' &&
    typeof device.deviceName === 'string' &&
    typeof device.available === 'boolean' &&
    typeof device.registeredAt === 'string' &&
    typeof device.lastSeenAt === 'string' &&
    typeof device.isDefault === 'boolean'
  );
}
