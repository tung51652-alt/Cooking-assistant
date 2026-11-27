import { useState, useEffect } from 'react';
import { Clock, Users, MagnifyingGlass } from '@phosphor-icons/react';
import { recipeSourceHref } from '../../../packages/cooklens-api';
import type { Dish, RecipeDetail, RecipeSource, RecipeSummary } from '../types';
import DishCatalogPicker from './DishCatalogPicker';

export function Source({ source }: { source: RecipeSource }) {
  const href = recipeSourceHref(source.url);
  return <div className="source-info"><span>Nguồn: </span>
    {href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.name}</a> : <span>{source.name}</span>}
    <small>{source.license}</small>
    <details><summary>Ghi nguồn &amp; ghi chú công thức</summary><p>{source.attribution}</p><p>{source.modifications}</p></details>
  </div>;
}

const minutes = (value: number | null) => value === null ? 'Chưa có thông tin' : `${value} phút`;

interface Props {
  dish: Dish | null;
  dishes: Dish[] | null;
  catalogOpen: boolean;
  dishesBusy: boolean;
  recipes: RecipeSummary[] | null;
  detail: RecipeDetail | null;
  busy: 'search' | 'detail' | null;
  onOpen: (recipe: RecipeSummary) => void;
  onBack: () => void;
  onSearch: (query?: string) => void;
  onOpenCatalog: () => void;
  onCloseCatalog: () => void;
  onLoadDishes: () => void;
  onConfirmDish: (dish: Dish) => void;
  onUpload: () => void;
  onAssistant: () => void;
}

export default function RecipePage({
  dish,
  dishes,
  catalogOpen,
  dishesBusy,
  recipes,
  detail,
  busy,
  onOpen,
  onBack,
  onSearch,
  onOpenCatalog,
  onCloseCatalog,
  onLoadDishes,
  onConfirmDish,
  onUpload,
  onAssistant,
}: Props) {
  const [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [dish?.normalized_dish]);
  return <section className="section" aria-labelledby="recipe-title">
    <div className="section-title"><h1 id="recipe-title">{detail ? detail.title : 'Công thức'}</h1>
      <p>{dish ? `Công thức cho món ${dish.display_name} bạn đã chọn.` : 'Chọn món ăn trong danh mục 30 món Việt hoặc nhận diện từ ảnh để tìm công thức.'}</p></div>
    {!dish ? (catalogOpen ? <DishCatalogPicker
      dishes={dishes}
      busy={dishesBusy}
      onConfirm={onConfirmDish}
      onRetry={onLoadDishes}
      onClose={onCloseCatalog}
      onUpload={onUpload}
    /> : <div className="empty-state"><h2>Bạn muốn nấu món gì?</h2><p>Chọn món trực tiếp từ danh mục 30 món Việt hoặc tải ảnh món ăn để CookLens nhận diện.</p><div className="empty-state-actions"><button type="button" className="primary-btn" onClick={onOpenCatalog}>Chọn món ăn</button><button type="button" className="secondary-btn" onClick={onUpload}>Tải ảnh món ăn</button></div></div>)
      : <>
        <div className="recipe-toolbar"><span>Món đã xác nhận: <strong>{dish.display_name}</strong></span><button type="button" className="text-btn" onClick={catalogOpen ? onCloseCatalog : onOpenCatalog}>{catalogOpen ? 'Đóng danh mục' : 'Đổi món'}</button></div>
        {catalogOpen && <DishCatalogPicker
          dishes={dishes}
          busy={dishesBusy}
          initialDish={dish}
          onConfirm={onConfirmDish}
          onRetry={onLoadDishes}
          onClose={onCloseCatalog}
        />}
        {!detail && <form className="recipe-query" onSubmit={event => { event.preventDefault(); onSearch(query); }}>
          <label htmlFor="recipeQuery">Ưu tiên nguyên liệu hoặc cách nấu (không bắt buộc)
            <input id="recipeQuery" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} placeholder="Ví dụ: thịt bò, ninh xương…" /></label>
          <button className="secondary-btn" disabled={!!busy}><MagnifyingGlass size={18} aria-hidden="true" /> Tìm công thức</button>
        </form>}
        {busy && <div className="loading-state" role="status">{busy === 'search' ? 'Đang tìm công thức phù hợp…' : 'Đang tải công thức…'}</div>}
        {!busy && detail ? <>
          <button className="text-btn back-link" onClick={onBack}>← Danh sách công thức</button>
          <div className="assistant-entry"><div><h2>Cùng CookLens vào bếp</h2><p>Hỏi về công thức và theo dõi từng bước nấu.</p></div><button className="primary-btn" onClick={onAssistant}>Hỏi CookLens &amp; bắt đầu nấu</button></div>
          <div className="recipe-info-grid">
            <div className="recipe-card"><h2>Nguyên liệu</h2><ul id="ingredients" className="ingredients">
              {detail.ingredients.map((item, index) => <li key={index}><span>{item.name}{item.note && <small>{item.note}</small>}</span><strong>{item.quantity === null ? 'Chưa có định lượng' : `${new Intl.NumberFormat('vi-VN').format(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`}</strong></li>)}
            </ul></div>
            <div className="recipe-card"><h2>Thông tin</h2><dl id="recipeInfo" className="recipe-facts">
              <div><dt>Khẩu phần</dt><dd>{detail.servings === null ? 'Chưa có thông tin' : `${detail.servings} người`}</dd></div>
              <div><dt>Chuẩn bị</dt><dd>{minutes(detail.prep_time_minutes)}</dd></div>
              <div><dt>Nấu</dt><dd>{minutes(detail.cook_time_minutes)}</dd></div>
            </dl><Source source={detail.source} /></div>
          </div>
          <div className="steps-card"><h2>Các bước thực hiện</h2><ol id="recipeSteps" className="steps-content">
            {detail.instructions.map(item => <li key={item.step}><p>{item.text}</p>{item.duration_minutes !== null && <small>{minutes(item.duration_minutes)}</small>}</li>)}
          </ol></div>
        </> : !busy && recipes && recipes.length > 0 ? <div className="recipe-list">
          {recipes.map(recipe => <article className="recipe-card recipe-list-item" key={recipe.id}><div><h2>{recipe.title}</h2><p>{recipe.preview}</p><div className="recipe-meta">
            {recipe.servings !== null && <span><Users size={16} aria-hidden="true" /> {recipe.servings} người</span>}
            {recipe.cook_time_minutes !== null && <span><Clock size={16} aria-hidden="true" /> {recipe.cook_time_minutes} phút nấu</span>}
            {recipe.prep_time_minutes !== null && <span>{recipe.prep_time_minutes} phút chuẩn bị</span>}
          </div><Source source={recipe.source} /></div><button className="secondary-btn" onClick={() => onOpen(recipe)} aria-label={`Xem công thức ${recipe.title}`}>Xem công thức</button></article>)}
        </div> : !busy && <div className="empty-state"><h2>{recipes ? 'Chưa có công thức phù hợp' : 'Chưa tải được công thức'}</h2>
          <p>{recipes ? 'Bạn có thể chọn món khác hoặc tìm lại sau.' : 'Hãy thử tìm lại công thức cho món đã xác nhận.'}</p><button className="primary-btn" onClick={() => onSearch(query)}>Tìm lại công thức</button></div>}
      </>}
  </section>;
}
