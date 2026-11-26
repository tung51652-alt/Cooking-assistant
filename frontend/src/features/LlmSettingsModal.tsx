import { useEffect, useRef, useState } from 'react';
import { Check, Key, Lock, LockOpen, Play, ShieldCheck, Trash, WarningCircle, WarningOctagon, X } from '@phosphor-icons/react';
import * as api from '../lib/api';
import {
  LLM_PRESETS,
  validateApiKey,
  validateBaseUrl,
  validateModelName,
} from '../lib/llmConfig';
import type { LlmProviderPreset, LlmTestResult, LlmUserConfig } from '../types';

interface Props {
  open: boolean;
  initialMode?: 'default' | 'custom';
  currentConfig: LlmUserConfig | null;
  onSave: (config: LlmUserConfig) => void;
  onClear: () => void;
  onClose: () => void;
}

const PROVIDER_ORDER: LlmProviderPreset[] = ['gemini', 'openai', 'nvidia', 'custom'];

export default function LlmSettingsModal({ open, initialMode, currentConfig, onSave, onClear, onClose }: Props) {
  const [mode, setMode] = useState<'default' | 'custom'>(initialMode ?? (currentConfig ? 'custom' : 'default'));
  const [provider, setProvider] = useState<LlmProviderPreset>(currentConfig?.provider || 'gemini');
  const [baseUrl, setBaseUrl] = useState<string>(currentConfig?.base_url || LLM_PRESETS.gemini.baseUrl);
  const [apiKey, setApiKey] = useState<string>(currentConfig?.api_key || '');
  const [model, setModel] = useState<string>(currentConfig?.model || LLM_PRESETS.gemini.defaultModel);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setTesting(false);
      return;
    }
    const nextProvider = currentConfig?.provider || 'gemini';
    setMode(initialMode ?? (currentConfig ? 'custom' : 'default'));
    setProvider(nextProvider);
    setBaseUrl(currentConfig?.base_url || LLM_PRESETS[nextProvider].baseUrl);
    setApiKey(currentConfig?.api_key || '');
    setModel(currentConfig?.model || LLM_PRESETS[nextProvider].defaultModel);
    setShowKey(false);
    setTestResult(null);
    setTestError(null);
  }, [open, initialMode, currentConfig]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      abortRef.current?.abort();
    };
  }, [open, onClose]);

  if (!open) return null;

  const preset = LLM_PRESETS[provider];
  const urlFeedback = validateBaseUrl(provider, baseUrl);
  const keyFeedback = validateApiKey(provider, apiKey);
  const modelFeedback = validateModelName(model);
  const allValid = urlFeedback.valid && keyFeedback.valid && modelFeedback.valid;

  function selectProvider(next: LlmProviderPreset) {
    abortRef.current?.abort();
    setTesting(false);
    setProvider(next);
    const meta = LLM_PRESETS[next];
    setBaseUrl(meta.baseUrl);
    const matchesAnyDefault = Object.values(LLM_PRESETS).some(item => item.defaultModel && item.defaultModel === model.trim());
    if (!model.trim() || matchesAnyDefault) {
      setModel(meta.defaultModel);
    }
    setTestResult(null);
    setTestError(null);
  }

  async function runHelloTest() {
    if (!allValid || testing) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await api.testLlmConfig({
        provider,
        base_url: provider === 'custom' ? baseUrl.trim() : preset.baseUrl,
        model: model.trim(),
        api_key: apiKey,
      }, controller.signal);
      if (!controller.signal.aborted) {
        setTestResult(result);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setTestError(failure instanceof api.ApiError ? failure.message : 'Không kiểm tra được kết nối tới model.');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setTesting(false);
      }
    }
  }

  function handleSave() {
    if (!allValid) return;
    onSave({
      provider,
      base_url: provider === 'custom' ? baseUrl.trim() : preset.baseUrl,
      model: model.trim(),
      api_key: apiKey,
    });
  }

  function handleBackToDefault() {
    abortRef.current?.abort();
    abortRef.current = null;
    setTesting(false);
    setApiKey('');
    setShowKey(false);
    setTestResult(null);
    setTestError(null);
    if (currentConfig) {
      onClear();
    } else {
      setMode('default');
    }
  }

  function switchMode(nextMode: 'default' | 'custom') {
    abortRef.current?.abort();
    abortRef.current = null;
    setTesting(false);
    setTestResult(null);
    setTestError(null);
    setMode(nextMode);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-panel llm-modal" role="dialog" aria-modal="true" aria-labelledby="llm-settings-title">
        <div className="modal-header">
          <div>
            <p className="assistant-eyebrow">BYOK · Trợ lý nấu ăn</p>
            <h2 id="llm-settings-title"><Key size={20} aria-hidden="true" /> Cấu hình API Key LLM</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Đóng cấu hình LLM">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="llm-mode-switch" role="radiogroup" aria-label="Chế độ cấu hình LLM">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'default'}
            className={`llm-mode-option${mode === 'default' ? ' is-selected' : ''}`}
            onClick={() => switchMode('default')}
          >
            <strong>Mặc định hệ thống</strong>
            <span>Dùng file .env của máy chủ</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'custom'}
            className={`llm-mode-option${mode === 'custom' ? ' is-selected' : ''}`}
            onClick={() => switchMode('custom')}
          >
            <strong>Tự cấu hình API Key</strong>
            <span>Nhập key và model của bạn</span>
          </button>
        </div>

        {mode === 'default' ? (
          <>
            <div className="llm-default-box">
              <ShieldCheck size={22} aria-hidden="true" />
              <div>
                <strong>Đang sử dụng cấu hình mặc định của máy chủ (.env)</strong>
                <p>Hệ thống tự động dùng cấu hình mặc định trong file .env. Vì lý do bảo mật, thông tin API key mặc định không được hiển thị trên giao diện.</p>
              </div>
            </div>

            <div className="modal-footer">
              <div className="modal-footer-actions">
                <button type="button" className="secondary-btn" onClick={onClose}>Đóng</button>
                {currentConfig ? (
                  <button type="button" className="primary-btn" onClick={handleBackToDefault}>
                    Áp dụng mặc định
                  </button>
                ) : (
                  <button type="button" className="primary-btn" onClick={() => switchMode('custom')}>
                    Tự cấu hình API Key
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="modal-lead">
              Key của bạn chỉ được lưu trên trình duyệt này và gửi qua HTTPS header khi chat; máy chủ không lưu API key vào cơ sở dữ liệu.
            </p>

            <div className="llm-steps">
              <section className="llm-step" aria-labelledby="llm-step-1">
                <h3 id="llm-step-1"><span className="llm-step-num">1</span> Chọn nhà cung cấp</h3>
                <div className="llm-provider-grid" role="radiogroup" aria-label="Nhà cung cấp LLM">
                  {PROVIDER_ORDER.map(id => {
                    const item = LLM_PRESETS[id];
                    const active = provider === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`llm-provider-card${active ? ' is-selected' : ''}`}
                        onClick={() => selectProvider(id)}
                      >
                        <strong>{item.label}</strong>
                        <span>{id === 'custom' ? 'Nhập endpoint riêng' : item.defaultModel}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="llm-field">
                  <label htmlFor="llm-base-url">Base URL (OpenAI-compatible)</label>
                  <input
                    id="llm-base-url"
                    type="url"
                    value={baseUrl}
                    readOnly={provider !== 'custom'}
                    onChange={event => { setBaseUrl(event.target.value); setTestResult(null); setTestError(null); }}
                    placeholder="https://example.com/v1"
                  />
                  <p className={`field-feedback ${urlFeedback.valid ? 'is-valid' : 'is-error'}`} aria-live="polite">
                    {urlFeedback.valid ? <Check size={15} aria-hidden="true" /> : <WarningOctagon size={15} aria-hidden="true" />}
                    <span>{urlFeedback.message}</span>
                  </p>
                </div>
              </section>

              <section className="llm-step" aria-labelledby="llm-step-2">
                <h3 id="llm-step-2"><span className="llm-step-num">2</span> Nhập API Key</h3>
                <div className="llm-field">
                  <label htmlFor="llm-api-key">API Key ({preset.label})</label>
                  <div className="llm-input-group">
                    <input
                      id="llm-api-key"
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={event => { setApiKey(event.target.value); setTestResult(null); setTestError(null); }}
                      placeholder={preset.keyHint}
                    />
                    <button
                      type="button"
                      className="secondary-btn llm-toggle-btn"
                      onClick={() => setShowKey(prev => !prev)}
                      aria-label={showKey ? 'Ẩn API key' : 'Hiện API key'}
                    >
                      {showKey ? <Lock size={18} aria-hidden="true" /> : <LockOpen size={18} aria-hidden="true" />}
                      <span>{showKey ? 'Ẩn' : 'Hiện'}</span>
                    </button>
                  </div>
                  <p className={`field-feedback ${keyFeedback.valid ? 'is-valid' : 'is-error'}`} aria-live="polite">
                    {keyFeedback.valid ? <Check size={15} aria-hidden="true" /> : <WarningOctagon size={15} aria-hidden="true" />}
                    <span>{keyFeedback.message}</span>
                  </p>
                  {keyFeedback.warning && (
                    <p className="field-feedback is-warning" aria-live="polite">
                      <WarningCircle size={15} aria-hidden="true" />
                      <span>{keyFeedback.warning}</span>
                    </p>
                  )}
                </div>
              </section>

              <section className="llm-step" aria-labelledby="llm-step-3">
                <h3 id="llm-step-3"><span className="llm-step-num">3</span> Nhập tên Model</h3>
                <div className="llm-field">
                  <label htmlFor="llm-model-name">Tên Model</label>
                  <input
                    id="llm-model-name"
                    type="text"
                    value={model}
                    spellCheck={false}
                    onChange={event => { setModel(event.target.value); setTestResult(null); setTestError(null); }}
                    placeholder={preset.defaultModel || 'Ví dụ: gpt-4o-mini'}
                  />
                  {preset.suggestions.length > 0 && (
                    <div className="llm-suggestions" aria-label="Gợi ý model">
                      {preset.suggestions.map(item => (
                        <button
                          key={item}
                          type="button"
                          className={`llm-chip${model.trim() === item ? ' is-selected' : ''}`}
                          onClick={() => { setModel(item); setTestResult(null); setTestError(null); }}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className={`field-feedback ${modelFeedback.valid ? 'is-valid' : 'is-error'}`} aria-live="polite">
                    {modelFeedback.valid ? <Check size={15} aria-hidden="true" /> : <WarningOctagon size={15} aria-hidden="true" />}
                    <span>{modelFeedback.message}</span>
                  </p>
                </div>
              </section>

              <section className="llm-step" aria-labelledby="llm-step-4">
                <h3 id="llm-step-4"><span className="llm-step-num">4</span> Kiểm tra kết nối (&ldquo;hello&rdquo;)</h3>
                <div className="llm-test-row">
                  <button
                    type="button"
                    className="camera-btn"
                    disabled={!allValid || testing}
                    onClick={() => void runHelloTest()}
                  >
                    <Play size={17} aria-hidden="true" />
                    <span>{testing ? 'Đang kiểm tra…' : 'Kiểm tra kết nối (Test hello)'}</span>
                  </button>
                  <small className="muted">Gửi tin nhắn thử &ldquo;hello&rdquo; để xác nhận key, model và đường truyền hoạt động.</small>
                </div>
                {testing && <p className="assistant-notice" role="status">Đang gửi &ldquo;hello&rdquo; tới {preset.label} ({model.trim()})…</p>}
                {testResult && (
                  <div className="llm-test-result is-ok" role="status">
                    <strong><Check size={18} aria-hidden="true" /> Done / OK · Kết nối thành công ({testResult.latency_ms} ms)</strong>
                    <p><strong>Nhà cung cấp:</strong> {testResult.provider} · <strong>Model:</strong> {testResult.model}</p>
                    <p className="llm-test-reply"><strong>Phản hồi:</strong> {testResult.reply}</p>
                  </div>
                )}
                {testError && (
                  <div className="llm-test-result is-error" role="alert">
                    <strong><WarningOctagon size={18} aria-hidden="true" /> Kiểm tra thất bại</strong>
                    <p>{testError}</p>
                  </div>
                )}
              </section>
            </div>

            <div className="modal-footer">
              <button type="button" className="text-btn llm-clear-btn" onClick={handleBackToDefault}>
                <Trash size={16} aria-hidden="true" /> Quay về mặc định
              </button>
              <div className="modal-footer-actions">
                <button type="button" className="secondary-btn" onClick={onClose}>Đóng</button>
                <button type="button" className="primary-btn" disabled={!allValid || testing} onClick={handleSave}>
                  Lưu cấu hình
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
