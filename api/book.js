// 링크로 보기: 책 번호(?id=)를 받아 그 책 파일의 주소와 보관 기한을 알려 준다.
// 화면은 이 주소에서 책 파일을 직접 받아 펼친다(파일 자체는 이 함수를 거치지 않는다).
import { head, del, BlobNotFoundError } from '@vercel/blob';
import { BOOK_ID_RE, bookPath, RETENTION_DAYS } from '../shared/share-config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ error: 'method' });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!BOOK_ID_RE.test(id)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'bad-id' });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'not-configured' });
  }

  try {
    const info = await head(bookPath(id), { token });
    const uploadedAt = new Date(info.uploadedAt).getTime();
    const expiresAt = uploadedAt + RETENTION_DAYS * DAY_MS;

    if (Date.now() > expiresAt) {
      await del(info.url, { token }).catch(() => {});   // 기한이 지났으면 이참에 지운다
      res.setHeader('Cache-Control', 'no-store');
      return res.status(410).json({ error: 'expired' });
    }

    // 같은 책을 여러 사람이 열 때 매번 저장소에 묻지 않도록 10분 동안 기억
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600');
    return res.status(200).json({ url: info.url, size: info.size, uploadedAt, expiresAt });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    if (err instanceof BlobNotFoundError) return res.status(404).json({ error: 'not-found' });
    console.error('book lookup failed', err);
    return res.status(500).json({ error: 'server' });
  }
}
