import { useRef, useState } from 'react';
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
  return <section id="uploadSection" className="section" aria-labelledby="upload-title">
    <div className="section-title">
      <h1 id="upload-title">Tải ảnh món ăn</h1>
      <p>Chọn một ảnh, khám phá ba món có khả năng cao nhất và tìm công thức phù hợp.</p>
    </div>
    <div className="upload-container">
      <div className={`upload-box${dragging ? ' is-dragging' : ''}`}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={event => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={event => { event.preventDefault(); setDragging(false); onFiles(event.dataTransfer.files); }}>
        <span className="upload-icon" aria-hidden="true">📷</span>
        <h2>Chọn ảnh món ăn</h2>
        <p>Kéo ảnh vào đây hoặc chọn ảnh từ thiết bị.</p>
        <p className="file-hint">JPG, PNG · tối đa 10 MiB · một món chính trong ảnh</p>
        <input ref={input} id="imageInput" aria-label="Chọn ảnh món ăn" type="file" accept="image/jpeg,image/png" hidden
          onChange={event => { onFiles(event.target.files); event.target.value = ''; }} />
        <input ref={camera} id="cameraInput" aria-label="Chụp ảnh món ăn" type="file" accept="image/jpeg,image/png" capture="environment" hidden
          onChange={event => { onFiles(event.target.files); event.target.value = ''; }} />
        <div className="button-row">
          <button id="chooseImageBtn" className="primary-btn" type="button" onClick={() => input.current?.click()}>Chọn ảnh</button>
          <button id="cameraBtn" className="secondary-btn camera-btn" type="button" onClick={() => camera.current?.click()}>Chụp ảnh</button>
        </div>
      </div>
      <div className="preview-box">
        <div className="panel-heading"><h2>Ảnh đã chọn</h2>
          {image && <button id="removeImageBtn" className="text-btn" onClick={onRemove}>Xóa ảnh</button>}
        </div>
        <div id="previewContainer" className={`preview-container${image ? ' has-image' : ''}`}>
          {image ? <img key={image.url} id="previewImage" src={image.url} alt="Ảnh món ăn đã chọn"
            onError={() => onInvalid(image.file, 'Không đọc được ảnh. Hãy chọn ảnh JPG hoặc PNG hợp lệ.')}
            onLoad={event => {
              if (event.currentTarget.naturalWidth * event.currentTarget.naturalHeight > 25_000_000)
                onInvalid(image.file, 'Ảnh có quá nhiều điểm ảnh. Vui lòng chọn ảnh tối đa 25 triệu điểm ảnh.');
            }} />
            : <div className="empty-preview"><span aria-hidden="true">🍽️</span><p id="previewText">Chưa có ảnh</p><small>Ảnh của bạn sẽ xuất hiện ở đây</small></div>}
        </div>
        {image && <p className="file-name">{image.file.name}</p>}
        <button id="predictBtn" className="primary-btn predict-btn" disabled={!image || busy} onClick={onPredict}>
          {busy ? 'Đang nhận diện…' : 'Nhận diện món'}
        </button>
        {busy && <p className="status-text" role="status">Đang phân tích ảnh. Bạn vẫn có thể chọn ảnh khác.</p>}
      </div>
    </div>
    <p className="privacy-note">Ảnh chỉ được dùng cho lần nhận diện này. Bạn luôn có thể chọn lại món trước khi xem công thức.</p>
  </section>;
}
