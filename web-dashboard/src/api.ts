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
}

export type ApiErrorKind = 'network' | 'http' | 'parse';

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
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

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
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
      );
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiRequestError(
        'The backend request timed out. Check that the backend is running.',
        'network',
      );
    }
    throw new ApiRequestError(
      'The backend is unavailable. Start the backend and try again.',
      'network',
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
): Promise<DialResponse> {
  const body = await requestJson<Partial<DialResponse>>(`${apiBaseUrl}/api/dial`, {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, contactName }),
  });

  if (!body || body.success !== true || typeof body.message !== 'string') {
    throw new ApiRequestError(
      'The backend returned an invalid dial response.',
      'parse',
    );
  }

  return body as DialResponse;
}
