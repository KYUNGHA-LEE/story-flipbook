// 화면에 펼친 책의 쪽 목록을 다루는 도구.
// 책을 파일로 내려받는 것은 src/lib/bookHtml.ts ("HTML로 저장")가 맡는다.
// (2026-11-20: "JSON으로 저장"과 "불러오기"를 없앴다. 예전 JSON 파일을 여는 코드도 함께 없앴다.)

// 화면에 보여줄 한 페이지 (url 은 브라우저 안에서만 쓰는 blob 주소)
export interface BookPage {
  name: string;
  blob: Blob;
  url: string;
}

// 이미지 파일들을 이름순(숫자 순서 고려)으로 정렬해 페이지로 만든다
export const filesToPages = (files: File[]): BookPage[] =>
  [...files]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map(file => ({ name: file.name, blob: file, url: URL.createObjectURL(file) }));

export const revokePages = (pages: BookPage[]) => {
  pages.forEach(page => URL.revokeObjectURL(page.url));
};
