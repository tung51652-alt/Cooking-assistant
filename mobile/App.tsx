import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { File, UploadType } from 'expo-file-system';
import { useFonts } from 'expo-font';
import * as SecureStore from 'expo-secure-store';
import { ApiError, createApi, MIN_VISION_CONFIDENCE, normalizeBaseUrl, recipeSourceHref, type NativeFileUploader } from '../packages/cooklens-api';
import type { Dish, LlmUserConfig, Prediction, RecipeDocument, RecipeSummary, RecipeSource } from '../packages/cooklens-api/types';
import { chooseImage, discardImage, uploadBody, type UploadImage } from './src/image';
import { CookingComposer, CookingSessionScreen } from './src/assistant/CookingSessionScreen';
import { createLlmConfigStore, formatLlmBadge } from './src/assistant/llm-config';
import { LlmSettingsModal } from './src/assistant/LlmSettingsModal';
import { createCookingSessionController } from './src/assistant/session-controller';
import { createSessionPointerStore } from './src/assistant/session-pointer';
import { filterDishes } from './src/dishes';

type Page = 'upload' | 'recognition' | 'assistant';
const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const sessionStore = createSessionPointerStore(SecureStore);
const llmConfigStore = createLlmConfigStore(SecureStore);
const confidenceFormat = new Intl.NumberFormat('vi-VN', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
});
let api: ReturnType<typeof createApi> | null = null;
let gateway: string | null = null;
const nativeFileUploader: NativeFileUploader = async (url, file, requestId, signal) => {
  const result = await new File(file.uri).upload(url, {
    httpMethod: 'POST', uploadType: UploadType.MULTIPART, fieldName: 'file',
    mimeType: file.type || 'image/jpeg', headers: { 'X-Request-ID': requestId },
    sessionType: 'foreground', signal,
  });
  return new Response(result.body, { status: result.status, headers: result.headers });
};
try {
  if (configuredUrl) {
    const url = normalizeBaseUrl(configuredUrl);
    if (url !== '/api') {
      gateway = url;
      api = createApi(url, randomUUID, nativeFileUploader);
    }
  }
} catch { /* Show configuration help below. */ }

function Button({ title, onPress, disabled = false, secondary = false, expanded }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; expanded?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, expanded }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary,
      (disabled || pressed) && { opacity: .55 }]}>
    <Text style={[styles.buttonText, secondary && { color: '#713b1f' }]}>{title}</Text>
  </Pressable>;
}

function ResumeCooking({ gateway, disabled, onResume }: {
  gateway: string; disabled: boolean; onResume: () => void;
}) {
  const [saved, setSaved] = useState<'loading' | 'available' | 'empty' | 'unavailable'>('loading');
  useEffect(() => {
    let active = true;
    void sessionStore.read(gateway).then(
      pointer => { if (active) setSaved(pointer ? 'available' : 'empty'); },
      () => { if (active) setSaved('unavailable'); },
    );
    return () => { active = false; };
  }, [gateway]);

  if (saved === 'loading') return null;
  if (saved === 'available') return <Button title="Tiếp tục phiên nấu" secondary disabled={disabled} onPress={onResume} />;
  return <Text style={styles.small}>{saved === 'empty'
    ? 'Bạn chưa có phiên nấu đã lưu. Chọn ảnh món ăn để bắt đầu.'
    : 'Chưa đọc được phiên nấu đã lưu. Bạn vẫn có thể chọn ảnh để bắt đầu.'}</Text>;
}

function sourceNotes(text: string) {
  return text.replace(/chưa xác (?:định|thực) để `?null\b`?/gi, 'chưa có thông tin')
    .replace(/vẫn `?null\b`?/gi, 'vẫn chưa có thông tin')
    .replace(/(?:giữ|để) `?null\b`?/gi, 'để trống');
}

function Source({ source }: { source: RecipeSource }) {
  const [expanded, setExpanded] = useState(false);
  const href = recipeSourceHref(source.url);
  return <View style={styles.source}>
    <Text style={styles.label}>Nguồn: {source.name}</Text>
    <Button title={expanded ? 'Ẩn ghi công và ghi chú' : 'Ghi công và ghi chú'} secondary expanded={expanded}
      onPress={() => setExpanded(open => !open)} />
    {expanded && <>
      <Text style={styles.small}>{source.license}</Text><Text style={styles.body}>{source.attribution}</Text>
      {!!source.modifications && <Text style={styles.small}>{sourceNotes(source.modifications)}</Text>}
      {href && <Button title="Mở nguồn công thức" secondary onPress={() => { Linking.openURL(href).catch(() => Alert.alert('Chưa mở được nguồn', 'Hãy kiểm tra kết nối rồi thử lại.')); }} />}
    </>}
  </View>;
}

function CookLens() {
  const [page, setPage] = useState<Page>('upload');
  const [image, setImage] = useState<UploadImage | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selected, setSelected] = useState<Dish | null>(null);
  const [confirmed, setConfirmed] = useState<Dish | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [document, setDetail] = useState<RecipeDocument | null>(null);
  const [preview, setPreview] = useState<{ title: string; document?: RecipeDocument } | null>(null);
  const detail = preview?.document?.recipe;
  const [showFilter, setShowFilter] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LlmUserConfig | null>(null);
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  const [llmModalInitialMode, setLlmModalInitialMode] = useState<'default' | 'custom' | undefined>(undefined);
  const [llmStorageNotice, setLlmStorageNotice] = useState('');
  const llmConfigRef = useRef<LlmUserConfig | null>(null);
  const llmConfigTouched = useRef(false);
  const [cooking] = useState(() => api && gateway ? createCookingSessionController({
    api, gateway, store: sessionStore, operationId: randomUUID, getLlmConfig: () => llmConfigRef.current,
  }) : null);
  const [manual, setManual] = useState(false);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [visionIssue, setVisionIssue] = useState(false);
  const retry = useRef<(() => void) | null>(null);
  const flight = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const photoGeneration = useRef(0);
  const imageRef = useRef<UploadImage | null>(null);
  const mounted = useRef(true);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const savedScroll = useRef<Partial<Record<Page, number>>>({});
  const scrollTarget = useRef<number | null>(null);
  const scrollToChat = useCallback(() => scroll.current?.scrollToEnd({ animated: true }), []);

  function transitionTo(next: Page, direction: 'forward' | 'back') {
    savedScroll.current[page] = scrollY.current;
    scrollTarget.current = direction === 'back' ? (savedScroll.current[next] ?? 0) : 0;
    setPage(next);
  }
  function cancel() { generation.current++; flight.current?.abort(); flight.current = null; setBusy(null); }
  function navigate(next: Page, direction: 'forward' | 'back' = 'forward') {
    cancel(); setError(''); setVisionIssue(false); retry.current = null; transitionTo(next, direction);
  }
  function resetPhoto() {
    photoGeneration.current++;
    cooking?.leave();
    discardImage(imageRef.current);
    imageRef.current = null;
    setImage(null); setPredictions([]); setSelected(null); setConfirmed(null); setRecipes(null); setDetail(null);
    setManual(false); setFilter(''); setQuery('');
  }
  function newPhoto() {
    resetPhoto(); navigate('upload');
  }
  function openCatalog() {
    resetPhoto(); navigate('recognition'); showCatalog();
  }
  function back() {
    photoGeneration.current++;
    cooking?.leave();
    navigate(page === 'assistant' && confirmed ? 'recognition' : 'upload', 'back');
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page === 'upload' && !busy) return false;
      back(); return true;
    });
    return () => subscription.remove();
  }, [page, busy]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && flight.current) {
        generation.current++; flight.current.abort(); flight.current = null;
        setBusy(null); setError('Tác vụ đã dừng khi rời ứng dụng. Bạn có thể thử lại.');
      }
    });
    return () => { mounted.current = false; photoGeneration.current++; generation.current++;
      flight.current?.abort(); subscription.remove(); discardImage(imageRef.current); };
  }, []);
  useEffect(() => {
    let active = true;
    void llmConfigStore.read().then(saved => {
      if (!active || llmConfigTouched.current) return;
      llmConfigRef.current = saved;
      setLlmConfig(saved);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (scrollTarget.current === null) return;
    const target = scrollTarget.current;
    scrollTarget.current = null;
    const frame = requestAnimationFrame(() => {
      scrollY.current = target;
      scroll.current?.scrollTo({ y: target, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [page]);

  async function perform<T>(label: string, work: (signal: AbortSignal) => Promise<T>, done: (data: T) => void) {
    cancel();
    const current = generation.current;
    const controller = new AbortController(); flight.current = controller;
    setBusy(label); setError(''); setVisionIssue(false);
    retry.current = () => { void perform(label, work, done); };
    try {
      const value = await work(controller.signal);
      if (mounted.current && current === generation.current && !controller.signal.aborted) done(value);
    } catch (caught) {
      if (mounted.current && current === generation.current && !controller.signal.aborted) {
        const code = caught instanceof ApiError ? caught.code : undefined;
        if (code === 'IMAGE_BLURRY' || code === 'LOW_CONFIDENCE_PREDICTION') {
          retry.current = null;
          setVisionIssue(true);
        }
        setError(caught instanceof Error ? caught.message : 'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
      }
    } finally {
      if (mounted.current && current === generation.current) { setBusy(null); flight.current = null; }
    }
  }

  async function pick(camera: boolean, preserveOnCancel = false) {
    cancel();
    if (!preserveOnCancel) {
      setError(''); setVisionIssue(false); retry.current = null;
    }
    const current = ++photoGeneration.current; setBusy('Đang chuẩn bị ảnh…');
    try {
      const chosen = await chooseImage(camera);
      if (!mounted.current || current !== photoGeneration.current) { discardImage(chosen); return; }
      if (chosen) {
        discardImage(imageRef.current); imageRef.current = chosen; setImage(chosen);
        setError(''); setVisionIssue(false); retry.current = null;
        setPredictions([]); setSelected(null); setConfirmed(null); setRecipes(null); setDetail(null);
        setManual(false); setFilter(''); setQuery(''); transitionTo('upload', 'forward');
      }
    } catch (caught) {
      if (mounted.current && current === photoGeneration.current) {
        setVisionIssue(false);
        retry.current = null;
        setError(caught instanceof Error ? caught.message : 'Không đọc được ảnh đã chọn.');
      }
    } finally { if (mounted.current && current === photoGeneration.current) setBusy(null); }
  }
  function recognize() {
    if (!image || !api) return;
    void perform('Đang nhận diện món…', signal => api!.predict(uploadBody(image), signal), value => {
      setPredictions(value); setSelected(null); setManual(false); transitionTo('recognition', 'forward');
    });
  }
  function chooseDish(dish: Dish) {
    cancel(); setError(''); retry.current = null; setSelected(dish); setConfirmed(null); setRecipes(null); setDetail(null); setQuery('');
  }
  function showCatalog() {
    cancel(); setManual(true); setError('');
    if (!dishes.length && api) void perform('Đang tải danh mục…', signal => api!.getDishes(signal), setDishes);
  }
  function activateRecipe(value: RecipeDocument) {
    setDetail(value);
    void cooking?.prepareRecipe(value);
  }

  function search(dish: Dish, preference: string) {
    if (!api) return;
    const sameDish = page === 'assistant' && confirmed?.normalized_dish === dish.normalized_dish;
    const currentRecipe = sameDish ? document : null;
    if (!sameDish) {
      cooking?.leave();
      setConfirmed(dish); setRecipes(null); setDetail(null); setPreview(null); setShowFilter(false);
      navigate('assistant');
    }
    void perform('Đang tìm công thức…', signal => api!.searchRecipes(dish.normalized_dish, signal, preference), value => {
      setRecipes(value);
      if (!currentRecipe && value.length === 1) {
        void perform('Đang tải công thức…', signal => api!.getRecipeDocument(value[0].id, dish.normalized_dish, signal), activateRecipe);
      }
    });
  }

  function openRecipe(recipe: RecipeSummary) {
    if (!api || !confirmed) return;
    if (document?.recipe.id === recipe.id) {
      setPreview({ title: recipe.title, document });
      return;
    }
    setPreview({ title: recipe.title });
    void perform('Đang mở công thức…', signal => api!.getRecipeDocument(recipe.id, confirmed.normalized_dish, signal),
      value => setPreview({ title: recipe.title, document: value }));
  }

  function closeRecipe() {
    cancel();
    setError(''); retry.current = null; setPreview(null);
  }

  function openLlmSettings(mode?: 'default' | 'custom') {
    setLlmModalInitialMode(mode);
    setLlmModalOpen(true);
  }

  async function saveLlmSettings(config: LlmUserConfig) {
    llmConfigTouched.current = true;
    llmConfigRef.current = config;
    setLlmConfig(config);
    setLlmModalOpen(false);
    const saved = await llmConfigStore.write(config);
    if (mounted.current) {
      setLlmStorageNotice(saved ? '' : 'Không lưu được khóa API vào SecureStore. Cấu hình hiện chỉ áp dụng khi ứng dụng đang mở.');
    }
  }

  async function clearLlmSettings() {
    llmConfigTouched.current = true;
    llmConfigRef.current = null;
    setLlmConfig(null);
    setLlmModalOpen(false);
    const cleared = await llmConfigStore.clear();
    if (mounted.current) {
      setLlmStorageNotice(cleared ? '' : 'Không xóa được khóa API đã lưu trong SecureStore. Ứng dụng đã quay về mặc định cho phiên này.');
    }
  }

  function resumeCooking() {
    if (!cooking) return;
    setConfirmed(null); setRecipes(null); setDetail(null); setPreview(null);
    navigate('assistant');
    void cooking.resume();
  }

  const chat = page === 'assistant';
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar barStyle="dark-content" />
    <KeyboardAvoidingView style={styles.screen} behavior={chat && Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={!chat}>
      {chat ? <View style={styles.chatHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel={confirmed ? 'Đổi món' : 'Quay lại'} onPress={back} style={styles.sheetClose}>
          <Text style={styles.label}>‹</Text>
        </Pressable>
        <Text style={[styles.chatBrand, styles.chatCopy]}>CookLens</Text>
        <Pressable accessibilityRole="button"
          accessibilityLabel={llmConfig ? `Cài đặt trợ lý, đang dùng ${formatLlmBadge(llmConfig)}` : 'Cài đặt trợ lý'}
          onPress={() => openLlmSettings()}
          style={[styles.llmPill, llmConfig && styles.llmPillActive]}>
          <Text style={[styles.llmPillText, llmConfig && styles.llmPillTextActive]} numberOfLines={1}>
            {llmConfig ? formatLlmBadge(llmConfig) : 'Cài đặt trợ lý'}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ảnh mới" onPress={newPhoto}
          style={styles.sheetClose}><Text style={styles.label}>+</Text></Pressable>
      </View> : <>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <Text accessibilityRole="header" style={styles.brand}>CookLens<Text style={{ color: '#c44b1b' }}> ✦</Text></Text>
            <Pressable accessibilityRole="button"
              accessibilityLabel={llmConfig ? `Cài đặt trợ lý, đang dùng ${formatLlmBadge(llmConfig)}` : 'Cài đặt trợ lý'}
              onPress={() => openLlmSettings()}
              style={({ pressed }) => [styles.llmPill, llmConfig && styles.llmPillActive, pressed && { opacity: .55 }]}>
              <Text style={[styles.llmPillText, llmConfig && styles.llmPillTextActive]} numberOfLines={1}>
                {llmConfig ? formatLlmBadge(llmConfig) : 'Cài đặt trợ lý'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.small}>Từ một bức ảnh đến bữa cơm Việt</Text>
        </View>
        {page !== 'upload' && <Button title="← Quay lại" secondary onPress={back} />}
      </>}
      {!!llmStorageNotice && <View accessibilityLiveRegion="polite" style={styles.notice}>
        <Text style={styles.small}>{llmStorageNotice}</Text>
      </View>}
      {!api && <View style={styles.error}><Text style={styles.body}>Chưa cấu hình được máy chủ CookLens. Hãy làm theo phần kết nối trong hướng dẫn mobile rồi khởi động lại ứng dụng.</Text></View>}
      <Text accessibilityRole="header" style={chat ? styles.subtitle : styles.title}>{chat ? 'Trợ lý nấu ăn' : page === 'upload' ? 'Hôm nay, mình nấu gì?' : image ? 'Đây có phải món của bạn?' : 'Chọn món'}</Text>
      {page === 'upload' && <>
        <Text style={styles.body}>Chụp hoặc chọn ảnh một món ăn Việt. Xem ba gợi ý, xác nhận món rồi khám phá công thức.</Text>
        {image ? <Image accessibilityLabel="Ảnh món ăn đã chọn" source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
          : <View style={styles.placeholder}><Text style={styles.placeholderIcon}>✦</Text><Text style={styles.label}>Bắt đầu từ một món ngon</Text><Text style={styles.small}>Một món rõ nét, ánh sáng đầy đủ</Text></View>}
        {!!error && <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}><Text style={styles.body}>{error}</Text>
          {visionIssue && <View style={styles.row}>
            <Button title="Chọn ảnh khác" onPress={() => { void pick(false, true); }} disabled={!!busy} />
            <Button title="Chụp ảnh mới" secondary onPress={() => { void pick(true, true); }} disabled={!!busy} />
          </View>}
          {!!retry.current && <Button title="Thử lại" onPress={() => retry.current?.()} disabled={!!busy} />}</View>}
        <View style={styles.row}><Button title="Chụp ảnh" onPress={() => { void pick(true, true); }} disabled={!!busy} secondary />
          <Button title="Chọn từ thư viện" onPress={() => { void pick(false, true); }} disabled={!!busy} secondary /></View>
        {image && <Button title="Nhận diện món" onPress={recognize} disabled={!!busy || !api || visionIssue} />}
        <Button title="Chọn món từ danh mục" secondary disabled={!!busy || !api} onPress={openCatalog} />
        {cooking && gateway && <ResumeCooking gateway={gateway} disabled={!!busy} onResume={resumeCooking} />}
        <Text style={styles.small}>Ảnh được chuyển sang JPEG, tối đa 10 MiB và 25 triệu pixel. Ảnh và lựa chọn không được lưu thành lịch sử.</Text>
      </>}
      {page === 'recognition' && (() => {
        const lowConfidence = predictions.length > 0 && predictions[0].confidence < MIN_VISION_CONFIDENCE;
        return <>
          {image && <Image source={{ uri: image.uri }} style={styles.thumbnail} accessibilityLabel="Ảnh đang nhận diện" resizeMode="contain" />}
          {lowConfidence ? <View accessibilityRole="alert" style={styles.error}>
            <Text style={styles.label}>Chưa xác định được món</Text>
            <Text style={styles.body}>Hãy thử ảnh khác hoặc chọn món theo tên trong danh mục 30 món Việt.</Text>
            <View style={styles.row}>
              <Button title="Chọn ảnh khác" onPress={() => { void pick(false, false); }} disabled={!!busy} />
              <Button title="Chụp ảnh mới" secondary onPress={() => { void pick(true, false); }} disabled={!!busy} />
            </View>
          </View> : !!predictions.length && <>
            <Text style={styles.body}>CookLens gợi ý món từ ảnh. Hãy chọn món đúng trước khi xem công thức.</Text>
            <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
              {predictions.map(prediction => <Pressable key={prediction.class_id} accessibilityRole="radio"
                accessibilityState={{ checked: selected?.class_id === prediction.class_id }} onPress={() => chooseDish(prediction)}
                style={[styles.card, selected?.class_id === prediction.class_id && styles.selected]}>
                <Text style={styles.label}>{prediction.rank}. {prediction.display_name}</Text>
                <Text style={styles.small}>Độ tin cậy của gợi ý: {confidenceFormat.format(prediction.confidence)}</Text>
              </Pressable>)}
            </View>
          </>}
          {!manual && <Button title="Chọn món từ danh mục" secondary onPress={showCatalog} />}
          {manual && (() => {
            const filteredDishes = filterDishes(dishes, filter);
            return <View style={styles.card}><Text style={styles.label}>Danh mục món ăn</Text>
              <TextInput accessibilityLabel="Lọc tên món" value={filter} onChangeText={setFilter} placeholder="Tìm tên món…" style={styles.input} />
              {filteredDishes.map(dish =>
                <Pressable key={dish.class_id} accessibilityRole="radio" accessibilityState={{ checked: selected?.class_id === dish.class_id }}
                  style={[styles.dish, selected?.class_id === dish.class_id && styles.selected]} onPress={() => chooseDish(dish)}>
                  <Text style={styles.body}>{dish.display_name}</Text></Pressable>)}
              {!busy && dishes.length > 0 && filteredDishes.length === 0 && <View style={{ gap: 10 }}>
                <Text style={styles.body}>Không tìm thấy món phù hợp</Text>
                <Button title="Xóa bộ lọc" secondary onPress={() => setFilter('')} />
              </View>}
            </View>;
          })()}
          {(!lowConfidence || manual) && <Button title={selected ? `Xác nhận ${selected.display_name}` : 'Chọn món để tiếp tục'} disabled={!selected || !!busy || !api}
            onPress={() => { if (selected) search(selected, ''); }} />}
        </>;
      })()}
      {chat && confirmed && <>
        <View style={styles.chatSent}>
          {image && <Image source={{ uri: image.uri }} accessibilityLabel="Ảnh món ăn đã gửi" style={styles.chatThumb} />}
          <View style={styles.chatCopy}><Text style={styles.label}>{confirmed.display_name}</Text><Text style={styles.small}>Món đã xác nhận</Text></View>
        </View>
        <View style={styles.chatIntro}>
          <Text style={styles.chatMark} accessibilityElementsHidden>✦</Text>
          <View style={styles.chatCopy}>
            <Text style={styles.small}>CookLens</Text>
            <Text accessibilityRole="header" style={styles.subtitle}>{recipes?.length === 1 ? 'Mình tìm được công thức.'
              : recipes?.length ? `Mình tìm được ${recipes.length} công thức.`
                : busy ? 'Đang tìm công thức…' : recipes ? 'Chưa có công thức phù hợp' : 'Chưa tải được công thức'}</Text>
            {!!recipes?.length && <Text style={styles.body}>Mở công thức hoặc hỏi về cách làm ngay tại đây.</Text>}
          </View>
        </View>
        {recipes?.map(recipe => <Pressable key={recipe.id} accessibilityRole="button"
          accessibilityLabel={`Xem công thức ${recipe.title}`} onPress={() => openRecipe(recipe)} style={styles.chatRecipe}>
          <Text style={styles.chatMark} accessibilityElementsHidden>≡</Text>
          <View style={styles.chatCopy}><Text style={styles.label}>{recipe.title}</Text>
            <Text style={styles.small}>{recipe.source.name}{document?.recipe.id === recipe.id ? ' · Đang dùng để hỏi' : ''}</Text></View>
          <Text style={styles.chatForward} accessibilityElementsHidden>›</Text>
        </Pressable>)}
        {recipes?.length === 0 && <Button title="Tìm lại công thức" secondary onPress={() => search(confirmed, query)} />}
        {!!recipes && <Button title={showFilter ? 'Ẩn tùy chọn tìm lại' : 'Ưu tiên nguyên liệu hoặc cách nấu'}
          onPress={() => setShowFilter(value => !value)} secondary />}
        {showFilter && <>
          <TextInput accessibilityLabel="Ưu tiên nguyên liệu hoặc cách nấu" value={query} maxLength={200} onChangeText={setQuery}
            placeholder="Ví dụ: thịt bò, ninh xương…" style={styles.input} />
          <Button title="Tìm công thức" secondary disabled={!!busy} onPress={() => search(confirmed, query)} />
        </>}
        {!!recipes?.length && !document && !busy && <Text style={styles.small}>Mở một công thức và chọn “Chọn công thức này”.</Text>}
      </>}
      {chat && confirmed && document && !recipes?.some(recipe => recipe.id === document.recipe.id) &&
        <Button title={`Xem công thức ${document.recipe.title}`} secondary onPress={() => setPreview({ title: document.recipe.title, document })} />}
      {chat && cooking && (!confirmed || document) && <CookingSessionScreen controller={cooking} Button={Button}
        document={document} llmConfig={llmConfig} onOpenLlmSettings={openLlmSettings}
        onChooseDish={openCatalog} onOpenRecipe={value => setPreview({ title: value.recipe.title, document: value })}
        scrollToChat={scrollToChat} />}
      {!!busy && !preview && <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color="#b84415" /><Text style={styles.body}>{busy}</Text></View>}
      {!!busy && !preview && !!flight.current && <Button title="Hủy tác vụ" secondary onPress={() => { cancel(); setError(''); retry.current = null; }} />}
      {page !== 'upload' && !!error && !preview && <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}><Text style={styles.body}>{error}</Text>
        {visionIssue && <Button title="Chọn ảnh khác" onPress={() => { void pick(false, false); }} disabled={!!busy} />}
        {!!retry.current && <Button title="Thử lại" onPress={() => retry.current?.()} disabled={!!busy} />}</View>}
      {(page === 'upload' || page === 'recognition') && <View style={styles.footer}><Text style={styles.small}>Hỗ trợ 30 món Việt. Ảnh ngoài danh mục hoặc có nhiều món có thể cho gợi ý sai. Bộ công thức có ghi nguồn, gồm cả các công thức do AI biên soạn.</Text></View>}
    </ScrollView>
    {chat && cooking && (!confirmed || document) && <CookingComposer controller={cooking} />}
    </KeyboardAvoidingView>
    <Modal visible={!!preview} animationType="slide" transparent onRequestClose={closeRecipe}>
      <View style={styles.sheetBackdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.sheetHeading}><Text accessibilityRole="header" style={[styles.subtitle, styles.chatCopy]}>{preview?.title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng công thức" onPress={closeRecipe} style={styles.sheetClose}>
              <Text style={styles.label}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {preview?.document && detail ? <>
              {confirmed && document?.recipe.id !== preview.document.recipe.id &&
                 <Button title="Chọn công thức này" onPress={() => {
                   if (preview.document) activateRecipe(preview.document);
                   closeRecipe();
                 }} />}
              <View style={styles.card}><Text style={styles.subtitle}>Nguyên liệu</Text>
                <Text style={styles.small}>Khẩu phần: {detail.servings === null ? 'Chưa có thông tin' : `${detail.servings} người`}</Text>
                {detail.ingredients.map((item, index) => <View key={index} style={styles.ingredient}>
                  <Text style={styles.body}>{item.name}{item.optional ? ' (tùy chọn)' : ''}</Text>
                   <Text style={styles.small}>{item.quantity === null ? 'Chưa có định lượng' : `${item.quantity} ${item.unit ?? ''}`}</Text>
                  {!!item.note && <Text style={styles.small}>{item.note}</Text>}
                </View>)}
              </View>
              <View style={styles.card}><Text style={styles.subtitle}>Các bước thực hiện</Text>
                {detail.instructions.map(step => <View key={step.step} style={styles.ingredient}>
                  <Text style={styles.label}>Bước {step.step}</Text><Text style={styles.body}>{step.text}</Text>
                  {step.duration_minutes != null && <Text style={styles.small}>{step.duration_minutes} phút</Text>}
                </View>)}
                <Source source={detail.source} />
              </View>
            </> : error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.body}>{error}</Text>
              {!!retry.current && <Button title="Thử lại" onPress={() => retry.current?.()} />}</View>
              : <Text accessibilityLiveRegion="polite" style={styles.body}>Đang mở công thức…</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
    <LlmSettingsModal
      open={llmModalOpen}
      initialMode={llmModalInitialMode}
      currentConfig={llmConfig}
      api={api}
      onSave={saveLlmSettings}
      onClear={clearLlmSettings}
      onClose={() => setLlmModalOpen(false)}
    />
  </SafeAreaView>;
}

export default function App() {
  const [loaded, error] = useFonts({
    Epilogue: require('@expo-google-fonts/epilogue/800ExtraBold/Epilogue_800ExtraBold.ttf'),
    Jakarta: require('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf'),
    JakartaSemi: require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
  });
  if (!loaded && !error) return <SafeAreaProvider><SafeAreaView style={styles.safe}><ActivityIndicator accessibilityLabel="Đang mở CookLens" /></SafeAreaView></SafeAreaProvider>;
  return <SafeAreaProvider><CookLens /></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5d8c5' },
  chatBrand: { fontFamily: 'Epilogue', fontSize: 22, color: '#35271d' },
  chatSent: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingRight: 12,
    borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: '#f9e3d3', maxWidth: '100%' },
  chatThumb: { width: 46, height: 46, borderRadius: 10 },
  chatIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  chatCopy: { flex: 1, flexShrink: 1, gap: 3 },
  chatMark: { width: 33, height: 33, textAlign: 'center', lineHeight: 33, color: '#a83d0d',
    backgroundColor: '#f7e3d1', borderRadius: 10, overflow: 'hidden', fontSize: 18 },
  chatRecipe: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fffdf8', borderColor: '#e5d8c5',
    borderWidth: 1, borderRadius: 17, padding: 10 },
  chatForward: { fontSize: 23, color: '#a83d0d', paddingHorizontal: 5 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#30221970' },
  sheet: { height: '88%', backgroundColor: '#fffdf8', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderBottomColor: '#e5d8c5', borderBottomWidth: 1 },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#f5e8d6' },
  sheetContent: { padding: 14, gap: 12 },
  safe: { flex: 1, backgroundColor: '#fbf7ee' }, content: { padding: 22, gap: 18, maxWidth: 700, width: '100%', alignSelf: 'center' },
  header: { paddingVertical: 16, gap: 6 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  llmPill: { minHeight: 38, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f2e4d3',
    borderWidth: 1, borderColor: '#d8bea2', justifyContent: 'center', maxWidth: 210 },
  llmPillActive: { backgroundColor: '#fff0df', borderColor: '#b84415' },
  llmPillText: { fontSize: 13, fontFamily: 'JakartaSemi', color: '#713b1f' },
  llmPillTextActive: { color: '#a83d0d' },
  notice: { backgroundColor: '#f7efe5', borderColor: '#d8bea2', borderWidth: 1, padding: 12, borderRadius: 14 },
  brand: { fontSize: 29, fontFamily: 'Epilogue', color: '#30251e' },
  title: { fontSize: 32, fontFamily: 'Epilogue', color: '#35271d' }, subtitle: { fontSize: 23, fontFamily: 'Epilogue', color: '#35271d' },
  body: { fontSize: 16, fontFamily: 'Jakarta', lineHeight: 25, color: '#4d4037', flexShrink: 1 }, small: { fontSize: 14, fontFamily: 'Jakarta', lineHeight: 22, color: '#6b5b4f' },
  label: { fontSize: 17, fontFamily: 'JakartaSemi', color: '#403025', flexShrink: 1 },
  button: { minHeight: 48, backgroundColor: '#b84415', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: '#f2e4d3', borderWidth: 1, borderColor: '#d8bea2' }, buttonText: { color: '#fffaf0', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  row: { gap: 12 }, card: { padding: 20, borderRadius: 24, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#e5d8c5', gap: 14 },
  selected: { backgroundColor: '#fff0df', borderColor: '#b84415', borderWidth: 2 },
  placeholder: { minHeight: 215, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 28, backgroundColor: '#f1e7d8', borderWidth: 1, borderColor: '#d9c7b0', borderStyle: 'dashed' },
  placeholderIcon: { fontSize: 46, color: '#b84415' }, preview: { height: 280, borderRadius: 24, backgroundColor: '#eee2d1' },
  thumbnail: { height: 150, borderRadius: 20, backgroundColor: '#eee2d1' }, input: { minHeight: 50, borderWidth: 1, borderColor: '#b9a58c', borderRadius: 16, padding: 14, color: '#35271d', backgroundColor: '#fffdf8', fontSize: 16 },
  dish: { padding: 14, borderRadius: 14 }, source: { gap: 8, paddingTop: 10 }, ingredient: { borderTopWidth: 1, borderColor: '#e8dece', paddingTop: 14, gap: 5 },
  error: { backgroundColor: '#fff0e8', borderColor: '#bf4e25', borderWidth: 1, padding: 18, borderRadius: 18, gap: 12 },
  loading: { padding: 18, gap: 10, alignItems: 'center' }, footer: { marginVertical: 18, borderTopWidth: 1, borderColor: '#ded2bf', paddingTop: 20 },
});
