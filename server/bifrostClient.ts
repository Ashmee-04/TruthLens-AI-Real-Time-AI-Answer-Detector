import { z } from 'zod';
import type { IntegrationStatus } from '../shared/types.ts';
import { getSafeHostLabel, getServerConfig } from './config.ts';
import {
  ConfigurationError,
  ExternalApiError,
  RateLimitError,
  TimeoutError,
} from './errors.ts';
import { extractJsonFromModelText } from './validation.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const ChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
        }),
      })
    )
    .min(1),
});

function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  if (normalized.endsWith('/v1') || normalized.endsWith('/openai/v1')) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function buildBifrostHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey.startsWith('sk-bf-')) {
    headers['x-bf-vk'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

export function getBifrostMissingVars(): string[] {
  const cfg = getServerConfig();
  const missing: string[] = [];
  if (!cfg.bifrostBaseUrl) missing.push('BIFROST_BASE_URL');
  if (!cfg.bifrostApiKey) missing.push('BIFROST_API_KEY');
  if (!cfg.bifrostModel) missing.push('BIFROST_MODEL');
  return missing;
}

export function assertBifrostConfigured(): {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
} {
  const cfg = getServerConfig();
  const missing = getBifrostMissingVars();
  if (missing.length > 0 || !cfg.bifrostBaseUrl || !cfg.bifrostApiKey || !cfg.bifrostModel) {
    throw new ConfigurationError(
      `Bifrost AI gateway is not configured on the server. Missing environment variables: ${missing.join(', ')}.`,
      'bifrost',
      'BIFROST_NOT_CONFIGURED'
    );
  }
  return {
    baseUrl: cfg.bifrostBaseUrl,
    apiKey: cfg.bifrostApiKey,
    model: cfg.bifrostModel,
    timeoutMs: cfg.bifrostTimeoutMs,
    maxRetries: cfg.maxRetries,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callBifrostJson<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const { baseUrl, apiKey, model, timeoutMs, maxRetries } = assertBifrostConfigured();
  const endpoint = buildChatCompletionsUrl(baseUrl);
  const headers = buildBifrostHeaders(apiKey);

  let useJsonMode = true;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const payload: Record<string, unknown> = {
        model,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 2500,
      };
      if (useJsonMode) {
        payload.response_format = { type: 'json_object' };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 400 && useJsonMode) {
        const errBody = await response.text().catch(() => '');
        if (/response_format|json_object/i.test(errBody)) {
          useJsonMode = false;
          continue;
        }
      }

      if (response.status === 401 || response.status === 403) {
        throw new ExternalApiError(
          `Bifrost authentication failed (HTTP ${response.status}). Verify BIFROST_API_KEY and gateway permissions.`,
          'bifrost',
          502,
          'BIFROST_AUTH_FAILED',
          false
        );
      }

      if (response.status === 429) {
        if (attempt < maxRetries) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw new RateLimitError(
          'Bifrost gateway rate limit exceeded. Please wait briefly and try again.',
          'bifrost',
          'BIFROST_RATE_LIMIT'
        );
      }

      if (response.status >= 500) {
        const bodyText = await response.text().catch(() => '');
        if (attempt < maxRetries) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        throw new ExternalApiError(
          `Bifrost gateway returned HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}.`,
          'bifrost',
          502,
          'BIFROST_UPSTREAM_ERROR',
          true
        );
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new ExternalApiError(
          `Bifrost request failed with HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}.`,
          'bifrost',
          502,
          'BIFROST_REQUEST_FAILED',
          false
        );
      }

      const rawJson = await response.json();
      const parsedEnvelope = ChatCompletionResponseSchema.safeParse(rawJson);
      if (!parsedEnvelope.success) {
        throw new ExternalApiError(
          'Bifrost returned an unexpected response structure (missing choices/message content).',
          'bifrost',
          502,
          'BIFROST_INVALID_RESPONSE',
          false
        );
      }

      const content = parsedEnvelope.data.choices[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new ExternalApiError(
          'Bifrost returned an empty completion payload.',
          'bifrost',
          502,
          'BIFROST_EMPTY_RESPONSE',
          false
        );
      }

      const extractedJson = extractJsonFromModelText(content);
      const validated = schema.safeParse(extractedJson);
      if (!validated.success) {
        throw new ExternalApiError(
          `Bifrost output failed schema validation: ${validated.error.issues[0]?.message || 'invalid structure'}.`,
          'bifrost',
          502,
          'BIFROST_SCHEMA_MISMATCH',
          false
        );
      }

      return validated.data;
    } catch (err) {
      lastError = err;
      if (err instanceof ExternalApiError || err instanceof RateLimitError || err instanceof ConfigurationError) {
        if (!err.retryable || attempt >= maxRetries) {
          throw err;
        }
      } else if (err instanceof DOMException && err.name === 'TimeoutError') {
        if (attempt >= maxRetries) {
          throw new TimeoutError(
            `Bifrost gateway request timed out after ${Math.round(timeoutMs / 1000)}s.`,
            'bifrost',
            'BIFROST_TIMEOUT'
          );
        }
      } else if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError(
          `Bifrost gateway request timed out after ${Math.round(timeoutMs / 1000)}s.`,
          'bifrost',
          'BIFROST_TIMEOUT'
        );
      } else if (attempt >= maxRetries) {
        const msg = err instanceof Error ? err.message : 'Unknown network error';
        throw new ExternalApiError(
          `Unable to reach Bifrost gateway: ${msg}`,
          'bifrost',
          502,
          'BIFROST_UNREACHABLE',
          true
        );
      }
      await sleep(700 * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ExternalApiError('Bifrost call failed after retries.', 'bifrost');
}

export async function getBifrostStatus(runLiveTest: boolean): Promise<IntegrationStatus> {
  const cfg = getServerConfig();
  const missing = getBifrostMissingVars();
  const endpointHost = getSafeHostLabel(cfg.bifrostBaseUrl);

  if (missing.length > 0 || !cfg.bifrostBaseUrl || !cfg.bifrostApiKey || !cfg.bifrostModel) {
    return {
      configured: false,
      status: 'unconfigured',
      endpointHost,
      model: cfg.bifrostModel,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      error: `Missing server environment variable(s): ${missing.join(', ')}.`,
      missingVars: missing,
    };
  }

  if (!runLiveTest) {
    return {
      configured: true,
      status: 'untested',
      endpointHost,
      model: cfg.bifrostModel,
      latencyMs: null,
      checkedAt: null,
      error: null,
      missingVars: [],
    };
  }

  const start = Date.now();
  try {
    const endpoint = buildChatCompletionsUrl(cfg.bifrostBaseUrl);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildBifrostHeaders(cfg.bifrostApiKey),
      body: JSON.stringify({
        model: cfg.bifrostModel,
        messages: [{ role: 'user', content: 'Respond with JSON: {"ok": true}' }],
        temperature: 0,
        max_tokens: 20,
      }),
      signal: AbortSignal.timeout(12000),
    });

    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        configured: true,
        status: 'disconnected',
        endpointHost,
        model: cfg.bifrostModel,
        latencyMs,
        checkedAt: new Date().toISOString(),
        error: `HTTP ${response.status} from Bifrost${text ? `: ${text.slice(0, 160)}` : ''}`,
        missingVars: [],
      };
    }

    const data = await response.json().catch(() => null);
    const valid = ChatCompletionResponseSchema.safeParse(data);
    if (!valid.success) {
      return {
        configured: true,
        status: 'disconnected',
        endpointHost,
        model: cfg.bifrostModel,
        latencyMs,
        checkedAt: new Date().toISOString(),
        error: 'Connected to endpoint, but response did not match OpenAI-compatible chat completion format.',
        missingVars: [],
      };
    }

    return {
      configured: true,
      status: 'connected',
      endpointHost,
      model: cfg.bifrostModel,
      latencyMs,
      checkedAt: new Date().toISOString(),
      error: null,
      missingVars: [],
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof DOMException && err.name === 'TimeoutError'
        ? 'Connection test timed out after 12s.'
        : err instanceof Error
          ? err.message
          : 'Network error connecting to Bifrost.';
    return {
      configured: true,
      status: 'disconnected',
      endpointHost,
      model: cfg.bifrostModel,
      latencyMs,
      checkedAt: new Date().toISOString(),
      error: message,
      missingVars: [],
    };
  }
}
