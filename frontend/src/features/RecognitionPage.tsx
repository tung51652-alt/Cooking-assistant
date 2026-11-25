import { CheckSquare, PencilSimple } from '@phosphor-icons/react';
import type { Dish, Prediction, SelectedImage } from '../types';

interface Props {
  image: SelectedImage | null;
  predictions: Prediction[];
  chosen: Dish | null;
  dishes: Dish[] | null;
  busy: boolean;
  onChoose: (dish: Dish | null) => void;
  onConfirm: () => void;
  onEdit: () => void;
  onUpload: () => void;
}

export default function RecognitionPage({ image, predictions, chosen, dishes, busy, onChoose, onConfirm, onEdit, onUpload }: Props) {
  function candidate(prediction: Prediction) {
    return <label className={`prediction-choice${chosen?.class_id === prediction.class_id ? ' is-selected' : ''}`} key={prediction.class_id}>
      <input type="radio" name="dish" checked={chosen?.class_id === prediction.class_id} onChange={() => onChoose(prediction)} />
      <span className="candidate-copy"><span className="rank">Khả năng {prediction.rank}</span><strong>{prediction.display_name}</strong></span>
      <span className="confidence">{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(prediction.confidence * 100)}%</span>
    </label>;
  }
  return <section className="section" aria-labelledby="recognition-title">
    <div className="section-title"><h1 id="recognition-title">Kết quả nhận diện</h1><p>Ba gợi ý từ ảnh của bạn. Hãy chọn món đúng để tìm công thức.</p></div>
    {predictions.length === 0 ? <div className="empty-state">
      <h2>Chưa có kết quả nhận diện</h2><p>Hãy tải ảnh và nhấn “Nhận diện món” để bắt đầu.</p>
      <button className="primary-btn" onClick={onUpload}>Tải ảnh món ăn</button>
    </div> : <>
      {image && <div className="recognition-photo"><img src={image.url} alt="Ảnh món ăn đang nhận diện" /><span>{image.file.name}</span><button className="text-btn" onClick={onUpload}>Đổi ảnh</button></div>}
      <div className="recognition-container" role="radiogroup" aria-label="Chọn món từ ba gợi ý">
        <div className="result-card"><h2>Món ăn được nhận diện</h2><div id="mainResult">{candidate(predictions[0])}</div><p className="muted" id="confidence">Độ tin cậy của mô hình, không phải xác nhận món ăn.</p></div>
        <div className="result-card"><h2>Các khả năng khác</h2><div id="topResults" className="top-results">{predictions.slice(1).map(candidate)}</div></div>
      </div>
      <div className="confirmation-panel">
        <div><h2>Đây có phải món bạn muốn tìm?</h2><p>Chọn một gợi ý ở trên hoặc sửa lại món trong danh mục.</p>
          <button className="text-btn" onClick={onEdit} disabled={busy}><PencilSimple size={17} aria-hidden="true" /> Sửa món trong danh mục</button></div>
        <button id="confirmButton" className="primary-btn" disabled={!chosen || busy} onClick={onConfirm}><CheckSquare size={19} aria-hidden="true" /> Xác nhận món</button>
      </div>
      {dishes && <div className="dish-editor"><label htmlFor="dishSelect">Chọn món khác</label>
        <select id="dishSelect" value={chosen?.normalized_dish || ''} onChange={event => onChoose(dishes.find(item => item.normalized_dish === event.target.value) || null)}>
          <option value="">Chọn một món trong danh mục</option>
          {dishes.map(item => <option key={item.class_id} value={item.normalized_dish}>{item.display_name}</option>)}
        </select></div>}
      {busy && <p role="status" className="status-text">Đang tải danh mục món ăn…</p>}
      <p className="privacy-note">Model hỗ trợ 30 món Việt. Ảnh nhiều món hoặc món ngoài danh mục có thể cho kết quả chưa chính xác.</p>
    </>}
  </section>;
}
