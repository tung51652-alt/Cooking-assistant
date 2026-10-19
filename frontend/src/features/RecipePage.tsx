import type { Dish, RecipeDetail, RecipeSource, RecipeSummary } from '../types';

function Source({ source }: { source: RecipeSource }) {
  let url: URL | null = null;
  try { url = new URL(source.url); } catch { /* Render attribution as text when no valid URL exists. */ }
  return <div className="source-info"><span>Nguồn: </span>
    {url && !url.username && !url.password && ['https:', 'http:'].includes(url.protocol)
      ? <a href={url.href} target="_blank" rel="noopener noreferrer">{source.name}</a> : <span>{source.name}</span>}
    <small>{source.license}{source.attribution ? ` · ${source.attribution}` : ''}</small>
  </div>;
}

const minutes = (value: number | null) => value === null ? 'Chưa có thông tin' : `${value} phút`;

interface Props {
  dish: Dish | null;
  recipes: RecipeSummary[] | null;
  detail: RecipeDetail | null;
  busy: 'search' | 'detail' | null;
  onOpen: (recipe: RecipeSummary) => void;
  onBack: () => void;
  onSearch: () => void;
  onChooseDish: () => void;
}

export default function RecipePage({ dish, recipes, detail, busy, onOpen, onBack, onSearch, onChooseDish }: Props) {
  return <section className="section" aria-labelledby="recipe-title">
    <div className="section-title"><h1 id="recipe-title">{detail ? detail.title : 'Công thức'}</h1>
      <p>{dish ? `Công thức cho món ${dish.display_name} bạn đã chọn.` : 'Xác nhận món ăn để tìm công thức liên quan.'}</p></div>
    {!dish ? <div className="empty-state"><h2>Bạn muốn nấu món gì?</h2><p>Chọn món từ kết quả nhận diện trước khi tìm công thức.</p><button className="primary-btn" onClick={onChooseDish}>Chọn món ăn</button></div>
      : <>
        <div className="recipe-toolbar"><span>Món đã xác nhận: <strong>{dish.display_name}</strong></span><button className="text-btn" onClick={onChooseDish}>Đổi món</button></div>
        {busy && <div className="loading-state" role="status">{busy === 'search' ? 'Đang tìm công thức phù hợp…' : 'Đang tải công thức…'}</div>}
        {!busy && detail ? <>
          <button className="text-btn back-link" onClick={onBack}>← Danh sách công thức</button>
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
          {recipes.map(recipe => <article className="recipe-card recipe-list-item" key={recipe.id}><div><h2>{recipe.title}</h2><p>{recipe.preview}</p><Source source={recipe.source} /></div><button className="secondary-btn" onClick={() => onOpen(recipe)} aria-label={`Xem công thức ${recipe.title}`}>Xem công thức</button></article>)}
        </div> : !busy && <div className="empty-state"><h2>{recipes ? 'Chưa có công thức phù hợp' : 'Chưa tải được công thức'}</h2>
          <p>{recipes ? 'Bạn có thể chọn món khác hoặc tìm lại sau.' : 'Hãy thử tìm lại công thức cho món đã xác nhận.'}</p><button className="primary-btn" onClick={onSearch}>Tìm lại công thức</button></div>}
      </>}
  </section>;
}
