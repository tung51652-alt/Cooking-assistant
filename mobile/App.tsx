import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Image, Linking, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { useFonts } from 'expo-font';
import { createApi } from '../packages/cooklens-api';
import type { Dish, Prediction, RecipeDetail, RecipeSummary, RecipeSource } from '../packages/cooklens-api/types';
import { chooseImage, discardImage, uploadBody, type UploadImage } from './src/image';

type Page = 'upload' | 'recognition' | 'recipes' | 'detail';
const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
let api: ReturnType<typeof createApi> | null = null;
try { if (configuredUrl) api = createApi(configuredUrl, randomUUID); } catch { /* Show configuration help below. */ }

function Button({ title, onPress, disabled = false, secondary = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary,
      (disabled || pressed) && { opacity: .55 }]}>
    <Text style={[styles.buttonText, secondary && { color: '#713b1f' }]}>{title}</Text>
  </Pressable>;
}

function Source({ source }: { source: RecipeSource }) {
  let href: string | null = null;
  try { const url = new URL(source.url); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) href = url.href; } catch { /* Plain attribution remains visible. */ }
  return <View style={styles.source}>
    <Text style={styles.label}>Nguồn: {source.name}</Text>
    <Text style={styles.small}>{source.license}</Text><Text style={styles.body}>{source.attribution}</Text>
    {!!source.modifications && <Text style={styles.small}>{source.modifications}</Text>}
    {!!href && <Button title="Mở nguồn công thức" secondary onPress={() => { Linking.openURL(href!).catch(() => Alert.alert('Chưa mở được nguồn', 'Hãy kiểm tra kết nối rồi thử lại.')); }} />}
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
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [manual, setManual] = useState(false);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const retry = useRef<(() => void) | null>(null);
  const flight = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const photoGeneration = useRef(0);
  const imageRef = useRef<UploadImage | null>(null);
  const mounted = useRef(true);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  function cancel() { generation.current++; flight.current?.abort(); flight.current = null; setBusy(null); }
  function navigate(next: Page) { cancel(); setError(''); retry.current = null; setPage(next); scroll.current?.scrollTo({ y: 0 }); }
  function back() {
    photoGeneration.current++;
    navigate(page === 'detail' ? 'recipes' : page === 'recipes' ? 'recognition' : 'upload');
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

  async function perform<T>(label: string, work: (signal: AbortSignal) => Promise<T>, done: (data: T) => void) {
    cancel();
    const current = generation.current;
    const controller = new AbortController(); flight.current = controller;
    setBusy(label); setError('');
    retry.current = () => { void perform(label, work, done); };
    try {
      const value = await work(controller.signal);
      if (mounted.current && current === generation.current && !controller.signal.aborted) done(value);
    } catch (caught) {
      if (mounted.current && current === generation.current && !controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
      }
    } finally {
      if (mounted.current && current === generation.current) { setBusy(null); flight.current = null; }
    }
  }

  async function pick(camera: boolean) {
    cancel(); setError(''); retry.current = null;
    const current = ++photoGeneration.current; setBusy('Đang chuẩn bị ảnh…');
    try {
      const chosen = await chooseImage(camera);
      if (!mounted.current || current !== photoGeneration.current) { discardImage(chosen); return; }
      if (chosen) {
        discardImage(imageRef.current); imageRef.current = chosen; setImage(chosen);
        setPredictions([]); setSelected(null); setConfirmed(null); setRecipes(null); setDetail(null);
        setManual(false); setFilter(''); setQuery(''); setPage('upload');
      }
    } catch (caught) {
      if (mounted.current && current === photoGeneration.current) setError(caught instanceof Error ? caught.message : 'Không đọc được ảnh đã chọn.');
    } finally { if (mounted.current && current === photoGeneration.current) setBusy(null); }
  }
  function recognize() {
    if (!image || !api) return;
    void perform('Đang nhận diện món…', signal => api!.predict(uploadBody(image), signal), value => {
      setPredictions(value); setSelected(null); setManual(false); setPage('recognition');
    });
  }
  function chooseDish(dish: Dish) {
    cancel(); setError(''); retry.current = null; setSelected(dish); setConfirmed(null); setRecipes(null); setDetail(null); setQuery('');
  }
  function showCatalog() {
    cancel(); setManual(true); setError('');
    if (!dishes.length && api) void perform('Đang tải danh mục…', signal => api!.getDishes(signal), setDishes);
  }
  function search(dish: Dish, preference: string) {
    if (!api) return;
    setConfirmed(dish); setRecipes(null); setDetail(null); setPage('recipes');
    void perform('Đang tìm công thức…', signal => api!.searchRecipes(dish.normalized_dish, signal, preference), setRecipes);
  }
  function openRecipe(recipe: RecipeSummary) {
    if (!api || !confirmed) return;
    setDetail(null); setPage('detail');
    void perform('Đang mở công thức…', signal => api!.getRecipe(recipe.id, confirmed.normalized_dish, signal), setDetail);
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar barStyle="dark-content" />
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.brand}>CookLens<Text style={{ color: '#c44b1b' }}> ✦</Text></Text>
        <Text style={styles.small}>Từ một bức ảnh đến bữa cơm Việt</Text></View>
      {page !== 'upload' && <Button title="← Quay lại" secondary onPress={back} />}
      {!api && <View style={styles.error}><Text style={styles.body}>Chưa cấu hình được máy chủ CookLens. Hãy làm theo phần kết nối trong hướng dẫn mobile rồi khởi động lại ứng dụng.</Text></View>}
      <Text accessibilityRole="header" style={styles.title}>{page === 'upload' ? 'Hôm nay, mình nấu gì?' : page === 'recognition' ? 'Đây có phải món của bạn?' : page === 'detail' ? (detail?.title || 'Chi tiết công thức') : 'Công thức cho bạn'}</Text>
      {page === 'upload' && <>
        <Text style={styles.body}>Chụp hoặc chọn ảnh một món ăn Việt. Xem ba gợi ý, xác nhận món rồi khám phá công thức.</Text>
        {image ? <Image accessibilityLabel="Ảnh món ăn đã chọn" source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
          : <View style={styles.placeholder}><Text style={styles.placeholderIcon}>✦</Text><Text style={styles.label}>Bắt đầu từ một món ngon</Text><Text style={styles.small}>Một món rõ nét, ánh sáng đầy đủ</Text></View>}
        <View style={styles.row}><Button title="Chụp ảnh" onPress={() => { void pick(true); }} disabled={!!busy} secondary />
          <Button title="Chọn từ thư viện" onPress={() => { void pick(false); }} disabled={!!busy} secondary /></View>
        {image && <Button title="Nhận diện món" onPress={recognize} disabled={!!busy || !api} />}
        <Text style={styles.small}>Ảnh được chuyển sang JPEG, tối đa 10 MiB và 25 triệu pixel. Ảnh và lựa chọn không được lưu thành lịch sử.</Text>
      </>}
      {page === 'recognition' && <>
        {image && <Image source={{ uri: image.uri }} style={styles.thumbnail} accessibilityLabel="Ảnh đang nhận diện" resizeMode="contain" />}
        <Text style={styles.body}>Chọn một dự đoán hoặc sửa món trong danh mục. Confidence là điểm model; bạn là người xác nhận.</Text>
        <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
          {predictions.map(prediction => <Pressable key={prediction.class_id} accessibilityRole="radio"
            accessibilityState={{ checked: selected?.class_id === prediction.class_id }} onPress={() => chooseDish(prediction)}
            style={[styles.card, selected?.class_id === prediction.class_id && styles.selected]}>
            <Text style={styles.label}>{prediction.rank}. {prediction.display_name}</Text>
            <Text style={styles.small}>{(prediction.confidence * 100).toFixed(1)}% confidence</Text>
          </Pressable>)}
        </View>
        <Button title="Sửa món trong danh mục" secondary onPress={showCatalog} />
        {manual && <View style={styles.card}><Text style={styles.label}>Danh mục món ăn</Text>
          <TextInput accessibilityLabel="Lọc tên món" value={filter} onChangeText={setFilter} placeholder="Tìm tên món…" style={styles.input} />
          {dishes.filter(dish => dish.display_name.toLocaleLowerCase('vi').includes(filter.toLocaleLowerCase('vi'))).map(dish =>
            <Pressable key={dish.class_id} accessibilityRole="radio" accessibilityState={{ checked: selected?.class_id === dish.class_id }}
              style={[styles.dish, selected?.class_id === dish.class_id && styles.selected]} onPress={() => chooseDish(dish)}>
              <Text style={styles.body}>{dish.display_name}</Text></Pressable>)}
        </View>}
        <Button title={selected ? `Xác nhận ${selected.display_name}` : 'Chọn món để tiếp tục'} disabled={!selected || !!busy || !api}
          onPress={() => { if (selected) search(selected, ''); }} />
      </>}
      {(page === 'recipes' || page === 'detail') && confirmed && <>
        <Text style={styles.label}>Món đã xác nhận: {confirmed.display_name}</Text>
        <Button title="Đổi món" secondary onPress={() => { navigate('recognition'); setConfirmed(null); setRecipes(null); setDetail(null); }} />
      </>}
      {page === 'recipes' && <>
        <Text style={styles.body}>Ưu tiên nguyên liệu hoặc cách nấu (không bắt buộc)</Text>
        <TextInput accessibilityLabel="Ưu tiên nguyên liệu hoặc cách nấu" value={query} maxLength={200} onChangeText={setQuery} placeholder="Ví dụ: thịt bò, ninh xương…" style={styles.input} />
        <Button title="Tìm công thức" secondary disabled={!!busy || !confirmed} onPress={() => { if (confirmed) search(confirmed, query); }} />
        {!busy && recipes?.length === 0 && <View style={styles.card}><Text style={styles.label}>Chưa có công thức phù hợp</Text><Text style={styles.body}>Bạn có thể đổi món hoặc thử tìm lại.</Text></View>}
        {!busy && recipes?.map(recipe => <View key={recipe.id} style={styles.card}>
          <Text style={styles.subtitle}>{recipe.title}</Text><Text style={styles.body}>{recipe.preview}</Text>
          <Source source={recipe.source} /><Button title={`Xem công thức ${recipe.title}`} onPress={() => openRecipe(recipe)} />
        </View>)}
      </>}
      {page === 'detail' && detail && <>
        <View style={styles.card}><Text style={styles.subtitle}>Nguyên liệu</Text>
          <Text style={styles.small}>Khẩu phần: {detail.servings === null ? 'Chưa có thông tin' : `${detail.servings} người`}</Text>
          {detail.ingredients.map((ingredient, index) => <View key={index} style={styles.ingredient}>
            <Text style={styles.body}>{ingredient.name}{ingredient.optional ? ' (tùy chọn)' : ''}</Text>
            <Text style={styles.label}>{ingredient.quantity === null ? 'Chưa có định lượng' : `${ingredient.quantity} ${ingredient.unit ?? ''}`}</Text>
            {!!ingredient.note && <Text style={styles.small}>{ingredient.note}</Text>}
          </View>)}
        </View>
        <View style={styles.card}><Text style={styles.subtitle}>Các bước thực hiện</Text>
          {detail.instructions.map(step => <View key={step.step} style={styles.ingredient}><Text style={styles.label}>Bước {step.step}</Text>
            <Text style={styles.body}>{step.text}</Text>{step.duration_minutes !== null && <Text style={styles.small}>{step.duration_minutes} phút</Text>}</View>)}
          <Source source={detail.source} />
        </View>
      </>}
      {!!busy && <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color="#b84415" /><Text style={styles.body}>{busy}</Text></View>}
      {!!busy && !!flight.current && <Button title="Hủy tác vụ" secondary onPress={() => { cancel(); setError(''); retry.current = null; }} />}
      {!!error && <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}><Text style={styles.body}>{error}</Text>
        {!!retry.current && <Button title="Thử lại" onPress={() => retry.current?.()} disabled={!!busy} />}</View>}
      <View style={styles.footer}><Text style={styles.small}>Hỗ trợ 30 món Việt. Ảnh ngoài danh mục hoặc nhiều món có thể cho kết quả sai. Công thức lấy từ corpus có nguồn; một số công thức được AI biên soạn và có ghi nguồn rõ ràng.</Text></View>
    </ScrollView>
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
  safe: { flex: 1, backgroundColor: '#fbf7ee' }, content: { padding: 22, gap: 18, maxWidth: 700, width: '100%', alignSelf: 'center' },
  header: { paddingVertical: 16, gap: 6 }, brand: { fontSize: 29, fontFamily: 'Epilogue', color: '#30251e' },
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
