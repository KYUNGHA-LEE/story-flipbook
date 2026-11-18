// 링크 공유 설정 — 화면(src)과 서버 함수(api)가 함께 쓴다. 숫자를 바꾸면 양쪽에 같이 적용된다.

export const BOOK_MAGIC = 'FLIPBK01';                 // 책 파일 맨 앞 8글자 (이 앱이 만든 파일인지 확인)
export const BOOK_ID_RE = /^[a-z0-9]{12}$/;            // 링크의 책 번호 형식
export const bookPath = id => `books/${id}.flipbook`;  // 저장소 안의 파일 경로

export const MAX_PAGES = 60;                           // 링크로 올릴 수 있는 최대 쪽수
export const MAX_BOOK_BYTES = 20 * 1024 * 1024;        // 책 한 권 최대 20MB (줄인 뒤 기준)
export const RETENTION_DAYS = 30;                      // 올린 날부터 보관하는 날수. 지나면 지운다
export const STORE_LIMIT_BYTES = 800 * 1024 * 1024;    // 저장소가 이만큼 차면 새 링크를 받지 않는다 (무료 한도 1GB 전에 멈춤)

export const IMAGE_MAX_EDGE = 1400;                    // 링크로 올릴 때와 JSON으로 저장할 때 그림의 긴 변을 이 크기(px) 이하로 줄인다
export const IMAGE_QUALITY = 0.82;                     // 줄인 그림의 JPEG 품질 (링크·JSON 저장 공통)
