import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { IconContext, BowlFood, ArrowRight, Key } from '@phosphor-icons/react';
import type { Dish, LlmUserConfig, Prediction, RecipeDetail, RecipeDocument, RecipeSummary, SelectedImage, View } from './types';
import * as api from './lib/api';
import { clearLlmConfig, LLM_PRESETS, loadLlmConfig, saveLlmConfig } from './lib/llmConfig';
import UploadPage from './features/UploadPage';
import RecognitionPage from './features/RecognitionPage';
import RecipePage from './features/RecipePage';
import AssistantPage from './features/AssistantPage';
import LlmSettingsModal from './features/LlmSettingsModal';

const routes: Record<View, string> = { upload: '/index.html', recognition: '/recognition.html', recipes: '/recipe.html', assistant: '/assistant.html' };
const labels: Record<View, string> = { upload: 'Trang chủ', recognition: 'Nhận diện', recipes: 'Công thức', assistant: 'Trợ lý' };
function currentView(): View {
  return location.pathname === routes.recognition ? 'recognition' : location.pathname === routes.recipes ? 'recipes' : location.pathname === routes.assistant ? 'assistant' : 'upload';
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
  const [recipeDocument, setRecipeDocument] = useState<RecipeDocument | null>(null);
  const [assistantDocument, setAssistantDocument] = useState<RecipeDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<'predict' | 'dishes' | 'search' | 'detail' | null>(null);
  const [llmConfig, setLlmConfig] = useState<LlmUserConfig | null>(loadLlmConfig);
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  const [llmModalInitialMode, setLlmModalInitialMode] = useState<'default' | 'custom' | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const main = useRef<HTMLElement>(null);
  const previousView = useRef(view);

  function openLlmModal(mode?: 'default' | 'custom') {
    setLlmModalInitialMode(mode);
    setLlmModalOpen(true);
  }

  useEffect(() => {
    const pop = () => { cancel(); setError(null); setErrorCode(null); if (currentView() === 'assistant') setAssistantDocument(null); setView(currentView()); };
    window.addEventListener('popstate', pop);
    return () => { window.removeEventListener('popstate', pop); request.current?.abort(); };
  }, []);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);
  useEffect(() => {
    document.title = `CookLens · ${labels[view]}`;
    if (previousView.current !== view) { previousView.current = view; main.current?.focus(); }
  }, [view]);

  function navigate(next: View) {
    if (location.pathname !== routes[next]) history.pushState(null, '', routes[next]);
    setView(next);
  }
  function link(event: MouseEvent<HTMLAnchorElement>, next: View) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); cancel(); setError(null); setErrorCode(null); if (next === 'assistant') setAssistantDocument(null); navigate(next);
  }
  function cancel() { request.current?.abort(); request.current = null; setBusy(null); }
  function resetRecipes() { setConfirmed(null); setRecipes(null); setDetail(null); setRecipeDocument(null); }
  function replaceImage(next: SelectedImage | null) {
    cancel(); imageRef.current = next; setImage(next); setPredictions([]); setChosen(null); resetRecipes(); setError(null); setErrorCode(null);
  }
  function filesChanged(files: FileList | null) {
    if (!files?.length) return;
    if (files.length !== 1) { setError('Vui lòng chọn một ảnh cho mỗi lần nhận diện.'); setErrorCode(null); return; }
    const file = files[0];
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError('Hãy chọn ảnh JPG hoặc PNG.'); setErrorCode(null); return; }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) { setError('Ảnh phải có nội dung và không quá 10 MiB.'); setErrorCode(null); return; }
    replaceImage({ file, url: URL.createObjectURL(file) });
  }
  function invalidImage(file: File, message: string) {
    if (imageRef.current?.file !== file) return;
    replaceImage(null); setError(message); setErrorCode(null);
  }
  async function run(task: NonNullable<typeof busy>, action: (signal: AbortSignal) => Promise<void>) {
    cancel();
    const controller = new AbortController(); request.current = controller; setBusy(task); setError(null); setErrorCode(null);
    try { await action(controller.signal); }
    catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof api.ApiError ? failure.message : 'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
        setErrorCode(failure instanceof api.ApiError ? (failure.code || null) : null);
      }
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
  function choose(dish: Dish | null) { cancel(); setChosen(dish); resetRecipes(); setError(null); setErrorCode(null); }
  async function editDish() {
    if (dishes) return;
    await run('dishes', async signal => { const result = await api.getDishes(signal); if (!signal.aborted) setDishes(result); });
  }
  async function findRecipes(dish: Dish | null = chosen, query = '') {
    if (!dish) return;
    setConfirmed(dish); setRecipes(null); setDetail(null); setRecipeDocument(null); navigate('recipes');
    await run('search', async signal => {
      const result = await api.searchRecipes(dish.normalized_dish, signal, query);
      if (!signal.aborted) setRecipes(result);
    });
  }
  async function openRecipe(recipe: RecipeSummary) {
    if (!confirmed) return;
    setDetail(null); setRecipeDocument(null);
    await run('detail', async signal => {
      const result = await api.getRecipeDocument(recipe.id, confirmed.normalized_dish, signal);
      if (!signal.aborted) { setDetail(result.recipe); setRecipeDocument(result); }
    });
  }
  const visionIssue = errorCode === 'IMAGE_BLURRY' || errorCode === 'LOW_CONFIDENCE_PREDICTION';
  return <IconContext.Provider value={{ weight: 'regular', size: 22 }}>
    <a className="skip-link" href="#main">Đến nội dung chính</a>
    <header className="header"><nav className="navbar" aria-label="Điều hướng chính">
      <a className="logo" href={routes.upload} onClick={event => link(event, 'upload')}><span aria-hidden="true">🍳</span> CookLens</a>
      <div className="nav-links">{(Object.keys(labels) as View[]).map(next => <a key={next} href={routes[next]} aria-current={view === next ? 'page' : undefined} onClick={event => link(event, next)}>{labels[next]}</a>)}</div>
      <div className="navbar-actions">
        <button type="button" className={`llm-nav-btn${llmConfig ? ' is-configured' : ''}`} onClick={() => openLlmModal()} title="Cấu hình API Key LLM">
          <Key size={17} aria-hidden="true" />
          <span>{llmConfig ? `${LLM_PRESETS[llmConfig.provider].shortLabel} · ${llmConfig.model}` : 'Cấu hình LLM'}</span>
        </button>
        <span className="header-note"><BowlFood aria-hidden="true" /> Vị Việt, bếp nhà</span>
      </div>
    </nav></header>
    <main id="main" ref={main} tabIndex={-1}>
      {error && <div className="error-message" role="alert"><p>{error}</p><div className="error-actions">
        {visionIssue && <button type="button" className="secondary-btn" onClick={() => { replaceImage(null); navigate('upload'); }}>Chọn / tải ảnh khác</button>}
        <button className="text-btn" onClick={() => { setError(null); setErrorCode(null); }}>Đóng thông báo</button>
      </div></div>}
      {view === 'upload' && <UploadPage image={image} busy={busy === 'predict'} onFiles={filesChanged} onRemove={() => replaceImage(null)} onPredict={recognize} onInvalid={invalidImage} />}
      {view === 'recognition' && <RecognitionPage image={image} predictions={predictions} chosen={chosen} dishes={dishes} busy={busy === 'dishes'} onChoose={choose} onConfirm={() => findRecipes()} onEdit={editDish} onUpload={() => { cancel(); setError(null); setErrorCode(null); navigate('upload'); }} />}
      {view === 'recipes' && <RecipePage dish={confirmed} recipes={recipes} detail={detail} busy={busy === 'search' ? 'search' : busy === 'detail' ? 'detail' : null} onOpen={openRecipe} onBack={() => { setDetail(null); setRecipeDocument(null); }} onSearch={query => findRecipes(confirmed, query)} onChooseDish={() => { cancel(); setError(null); setErrorCode(null); navigate('recognition'); }} onAssistant={() => { if (recipeDocument) { cancel(); setError(null); setErrorCode(null); setAssistantDocument(recipeDocument); navigate('assistant'); } }} />}
      {view === 'assistant' && <AssistantPage key={assistantDocument ? `${assistantDocument.recipe.id}:${assistantDocument.corpus_version}` : 'restore'} document={assistantDocument} llmConfig={llmConfig} onOpenLlmSettings={openLlmModal} onRecipes={() => { setAssistantDocument(null); navigate('recipes'); }} />}
    </main>
    <footer><div className="footer-inner"><a className="footer-brand" href={routes.upload} onClick={event => link(event, 'upload')}><span aria-hidden="true">🍳</span> CookLens</a><span>© {new Date().getFullYear()} CookLens. Từ ảnh món ăn đến công thức của bạn.</span><a href="#main">Về đầu trang <ArrowRight size={16} aria-hidden="true" /></a></div></footer>
    <LlmSettingsModal
      open={llmModalOpen}
      initialMode={llmModalInitialMode}
      currentConfig={llmConfig}
      onSave={cfg => { saveLlmConfig(cfg); setLlmConfig(cfg); setLlmModalOpen(false); }}
      onClear={() => { clearLlmConfig(); setLlmConfig(null); setLlmModalOpen(false); }}
      onClose={() => setLlmModalOpen(false)}
    />
  </IconContext.Provider>;
}
