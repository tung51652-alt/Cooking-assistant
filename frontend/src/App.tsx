import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Dish, Prediction, RecipeDetail, RecipeSummary, SelectedImage, View } from './types';
import * as api from './lib/api';
import UploadPage from './features/UploadPage';
import RecognitionPage from './features/RecognitionPage';
import RecipePage from './features/RecipePage';

const routes: Record<View, string> = { upload: '/index.html', recognition: '/recognition.html', recipes: '/recipe.html' };
const labels: Record<View, string> = { upload: 'Trang chủ', recognition: 'Nhận diện', recipes: 'Công thức' };
function currentView(): View {
  return location.pathname === routes.recognition ? 'recognition' : location.pathname === routes.recipes ? 'recipes' : 'upload';
}

export default function App() {
  const [view, setView] = useState<View>(currentView);
  const [image, setImage] = useState<SelectedImage | null>(null);
  const imageRef = useRef<SelectedImage | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [chosen, setChosen] = useState<Dish | null>(null);
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [confirmed, setConfirmed] = useState<Dish | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'predict' | 'dishes' | 'search' | 'detail' | null>(null);
  const request = useRef<AbortController | null>(null);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const pop = () => setView(currentView());
    window.addEventListener('popstate', pop);
    return () => { window.removeEventListener('popstate', pop); request.current?.abort(); };
  }, []);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);
  useEffect(() => { document.title = `CookLens · ${labels[view]}`; main.current?.focus(); }, [view]);

  function navigate(next: View) {
    if (location.pathname !== routes[next]) history.pushState(null, '', routes[next]);
    setView(next);
  }
  function link(event: MouseEvent<HTMLAnchorElement>, next: View) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(next);
  }
  function cancel() { request.current?.abort(); request.current = null; setBusy(null); }
  function resetRecipes() { setConfirmed(null); setRecipes(null); setDetail(null); }
  function replaceImage(next: SelectedImage | null) {
    cancel(); imageRef.current = next; setImage(next); setPredictions([]); setChosen(null); resetRecipes(); setError(null);
  }
  function filesChanged(files: FileList | null) {
    if (!files?.length) return;
    if (files.length !== 1) { setError('Vui lòng chọn một ảnh cho mỗi lần nhận diện.'); return; }
    const file = files[0];
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError('Hãy chọn ảnh JPG hoặc PNG.'); return; }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) { setError('Ảnh phải có nội dung và không quá 10 MiB.'); return; }
    replaceImage({ file, url: URL.createObjectURL(file) });
  }
  function invalidImage(file: File, message: string) {
    if (imageRef.current?.file !== file) return;
    replaceImage(null); setError(message);
  }
  async function run(task: NonNullable<typeof busy>, action: (signal: AbortSignal) => Promise<void>) {
    cancel();
    const controller = new AbortController(); request.current = controller; setBusy(task); setError(null);
    try { await action(controller.signal); }
    catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof api.ApiError ? failure.message : 'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
    } finally { if (request.current === controller) { request.current = null; setBusy(null); } }
  }
  async function recognize() {
    if (!image) return;
    setPredictions([]); setChosen(null); resetRecipes();
    await run('predict', async signal => {
      const result = await api.predict(image.file, signal);
      if (!signal.aborted) { setPredictions(result); navigate('recognition'); }
    });
  }
  function choose(dish: Dish | null) { cancel(); setChosen(dish); resetRecipes(); setError(null); }
  async function editDish() {
    if (dishes) return;
    await run('dishes', async signal => { const result = await api.getDishes(signal); if (!signal.aborted) setDishes(result); });
  }
  async function findRecipes(dish: Dish | null = chosen) {
    if (!dish) return;
    setConfirmed(dish); setRecipes(null); setDetail(null); navigate('recipes');
    await run('search', async signal => {
      const result = await api.searchRecipes(dish.normalized_dish, signal);
      if (!signal.aborted) setRecipes(result);
    });
  }
  async function openRecipe(recipe: RecipeSummary) {
    if (!confirmed) return;
    setDetail(null);
    await run('detail', async signal => {
      const result = await api.getRecipe(recipe.id, confirmed.normalized_dish, signal);
      if (!signal.aborted) setDetail(result);
    });
  }
  return <>
    <a className="skip-link" href="#main">Đến nội dung chính</a>
    <header className="header"><nav className="navbar" aria-label="Điều hướng chính">
      <a className="logo" href={routes.upload} onClick={event => link(event, 'upload')}><span aria-hidden="true">🍳</span> CookLens</a>
      <div className="nav-links">{(Object.keys(labels) as View[]).map(next => <a key={next} href={routes[next]} aria-current={view === next ? 'page' : undefined} onClick={event => link(event, next)}>{labels[next]}</a>)}</div>
    </nav></header>
    <main id="main" ref={main} tabIndex={-1}>
      {error && <div className="error-message" role="alert"><p>{error}</p><button className="text-btn" onClick={() => setError(null)}>Đóng thông báo</button></div>}
      {view === 'upload' && <UploadPage image={image} busy={busy === 'predict'} onFiles={filesChanged} onRemove={() => replaceImage(null)} onPredict={recognize} onInvalid={invalidImage} />}
      {view === 'recognition' && <RecognitionPage image={image} predictions={predictions} chosen={chosen} dishes={dishes} busy={busy === 'dishes'} onChoose={choose} onConfirm={() => findRecipes()} onEdit={editDish} onUpload={() => navigate('upload')} />}
      {view === 'recipes' && <RecipePage dish={confirmed} recipes={recipes} detail={detail} busy={busy === 'search' ? 'search' : busy === 'detail' ? 'detail' : null} onOpen={openRecipe} onBack={() => setDetail(null)} onSearch={() => findRecipes(confirmed)} onChooseDish={() => navigate('recognition')} />}
    </main>
    <footer><span>© {new Date().getFullYear()} CookLens</span><span>Từ ảnh món ăn đến công thức của bạn.</span></footer>
  </>;
}
