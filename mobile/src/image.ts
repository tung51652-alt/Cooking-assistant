import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';

export interface UploadImage { uri: string; width: number; height: number; size: number }
export function discardImage(image: UploadImage | null) {
  if (!image) return;
  try { const file = new File(image.uri); if (file.exists) file.delete(); } catch { /* Cache may already be gone. */ }
}

export async function chooseImage(camera: boolean): Promise<UploadImage | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Chưa được phép dùng camera. Bạn có thể chọn ảnh từ thư viện hoặc cấp quyền trong Cài đặt.');
  }
  // The system photo picker grants access only to the chosen image; no broad library permission.
  const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({
    mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  try {
  if (!asset || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 25_000_000) {
    throw new Error('Ảnh cần không quá 25 triệu pixel. Hãy chọn ảnh nhỏ hơn.');
  }
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const rendered = await context.renderAsync();
    try {
      // Native decoding applies orientation; re-encoding also converts HEIC to the wire format.
      const output = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: .9 });
      const image = { uri: output.uri, width: output.width, height: output.height, size: new File(output.uri).size };
      if (image.size <= 0 || image.size > 10 * 1024 * 1024) {
        discardImage(image);
        throw new Error('Ảnh sau chuyển đổi vượt 10 MiB. Hãy chọn ảnh nhỏ hơn.');
      }
      return image;
    } finally { rendered.release(); }
  } finally { context.release(); }
  } finally {
    // Only remove the picker's temporary copy in this app's cache, never a gallery original.
    if (asset?.uri.startsWith(Paths.cache.uri)) {
      try { const cached = new File(asset.uri); if (cached.exists) cached.delete(); } catch { /* Cache cleanup is best effort. */ }
    }
  }
}

export function uploadBody(image: UploadImage): FormData {
  const body = new FormData();
  // React Native's native FormData adapter accepts URI descriptors rather than browser File objects.
  body.append('file', { uri: image.uri, name: 'food.jpg', type: 'image/jpeg' } as unknown as Blob);
  return body;
}
