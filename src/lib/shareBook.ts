// 책을 링크로 공유하는 도구
// - 올릴 때: 그림을 화면에 맞게 줄이고 → 책 한 권을 파일 하나로 묶어 → 저장소에 올린 뒤 → 링크를 만든다
// - 열 때: 링크의 책 번호로 파일 주소를 알아내 → 파일을 받아 → 쪽으로 다시 나눈다
// 책 한 권을 파일 하나로 묶는 이유: 저장소 무료 한도가 "올리기 횟수"로도 걸려 있어서, 쪽마다 따로 올리면 금방 찬다.
import type { BookPage } from './bookFile';
import { shrinkImage, ImageReadError, type ShrunkImage } from './shrinkImage';
import {
  BOOK_MAGIC,
  BOOK_ID_RE,
  MAX_PAGES,
  MAX_BOOK_BYTES,
  RETENTION_DAYS,
  IMAGE_MAX_EDGE,
  IMAGE_QUALITY,
} from '../../shared/share-config.js';

export { MAX_PAGES, RETENTION_DAYS };

export type ShareErrorCode =
  | 'too-many-pages'
  | 'too-big'
  | 'not-configured'
  | 'store-full'
  | 'not-found'
  | 'expired'
  | 'bad-id'
  | 'bad-file'
  | 'server';

export class ShareError extends Error {
  code: ShareErrorCode;
  constructor(code: ShareErrorCode) {
    super(shareErrorText(code));
    this.code = code;
  }
}

export function shareErrorText(code: ShareErrorCode): string {
  switch (code) {
    case 'too-many-pages':
      return `링크로 올릴 수 있는 책은 최대 ${MAX_PAGES}쪽입니다. 쪽수를 줄여 다시 해 보세요.`;
    case 'too-big':
      return `책이 너무 큽니다(줄인 뒤에도 ${Math.round(MAX_BOOK_BYTES / 1024 / 1024)}MB 초과). 쪽수를 줄여 다시 해 보세요.`;
    case 'not-configured':
      return '이 사이트에는 링크 저장소가 연결되어 있지 않아 링크를 만들거나 열 수 없습니다.';
    case 'store-full':
      return '이 사이트의 링크 저장 공간이 가득 찼습니다. 오래된 책이 지워진 뒤 다시 해 보세요.';
    case 'not-found':
      return '이 링크의 책을 찾지 못했습니다. 주소가 맞는지 확인해 주세요.';
    case 'expired':
      return `보관 기간(${RETENTION_DAYS}일)이 지나 지워진 책입니다.`;
    case 'bad-id':
      return '링크 주소가 올바르지 않습니다. 주소를 끝까지 복사했는지 확인해 주세요.';
    case 'bad-file':
      return '책 파일을 읽지 못했습니다. 링크를 다시 만들어 주세요.';
    default:
      return '지금은 처리하지 못했습니다. 인터넷 연결을 확인하고 잠시 뒤 다시 해 보세요.';
  }
}

export interface SharedInfo {
  id: string;
  link: string;
  expiresAt: number | null;
}

export type ShareProgress =
  | { phase: 'prepare'; done: number; total: number }
  | { phase: 'upload'; percent: number };

// 헷갈리는 글자(l·o·0·1)를 뺀 32글자에서 12자리 — 추측으로는 맞힐 수 없는 길이
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
const makeId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => ID_CHARS[b % ID_CHARS.length]).join('');
};

export const linkForId = (id: string) => `${location.origin}${location.pathname}?b=${id}`;

// 주소에 책 번호(?b=)가 있으면 돌려준다
export const idFromLocation = (): string | null => new URLSearchParams(location.search).get('b');

// ---------- 그림 줄이기 ----------

// 그림 한 장을 올리기 알맞게 줄인다 (줄이는 방법은 "JSON으로 저장"과 같다 — src/lib/shrinkImage.ts)
const shrinkForShare = async (blob: Blob): Promise<ShrunkImage> => {
  try {
    return await shrinkImage(blob, IMAGE_MAX_EDGE, IMAGE_QUALITY);
  } catch (err) {
    throw new ShareError(err instanceof ImageReadError ? 'bad-file' : 'server');
  }
};

// ---------- 책 한 권 = 파일 하나 ----------
// [8바이트 표식 "FLIPBK01"][4바이트 머리말 길이][머리말 JSON][그림1][그림2]…

interface BundleHeader {
  format: 'story-flipbook-share';
  version: 1;
  createdAt: string;
  pages: { type: string; size: number; w: number; h: number }[];
}

const PAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const packBook = (items: { blob: Blob; w: number; h: number }[]): Blob => {
  const header: BundleHeader = {
    format: 'story-flipbook-share',
    version: 1,
    createdAt: new Date().toISOString(),
    pages: items.map(it => ({ type: it.blob.type || 'image/jpeg', size: it.blob.size, w: it.w, h: it.h })),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const prefix = new Uint8Array(12);
  prefix.set(new TextEncoder().encode(BOOK_MAGIC), 0);
  new DataView(prefix.buffer).setUint32(8, headerBytes.length, true);
  return new Blob([prefix, headerBytes, ...items.map(it => it.blob)], { type: 'application/octet-stream' });
};

export const unpackBook = (buffer: ArrayBuffer): BookPage[] => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12 || new TextDecoder().decode(bytes.subarray(0, 8)) !== BOOK_MAGIC) throw new ShareError('bad-file');
  const headerLength = new DataView(buffer).getUint32(8, true);
  if (headerLength <= 0 || headerLength > 1024 * 1024 || 12 + headerLength > bytes.length) throw new ShareError('bad-file');

  let header: BundleHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headerLength)));
  } catch {
    throw new ShareError('bad-file');
  }
  if (!header || header.format !== 'story-flipbook-share' || !Array.isArray(header.pages)) throw new ShareError('bad-file');
  if (header.pages.length === 0 || header.pages.length > MAX_PAGES) throw new ShareError('bad-file');

  const pages: BookPage[] = [];
  let offset = 12 + headerLength;
  try {
    header.pages.forEach((p, i) => {
      // 그림 형식만 받는다 (그 밖의 내용은 열지 않는다)
      if (!p || !PAGE_TYPES.includes(p.type) || !Number.isInteger(p.size) || p.size <= 0 || offset + p.size > bytes.length) {
        throw new ShareError('bad-file');
      }
      const blob = new Blob([bytes.subarray(offset, offset + p.size)], { type: p.type });
      offset += p.size;
      pages.push({ name: `page-${String(i + 1).padStart(3, '0')}`, blob, url: URL.createObjectURL(blob) });
    });
  } catch (err) {
    pages.forEach(p => URL.revokeObjectURL(p.url));
    throw err;
  }
  return pages;
};

// ---------- 올리기 ----------

const readJson = async (res: Response): Promise<any> => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const toShareError = (res: Response, data: any): ShareError => {
  const known: ShareErrorCode[] = ['not-configured', 'store-full', 'not-found', 'expired', 'bad-id'];
  if (data && known.includes(data.error)) return new ShareError(data.error);
  return new ShareError('server');
};

// 이 사이트에 링크 저장소가 연결되어 있는지 묻는다.
// 연결되지 않았거나(원본 사이트), 물어볼 수 없으면(내 컴퓨터의 개발 서버) false — 그때는 [링크 만들기] 버튼을 보이지 않는다.
export const isShareAvailable = async (): Promise<boolean> => {
  try {
    const res = await fetch('/api/share-config');
    if (!res.ok) return false;
    const data = await readJson(res);
    return Boolean(data && data.enabled === true);
  } catch {
    return false;
  }
};

// 책의 그림을 줄이고 파일 하나로 묶는다 (올리기 전 단계)
export const buildBundle = async (pages: BookPage[], onProgress: (p: ShareProgress) => void): Promise<Blob> => {
  if (pages.length === 0) throw new ShareError('bad-file');
  if (pages.length > MAX_PAGES) throw new ShareError('too-many-pages');

  const items: { blob: Blob; w: number; h: number }[] = [];
  for (let i = 0; i < pages.length; i++) {
    items.push(await shrinkForShare(pages[i].blob));
    onProgress({ phase: 'prepare', done: i + 1, total: pages.length });
  }

  const bundle = packBook(items);
  if (bundle.size > MAX_BOOK_BYTES) throw new ShareError('too-big');
  return bundle;
};

// 지금 책을 저장소에 올리고 링크를 돌려준다
export const shareBook = async (pages: BookPage[], onProgress: (p: ShareProgress) => void): Promise<SharedInfo> => {
  const bundle = await buildBundle(pages, onProgress);

  const id = makeId();
  onProgress({ phase: 'upload', percent: 0 });
  let grant: { token: string; pathname: string; expiresAt?: number };
  try {
    const res = await fetch('/api/share-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await readJson(res);
    if (!res.ok || !data || typeof data.token !== 'string' || typeof data.pathname !== 'string') throw toShareError(res, data);
    grant = data;
  } catch (err) {
    throw err instanceof ShareError ? err : new ShareError('server');
  }

  try {
    // 올리기 도구는 링크를 만들 때만 내려받는다 (책만 보는 사람의 첫 화면을 무겁게 하지 않으려고)
    const { put } = await import('@vercel/blob/client');
    await put(grant.pathname, bundle, {
      access: 'public',
      token: grant.token,
      contentType: 'application/octet-stream',
      onUploadProgress: e => onProgress({ phase: 'upload', percent: Math.round(e.percentage) }),
    });
  } catch {
    throw new ShareError('server');
  }

  return { id, link: linkForId(id), expiresAt: typeof grant.expiresAt === 'number' ? grant.expiresAt : null };
};

// ---------- 링크로 열기 ----------

const isStoreUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
};

export const loadSharedBook = async (id: string): Promise<{ pages: BookPage[]; info: SharedInfo }> => {
  if (!BOOK_ID_RE.test(id)) throw new ShareError('bad-id');

  let data: any;
  try {
    const res = await fetch(`/api/book?id=${id}`);
    data = await readJson(res);
    if (!res.ok || !data) throw toShareError(res, data);
  } catch (err) {
    throw err instanceof ShareError ? err : new ShareError('server');
  }
  if (!isStoreUrl(data.url)) throw new ShareError('server');

  let buffer: ArrayBuffer;
  try {
    const fileRes = await fetch(data.url);
    if (!fileRes.ok) throw new ShareError(fileRes.status === 404 ? 'not-found' : 'server');
    buffer = await fileRes.arrayBuffer();
  } catch (err) {
    throw err instanceof ShareError ? err : new ShareError('server');
  }

  return {
    pages: unpackBook(buffer),
    info: { id, link: linkForId(id), expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : null },
  };
};
