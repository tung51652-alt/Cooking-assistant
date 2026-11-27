import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, type createApi } from '../../../packages/cooklens-api';
import type { LlmProviderPreset, LlmTestResult, LlmUserConfig } from '../../../packages/cooklens-api/types';
import {
  LLM_PRESETS,
  PROVIDER_ORDER,
  validateApiKey,
  validateBaseUrl,
  validateModelName,
} from './llm-config';

export interface LlmSettingsModalProps {
  open: boolean;
  initialMode?: 'default' | 'custom';
  currentConfig: LlmUserConfig | null;
  api: Pick<ReturnType<typeof createApi>, 'testLlmConfig'> | null;
  onSave: (config: LlmUserConfig) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onClose: () => void;
}

export function LlmSettingsModal({
  open,
  initialMode,
  currentConfig,
  api,
  onSave,
  onClear,
  onClose,
}: LlmSettingsModalProps) {
  const [mode, setMode] = useState<'default' | 'custom'>(initialMode ?? (currentConfig ? 'custom' : 'default'));
  const [provider, setProvider] = useState<LlmProviderPreset>(currentConfig?.provider || 'gemini');
  const [baseUrl, setBaseUrl] = useState<string>(currentConfig?.base_url || LLM_PRESETS.gemini.baseUrl);
  const [apiKey, setApiKey] = useState<string>(currentConfig?.api_key || '');
  const [model, setModel] = useState<string>(currentConfig?.model || LLM_PRESETS.gemini.defaultModel);
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(currentConfig?.provider === 'custom');
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
    setAdvancedOpen(nextProvider === 'custom');
    setTestResult(null);
    setTestError(null);
  }, [open, initialMode, currentConfig]);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const preset = LLM_PRESETS[provider];
  const urlFeedback = validateBaseUrl(provider, baseUrl);
  const keyFeedback = validateApiKey(provider, apiKey);
  const modelFeedback = validateModelName(model);
  const allValid = urlFeedback.valid && keyFeedback.valid && modelFeedback.valid;

  function selectProvider(next: LlmProviderPreset) {
    abortRef.current?.abort();
    abortRef.current = null;
    setTesting(false);
    setProvider(next);
    setAdvancedOpen(next === 'custom');
    const meta = LLM_PRESETS[next];
    setBaseUrl(meta.baseUrl);
    const matchesAnyDefault = Object.values(LLM_PRESETS).some(
      item => item.defaultModel && item.defaultModel === model.trim(),
    );
    if (!model.trim() || matchesAnyDefault) {
      setModel(meta.defaultModel);
    }
    setTestResult(null);
    setTestError(null);
  }

  function switchMode(nextMode: 'default' | 'custom') {
    abortRef.current?.abort();
    abortRef.current = null;
    setTesting(false);
    setTestResult(null);
    setTestError(null);
    setMode(nextMode);
  }

  async function runHelloTest() {
    if (!api || !allValid || testing) return;
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
        setTestError(failure instanceof ApiError ? failure.message : 'Không kiểm tra được kết nối tới model.');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setTesting(false);
      }
    }
  }

  function handleSave() {
    if (!allValid || testing) return;
    void onSave({
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
    setAdvancedOpen(false);
    setTestResult(null);
    setTestError(null);
    if (currentConfig) {
      void onClear();
    } else {
      setMode('default');
    }
  }

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Trợ lý nấu ăn</Text>
              <Text accessibilityRole="header" style={styles.title}>Cài đặt trợ lý</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng cài đặt trợ lý"
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            >
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View accessibilityRole="radiogroup" accessibilityLabel="Chế độ trợ lý" style={styles.modeGroup}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === 'default' }}
                onPress={() => switchMode('default')}
                style={[styles.modeCard, mode === 'default' && styles.selectedCard]}
              >
                <Text style={styles.cardTitle}>Mặc định hệ thống</Text>
                <Text style={styles.small}>Hỏi đáp hoạt động khi máy chủ đã được cấu hình</Text>
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === 'custom' }}
                onPress={() => switchMode('custom')}
                style={[styles.modeCard, mode === 'custom' && styles.selectedCard]}
              >
                <Text style={styles.cardTitle}>Dùng khóa API riêng</Text>
                <Text style={styles.small}>Nhập khóa API và chọn model của bạn</Text>
              </Pressable>
            </View>

            {mode === 'default' ? (
              <>
                <View style={styles.infoBox}>
                  <Text style={styles.cardTitle}>Hỏi đáp hoạt động khi máy chủ đã được cấu hình</Text>
                  <Text style={styles.body}>
                    Nếu máy chủ chưa bật tính năng hỏi đáp, bạn vẫn có thể xem các bước nấu như bình thường. Khi cần hỏi đáp ngay, hãy chuyển sang Dùng khóa API riêng hoặc liên hệ người quản lý hệ thống.
                  </Text>
                </View>

                <View style={styles.footerRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onClose}
                    style={({ pressed }) => [styles.button, styles.secondaryBtn, styles.flexBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryBtnText}>Đóng</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => (currentConfig ? handleBackToDefault() : onClose())}
                    style={({ pressed }) => [styles.button, styles.flexBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.primaryBtnText}>Lưu</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.securityNote}>
                  <Text style={styles.small}>
                    Khóa API của bạn được lưu trong SecureStore trên thiết bị và chỉ được gửi trực tiếp kèm yêu cầu hỏi đáp; máy chủ không lưu trữ khóa của bạn.
                  </Text>
                </View>

                <View style={styles.section}>
                  <Text accessibilityRole="header" style={styles.stepTitle}>1. Chọn nhà cung cấp</Text>
                  <View accessibilityRole="radiogroup" accessibilityLabel="Nhà cung cấp trợ lý" style={styles.providerList}>
                    {PROVIDER_ORDER.map(id => {
                      const item = LLM_PRESETS[id];
                      const active = provider === id;
                      return (
                        <Pressable
                          key={id}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: active }}
                          onPress={() => selectProvider(id)}
                          style={[styles.providerCard, active && styles.selectedCard]}
                        >
                          <Text style={styles.cardTitle}>{item.label}</Text>
                          <Text style={styles.small}>
                            {id === 'custom' ? 'Tương thích OpenAI · nhập địa chỉ riêng' : item.defaultModel}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.advancedBox}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: advancedOpen }}
                      onPress={() => setAdvancedOpen(prev => !prev)}
                      style={({ pressed }) => [styles.advancedToggle, pressed && styles.pressed]}
                    >
                      <View style={styles.advancedToggleCopy}>
                        <Text style={styles.cardTitle}>{advancedOpen ? '▾' : '▸'} Cài đặt nâng cao</Text>
                        <Text style={styles.small}>
                          {provider === 'custom' ? 'Bắt buộc với nhà cung cấp tùy chỉnh' : 'Địa chỉ kết nối & ghi chú kỹ thuật'}
                        </Text>
                      </View>
                    </Pressable>

                    {!advancedOpen && !urlFeedback.valid && (
                      <Text accessibilityLiveRegion="polite" style={styles.feedbackError}>{urlFeedback.message}</Text>
                    )}

                    {advancedOpen && (
                      <View style={styles.advancedPanel}>
                        <Text style={styles.fieldLabel}>Base URL (OpenAI-compatible)</Text>
                        <TextInput
                          accessibilityLabel="Base URL (OpenAI-compatible)"
                          value={baseUrl}
                          editable={provider === 'custom'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="url"
                          placeholder="https://example.com/v1"
                          placeholderTextColor="#8a7a6d"
                          onChangeText={text => {
                            setBaseUrl(text);
                            setTestResult(null);
                            setTestError(null);
                          }}
                          style={[styles.input, provider !== 'custom' && styles.readOnlyInput]}
                        />
                        <Text
                          accessibilityLiveRegion="polite"
                          style={urlFeedback.valid ? styles.feedbackOk : styles.feedbackError}
                        >
                          {urlFeedback.message}
                        </Text>
                        <Text style={styles.small}>
                          Ghi chú kỹ thuật: Khóa API và địa chỉ kết nối chỉ được gửi kèm yêu cầu hỏi đáp qua header; máy chủ không lưu khóa vào cơ sở dữ liệu.
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.section}>
                  <Text accessibilityRole="header" style={styles.stepTitle}>2. Nhập khóa API</Text>
                  <Text style={styles.fieldLabel}>Khóa API ({preset.label})</Text>
                  <View style={styles.inputGroup}>
                    <TextInput
                      accessibilityLabel={`Khóa API (${preset.label})`}
                      value={apiKey}
                      secureTextEntry={!showKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="none"
                      placeholder={preset.keyHint}
                      placeholderTextColor="#8a7a6d"
                      onChangeText={text => {
                        setApiKey(text);
                        setTestResult(null);
                        setTestError(null);
                      }}
                      style={[styles.input, styles.keyInput]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={showKey ? 'Ẩn khóa API' : 'Hiện khóa API'}
                      onPress={() => setShowKey(prev => !prev)}
                      style={({ pressed }) => [styles.toggleKeyBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryBtnText}>{showKey ? 'Ẩn' : 'Hiện'}</Text>
                    </Pressable>
                  </View>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={keyFeedback.valid ? styles.feedbackOk : styles.feedbackError}
                  >
                    {keyFeedback.message}
                  </Text>
                  {!!keyFeedback.warning && (
                    <Text accessibilityLiveRegion="polite" style={styles.feedbackWarn}>{keyFeedback.warning}</Text>
                  )}
                </View>

                <View style={styles.section}>
                  <Text accessibilityRole="header" style={styles.stepTitle}>3. Chọn tên Model</Text>
                  <Text style={styles.fieldLabel}>Tên Model</Text>
                  <TextInput
                    accessibilityLabel="Tên Model"
                    value={model}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={preset.defaultModel || 'Ví dụ: gpt-4o-mini'}
                    placeholderTextColor="#8a7a6d"
                    onChangeText={text => {
                      setModel(text);
                      setTestResult(null);
                      setTestError(null);
                    }}
                    style={styles.input}
                  />
                  {preset.suggestions.length > 0 && (
                    <View style={styles.chips}>
                      {preset.suggestions.map(item => {
                        const selected = model.trim() === item;
                        return (
                          <Pressable
                            key={item}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => {
                              setModel(item);
                              setTestResult(null);
                              setTestError(null);
                            }}
                            style={[styles.chip, selected && styles.chipSelected]}
                          >
                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  <Text
                    accessibilityLiveRegion="polite"
                    style={modelFeedback.valid ? styles.feedbackOk : styles.feedbackError}
                  >
                    {modelFeedback.message}
                  </Text>
                </View>

                <View style={styles.section}>
                  <Text accessibilityRole="header" style={styles.stepTitle}>4. Kiểm tra kết nối</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !allValid || testing || !api }}
                    disabled={!allValid || testing || !api}
                    onPress={() => { void runHelloTest(); }}
                    style={({ pressed }) => [
                      styles.button,
                      styles.secondaryBtn,
                      (!allValid || testing || !api || pressed) && styles.pressed,
                    ]}
                  >
                    <Text style={styles.secondaryBtnText}>
                      {testing ? 'Đang kiểm tra…' : 'Kiểm tra kết nối (Test hello)'}
                    </Text>
                  </Pressable>
                  <Text style={styles.small}>
                    {api
                      ? 'Gửi một tin nhắn thử ngắn để xác nhận khóa API và model hoạt động bình thường.'
                      : 'Chưa cấu hình máy chủ CookLens nên chưa thể kiểm tra kết nối trực tiếp.'}
                  </Text>
                  {testing && (
                    <View accessibilityLiveRegion="polite" style={styles.testingRow}>
                      <ActivityIndicator color="#b84415" />
                      <Text style={styles.body}>Đang kiểm tra kết nối tới {preset.label} ({model.trim()})…</Text>
                    </View>
                  )}
                  {testResult && (
                    <View accessibilityLiveRegion="polite" style={styles.resultOk}>
                      <Text style={styles.resultOkTitle}>Kết nối thành công ({testResult.latency_ms} ms)</Text>
                      <Text style={styles.body}>Nhà cung cấp: {testResult.provider} · Model: {testResult.model}</Text>
                      <Text style={styles.body}>Phản hồi: {testResult.reply}</Text>
                    </View>
                  )}
                  {testError && (
                    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.resultError}>
                      <Text style={styles.resultErrorTitle}>Kiểm tra thất bại</Text>
                      <Text style={styles.body}>{testError}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.footerStack}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !allValid || testing }}
                    disabled={!allValid || testing}
                    onPress={handleSave}
                    style={({ pressed }) => [styles.button, (!allValid || testing || pressed) && styles.pressed]}
                  >
                    <Text style={styles.primaryBtnText}>Lưu cấu hình</Text>
                  </Pressable>
                  <View style={styles.footerRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleBackToDefault}
                      style={({ pressed }) => [styles.button, styles.secondaryBtn, styles.flexBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryBtnText}>Quay về mặc định</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={onClose}
                      style={({ pressed }) => [styles.button, styles.secondaryBtn, styles.flexBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryBtnText}>Đóng</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#30221970' },
  sheet: { height: '90%', backgroundColor: '#fffdf8', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5d8c5' },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 13, fontFamily: 'JakartaSemi', color: '#a83d0d' },
  title: { fontSize: 22, fontFamily: 'Epilogue', color: '#35271d' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#f5e8d6' },
  closeIcon: { fontSize: 22, fontFamily: 'JakartaSemi', color: '#403025' },
  content: { padding: 18, gap: 16, paddingBottom: 32 },
  modeGroup: { gap: 10 },
  modeCard: { padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#e5d8c5', backgroundColor: '#fbf7ee', gap: 4 },
  selectedCard: { backgroundColor: '#fff0df', borderColor: '#b84415', borderWidth: 2 },
  cardTitle: { fontSize: 16, fontFamily: 'JakartaSemi', color: '#35271d' },
  body: { fontSize: 15, fontFamily: 'Jakarta', lineHeight: 22, color: '#4d4037', flexShrink: 1 },
  small: { fontSize: 13, fontFamily: 'Jakarta', lineHeight: 20, color: '#6b5b4f', flexShrink: 1 },
  infoBox: { padding: 16, borderRadius: 18, backgroundColor: '#f7efe5', borderWidth: 1, borderColor: '#e5d8c5', gap: 8 },
  securityNote: { padding: 14, borderRadius: 16, backgroundColor: '#f7efe5', borderWidth: 1, borderColor: '#e5d8c5' },
  section: { padding: 16, borderRadius: 20, backgroundColor: '#fbf7ee', borderWidth: 1, borderColor: '#e5d8c5', gap: 10 },
  stepTitle: { fontSize: 17, fontFamily: 'Epilogue', color: '#35271d' },
  providerList: { gap: 8 },
  providerCard: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#dfd0bc', backgroundColor: '#fffdf8', gap: 2 },
  advancedBox: { marginTop: 4, borderRadius: 14, borderWidth: 1, borderColor: '#dfd0bc', backgroundColor: '#fffdf8', overflow: 'hidden' },
  advancedToggle: { padding: 12 },
  advancedToggleCopy: { gap: 2 },
  advancedPanel: { paddingHorizontal: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#eee4d5', paddingTop: 10 },
  fieldLabel: { fontSize: 14, fontFamily: 'JakartaSemi', color: '#403025' },
  inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#b9a58c', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: '#35271d', backgroundColor: '#fffdf8', fontFamily: 'Jakarta', fontSize: 15 },
  keyInput: { flex: 1 },
  readOnlyInput: { backgroundColor: '#f3eadc', color: '#6b5b4f' },
  toggleKeyBtn: { minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#f2e4d3', borderWidth: 1, borderColor: '#d8bea2', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#d8bea2' },
  chipSelected: { backgroundColor: '#b84415', borderColor: '#b84415' },
  chipText: { fontSize: 13, fontFamily: 'JakartaSemi', color: '#5c3c28' },
  chipTextSelected: { color: '#fffaf0' },
  feedbackOk: { fontSize: 13, fontFamily: 'JakartaSemi', color: '#1f6a3b' },
  feedbackWarn: { fontSize: 13, fontFamily: 'Jakarta', color: '#92520e' },
  feedbackError: { fontSize: 13, fontFamily: 'JakartaSemi', color: '#b42318' },
  testingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  resultOk: { padding: 12, borderRadius: 14, backgroundColor: '#eef8f0', borderWidth: 1, borderColor: '#69b380', gap: 4 },
  resultOkTitle: { fontSize: 15, fontFamily: 'JakartaSemi', color: '#1f6a3b' },
  resultError: { padding: 12, borderRadius: 14, backgroundColor: '#fff0e8', borderWidth: 1, borderColor: '#bf4e25', gap: 4 },
  resultErrorTitle: { fontSize: 15, fontFamily: 'JakartaSemi', color: '#a52714' },
  footerStack: { gap: 10, paddingTop: 4 },
  footerRow: { flexDirection: 'row', gap: 10 },
  flexBtn: { flex: 1 },
  button: { minHeight: 48, backgroundColor: '#b84415', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  secondaryBtn: { backgroundColor: '#f2e4d3', borderWidth: 1, borderColor: '#d8bea2' },
  primaryBtnText: { color: '#fffaf0', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  secondaryBtnText: { color: '#713b1f', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.55 },
});
