import { recipeSourceHref } from '../../../packages/cooklens-api';
import type { RecipeDetail, RecipeSource } from '../types';

export function Source({ source }: { source: RecipeSource }) {
  const href = recipeSourceHref(source.url);
  return (
    <div className="source-info">
      <span>Nguồn: </span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {source.name}
        </a>
      ) : (
        <span>{source.name}</span>
      )}
      <small>{source.license}</small>
      <details>
        <summary>Ghi nguồn &amp; ghi chú công thức</summary>
        <p>{source.attribution}</p>
        <p>{source.modifications}</p>
      </details>
    </div>
  );
}

const minutes = (value: number | null) => (value === null ? 'Chưa có thông tin' : `${value} phút`);

export function RecipeContent({ detail }: { detail: RecipeDetail }) {
  return (
    <>
      <div className="recipe-info-grid">
        <div className="recipe-card">
          <h2>Nguyên liệu</h2>
          <ul id="ingredients" className="ingredients">
            {detail.ingredients.map((item, index) => (
              <li key={index}>
                <span>
                  {item.name}
                  {item.note && <small>{item.note}</small>}
                </span>
                <strong>
                  {item.quantity === null
                    ? 'Chưa có định lượng'
                    : `${new Intl.NumberFormat('vi-VN').format(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`}
                </strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="recipe-card">
          <h2>Thông tin</h2>
          <dl id="recipeInfo" className="recipe-facts">
            <div>
              <dt>Khẩu phần</dt>
              <dd>{detail.servings === null ? 'Chưa có thông tin' : `${detail.servings} người`}</dd>
            </div>
            <div>
              <dt>Chuẩn bị</dt>
              <dd>{minutes(detail.prep_time_minutes)}</dd>
            </div>
            <div>
              <dt>Nấu</dt>
              <dd>{minutes(detail.cook_time_minutes)}</dd>
            </div>
          </dl>
          <Source source={detail.source} />
        </div>
      </div>
      <div className="steps-card">
        <h2>Các bước thực hiện</h2>
        <ol id="recipeSteps" className="steps-content">
          {detail.instructions.map((item) => (
            <li key={item.step}>
              <p>{item.text}</p>
              {item.duration_minutes !== null && <small>{minutes(item.duration_minutes)}</small>}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
