// 이 사이트에 링크 저장소(Vercel Blob)가 연결되어 있는지 알려 준다.
// 화면은 이 답을 보고 [링크 만들기] 버튼을 보일지 정한다.
// 저장소는 사이트를 올린 사람의 Vercel 계정에 있는 것만 쓴다 — 연결되지 않은 사이트(원본 사이트 포함)에서는 false.
// 키 자체는 알려 주지 않고, 있는지 없는지만 답한다.
export default function handler(req, res) {
  // 저장소를 연결하면 새로 배포해야 반영되고, 새 배포는 이 기억을 새로 만든다
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  return res.status(200).json({ enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}
