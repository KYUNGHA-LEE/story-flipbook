// 링크 만들기 1단계: 브라우저가 책 파일 하나를 Vercel Blob 저장소에 직접 올릴 수 있는 "1회용 올리기 허가"를 내준다.
// - 책 파일은 서버를 거치지 않고 브라우저에서 저장소로 바로 올라간다(서버 함수는 4.5MB 넘는 요청을 못 받는다).
// - 허가는 정해진 경로(books/<번호>.flipbook) 하나, 20MB 이하, 10분 동안만 쓸 수 있다.
// - 허가를 내주기 전에 보관 기간이 지난 책을 지우고, 저장소가 거의 찼으면 거절한다.
//   (무료 한도를 넘으면 저장소 전체가 30일 동안 막혀 이미 만든 링크까지 안 열리기 때문)
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { list, del } from '@vercel/blob';
import { BOOK_ID_RE, bookPath, MAX_BOOK_BYTES, RETENTION_DAYS, STORE_LIMIT_BYTES } from '../shared/share-config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// 기한이 지난 책을 지우고, 남은 책의 전체 크기를 돌려준다
async function sweepExpired(token, now) {
  let cursor;
  let totalBytes = 0;
  const expired = [];
  do {
    const page = await list({ prefix: 'books/', limit: 1000, cursor, token });
    for (const blob of page.blobs) {
      if (now - new Date(blob.uploadedAt).getTime() > RETENTION_DAYS * DAY_MS) expired.push(blob.url);
      else totalBytes += blob.size;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (expired.length > 0) await del(expired, { token });
  return totalBytes;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  // 다른 사이트의 화면에서 이 주소를 부르는 것은 받지 않는다
  const origin = req.headers.origin;
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch { /* 형식이 틀린 값 */ }
    if (originHost !== req.headers.host) return res.status(403).json({ error: 'origin' });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(503).json({ error: 'not-configured' });

  const id = req.body && typeof req.body.id === 'string' ? req.body.id : '';
  if (!BOOK_ID_RE.test(id)) return res.status(400).json({ error: 'bad-id' });

  try {
    const now = Date.now();
    const totalBytes = await sweepExpired(token, now);
    if (totalBytes + MAX_BOOK_BYTES > STORE_LIMIT_BYTES) return res.status(507).json({ error: 'store-full' });

    const pathname = bookPath(id);
    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      allowedContentTypes: ['application/octet-stream'],
      maximumSizeInBytes: MAX_BOOK_BYTES,
      validUntil: now + 10 * 60 * 1000,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 24 * 60 * 60,   // 지운 책이 하루 넘게 남아 보이지 않도록
    });
    return res.status(200).json({ token: clientToken, pathname, expiresAt: now + RETENTION_DAYS * DAY_MS });
  } catch (err) {
    console.error('share-upload failed', err);
    return res.status(500).json({ error: 'server' });
  }
}
