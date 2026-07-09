import { UserModelSettings, DEFAULT_USER_MODEL_SETTINGS } from '../types/modelSettings';

const STORAGE_KEY = 'infinite-canvas:user-model-settings:v1';

export function loadUserModelSettings(): UserModelSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_MODEL_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_USER_MODEL_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_USER_MODEL_SETTINGS };
  }
}

export function saveUserModelSettings(settings: UserModelSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, updatedAt: Date.now() }));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function clearUserModelSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key ? '****' : '';
  return key.slice(0, 3) + '****' + key.slice(-4);
}

export function validateApiKeyFormat(key: string): { valid: boolean; reason?: string } {
  if (!key || !key.trim()) return { valid: false, reason: 'API Key 不能为空' };
  // APIMart keys typically start with "sk-" but we don't strictly enforce
  if (key.trim().length < 16) return { valid: false, reason: 'API Key 太短，请检查' };
  return { valid: true };
}
