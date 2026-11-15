import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  port: number;
  maxInputChars: number;
  maxContextChars: number;
  maxTitleChars: number;
  tavilyApiKey: string | null;
  tavilyTimeoutMs: number;
  bifrostBaseUrl: string | null;
  bifrostApiKey: string | null;
  bifrostModel: string | null;
  bifrostTimeoutMs: number;
  maxRetries: number;
  dataDir: string;
}

function cleanEnv(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed === 'MY_TAVILY_API_KEY' ||
    trimmed === 'tvly-YOUR_TAVILY_API_KEY' ||
    trimmed === 'sk-bf-YOUR_BIFROST_KEY' ||
    trimmed === 'https://YOUR_BIFROST_GATEWAY_URL'
  ) {
    return null;
  }
  return trimmed;
}

export function getServerConfig(): ServerConfig {
  const parsedMax = Number(process.env.MAX_INPUT_CHARS || '12000');
  const maxInputChars = Number.isFinite(parsedMax) && parsedMax >= 500 && parsedMax <= 50000 ? parsedMax : 12000;

  return {
    port: Number(process.env.PORT || '3000'),
    maxInputChars,
    maxContextChars: 1000,
    maxTitleChars: 200,
    tavilyApiKey: cleanEnv(process.env.TAVILY_API_KEY),
    tavilyTimeoutMs: 18000,
    bifrostBaseUrl: cleanEnv(process.env.BIFROST_BASE_URL),
    bifrostApiKey: cleanEnv(process.env.BIFROST_API_KEY),
    bifrostModel: cleanEnv(process.env.BIFROST_MODEL),
    bifrostTimeoutMs: 35000,
    maxRetries: 2,
    dataDir: process.env.TRUTHLENS_DATA_DIR || './data',
  };
}

export function getSafeHostLabel(urlString: string | null): string | null {
  if (!urlString) return null;
  try {
    const parsed = new URL(urlString);
    return parsed.origin;
  } catch {
    return 'Invalid URL format';
  }
}
