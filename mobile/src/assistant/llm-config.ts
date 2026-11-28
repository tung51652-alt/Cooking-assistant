import type { LlmProviderPreset, LlmUserConfig } from '../../../packages/cooklens-api/types';

export const LLM_CONFIG_STORAGE_KEY = 'cooklens.llm-config.v1';

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

export const PROVIDER_ORDER: LlmProviderPreset[] = ['gemini', 'openai', 'nvidia', 'custom'];

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

export interface LlmConfigStore {
  read(): Promise<LlmUserConfig | null>;
  write(config: LlmUserConfig): Promise<boolean>;
  clear(): Promise<boolean>;
}

interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const ASCII_KEY_PATTERN = /^[\x21-\x7E]{1,4096}$/;
const VALID_CUSTOM_PATH_SUFFIXES = ['/v1', '/v1beta/openai', '/openai'];

function isPrivateOrReservedIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every(p => /^(?:0|[1-9]\d{0,2})$/.test(p))) return false;
  const nums = parts.map(Number);
  if (nums.some(n => n < 0 || n > 255)) return false;
  const [a, b, c] = nums;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 2)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isBlockedCustomHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/\.+$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host.startsWith('[') && host.endsWith(']')) {
    const inner = host.slice(1, -1);
    if (inner === '::1' || inner === '::' || inner === '0:0:0:0:0:0:0:1' || inner === '0:0:0:0:0:0:0:0') return true;
    if (inner.startsWith('fc') || inner.startsWith('fd') || inner.startsWith('fe8') || inner.startsWith('fe9')
      || inner.startsWith('fea') || inner.startsWith('feb') || inner.startsWith('ff') || inner.startsWith('2001:db8:')) {
      return true;
    }
    if (inner.startsWith('::ffff:')) {
      const mapped = inner.slice('::ffff:'.length);
      if (isPrivateOrReservedIpv4(mapped)) return true;
      const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
      if (hexMatch) {
        const hi = parseInt(hexMatch[1], 16);
        const lo = parseInt(hexMatch[2], 16);
        const dotted = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
        if (isPrivateOrReservedIpv4(dotted)) return true;
      }
    }
    return false;
  }
  return isPrivateOrReservedIpv4(host);
}

export function isProviderPreset(value: unknown): value is LlmProviderPreset {
  return value === 'gemini' || value === 'openai' || value === 'nvidia' || value === 'custom';
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
  if (/\s/.test(trimmed)) {
    return { valid: false, message: 'Base URL không được chứa khoảng trắng.' };
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
    return { valid: false, message: 'Base URL phải dùng HTTPS.' };
  }
  if (isBlockedCustomHost(parsed.hostname)) {
    return { valid: false, message: 'Base URL phải dùng địa chỉ HTTPS công khai (không cho phép localhost hoặc IP nội bộ).' };
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (cleanPath.includes('//') || !VALID_CUSTOM_PATH_SUFFIXES.some(suffix => cleanPath.endsWith(suffix))) {
    return { valid: false, message: 'Đường dẫn Base URL phải kết thúc bằng /v1, /v1beta/openai hoặc /openai.' };
  }
  return { valid: true, message: 'Base URL hợp lệ.' };
}

export function normalizeLlmConfig(value: unknown): LlmUserConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isProviderPreset(record.provider) || typeof record.model !== 'string' || typeof record.api_key !== 'string') {
    return null;
  }
  const provider = record.provider;
  const rawBaseUrl = typeof record.base_url === 'string' ? record.base_url.trim() : '';
  const baseUrl = provider === 'custom' ? rawBaseUrl : LLM_PRESETS[provider].baseUrl;
  const model = record.model.trim();
  const apiKey = record.api_key;
  if (!validateApiKey(provider, apiKey).valid
    || !validateModelName(model).valid
    || !validateBaseUrl(provider, baseUrl).valid) {
    return null;
  }
  return {
    provider,
    base_url: baseUrl || undefined,
    model,
    api_key: apiKey,
  };
}

export function formatLlmBadge(config: LlmUserConfig): string {
  return `${LLM_PRESETS[config.provider].shortLabel} · ${config.model}`;
}

export function createLlmConfigStore(storage: SecureStorage, storageKey = LLM_CONFIG_STORAGE_KEY): LlmConfigStore {
  let queue = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.then(() => {}, () => {});
    return result;
  }

  return {
    read: () => enqueue(async () => {
      try {
        const raw = await storage.getItemAsync(storageKey);
        if (!raw) return null;
        return normalizeLlmConfig(JSON.parse(raw));
      } catch {
        return null;
      }
    }),
    write: config => enqueue(async () => {
      const normalized = normalizeLlmConfig(config);
      if (!normalized) return false;
      try {
        await storage.setItemAsync(storageKey, JSON.stringify(normalized));
        return true;
      } catch {
        return false;
      }
    }),
    clear: () => enqueue(async () => {
      try {
        await storage.deleteItemAsync(storageKey);
        return true;
      } catch {
        return false;
      }
    }),
  };
}
