# 동화책 플립북

그림책·동화책·사진첩 이미지를 올리면 실제 종이책을 넘기는 듯한 3D 효과로 보여주는 웹앱입니다.

- 주소: https://story-flipbook.vercel.app
- 이미지는 서버로 보내지 않고 **브라우저 안에서만** 처리합니다. (로그인·저장·링크 공유 기능은 없습니다)
- 올린 이미지의 비율(가로형·세로형·정사각형)에 맞춰 책 크기가 자동으로 정해집니다.
- PC에서는 두 페이지를 펼쳐서, 모바일에서는 한 페이지씩 보여줍니다.
- 책장은 마우스 드래그·클릭·스와이프·키보드 방향키로 넘길 수 있습니다.

## 사용 기술

React · Vite · Tailwind CSS · [react-pageflip](https://github.com/Nodlik/react-pageflip)

## 로컬에서 실행

Node.js가 필요합니다.

```bash
npm install
npm run dev
```

개발 서버는 http://localhost:3000 에서 열립니다.

## 배포

`main` 브랜치에 push 하면 Vercel(프로젝트 `story-flipbook`)이 자동으로 배포합니다.

---

Google AI Studio에서 만든 앱을 바탕으로 수정했습니다.
