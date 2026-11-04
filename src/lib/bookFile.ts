// 플립북을 JSON 파일로 저장하고 다시 불러오는 도구
// 이미지는 base64(data URL)로 JSON 안에 그대로 담기 때문에 파일 하나만 있으면 같은 책을 다시 열 수 있다.

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

// 현재 책을 JSON 파일로 내려받는다
export const savePagesAsJson = async (pages: BookPage[]) => {
  // 페이지를 하나씩 문자열로 만들어 Blob 에 이어 붙인다 (큰 책도 하나의 거대한 문자열을 만들지 않도록)
  const parts: string[] = [
    `{"format":${JSON.stringify(BOOK_FORMAT)},"version":${BOOK_VERSION},"savedAt":${JSON.stringify(
      new Date().toISOString()
    )},"pages":[`,
  ];

  for (let i = 0; i < pages.length; i++) {
    const { name, blob } = pages[i];
    const saved: SavedPage = { name, type: blob.type, data: await readAsDataURL(blob) };
    parts.push((i > 0 ? ',' : '') + JSON.stringify(saved));
  }
  parts.push(']}');

  const fileUrl = URL.createObjectURL(new Blob(parts, { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = fileUrl;
  link.download = makeFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 다운로드가 시작될 시간을 준 뒤 주소 해제
  setTimeout(() => URL.revokeObjectURL(fileUrl), 10_000);
};

// 저장해 둔 JSON 파일을 읽어 페이지 목록으로 되돌린다. 형식이 맞지 않으면 사유를 담은 Error 를 던진다.
export const loadPagesFromJson = async (file: File): Promise<BookPage[]> => {
  let parsed: any;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('JSON 파일을 읽지 못했습니다. 이 앱에서 저장한 파일이 맞는지 확인해 주세요.');
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
  return pages;
};
