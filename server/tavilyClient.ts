import { z } from 'zod';
import type { IntegrationStatus, WebEvidenceSource } from '../shared/types.ts';
import { getServerConfig } from './config.ts';
import {
  ConfigurationError,
  ExternalApiError,
  RateLimitError,
  TimeoutError,
} from './errors.ts';
import { isValidHttpUrl, sanitizeUntrustedText } from './validation.ts';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

const TavilyResultItemSchema = z.object({
  title: z.string().optional().default('Untitled Source'),
  url: z.string(),
  content: z.string().optional().default(''),
  score: z.number().optional().nullable(),
  published_date: z.string().optional().nullable(),
});

const TavilyResponseSchema = z.object({
  query: z.string().optional(),
  results: z.array(TavilyResultItemSchema).default([]),
  response_time: z.number().optional(),
});

export function assertTavilyConfigured(): {
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
} {
  const cfg = getServerConfig();
  if (!cfg.tavilyApiKey) {
    throw new ConfigurationError(
      'Tavily Search API is not configured on the server. Missing environment variable: TAVILY_API_KEY.',
      'tavily',
      'TAVILY_NOT_CONFIGURED'
    );
  }
  return {
    apiKey: cfg.tavilyApiKey,
    timeoutMs: cfg.tavilyTimeoutMs,
    maxRetries: cfg.maxRetries,
  };
}

function normalizePublishedDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return trimmed;
  }
  return new Date(parsed).toISOString();
}

export async function searchTavily(
  query: string,
  options: {
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    topic?: 'general' | 'news' | 'finance';
  } = {}
): Promise<WebEvidenceSource[]> {
  const { apiKey, timeoutMs, maxRetries } = assertTavilyConfigured();
  const cleanQuery = query.trim().slice(0, 400);
  if (!cleanQuery) {
    return [];
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(TAVILY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: cleanQuery,
          search_depth: options.searchDepth ?? 'advanced',
          topic: options.topic ?? 'general',
          max_results: options.maxResults ?? 5,
          include_answer: false,
          include_raw_content: false,
          include_images: false,
          include_published_date: true,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const retrievedAt = new Date().toISOString();

      if (response.status === 401 || response.status === 403) {
        throw new ExternalApiError(
          `Tavily authentication failed (HTTP ${response.status}). Verify TAVILY_API_KEY on the server.`,
          'tavily',
          502,
          'TAVILY_AUTH_FAILED',
          false
        );
      }

      if (response.status === 429) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          continue;
        }
        throw new RateLimitError(
          'Tavily Search API rate limit reached. Please retry after a short pause.',
          'tavily',
          'TAVILY_RATE_LIMIT'
        );
      }

      if (response.status >= 500) {
        const bodyText = await response.text().catch(() => '');
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw new ExternalApiError(
          `Tavily Search API returned HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 160)}` : ''}.`,
          'tavily',
          502,
          'TAVILY_UPSTREAM_ERROR',
          true
        );
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new ExternalApiError(
          `Tavily Search API error (HTTP ${response.status})${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}.`,
          'tavily',
          502,
          'TAVILY_REQUEST_FAILED',
          false
        );
      }

      const rawJson = await response.json();
      const parsed = TavilyResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        throw new ExternalApiError(
          'Tavily returned an unexpected response payload.',
          'tavily',
          502,
          'TAVILY_INVALID_RESPONSE',
          false
        );
      }

      const sources: WebEvidenceSource[] = [];
      for (let i = 0; i < parsed.data.results.length; i++) {
        const item = parsed.data.results[i];
        if (!isValidHttpUrl(item.url)) {
          continue;
        }
        sources.push({
          id: `SRC-${Date.now()}-${i + 1}`,
          title: sanitizeUntrustedText(item.title || item.url, 220),
          url: item.url,
          snippet: sanitizeUntrustedText(item.content || '', 1200),
          publishedDate: normalizePublishedDate(item.published_date),
          retrievedAt,
          relevanceScore: typeof item.score === 'number' ? Number(item.score.toFixed(4)) : null,
          queryUsed: cleanQuery,
        });
      }

      return sources;
    } catch (err) {
      if (err instanceof ExternalApiError || err instanceof RateLimitError || err instanceof ConfigurationError) {
        if (!err.retryable || attempt >= maxRetries) {
          throw err;
        }
      } else if (err instanceof DOMException && err.name === 'TimeoutError') {
        if (attempt >= maxRetries) {
          throw new TimeoutError(
            `Tavily Search API timed out after ${Math.round(timeoutMs / 1000)}s.`,
            'tavily',
            'TAVILY_TIMEOUT'
          );
        }
      } else if (attempt >= maxRetries) {
        const msg = err instanceof Error ? err.message : 'Network failure';
        throw new ExternalApiError(
          `Unable to reach Tavily Search API: ${msg}`,
          'tavily',
          502,
          'TAVILY_UNREACHABLE',
          true
        );
      }
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }

  return [];
}

export async function getTavilyStatus(runLiveTest: boolean): Promise<IntegrationStatus> {
  const cfg = getServerConfig();
  if (!cfg.tavilyApiKey) {
    return {
      configured: false,
      status: 'unconfigured',
      endpointHost: 'https://api.tavily.com',
      model: null,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      error: 'Missing server environment variable: TAVILY_API_KEY.',
      missingVars: ['TAVILY_API_KEY'],
    };
  }

  if (!runLiveTest) {
    return {
      configured: true,
      status: 'untested',
      endpointHost: 'https://api.tavily.com',
      model: null,
      latencyMs: null,
      checkedAt: null,
      error: null,
      missingVars: [],
    };
  }

  const start = Date.now();
  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.tavilyApiKey}`,
      },
      body: JSON.stringify({
        query: 'Tavily API documentation',
        search_depth: 'basic',
        max_results: 1,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        configured: true,
        status: 'disconnected',
        endpointHost: 'https://api.tavily.com',
        model: null,
        latencyMs,
        checkedAt: new Date().toISOString(),
        error: `HTTP ${response.status} from Tavily${text ? `: ${text.slice(0, 160)}` : ''}`,
        missingVars: [],
      };
    }

    const json = await response.json().catch(() => null);
    const parsed = TavilyResponseSchema.safeParse(json);
    if (!parsed.success) {
      return {
        configured: true,
        status: 'disconnected',
        endpointHost: 'https://api.tavily.com',
        model: null,
        latencyMs,
        checkedAt: new Date().toISOString(),
        error: 'Tavily returned an invalid JSON payload.',
        missingVars: [],
      };
    }

    return {
      configured: true,
      status: 'connected',
      endpointHost: 'https://api.tavily.com',
      model: null,
      latencyMs,
      checkedAt: new Date().toISOString(),
      error: null,
      missingVars: [],
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof DOMException && err.name === 'TimeoutError'
        ? 'Tavily connection test timed out after 10s.'
        : err instanceof Error
          ? err.message
          : 'Network error connecting to Tavily.';
    return {
      configured: true,
      status: 'disconnected',
      endpointHost: 'https://api.tavily.com',
      model: null,
      latencyMs,
      checkedAt: new Date().toISOString(),
      error: message,
      missingVars: [],
    };
  }
}
