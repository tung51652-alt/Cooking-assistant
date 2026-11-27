import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, CaretRight, ImageSquare, Sparkle, X } from '@phosphor-icons/react';
import type { Dish, LlmUserConfig, RecipeDocument, RecipeSummary, SelectedImage } from '../types';
import { getRecipeDocument } from '../lib/api';
import AssistantPage from './AssistantPage';
import { RecipeContent, Source } from './RecipeContent';
import { loadRecipeSelection, saveRecipeSelection } from '../lib/recipeContext';

type Props = {
  dish: Dish | null;
  image: SelectedImage | null;
  recipes: RecipeSummary[] | null;
  searching: boolean;
  searchError: string | null;
  llmConfig: LlmUserConfig | null;
  onSearch: (query: string) => void;
  onLlmSettings: (mode?: 'default' | 'custom') => void;
  onChangeDish: () => void;
  onNewPhoto: () => void;
};

function useRecipe(id: string | undefined, dish: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: string; value?: RecipeDocument; error?: string }>();
  useEffect(() => {
    if (!id) return;
    const request = new AbortController();
    setResult(undefined);
    void getRecipeDocument(id, dish, request.signal).then(
      (value) => {
        if (!request.signal.aborted) setResult({ id, value });
      },
      (error) => {
        if (!request.signal.aborted)
          setResult({ id, error: error instanceof Error ? error.message : 'Chưa tải được công thức.' });
      },
    );
    return () => request.abort();
  }, [id, dish, attempt]);
  return { result: result?.id === id ? result : undefined, retry: () => setAttempt((value) => value + 1) };
}

export default function RecipeConversation(props: Props) {
  const { dish, llmConfig, onLlmSettings, onChangeDish, onNewPhoto } = props;
  return (
    <section className="recipe-conversation" aria-labelledby="recipe-chat-heading">
      <header className="recipe-chat-header">
        <div>
          {dish && (
            <button className="text-btn" onClick={onChangeDish}>
              <ArrowLeft size={16} aria-hidden="true" /> Đổi món
            </button>
          )}
          <h1 id="recipe-chat-heading">Trợ lý nấu ăn</h1>
        </div>
        <button className="secondary-btn" onClick={onNewPhoto}>
          <ImageSquare size={19} aria-hidden="true" /> Ảnh mới
        </button>
      </header>
      {dish ? (
        <DishConversation {...props} dish={dish} />
      ) : (
        <AssistantPage
          document={null}
          llmConfig={llmConfig}
          onOpenLlmSettings={onLlmSettings}
          onRecipes={onChangeDish}
        />
      )}
    </section>
  );
}

function DishConversation({
  dish,
  image,
  recipes,
  searching,
  searchError,
  llmConfig,
  onSearch,
  onLlmSettings,
  onChangeDish,
}: Props & { dish: Dish }) {
  const [selected, setSelected] = useState<RecipeDocument | null>(null);
  const [savedRecipeId, setSavedRecipeId] = useState(() => loadRecipeSelection(dish.normalized_dish));
  const [previewId, setPreviewId] = useState<string>();
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const legacyRecipeId = history.state?.recipeId;
  const autoId =
    savedRecipeId ??
    recipes?.find((recipe) => recipe.id === legacyRecipeId)?.id ??
    (recipes?.length === 1 ? recipes[0].id : undefined);
  const single = useRecipe(selected ? undefined : autoId, dish.normalized_dish);
  const active = selected ?? single.result?.value;
  useEffect(() => {
    const value = single.result?.value;
    if (value) {
      setSelected(value);
      saveRecipeSelection(dish.normalized_dish, value.recipe.id);
    }
  }, [dish.normalized_dish, single.result?.value]);
  const previewUsesActive = previewId === (active?.recipe.id ?? autoId);
  const preview = useRecipe(previewUsesActive ? undefined : previewId, dish.normalized_dish);
  const shown = previewUsesActive ? active : preview.result?.value;
  const previewError = previewUsesActive ? single.result?.error : preview.result?.error;
  const inspectedTitle = recipes?.find((recipe) => recipe.id === previewId)?.title ?? shown?.recipe.title;

  function open(id: string) {
    setPreviewId(id);
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }

  function choose(document: RecipeDocument) {
    setSelected(document);
    setSavedRecipeId(document.recipe.id);
    saveRecipeSelection(dish.normalized_dish, document.recipe.id);
    dialog.current?.close();
  }

  return (
    <>
      <div className="recipe-chat-layout">
        <div className="recipe-chat-thread">
          <div className="recipe-chat-sent" aria-label={`Món đã xác nhận: ${dish.display_name}`}>
            {image && <img src={image.url} alt="Ảnh món ăn đã gửi" />}
            <div>
              <strong>{dish.display_name}</strong>
              <small>Món đã xác nhận</small>
            </div>
          </div>
          <div className="recipe-chat-intro">
            <div className="recipe-chat-mark">
              <Sparkle weight="fill" aria-hidden="true" />
            </div>
            <div className="recipe-chat-results">
              <p className="recipe-chat-name">CookLens</p>
              <h2>
                {searching
                  ? 'Đang tìm công thức…'
                  : recipes?.length === 1
                    ? 'Mình tìm được công thức.'
                    : recipes?.length
                      ? `Mình tìm được ${recipes.length} công thức.`
                      : recipes
                        ? 'Chưa có công thức phù hợp'
                        : 'Chưa tải được công thức'}
              </h2>
              {searchError && (
                <p role="alert" className="recipe-chat-error">
                  {searchError}
                </p>
              )}
              {searching ? (
                <p role="status">Đang tìm công thức theo món bạn đã chọn.</p>
              ) : recipes?.length ? (
                <p>Bạn có thể xem cách làm hoặc hỏi về một công thức ngay tại đây.</p>
              ) : (
                <button className="secondary-btn" onClick={() => onSearch(query)}>
                  Tìm lại công thức
                </button>
              )}
              {recipes && !searching && (
                <div className="recipe-chat-cards">
                  {recipes.map((recipe) => (
                    <article className="recipe-chat-card" key={recipe.id}>
                      <button
                        type="button"
                        className="recipe-chat-card-button"
                        onClick={() => open(recipe.id)}
                        aria-label={`Xem công thức ${recipe.title}`}
                      >
                        <span className="recipe-chat-mark">
                          <BookOpen aria-hidden="true" />
                        </span>
                        <span>
                          <strong>{recipe.title}</strong>
                          <small>
                            {recipe.source.name} · <span className="recipe-chat-license">{recipe.source.license}</span>
                            {active?.recipe.id === recipe.id ? ' · Đang dùng để hỏi' : ''}
                          </small>
                        </span>
                        <span className="recipe-chat-card-action">
                          <span>Xem công thức</span>
                          <CaretRight size={16} aria-hidden="true" />
                        </span>
                      </button>
                    </article>
                  ))}
                </div>
              )}
              <details className="recipe-chat-filter">
                <summary>Ưu tiên nguyên liệu hoặc cách nấu</summary>
                <form
                  className="recipe-query"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSearch(query);
                  }}
                >
                  <label>
                    Ưu tiên nguyên liệu hoặc cách nấu (không bắt buộc)
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      maxLength={200}
                      placeholder="Ví dụ: thịt bò, ninh xương…"
                    />
                  </label>
                  <button className="secondary-btn" disabled={searching}>
                    Tìm công thức
                  </button>
                </form>
              </details>
            </div>
          </div>
          {single.result?.error && (
            <div className="error-message" role="alert">
              <p>{single.result.error}</p>
              <button className="secondary-btn" onClick={single.retry}>
                Thử tải lại công thức
              </button>
            </div>
          )}
          {active && !recipes?.some((recipe) => recipe.id === active.recipe.id) && (
            <button className="text-btn" onClick={() => open(active.recipe.id)}>
              Xem công thức {active.recipe.title}
            </button>
          )}
          {active ? (
            <AssistantPage
              key={`${active.recipe.id}:${active.corpus_version}:${active.recipe.updated_at}`}
              document={active}
              llmConfig={llmConfig}
              onOpenLlmSettings={onLlmSettings}
              onRecipes={onChangeDish}
            />
          ) : (
            !!recipes?.length && (
              <p className="recipe-chat-selection" role="status">
                {autoId && !single.result?.error
                  ? 'Đang tải công thức để mở ô hỏi…'
                  : 'Mở một công thức và chọn “Chọn công thức này” để bắt đầu.'}
              </p>
            )
          )}
        </div>
        <aside className="recipe-chat-context" aria-label="Món ăn đang xem">
          {image && <img src={image.url} alt="Ảnh món ăn đã xác nhận" />}
          <p className="recipe-chat-name">Món đã xác nhận</p>
          <h2>{dish.display_name}</h2>
          {active && (
            <>
              <h3>Nguyên liệu chính</h3>
              <ul>
                {active.recipe.ingredients.slice(0, 5).map((item, index) => (
                  <li key={index}>{item.name}</li>
                ))}
              </ul>
              <Source source={active.recipe.source} />
            </>
          )}
        </aside>
      </div>
      <dialog
        ref={dialog}
        className="recipe-chat-dialog"
        aria-labelledby="chat-recipe-title"
        onClose={() => setPreviewId(undefined)}
      >
        <div className="recipe-chat-dialog-heading">
          <h2 id="chat-recipe-title">{inspectedTitle ?? 'Chi tiết công thức'}</h2>
          <button className="modal-close-btn" onClick={() => dialog.current?.close()} aria-label="Đóng công thức">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="recipe-chat-dialog-body">
          {shown ? (
            <>
              {active?.recipe.id !== shown.recipe.id && (
                <button className="primary-btn" onClick={() => choose(shown)}>
                  Chọn công thức này
                </button>
              )}
              <RecipeContent detail={shown.recipe} />
            </>
          ) : previewError ? (
            <div role="alert">
              <p>{previewError}</p>
              <button className="secondary-btn" onClick={previewUsesActive ? single.retry : preview.retry}>
                Thử lại
              </button>
            </div>
          ) : (
            <p role="status">Đang tải công thức…</p>
          )}
        </div>
      </dialog>
    </>
  );
}
