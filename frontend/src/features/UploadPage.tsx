import { useRef, useState } from 'react';
import { Camera, Images, ImageSquare, Scan, Sparkle, X, ArrowRight, CheckSquare, ShieldCheck } from '@phosphor-icons/react';
import type { SelectedImage } from '../types';

interface Props {
  image: SelectedImage | null;
  busy: boolean;
  onFiles: (files: FileList | null) => void;
  onRemove: () => void;
  onPredict: () => void;
  onInvalid: (file: File, message: string) => void;
}

export default function UploadPage({ image, busy, onFiles, onRemove, onPredict, onInvalid }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <section id="uploadSection" className="section upload-section" aria-labelledby="upload-title">
    <div className="home-intro">
      <span className="intro-badge"><Sparkle size={17} weight="fill" aria-hidden="true" /> Cảm hứng cho bữa cơm Việt</span>
      <h1 id="upload-title">Chụp món ngon. Tìm cách nấu.</h1>
      <p>Từ một tấm ảnh đến công thức cho món bạn yêu thích.<br className="desktop-break" /> Chọn món phù hợp và mang hương vị ấy về căn bếp của mình.</p>
    </div>
    <div className="section-heading"><h2><Camera aria-hidden="true" /> Tải ảnh &amp; nhận diện</h2><span>JPG, PNG · tối đa 10 MiB</span></div>
    <div className="upload-container">
      <div className="upload-panel">
        <div className="panel-heading"><h3><Images aria-hidden="true" /> Chọn ảnh món ăn</h3><span className="panel-tag">Tải ảnh</span></div>
        <input ref={input} id="imageInput" aria-label="Chọn ảnh món ăn" type="file" accept="image/jpeg,image/png" hidden
          onChange={event => { onFiles(event.target.files); event.target.value = ''; }} />
        <input ref={camera} id="cameraInput" aria-label="Chụp ảnh món ăn" type="file" accept="image/jpeg,image/png" capture="environment" hidden
          onChange={event => { onFiles(event.target.files); event.target.value = ''; }} />
        <button type="button" className={`upload-box${dragging ? ' is-dragging' : ''}`} onClick={() => input.current?.click()}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
          onDrop={event => { event.preventDefault(); setDragging(false); onFiles(event.dataTransfer.files); }}>
          <span className="upload-icon" aria-hidden="true">🥘</span>
          <strong>Kéo &amp; thả ảnh món ăn vào đây</strong>
          <span>Hoặc chạm để chọn ảnh từ thiết bị của bạn</span>
          <small>Ảnh rõ nét, một món chính sẽ dễ nhận diện hơn</small>
        </button>
        <div className="button-row two-buttons">
          <button id="chooseImageBtn" className="secondary-btn" type="button" onClick={() => input.current?.click()}><Images size={20} aria-hidden="true" /> Chọn ảnh</button>
          <button id="cameraBtn" className="camera-btn" type="button" onClick={() => camera.current?.click()}><Camera size={20} aria-hidden="true" /> Chụp ảnh</button>
        </div>
      </div>
      <div className="preview-box">
        <div className="panel-heading"><h3><Scan aria-hidden="true" /> Xem trước &amp; nhận diện</h3><span className="panel-tag">Xem trước</span></div>
        <div id="previewContainer" className={`preview-container${image ? ' has-image' : ''}`}>
          {image ? <>
            <img key={image.url} id="previewImage" src={image.url} alt="Ảnh món ăn đã chọn"
              onError={() => onInvalid(image.file, 'Không đọc được ảnh. Hãy chọn ảnh JPG hoặc PNG hợp lệ.')}
              onLoad={event => { if (event.currentTarget.naturalWidth * event.currentTarget.naturalHeight > 25_000_000) onInvalid(image.file, 'Ảnh có quá nhiều điểm ảnh. Vui lòng chọn ảnh tối đa 25 triệu điểm ảnh.'); }} />
            {busy && <div className="scanning-overlay" role="status"><span className="spinner" /><strong>Đang tìm món ăn trong ảnh…</strong><span>Bạn sẽ chọn món trước khi xem công thức</span></div>}
          </> : <div className="empty-preview"><span className="preview-icon"><ImageSquare size={30} aria-hidden="true" /></span><strong id="previewText">Chưa có ảnh được chọn</strong><p>Ảnh món ăn của bạn sẽ xuất hiện ở đây<br /> để xem trước và nhận diện.</p></div>}
        </div>
        {image && <p className="file-name"><CheckSquare size={15} aria-hidden="true" /> {image.file.name}</p>}
        <div className="button-row two-buttons">
          <button id="removeImageBtn" className="secondary-btn" disabled={!image} onClick={onRemove}><X size={19} aria-hidden="true" /> Xóa ảnh</button>
          <button id="predictBtn" className="primary-btn" disabled={!image || busy} onClick={onPredict}><Scan size={19} aria-hidden="true" />{busy ? 'Đang nhận diện…' : 'Nhận diện món'}</button>
        </div>
      </div>
    </div>
    <p className="privacy-note"><ShieldCheck size={17} aria-hidden="true" />Ảnh chỉ dùng cho lần nhận diện này. Bạn luôn là người xác nhận món ăn.</p>
    <section className="journey" aria-labelledby="journey-title">
      <div className="journey-heading"><span aria-hidden="true">🍳</span><div><h2 id="journey-title">Một tấm ảnh. Một bữa ngon.</h2><p>CookLens cùng bạn tìm lại hương vị yêu thích.</p></div></div>
      <ol className="journey-steps">
        <li><span className="journey-number">1</span><div><h3>Chọn ảnh của bạn</h3><p>Tải ảnh có sẵn hoặc chụp món ăn ngay tại bàn.</p></div><ArrowRight aria-hidden="true" /></li>
        <li><span className="journey-number">2</span><div><h3>Xác nhận món ăn</h3><p>Chọn trong ba gợi ý hoặc sửa từ danh mục 30 món Việt.</p></div><ArrowRight aria-hidden="true" /></li>
        <li><span className="journey-number">3</span><div><h3>Mang vị ngon về bếp</h3><p>Xem nguyên liệu, cách nấu và nguồn công thức rõ ràng.</p></div></li>
      </ol>
    </section>
  </section>;
}
