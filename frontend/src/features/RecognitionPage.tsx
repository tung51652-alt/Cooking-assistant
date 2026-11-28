import { useEffect, useState } from 'react';
import { CheckSquare, PencilSimple, WarningCircle } from '@phosphor-icons/react';
import type { Dish, Prediction, SelectedImage } from '../types';
import { MIN_VISION_CONFIDENCE } from '../../../packages/cooklens-api';
import DishCatalogPicker from './DishCatalogPicker';

interface Props {
  image: SelectedImage | null;
  predictions: Prediction[];
  chosen: Dish | null;
  dishes: Dish[] | null;
  busy: boolean;
  onChoose: (dish: Dish | null) => void;
  onConfirm: () => void;
  onConfirmDish: (dish: Dish) => void;
  onEdit: () => void;
  onUpload: () => void;
}

export default function RecognitionPage({
  image,
  predictions,
  chosen,
  dishes,
  busy,
  onChoose,
  onConfirm,
  onConfirmDish,
  onEdit,
  onUpload,
}: Props) {
  const lowConfidence = predictions.length > 0 && predictions[0].confidence < MIN_VISION_CONFIDENCE;
  const formatConfidence = (value: number) =>
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value * 100);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const predictionKey = predictions.map((item) => `${item.class_id}:${item.confidence}`).join(',');

  useEffect(() => {
    setCatalogOpen(false);
  }, [predictionKey]);

  function openManualCatalog() {
    setCatalogOpen(true);
    onEdit();
  }

  function candidate(prediction: Prediction) {
    return (
      <label
        className={`prediction-choice${chosen?.class_id === prediction.class_id ? ' is-selected' : ''}`}
        key={prediction.class_id}
      >
        <input
          type="radio"
          name="dish"
          checked={chosen?.class_id === prediction.class_id}
          onChange={() => onChoose(prediction)}
        />
        <span className="candidate-copy">
          <span className="rank">Khả năng {prediction.rank}</span>
          <strong>{prediction.display_name}</strong>
        </span>
        <span className="confidence">{formatConfidence(prediction.confidence)}%</span>
      </label>
    );
  }
  return (
    <section className="section" aria-labelledby="recognition-title">
      <div className="section-title">
        <h1 id="recognition-title">Kết quả nhận diện</h1>
        <p>
          {lowConfidence
            ? 'CookLens chưa đủ tự tin để gợi ý món từ ảnh này.'
            : 'Ba gợi ý từ ảnh của bạn. Hãy chọn món đúng để tìm công thức.'}
        </p>
      </div>
      {predictions.length === 0 ? (
        <>
          <div className="empty-state">
            <h2>Chưa có kết quả nhận diện</h2>
            <p>Hãy tải ảnh và nhấn “Nhận diện món”, hoặc chọn món trực tiếp từ danh mục 30 món Việt.</p>
            <div className="empty-state-actions">
              <button type="button" className="primary-btn" onClick={onUpload}>
                Tải ảnh món ăn
              </button>
              <button type="button" className="secondary-btn" onClick={openManualCatalog}>
                Chọn món từ danh mục
              </button>
            </div>
          </div>
          {catalogOpen && (
            <DishCatalogPicker
              dishes={dishes}
              busy={busy}
              onConfirm={onConfirmDish}
              onRetry={onEdit}
              onClose={() => setCatalogOpen(false)}
            />
          )}
        </>
      ) : lowConfidence ? (
        <>
          {image && (
            <div className="recognition-photo">
              <img src={image.url} alt="Ảnh món ăn đang nhận diện" />
              <span>{image.file.name}</span>
              <button className="text-btn" onClick={onUpload}>
                Đổi ảnh
              </button>
            </div>
          )}
          <div className="vision-warning-card" role="alert">
            <div className="vision-warning-copy">
              <WarningCircle size={28} aria-hidden="true" />
              <div>
                <h2>Chưa xác định được món</h2>
                <p>Hãy thử ảnh khác hoặc chọn món theo tên trong danh mục 30 món Việt.</p>
              </div>
            </div>
            <div className="vision-warning-actions">
              <button type="button" className="primary-btn" onClick={onUpload}>
                Chọn / tải ảnh khác
              </button>
              <button type="button" className="secondary-btn" onClick={openManualCatalog}>
                Chọn món từ danh mục
              </button>
            </div>
          </div>
          {catalogOpen && (
            <DishCatalogPicker
              dishes={dishes}
              busy={busy}
              onConfirm={onConfirmDish}
              onRetry={onEdit}
              onClose={() => setCatalogOpen(false)}
            />
          )}
        </>
      ) : (
        <>
          {image && (
            <div className="recognition-photo">
              <img src={image.url} alt="Ảnh món ăn đang nhận diện" />
              <span>{image.file.name}</span>
              <button className="text-btn" onClick={onUpload}>
                Đổi ảnh
              </button>
            </div>
          )}
          <div className="recognition-container" role="radiogroup" aria-label="Chọn món từ ba gợi ý">
            <div className="result-card">
              <h2>Món gợi ý</h2>
              <div id="mainResult">{candidate(predictions[0])}</div>
              <p className="muted" id="confidence">
                Đây là gợi ý từ ảnh. Hãy chọn món đúng hoặc tìm món theo tên.
              </p>
            </div>
            <div className="result-card">
              <h2>Các khả năng khác</h2>
              <div id="topResults" className="top-results">
                {predictions.slice(1).map(candidate)}
              </div>
            </div>
          </div>
          <div className="confirmation-panel">
            <div>
              <h2>Đây có phải món bạn muốn tìm?</h2>
              <p>Chọn một gợi ý ở trên hoặc sửa lại món trong danh mục.</p>
              <button className="text-btn" onClick={onEdit} disabled={busy}>
                <PencilSimple size={17} aria-hidden="true" /> Sửa món trong danh mục
              </button>
            </div>
            <button id="confirmButton" className="primary-btn" disabled={!chosen || busy} onClick={onConfirm}>
              <CheckSquare size={19} aria-hidden="true" /> Xác nhận món
            </button>
          </div>
          {dishes && (
            <div className="dish-editor">
              <label htmlFor="dishSelect">Chọn món khác</label>
              <select
                id="dishSelect"
                value={chosen?.normalized_dish || ''}
                onChange={(event) =>
                  onChoose(dishes.find((item) => item.normalized_dish === event.target.value) || null)
                }
              >
                <option value="">Chọn một món trong danh mục</option>
                {dishes.map((item) => (
                  <option key={item.class_id} value={item.normalized_dish}>
                    {item.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {busy && (
            <p role="status" className="status-text">
              Đang tải danh mục món ăn…
            </p>
          )}
          <p className="privacy-note">
            CookLens hỗ trợ 30 món Việt. Ảnh nhiều món hoặc món ngoài danh mục có thể cho kết quả chưa chính xác.
          </p>
        </>
      )}
    </section>
  );
}
