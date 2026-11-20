// 플립북을 HTML 파일 하나로 저장하는 도구 (2026-11-20, "JSON으로 저장"을 대신함)
// 저장한 파일을 두 번 누르면 브라우저에서 책이 바로 펼쳐진다. 그림(base64)과 책장 넘김 스크립트를 모두 파일 안에 담아
// 인터넷 연결이나 이 앱 없이도 열린다. 이 파일을 앱으로 다시 불러오는 기능은 없다.
//
// 파일 순서: 모양·스크립트를 앞(head)에, 그림을 맨 뒤(body)에 둔다. 받는 도중 파일 끝이 잘려도
// 온전히 들어온 쪽까지는 책으로 열리고(viewer.js 가 저장할 때 적어 둔 쪽수와 비교해 알린다),
// 스크립트가 돌지 않는 곳에서는 그림이 위에서 아래로 그대로 보인다.
import type { BookPage } from './bookFile';
import { shrinkImage } from './shrinkImage';
import { IMAGE_MAX_EDGE, IMAGE_QUALITY } from '../../shared/share-config.js';
import viewerCss from './htmlBook/viewer.css?raw';
import viewerJs from './htmlBook/viewer.js?raw';
import pageFlipJs from 'page-flip/dist/js/page-flip.browser.js?raw';

const PAGE_FLIP_NOTICE =
  '/*! page-flip 2.0.7 (StPageFlip) | MIT License | Copyright (c) 2020 Nodlik | https://github.com/Nodlik/StPageFlip */';

const readAsDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });

const pad = (n: number) => String(n).padStart(2, '0');

export const makeFileName = (date = new Date()) =>
  `플립북_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.html`;

// 그림 한 장을 파일에 넣을 크기로 줄인다 ("링크 만들기"와 같은 크기).
// 움직이는 GIF 는 JPEG 으로 바꾸면 멈춘 그림이 되므로 그대로 두고, 줄이지 못한 그림(읽을 수 없는 형식 등)도 원본 그대로 넣는다.
const shrinkForSave = async (blob: Blob): Promise<Blob> => {
  if (blob.type === 'image/gif') return blob;
  try {
    return (await shrinkImage(blob, IMAGE_MAX_EDGE, IMAGE_QUALITY)).blob;
  } catch {
    return blob;
  }
};

// 그림을 HTML 의 src="…" 안에 넣을 주소(data URL)로 만든다.
// 종류 이름은 정해진 글자만 허용하고(따옴표 등이 섞여 HTML 이 깨지지 않게), 내용은 base64 라 안전하다.
const toDataUrl = async (blob: Blob): Promise<string> => {
  const raw = await readAsDataURL(blob);
  const base64 = raw.slice(raw.indexOf(',') + 1);
  const type = /^image\/[a-z0-9.+-]+$/i.test(blob.type) ? blob.type : 'image/jpeg';
  return `data:${type};base64,${base64}`;
};

// <script> 안에 넣을 글에 "</script" 가 있으면 거기서 스크립트가 끝나 버리므로 막아 둔다
const inlineScript = (code: string) => code.replace(/<\/(script)/gi, '<\\/$1');

const htmlHead = (pageCount: number, savedAt: string) =>
  `<!DOCTYPE html>
<html lang="ko" data-pages="${pageCount}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="FlipBook (story-flipbook)">
<meta name="date" content="${savedAt}">
<title>플립북</title>
<style>
${viewerCss.replace(/<\/(style)/gi, '<\\/$1')}
</style>
<script>
${PAGE_FLIP_NOTICE}
${inlineScript(pageFlipJs)}
</script>
<script>
${inlineScript(viewerJs)}
</script>
</head>
<body>
<div id="pages">
`;

const HTML_TAIL = `</div>
</body>
</html>
`;

// 현재 책을 HTML 파일로 만든다 (내려받지는 않는다).
export const buildBookHtml = async (
  pages: BookPage[],
  onProgress?: (done: number, total: number) => void
): Promise<Blob> => {
  // 쪽을 하나씩 글로 만들어 Blob 에 이어 붙인다 (큰 책도 하나의 거대한 글을 만들지 않도록)
  const parts: string[] = [htmlHead(pages.length, new Date().toISOString())];
  for (let i = 0; i < pages.length; i++) {
    const small = await shrinkForSave(pages[i].blob);
    parts.push(`<img alt="${i + 1}쪽" src="${await toDataUrl(small)}">\n`);
    onProgress?.(i + 1, pages.length);
  }
  parts.push(HTML_TAIL);
  return new Blob(parts, { type: 'text/html;charset=utf-8' });
};

// 현재 책을 HTML 파일로 내려받는다. 받은 파일의 이름과 크기(바이트)를 돌려준다.
export const savePagesAsHtml = async (
  pages: BookPage[],
  onProgress?: (done: number, total: number) => void
): Promise<{ name: string; bytes: number }> => {
  const file = await buildBookHtml(pages, onProgress);
  const fileUrl = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = fileUrl;
  link.download = makeFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 다운로드가 시작될 시간을 준 뒤 주소 해제
  setTimeout(() => URL.revokeObjectURL(fileUrl), 10_000);
  return { name: link.download, bytes: file.size };
};
