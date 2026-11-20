// 파일 내용을 글자 그대로 가져오는 Vite 의 "?raw" 가져오기 (src/lib/bookHtml.ts 가 저장 파일에 담을 모양·스크립트를 읽을 때 쓴다)
declare module '*?raw' {
  const text: string;
  export default text;
}
