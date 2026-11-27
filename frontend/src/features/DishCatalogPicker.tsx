import { useRef, useState } from 'react';
import { CheckSquare, MagnifyingGlass, X } from '@phosphor-icons/react';
import type { Dish } from '../types';

export function normalizeVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

interface Props {
  dishes: Dish[] | null;
  busy: boolean;
  initialDish?: Dish | null;
  title?: string;
  description?: string;
  onConfirm: (dish: Dish) => void;
  onRetry: () => void;
  onClose?: () => void;
  onUpload?: () => void;
}

export default function DishCatalogPicker({
  dishes,
  busy,
  initialDish = null,
  title = 'Chọn món trong danh mục 30 món Việt',
  description = 'Tìm nhanh theo tên món (có dấu hoặc không dấu), chọn món bạn muốn nấu và xác nhận để xem công thức.',
  onConfirm,
  onRetry,
  onClose,
  onUpload,
}: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Dish | null>(initialDish);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = normalizeVietnamese(query);
  const filtered = (dishes ?? []).filter((dish) => {
    if (!normalizedQuery) return true;
    const normalizedName = normalizeVietnamese(dish.display_name);
    const normalizedSlug = dish.normalized_dish.replace(/_/g, ' ');
    return normalizedName.includes(normalizedQuery) || normalizedSlug.includes(normalizedQuery);
  });

  function clearFilter() {
    setQuery('');
    searchInputRef.current?.focus();
  }

  return (
    <div className="dish-catalog" aria-labelledby="dish-catalog-title">
      <div className="dish-catalog-header">
        <div>
          <h2 id="dish-catalog-title">{title}</h2>
          <p>{description}</p>
        </div>
        {onClose && (
          <button type="button" className="text-btn" onClick={onClose}>
            Đóng danh mục
          </button>
        )}
      </div>

      {busy ? (
        <div className="loading-state" role="status">
          Đang tải danh mục món ăn…
        </div>
      ) : !dishes ? (
        <div className="dish-catalog-empty">
          <p>Chưa tải được danh mục món ăn. Bạn có thể thử tải lại.</p>
          <button type="button" className="secondary-btn" onClick={onRetry}>
            Thử tải lại danh mục
          </button>
        </div>
      ) : dishes.length === 0 ? (
        <div className="dish-catalog-empty">
          <p>Danh mục hiện chưa có món ăn nào.</p>
          <button type="button" className="secondary-btn" onClick={onRetry}>
            Thử tải lại danh mục
          </button>
        </div>
      ) : (
        <>
          <div className="dish-catalog-search">
            <label htmlFor="dishCatalogSearch">Tìm món ăn theo tên</label>
            <div className="dish-catalog-input-wrap">
              <MagnifyingGlass size={18} aria-hidden="true" />
              <input
                ref={searchInputRef}
                id="dishCatalogSearch"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ví dụ: pho, Phở, bun dau, bánh xèo…"
                maxLength={100}
              />
              {query && (
                <button
                  type="button"
                  className="dish-catalog-clear-btn"
                  aria-label="Xóa từ khóa tìm kiếm"
                  onClick={clearFilter}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="dish-catalog-count" aria-live="polite">
              {normalizedQuery
                ? `Tìm thấy ${filtered.length} / ${dishes.length} món phù hợp.`
                : `Danh mục gồm ${dishes.length} món Việt được hỗ trợ.`}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="dish-catalog-empty" role="status">
              <p>Không tìm thấy món ăn nào khớp với “{query.trim()}”.</p>
              <button type="button" className="secondary-btn" onClick={clearFilter}>
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div className="dish-catalog-grid" role="group" aria-label="Danh mục 30 món Việt">
              {filtered.map((dish) => {
                const active = selected?.normalized_dish === dish.normalized_dish;
                return (
                  <button
                    key={dish.class_id}
                    type="button"
                    className={`dish-catalog-item${active ? ' is-selected' : ''}`}
                    aria-pressed={active}
                    onClick={() => setSelected(dish)}
                  >
                    <span>{dish.display_name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="dish-catalog-footer">
            <div className="dish-catalog-selection">
              {selected ? (
                <span>
                  Món đã chọn: <strong>{selected.display_name}</strong>
                </span>
              ) : (
                <span className="muted">Chọn một món trong danh sách để xem công thức.</span>
              )}
              {onUpload && (
                <button type="button" className="text-btn" onClick={onUpload}>
                  Hoặc tải ảnh để nhận diện
                </button>
              )}
            </div>
            <button
              type="button"
              className="primary-btn"
              disabled={!selected}
              onClick={() => {
                if (selected) onConfirm(selected);
              }}
            >
              <CheckSquare size={19} aria-hidden="true" /> Xác nhận món
            </button>
          </div>
        </>
      )}
    </div>
  );
}
