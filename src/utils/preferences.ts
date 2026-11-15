import type { AppPreferences } from '../../shared/types.ts';

const STORAGE_KEY = 'truthlens_ai_preferences_v1';

export const DEFAULT_PREFERENCES: AppPreferences = {
  expandAllClaimsByDefault: false,
  showMethodologyNotes: true,
  compactTableRows: false,
};

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      expandAllClaimsByDefault: Boolean(parsed.expandAllClaimsByDefault),
      showMethodologyNotes:
        parsed.showMethodologyNotes === undefined ? true : Boolean(parsed.showMethodologyNotes),
      compactTableRows: Boolean(parsed.compactTableRows),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: AppPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota issues cleanly
  }
}
