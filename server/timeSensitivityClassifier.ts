import type { ClaimCategory, ExtractedClaim, VolatilityTier } from '../shared/types.ts';

const HIGH_VOLATILITY_CATEGORIES = new Set<ClaimCategory>([
  'Product pricing',
  'API versions',
  'Company leadership',
  'Policies',
]);

const MEDIUM_VOLATILITY_CATEGORIES = new Set<ClaimCategory>([
  'Software features',
  'Regulations',
  'Technology updates',
  'Statistics',
]);

const CURRENT_PRESENT_TENSE_HINTS =
  /\b(currently|now|today|latest|as of|newest|active|costs?|priced at|per month|per year|ceo|president|chief executive|deprecated|supported|v\d+|version \d+)\b/i;

const HISTORICAL_FIXED_HINTS =
  /\b(was founded in|born in|died in|in \d{4} .* signed|originally released in \d{4})\b/i;

export function refineTimeSensitivityAndQueries(claims: ExtractedClaim[]): ExtractedClaim[] {
  return claims.map((claim) => {
    let isTimeSensitive = claim.isTimeSensitive;
    let volatilityTier: VolatilityTier = claim.volatilityTier;

    // Deterministic safeguard: ensure clearly present-tense volatile categories are checked
    if (!isTimeSensitive && CURRENT_PRESENT_TENSE_HINTS.test(claim.originalText)) {
      if (HIGH_VOLATILITY_CATEGORIES.has(claim.category) || MEDIUM_VOLATILITY_CATEGORIES.has(claim.category)) {
        isTimeSensitive = true;
      }
    }

    // Deterministic safeguard: purely historical founding/release-year claims shouldn't be forced as volatile
    if (
      isTimeSensitive &&
      claim.category === 'Other factual information' &&
      HISTORICAL_FIXED_HINTS.test(claim.originalText) &&
      !CURRENT_PRESENT_TENSE_HINTS.test(claim.originalText)
    ) {
      isTimeSensitive = false;
      volatilityTier = 'static';
    }

    if (isTimeSensitive) {
      if (HIGH_VOLATILITY_CATEGORIES.has(claim.category)) {
        volatilityTier = 'high';
      } else if (MEDIUM_VOLATILITY_CATEGORIES.has(claim.category) && volatilityTier === 'static') {
        volatilityTier = 'medium';
      }
    } else {
      volatilityTier = 'static';
    }

    const queries = buildSearchQueries(claim);

    return {
      ...claim,
      isTimeSensitive,
      volatilityTier,
      suggestedQueries: queries,
    };
  });
}

function buildSearchQueries(claim: ExtractedClaim): string[] {
  const baseQueries = claim.suggestedQueries.filter((q) => q.length >= 4);
  if (baseQueries.length >= 2) {
    return baseQueries.slice(0, 2);
  }

  const contextPrefix = claim.contextNote ? `${claim.contextNote.slice(0, 60)} ` : '';
  const fallbackPrimary = `${contextPrefix}${claim.originalText}`
    .replace(/["“”]/g, '')
    .trim()
    .slice(0, 180);

  if (baseQueries.length === 1) {
    // Add a secondary verification query focused on official/recent status for conflict checking
    const secondarySuffix =
      claim.category === 'API versions'
        ? 'latest version deprecation official documentation'
        : claim.category === 'Product pricing'
          ? 'official pricing plans current'
          : claim.category === 'Company leadership'
            ? 'current CEO leadership announcement'
            : 'latest update official source';
    const baseClean = baseQueries[0].slice(0, 120);
    return [baseQueries[0], `${baseClean} ${secondarySuffix}`.slice(0, 180)];
  }

  return [fallbackPrimary];
}
