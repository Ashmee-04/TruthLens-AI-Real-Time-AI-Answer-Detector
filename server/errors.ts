import type { NextFunction, Request, Response } from 'express';

export type ErrorProvider = 'bifrost' | 'tavily' | 'server';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly provider: ErrorProvider;
  public readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      provider?: ErrorProvider;
      retryable?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.provider = options.provider ?? 'server';
    this.retryable = options.retryable ?? false;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message, { statusCode: 400, code, provider: 'server', retryable: false });
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, provider: ErrorProvider, code = 'CONFIGURATION_ERROR') {
    super(message, { statusCode: 503, code, provider, retryable: false });
    this.name = 'ConfigurationError';
  }
}

export class ExternalApiError extends AppError {
  constructor(
    message: string,
    provider: 'bifrost' | 'tavily',
    statusCode = 502,
    code = 'EXTERNAL_API_ERROR',
    retryable = false
  ) {
    super(message, { statusCode, code, provider, retryable });
    this.name = 'ExternalApiError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, provider: ErrorProvider, code = 'RATE_LIMIT_EXCEEDED') {
    super(message, { statusCode: 429, code, provider, retryable: true });
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, provider: ErrorProvider, code = 'REQUEST_TIMEOUT') {
    super(message, { statusCode: 504, code, provider, retryable: true });
    this.name = 'TimeoutError';
  }
}

export function serializeSafeError(err: unknown): {
  statusCode: number;
  code: string;
  message: string;
  provider: ErrorProvider;
  retryable: boolean;
} {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      provider: err.provider,
      retryable: err.retryable,
    };
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Request body must be valid JSON.',
      provider: 'server',
      retryable: false,
    };
  }

  const fallbackMessage =
    err instanceof Error && err.message
      ? err.message
      : 'An unexpected server error occurred during verification.';

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: fallbackMessage,
    provider: 'server',
    retryable: false,
  };
}

export function errorHandlerMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const safe = serializeSafeError(err);
  if (!res.headersSent) {
    res.status(safe.statusCode).json({
      error: {
        code: safe.code,
        message: safe.message,
        provider: safe.provider,
        retryable: safe.retryable,
      },
    });
  }
}
