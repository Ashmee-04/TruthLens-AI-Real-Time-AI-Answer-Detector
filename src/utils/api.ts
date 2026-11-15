import type {
  HealthResponse,
  HistoryListResponse,
  VerificationProgressEvent,
  VerificationRecord,
} from '../../shared/types.ts';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly provider?: string;

  constructor(message: string, status = 500, code = 'API_ERROR', provider?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.provider = provider;
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractApiError(data: unknown, fallbackStatus: number): ApiClientError {
  if (data && typeof data === 'object' && 'error' in data) {
    const errObj = (data as { error: Record<string, unknown> }).error;
    return new ApiClientError(
      String(errObj.message || `Request failed with status ${fallbackStatus}.`),
      fallbackStatus,
      String(errObj.code || 'API_ERROR'),
      errObj.provider ? String(errObj.provider) : undefined
    );
  }
  return new ApiClientError(
    `Backend request failed with HTTP ${fallbackStatus}.`,
    fallbackStatus,
    'HTTP_ERROR'
  );
}

export async function fetchHealth(live = false): Promise<HealthResponse> {
  try {
    const url = live ? '/api/health?live=true' : '/api/health';
    const res = await fetch(url, { method: 'GET' });
    const data = await parseJsonSafe(res);
    if (!res.ok) throw extractApiError(data, res.status);
    return data as HealthResponse;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError(
      'Unable to reach the TruthLens AI backend server. Ensure the server is running.',
      0,
      'BACKEND_UNAVAILABLE',
      'server'
    );
  }
}

export async function testConnections(): Promise<HealthResponse> {
  try {
    const res = await fetch('/api/health/test', { method: 'POST' });
    const data = await parseJsonSafe(res);
    if (!res.ok) throw extractApiError(data, res.status);
    return data as HealthResponse;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError(
      'Unable to reach the TruthLens AI backend server to test API connections.',
      0,
      'BACKEND_UNAVAILABLE',
      'server'
    );
  }
}

export async function fetchHistory(): Promise<HistoryListResponse> {
  try {
    const res = await fetch('/api/history');
    const data = await parseJsonSafe(res);
    if (!res.ok) throw extractApiError(data, res.status);
    return data as HistoryListResponse;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError(
      'Unable to load verification history because the backend server is unreachable.',
      0,
      'BACKEND_UNAVAILABLE',
      'server'
    );
  }
}

export async function fetchReportById(id: string): Promise<VerificationRecord> {
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(id)}`);
    const data = await parseJsonSafe(res);
    if (!res.ok) throw extractApiError(data, res.status);
    return data as VerificationRecord;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError('Failed to fetch verification report.', 0, 'BACKEND_UNAVAILABLE');
  }
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await parseJsonSafe(res);
    if (!res.ok) throw extractApiError(data, res.status);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError('Failed to delete verification record.', 0, 'BACKEND_UNAVAILABLE');
  }
}

export async function runVerificationStream(
  payload: { answer: string; title?: string; context?: string },
  onProgress: (event: VerificationProgressEvent) => void
): Promise<VerificationRecord> {
  let res: Response;
  try {
    res = await fetch('/api/verify?stream=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiClientError(
      'Cannot connect to the TruthLens AI verification backend. Check that the server is running.',
      0,
      'BACKEND_UNAVAILABLE',
      'server'
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    const data = await parseJsonSafe(res);
    throw extractApiError(data, res.status);
  }

  if (!res.body) {
    throw new ApiClientError('Backend did not return a readable response stream.', 500, 'STREAM_ERROR');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalRecord: VerificationRecord | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        let evt: VerificationProgressEvent;
        try {
          evt = JSON.parse(jsonStr) as VerificationProgressEvent;
        } catch {
          continue;
        }

        onProgress(evt);

        if (evt.stage === 'error' && evt.error) {
          throw new ApiClientError(
            evt.error.message,
            502,
            evt.error.code,
            evt.error.provider
          );
        }

        if (evt.stage === 'completed' && evt.record) {
          finalRecord = evt.record;
        }
      }
    }
  }

  if (!finalRecord) {
    throw new ApiClientError(
      'Verification stream ended unexpectedly before a report was received.',
      500,
      'INCOMPLETE_STREAM',
      'server'
    );
  }

  return finalRecord;
}
