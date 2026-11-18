// 플립북을 JSON 파일로 저장하고 다시 불러오는 도구
// 이미지는 base64(data URL)로 JSON 안에 담기 때문에 파일 하나만 있으면 같은 책을 다시 열 수 있다.
// 저장할 때 그림은 "링크 만들기"와 같은 크기로 줄여 담는다(2026-11-18) — 원본 PNG 를 그대로 담으면
// 4~5쪽짜리 책도 20~30MB 가 되어 주고받기가 아주 느렸다. 파일 형식(version 1)은 그대로라 예전 파일도 열린다.
import { shrinkImage } from './shrinkImage';
import { IMAGE_MAX_EDGE, IMAGE_QUALITY } from '../../shared/share-config.js';

export const BOOK_FORMAT = 'story-flipbook';
export const BOOK_VERSION = 1;

// 화면에 보여줄 한 페이지 (url 은 브라우저 안에서만 쓰는 blob 주소)
export interface BookPage {
  name: string;
  blob: Blob;
  url: string;
}

interface SavedPage {
  name: string;
  type: string;
  data: string; // data:image/...;base64,....
}

const readAsDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });

// 이미지 파일들을 이름순(숫자 순서 고려)으로 정렬해 페이지로 만든다
export const filesToPages = (files: File[]): BookPage[] =>
  [...files]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map(file => ({ name: file.name, blob: file, url: URL.createObjectURL(file) }));

export const revokePages = (pages: BookPage[]) => {
  pages.forEach(page => URL.revokeObjectURL(page.url));
};

const pad = (n: number) => String(n).padStart(2, '0');

export const makeFileName = (date = new Date()) =>
  `플립북_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;

// 그림 한 장을 JSON 에 넣을 크기로 줄인다.
// 움직이는 GIF 는 JPEG 으로 바꾸면 멈춘 그림이 되므로 그대로 두고, 줄이지 못한 그림(읽을 수 없는 형식 등)도 원본 그대로 넣는다.
const shrinkForSave = async (blob: Blob): Promise<Blob> => {
  if (blob.type === 'image/gif') return blob;
  try {
    return (await shrinkImage(blob, IMAGE_MAX_EDGE, IMAGE_QUALITY)).blob;
  } catch {
    return blob;
  }
};

// 현재 책을 JSON 파일로 내려받는다. 받은 파일의 크기(바이트)를 돌려준다.
export const savePagesAsJson = async (
  pages: BookPage[],
  onProgress?: (done: number, total: number) => void
): Promise<{ bytes: number }> => {
  // 페이지를 하나씩 문자열로 만들어 Blob 에 이어 붙인다 (큰 책도 하나의 거대한 문자열을 만들지 않도록)
  const parts: string[] = [
    `{"format":${JSON.stringify(BOOK_FORMAT)},"version":${BOOK_VERSION},"savedAt":${JSON.stringify(
      new Date().toISOString()
    )},"pages":[`,
  ];

  for (let i = 0; i < pages.length; i++) {
    const { name, blob } = pages[i];
    const small = await shrinkForSave(blob);
    const saved: SavedPage = { name, type: small.type || blob.type, data: await readAsDataURL(small) };
    parts.push((i > 0 ? ',' : '') + JSON.stringify(saved));
    onProgress?.(i + 1, pages.length);
  }
  parts.push(']}');

  const file = new Blob(parts, { type: 'application/json' });
  const fileUrl = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = fileUrl;
  link.download = makeFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 다운로드가 시작될 시간을 준 뒤 주소 해제
  setTimeout(() => URL.revokeObjectURL(fileUrl), 10_000);
  return { bytes: file.size };
};

// 파일 이름이나 종류로 "저장한 책(JSON)"인지 본다 (업로드 상자에 JSON 을 넣어도 열어 주려고)
export const isJsonFile = (file: File) => file.type === 'application/json' || /\.json$/i.test(file.name);

// 끝이 잘린 플립북 JSON(끝까지 받아지지 않은 파일)에서 온전한 쪽만 꺼낸다.
// 큰 파일은 받는 도중에 끊기는 일이 잦다(2026-11-18: 30~60MB 파일 9개 중 4개가 잘려 있었음).
// 이 앱이 저장한 모양({"name":..,"type":..,"data":"data:image/..;base64,...."})만 다룬다. 플립북 파일이 아니면 null.
const salvagePages = (text: string): SavedPage[] | null => {
  if (!/^﻿?\s*\{\s*"format"\s*:\s*"story-flipbook"/.test(text.slice(0, 200))) return null;
  const DATA_KEY = '"data":"';
  let pos = text.indexOf('"pages":[');
  if (pos < 0) return null;
  pos += '"pages":['.length;

  const found: SavedPage[] = [];
  while (pos < text.length) {
    if (text[pos] === ',') pos++;
    if (text[pos] !== '{') break;
    const dataKey = text.indexOf(DATA_KEY, pos);
    if (dataKey < 0) break;
    const dataStart = dataKey + DATA_KEY.length;
    const dataEnd = text.indexOf('"', dataStart); // base64 에는 따옴표가 없으므로 다음 따옴표가 그림의 끝
    if (dataEnd < 0 || text[dataEnd + 1] !== '}') break; // 이 쪽은 끝까지 들어 있지 않다
    let meta: any;
    try {
      meta = JSON.parse(text.slice(pos, dataStart) + '"}'); // 이름·종류만 읽는다
    } catch {
      break;
    }
    found.push({ name: meta?.name, type: meta?.type, data: text.slice(dataStart, dataEnd) });
    pos = dataEnd + 2;
  }
  return found;
};

export interface LoadedBook {
  pages: BookPage[];
  incomplete: boolean; // true = 끝이 잘린 파일이라 온전한 쪽까지만 열었다
}

// 저장해 둔 JSON 파일을 읽어 페이지 목록으로 되돌린다. 형식이 맞지 않으면 사유를 담은 Error 를 던진다.
export const loadPagesFromJson = async (file: File): Promise<LoadedBook> => {
  let parsed: any;
  let incomplete = false;
  const text = await file.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    const salvaged = salvagePages(text);
    if (salvaged === null) {
      throw new Error('JSON 파일을 읽지 못했습니다. 이 앱에서 "JSON으로 저장"한 파일이 맞는지 확인해 주세요.');
    }
    if (salvaged.length === 0) {
      throw new Error('끝까지 받아지지 않은 파일이라 열 수 있는 쪽이 없습니다. 파일을 다시 받아 주세요.');
    }
    parsed = { format: BOOK_FORMAT, version: BOOK_VERSION, pages: salvaged };
    incomplete = true;
  }

  if (!parsed || parsed.format !== BOOK_FORMAT || !Array.isArray(parsed.pages)) {
    throw new Error('플립북 JSON 파일이 아닙니다. 이 앱에서 "JSON으로 저장"한 파일을 선택해 주세요.');
  }
  if (typeof parsed.version === 'number' && parsed.version > BOOK_VERSION) {
    throw new Error('더 새로운 버전에서 저장한 파일이라 열 수 없습니다.');
  }
  if (parsed.pages.length === 0) {
    throw new Error('이 파일에는 페이지가 없습니다.');
  }

  const pages: BookPage[] = [];
  try {
    for (let i = 0; i < parsed.pages.length; i++) {
      const item = parsed.pages[i];
      // 이미지 data URL 만 허용 (그 밖의 주소는 열지 않는다)
      if (!item || typeof item.data !== 'string' || !item.data.startsWith('data:image/')) {
        throw new Error(`${i + 1}번째 페이지가 올바른 이미지가 아닙니다.`);
      }
      const blob = await (await fetch(item.data)).blob();
      pages.push({
        name: typeof item.name === 'string' ? item.name : `page-${i + 1}`,
        blob,
        url: URL.createObjectURL(blob),
      });
    }
  } catch (err) {
    revokePages(pages);
    throw err;
  }
  return { pages, incomplete };
};
