import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { IconContext, BowlFood, ArrowRight, Key } from '@phosphor-icons/react';
import type { Dish, Prediction, RecipeSummary, SelectedImage, View } from './types';
import * as api from './lib/api';
import {
  clearLlmConfig,
  LLM_PRESETS,
  loadLlmConfigWithScope,
  saveLlmConfig,
  type StoredLlmConfig,
} from './lib/llmConfig';
import { loadConfirmedDish, saveConfirmedDish, saveRecipeSelection } from './lib/recipeContext';
import UploadPage from './features/UploadPage';
import RecognitionPage from './features/RecognitionPage';
import DishCatalogPicker from './features/DishCatalogPicker';
import RecipeConversation from './features/RecipeConversation';
import LlmSettingsModal from './features/LlmSettingsModal';

const routes: Record<View, string> = {
  upload: '/index.html',
  recognition: '/recognition.html',
  recipes: '/recipe.html',
  assistant: '/assistant.html',
};
const labels: Record<View, string> = {
  upload: 'Trang chủ',
  recognition: 'Nhận diện',
  recipes: 'Chọn món',
  assistant: 'Trợ lý',
};
function currentView(): View {
  return location.pathname === routes.recognition
    ? 'recognition'
    : location.pathname === routes.recipes
      ? 'recipes'
      : location.pathname === routes.assistant
        ? 'assistant'
        : 'upload';
}

export default function App() {
  const [view, setView] = useState<View>(currentView);
  const [image, setImage] = useState<SelectedImage | null>(null);
  const imageRef = useRef<SelectedImage | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [confirmed, setConfirmed] = useState<Dish | null>(loadConfirmedDish);
  const [chosen, setChosen] = useState<Dish | null>(confirmed);
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<'predict' | 'dishes' | 'search' | null>(null);
  const [llmState, setLlmState] = useState<StoredLlmConfig | null>(loadLlmConfigWithScope);
  const llmConfig = llmState?.config ?? null;
  const llmStorageScope = llmState?.scope ?? 'session';
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  const [llmModalInitialMode, setLlmModalInitialMode] = useState<'default' | 'custom' | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const main = useRef<HTMLElement>(null);
  const conversation = view === 'assistant';
  const previousView = useRef(view);

  function openLlmModal(mode?: 'default' | 'custom') {
    setLlmModalInitialMode(mode);
    setLlmModalOpen(true);
  }

  useEffect(() => {
    const pop = () => {
      cancel();
      setError(null);
      setErrorCode(null);
      setView(currentView());
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      request.current?.abort();
    };
  }, []);
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  useLayoutEffect(() => {
    document.title = `CookLens · ${labels[view]}`;
    if (previousView.current !== view) {
      previousView.current = view;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      main.current?.focus({ preventScroll: true });
    }
  }, [view]);
  useEffect(() => {
    saveConfirmedDish(confirmed);
  }, [confirmed]);
  useEffect(() => {
    if (view === 'recipes' && !dishes && !busy) void editDish();
    if (view === 'assistant' && confirmed && recipes === null && !busy) void searchRecipes(confirmed);
  }, [view, confirmed]);

  function navigate(next: View) {
    if (location.pathname !== routes[next]) history.pushState(null, '', routes[next]);
    setView(next);
  }
  function link(event: MouseEvent<HTMLAnchorElement>, next: View) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (view === next) return;
    cancel();
    setError(null);
    setErrorCode(null);
    navigate(next);
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setBusy(null);
  }
  function resetRecipes() {
    setConfirmed(null);
    setRecipes(null);
    saveRecipeSelection();
  }
  function replaceImage(next: SelectedImage | null) {
    cancel();
    imageRef.current = next;
    setImage(next);
    setPredictions([]);
    setChosen(null);
    resetRecipes();
    setError(null);
    setErrorCode(null);
  }
  function filesChanged(files: FileList | null) {
    if (!files?.length) return;
    if (files.length !== 1) {
      setError('Vui lòng chọn một ảnh cho mỗi lần nhận diện.');
      setErrorCode(null);
      return;
    }
    const file = files[0];
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Hãy chọn ảnh JPG hoặc PNG.');
      setErrorCode(null);
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError('Ảnh phải có nội dung và không quá 10 MiB.');
      setErrorCode(null);
      return;
    }
    replaceImage({ file, url: URL.createObjectURL(file) });
  }
  function invalidImage(file: File, message: string) {
    if (imageRef.current?.file !== file) return;
    replaceImage(null);
    setError(message);
    setErrorCode(null);
  }
  async function run(task: NonNullable<typeof busy>, action: (signal: AbortSignal) => Promise<void>) {
    cancel();
    const controller = new AbortController();
    request.current = controller;
    setBusy(task);
    setError(null);
    setErrorCode(null);
    try {
      await action(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof api.ApiError ? failure.message : 'Chưa xử lý được yêu cầu. Vui lòng thử lại.');
        setErrorCode(failure instanceof api.ApiError ? failure.code || null : null);
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(null);
      }
    }
  }
  async function recognize() {
    if (!image) return;
    setPredictions([]);
    setChosen(null);
    resetRecipes();
    await run('predict', async (signal) => {
      const result = await api.predict(image.file, signal);
      if (!signal.aborted) {
        setPredictions(result);
        navigate('recognition');
      }
    });
  }
  function choose(dish: Dish | null) {
    cancel();
    setChosen(dish);
    setError(null);
    setErrorCode(null);
  }
  async function editDish() {
    if (dishes) return;
    await run('dishes', async (signal) => {
      const result = await api.getDishes(signal);
      if (!signal.aborted) setDishes(result);
    });
  }
  function openDishCatalog() {
    if (view === 'recipes') return;
    cancel();
    setError(null);
    setErrorCode(null);
    navigate('recipes');
  }
  function searchRecipes(dish: Dish, query = '') {
    return run('search', async (signal) => {
      const result = await api.searchRecipes(dish.normalized_dish, signal, query);
      if (!signal.aborted) setRecipes(result);
    });
  }
  function confirmDish(dish: Dish | null = chosen, fromPhoto = true) {
    if (!dish) return;
    if (dish.normalized_dish !== confirmed?.normalized_dish) setRecipes(null);
    if (!fromPhoto) {
      imageRef.current = null;
      setImage(null);
      setPredictions([]);
    }
    setConfirmed(dish);
    setChosen(dish);
    navigate('assistant');
    void searchRecipes(dish);
  }
  function goToUpload() {
    cancel();
    setError(null);
    setErrorCode(null);
    navigate('upload');
  }
  const visionIssue = errorCode === 'IMAGE_BLURRY' || errorCode === 'LOW_CONFIDENCE_PREDICTION';
  return (
    <IconContext.Provider value={{ weight: 'regular', size: 22 }}>
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      <header className="header">
        <nav className="navbar" aria-label="Điều hướng chính">
          <a className="logo" href={routes.upload} onClick={(event) => link(event, 'upload')}>
            <span aria-hidden="true">🍳</span> CookLens
          </a>
          <div className="nav-links">
            {(['upload', 'recipes', 'assistant'] as const).map((next) => (
              <a
                key={next}
                href={routes[next]}
                aria-current={view === next ? 'page' : undefined}
                onClick={(event) => link(event, next)}
              >
                {labels[next]}
              </a>
            ))}
          </div>
          <div className="navbar-actions">
            <button
              type="button"
              className={`llm-nav-btn${llmConfig ? ' is-configured' : ''}`}
              onClick={() => openLlmModal()}
              title="Cài đặt trợ lý"
            >
              <Key size={17} aria-hidden="true" />
              <span>
                {llmConfig ? `${LLM_PRESETS[llmConfig.provider].shortLabel} · ${llmConfig.model}` : 'Cài đặt trợ lý'}
              </span>
            </button>
            <span className="header-note">
              <BowlFood aria-hidden="true" /> Vị Việt, bếp nhà
            </span>
          </div>
        </nav>
      </header>
      <main id="main" className={conversation ? 'conversation-main' : undefined} ref={main} tabIndex={-1}>
        {error && view !== 'upload' && !conversation && (
          <div className="error-message" role="alert">
            <p>{error}</p>
            <div className="error-actions">
              {visionIssue && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    replaceImage(null);
                    navigate('upload');
                  }}
                >
                  Chọn / tải ảnh khác
                </button>
              )}
              <button
                className="text-btn"
                onClick={() => {
                  setError(null);
                  setErrorCode(null);
                }}
              >
                Đóng thông báo
              </button>
            </div>
          </div>
        )}
        {view === 'upload' && (
          <UploadPage
            image={image}
            busy={busy === 'predict'}
            error={error}
            visionIssue={visionIssue}
            onFiles={filesChanged}
            onRemove={() => replaceImage(null)}
            onPredict={recognize}
            onInvalid={invalidImage}
            onDismissError={() => {
              setError(null);
              setErrorCode(null);
            }}
            onOpenCatalog={openDishCatalog}
          />
        )}
        {view === 'recognition' && (
          <RecognitionPage
            image={image}
            predictions={predictions}
            chosen={chosen}
            dishes={dishes}
            busy={busy === 'dishes'}
            onChoose={choose}
            onConfirm={() => confirmDish()}
            onConfirmDish={(dish) => confirmDish(dish, !!image)}
            onEdit={editDish}
            onUpload={goToUpload}
          />
        )}
        {view === 'recipes' && (
          <section className="section" aria-labelledby="catalog-title">
            <h1 id="catalog-title">Chọn món</h1>
            <DishCatalogPicker
              dishes={dishes}
              busy={busy === 'dishes'}
              initialDish={confirmed}
              onConfirm={(dish) => confirmDish(dish, false)}
              onRetry={editDish}
              onUpload={goToUpload}
            />
          </section>
        )}
        {conversation && (
          <RecipeConversation
            key={confirmed?.normalized_dish ?? 'resume'}
            dish={confirmed}
            image={image}
            recipes={recipes}
            searching={busy === 'search'}
            searchError={error}
            llmConfig={llmConfig}
            onSearch={(query) => {
              if (confirmed) void searchRecipes(confirmed, query);
            }}
            onLlmSettings={openLlmModal}
            onChangeDish={
              image && predictions.length
                ? () => {
                    cancel();
                    setError(null);
                    setErrorCode(null);
                    navigate('recognition');
                  }
                : openDishCatalog
            }
            onNewPhoto={() => {
              replaceImage(null);
              navigate('upload');
            }}
          />
        )}
      </main>
      <footer>
        <div className="footer-inner">
          <a className="footer-brand" href={routes.upload} onClick={(event) => link(event, 'upload')}>
            <span aria-hidden="true">🍳</span> CookLens
          </a>
          <span>© {new Date().getFullYear()} CookLens. Từ ảnh món ăn đến công thức của bạn.</span>
          <a href="#main">
            Về đầu trang <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </footer>
      <LlmSettingsModal
        open={llmModalOpen}
        initialMode={llmModalInitialMode}
        currentConfig={llmConfig}
        currentStorageScope={llmStorageScope}
        onSave={(cfg, scope) => {
          saveLlmConfig(cfg, scope);
          setLlmState({ config: cfg, scope });
          setLlmModalOpen(false);
        }}
        onClear={() => {
          clearLlmConfig();
          setLlmState(null);
          setLlmModalOpen(false);
        }}
        onClose={() => setLlmModalOpen(false)}
      />
    </IconContext.Provider>
  );
}
