// 그림을 화면에 알맞은 크기로 줄이는 도구 — "JSON으로 저장"과 "링크 만들기"가 함께 쓴다.
// 긴 변을 maxEdge(px) 이하로 줄이고 JPEG 으로 다시 만든다. 이미 작은 그림은 그대로 둔다.

interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

const decodeImage = async (blob: Blob): Promise<Drawable> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* 아래 <img> 방식으로 다시 시도 */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const KEEP_AS_IS_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const KEEP_AS_IS_BYTES = 350 * 1024;

// 그림의 크기를 읽지 못했을 때 (깨진 파일 등)
export class ImageReadError extends Error {}

export interface ShrunkImage {
  blob: Blob;
  w: number;
  h: number;
}

// 그림 한 장을 줄인다. 이미 작으면 그대로 쓴다.
export const shrinkImage = async (blob: Blob, maxEdge: number, quality: number): Promise<ShrunkImage> => {
  const img = await decodeImage(blob);
  try {
    if (!img.width || !img.height) throw new ImageReadError('그림 크기를 읽지 못했습니다.');
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    if (scale === 1 && blob.size <= KEEP_AS_IS_BYTES && KEEP_AS_IS_TYPES.includes(blob.type)) {
      return { blob, w, h };
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('그림을 줄이지 못했습니다.');
    ctx.fillStyle = '#ffffff'; // 투명한 부분은 흰 종이로
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, 0, 0, w, h);

    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!out) throw new Error('그림을 줄이지 못했습니다.');
    // 줄이지 않았는데 다시 만든 파일이 더 크면 원래 파일을 쓴다
    if (scale === 1 && out.size >= blob.size && KEEP_AS_IS_TYPES.includes(blob.type)) return { blob, w, h };
    return { blob: out, w, h };
  } finally {
    img.close();
  }
};
