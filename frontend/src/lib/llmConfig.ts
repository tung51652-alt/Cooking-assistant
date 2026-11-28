import type { LlmProviderPreset, LlmUserConfig } from '../types';

export const LLM_CONFIG_STORAGE = 'cooklens.llm.config';

export type LlmStorageScope = 'session' | 'local';

export interface StoredLlmConfig {
  config: LlmUserConfig;
  scope: LlmStorageScope;
}

export interface ProviderPresetMeta {
  id: LlmProviderPreset;
  label: string;
  shortLabel: string;
  baseUrl: string;
  defaultModel: string;
  suggestions: string[];
  keyPrefix?: string;
  keyHint: string;
}

export const LLM_PRESETS: Record<LlmProviderPreset, ProviderPresetMeta> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.5-flash-lite',
    suggestions: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
    keyPrefix: 'AIza',
    keyHint: 'Thường bắt đầu bằng AIza...',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    suggestions: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    keyPrefix: 'sk-',
    keyHint: 'Thường bắt đầu bằng sk-...',
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    shortLabel: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-8b-instruct',
    suggestions: ['meta/llama-3.1-8b-instruct', 'meta/llama-3.3-70b-instruct', 'qwen/qwen2.5-72b-instruct'],
    keyPrefix: 'nvapi-',
    keyHint: 'Thường bắt đầu bằng nvapi-...',
  },
  custom: {
    id: 'custom',
    label: 'Nhà cung cấp tùy chỉnh',
    shortLabel: 'Tùy chỉnh',
    baseUrl: '',
    defaultModel: '',
    suggestions: [],
    keyHint: 'Nhập khóa API của nhà cung cấp tương thích OpenAI',
  },
};

export interface ValidationFeedback {
  valid: boolean;
  message: string;
  warning?: string;
}

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const ASCII_KEY_PATTERN = /^[\x21-\x7E]{1,4096}$/;
const VALID_CUSTOM_PATH_SUFFIXES = ['/v1', '/v1beta/openai', '/openai'];
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.arpa', '.lan'];

function isPublicIpv4Octets(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isBlockedCustomHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  if (host.startsWith('[') && host.endsWith(']')) {
    const inner = host.slice(1, -1);
    if (
      inner === '::' ||
      inner === '::1' ||
      inner.startsWith('fc') ||
      inner.startsWith('fd') ||
      inner.startsWith('fe8') ||
      inner.startsWith('fe9') ||
      inner.startsWith('fea') ||
      inner.startsWith('feb') ||
      inner.startsWith('ff') ||
      inner.startsWith('2001:db8:') ||
      inner.startsWith('::ffff:')
    ) {
      return true;
    }
    return !/^[23][0-9a-f]{3}:/i.test(inner);
  }
  if (!host.includes('.')) return true;
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const parts = ipv4Match.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    return !isPublicIpv4Octets(parts[0], parts[1], parts[2]);
  }
  return false;
}

export function validateApiKey(provider: LlmProviderPreset, apiKey: string): ValidationFeedback {
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, message: 'API key không được để trống.' };
  }
  if (/\s/.test(apiKey)) {
    return { valid: false, message: 'API key không được chứa khoảng trắng hoặc ký tự xuống dòng.' };
  }
  if (!ASCII_KEY_PATTERN.test(apiKey)) {
    return { valid: false, message: 'API key chỉ được chứa ký tự ASCII in được (không dấu), tối đa 4096 ký tự.' };
  }
  if (apiKey.length < 8) {
    return { valid: false, message: 'API key quá ngắn (cần ít nhất 8 ký tự).' };
  }
  const preset = LLM_PRESETS[provider];
  if (preset.keyPrefix && !apiKey.startsWith(preset.keyPrefix)) {
    return {
      valid: true,
      message: 'Định dạng API key hợp lệ.',
      warning: `Lưu ý: key ${preset.label} thường bắt đầu bằng "${preset.keyPrefix}". Hãy kiểm tra lại nếu test thất bại.`,
    };
  }
  return {
    valid: true,
    message: preset.keyPrefix
      ? `Định dạng API key hợp lệ (khớp tiền tố ${preset.keyPrefix}).`
      : 'Định dạng API key hợp lệ.',
  };
}

export function validateModelName(model: string): ValidationFeedback {
  const trimmed = model.trim();
  if (!trimmed) {
    return { valid: false, message: 'Vui lòng nhập tên model.' };
  }
  if (!MODEL_PATTERN.test(trimmed)) {
    return {
      valid: false,
      message: 'Tên model phải bắt đầu bằng chữ hoặc số, chỉ gồm chữ, số và . _ : / - (tối đa 200 ký tự).',
    };
  }
  return { valid: true, message: 'Tên model hợp lệ.' };
}

export function validateBaseUrl(provider: LlmProviderPreset, baseUrl: string): ValidationFeedback {
  if (provider !== 'custom') {
    return { valid: true, message: 'Sử dụng Base URL mặc định của nhà cung cấp.' };
  }
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return { valid: false, message: 'Vui lòng nhập Base URL cho nhà cung cấp tùy chỉnh.' };
  }
  if (trimmed.includes('..') || trimmed.includes('%')) {
    return { valid: false, message: 'Base URL không được chứa ".." hoặc ký tự mã hóa "%".' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, message: 'Base URL không đúng định dạng URL.' };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { valid: false, message: 'Base URL không được chứa thông tin đăng nhập, query hoặc fragment.' };
  }
  if (parsed.protocol !== 'https:') {
    return { valid: false, message: 'Base URL phải dùng HTTPS với địa chỉ công khai hợp lệ.' };
  }
  if (isBlockedCustomHost(parsed.hostname)) {
    return {
      valid: false,
      message: 'Base URL phải dùng địa chỉ HTTPS công khai (không hỗ trợ localhost hoặc địa chỉ nội bộ).',
    };
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (cleanPath.includes('//') || !VALID_CUSTOM_PATH_SUFFIXES.some((suffix) => cleanPath.endsWith(suffix))) {
    return { valid: false, message: 'Đường dẫn Base URL phải kết thúc bằng /v1, /v1beta/openai hoặc /openai.' };
  }
  return { valid: true, message: 'Base URL hợp lệ.' };
}

export function isProviderPreset(value: unknown): value is LlmProviderPreset {
  return value === 'gemini' || value === 'openai' || value === 'nvidia' || value === 'custom';
}

function parseStoredConfig(raw: string | null): LlmUserConfig | null {
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (!isProviderPreset(record.provider) || typeof record.model !== 'string' || typeof record.api_key !== 'string') {
    return null;
  }
  const baseUrl =
    typeof record.base_url === 'string' && record.base_url.trim()
      ? record.base_url.trim()
      : LLM_PRESETS[record.provider].baseUrl;
  if (
    !validateApiKey(record.provider, record.api_key).valid ||
    !validateModelName(record.model).valid ||
    !validateBaseUrl(record.provider, baseUrl).valid
  ) {
    return null;
  }
  return {
    provider: record.provider,
    base_url: baseUrl || undefined,
    model: record.model.trim(),
    api_key: record.api_key,
  };
}

export function loadLlmConfigWithScope(): StoredLlmConfig | null {
  try {
    const sessionConfig = parseStoredConfig(sessionStorage.getItem(LLM_CONFIG_STORAGE));
    if (sessionConfig) return { config: sessionConfig, scope: 'session' };
  } catch {
    /* Ignore sessionStorage read errors and check localStorage fallback. */
  }
  try {
    const localConfig = parseStoredConfig(localStorage.getItem(LLM_CONFIG_STORAGE));
    if (localConfig) return { config: localConfig, scope: 'local' };
  } catch {
    /* Ignore localStorage read errors. */
  }
  return null;
}

export function loadLlmConfig(): LlmUserConfig | null {
  return loadLlmConfigWithScope()?.config ?? null;
}

export function saveLlmConfig(config: LlmUserConfig, scope: LlmStorageScope = 'session'): boolean {
  const serialized = JSON.stringify({
    provider: config.provider,
    base_url: config.base_url?.trim() || LLM_PRESETS[config.provider].baseUrl || undefined,
    model: config.model.trim(),
    api_key: config.api_key,
  });
  try {
    if (scope === 'local') {
      localStorage.setItem(LLM_CONFIG_STORAGE, serialized);
      try {
        sessionStorage.removeItem(LLM_CONFIG_STORAGE);
      } catch {
        /* Ignore cleanup errors. */
      }
    } else {
      sessionStorage.setItem(LLM_CONFIG_STORAGE, serialized);
      try {
        localStorage.removeItem(LLM_CONFIG_STORAGE);
      } catch {
        /* Ignore cleanup errors. */
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function clearLlmConfig(): void {
  try {
    sessionStorage.removeItem(LLM_CONFIG_STORAGE);
  } catch {
    /* Ignore sessionStorage errors on clear. */
  }
  try {
    localStorage.removeItem(LLM_CONFIG_STORAGE);
  } catch {
    /* Ignore localStorage errors on clear. */
  }
}
