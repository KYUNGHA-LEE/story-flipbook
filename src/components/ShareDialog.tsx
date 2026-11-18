import { useEffect, useRef, useState } from 'react';
import { Link2, Copy, Check, AlertCircle } from 'lucide-react';
import type { BookPage } from '../lib/bookFile';
import { shareBook, ShareError, shareErrorText, RETENTION_DAYS, type SharedInfo, type ShareProgress } from '../lib/shareBook';

interface ShareDialogProps {
  pages: BookPage[];
  shared: SharedInfo | null; // 이미 링크가 있는 책이면 그 링크를 바로 보여 준다
  onShared: (info: SharedInfo) => void;
  onClose: () => void;
}

type Step = 'confirm' | 'working' | 'done' | 'error';

const formatDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

// "링크 만들기" 창: 안내 → 올리는 중 → 링크 보여 주기
export function ShareDialog({ pages, shared, onShared, onClose }: ShareDialogProps) {
  const [step, setStep] = useState<Step>(shared ? 'done' : 'confirm');
  const [progress, setProgress] = useState<ShareProgress | null>(null);
  const [errorText, setErrorText] = useState('');
  const [copied, setCopied] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const working = step === 'working';

  // Esc 로 닫기 (올리는 중에는 닫지 않는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [working, onClose]);

  const start = async () => {
    setStep('working');
    setProgress({ phase: 'prepare', done: 0, total: pages.length });
    try {
      onShared(await shareBook(pages, setProgress));
      setStep('done');
    } catch (err) {
      setErrorText(err instanceof ShareError ? err.message : shareErrorText('server'));
      setStep('error');
    }
  };

  const copyLink = async () => {
    if (!shared) return;
    try {
      await navigator.clipboard.writeText(shared.link);
    } catch {
      // 클립보드 권한이 없으면 입력칸을 선택해 직접 복사할 수 있게 한다
      linkInputRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const percent =
    progress?.phase === 'upload'
      ? 50 + progress.percent / 2
      : progress && progress.total > 0
        ? (progress.done / progress.total) * 50
        : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => {
        if (!working) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 break-keep"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-50 rounded-xl">
            <Link2 className="w-5 h-5 text-blue-600" />
          </div>
          <h2 id="share-title" className="text-lg font-bold text-slate-800">
            {step === 'done' ? '책 링크' : '링크 만들기'}
          </h2>
        </div>

        {step === 'confirm' && (
          <>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              이 책({pages.length}쪽)의 그림을 인터넷에 올리고, 누구나 열어 볼 수 있는 주소를 만듭니다.
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-1.5 mb-5 list-disc pl-5">
              <li>
                <b className="text-slate-800">주소를 아는 사람은 누구나</b> 이 책을 볼 수 있습니다.
              </li>
              <li>얼굴 사진이나 이름·연락처 같은 개인정보가 들어 있으면 올리지 마세요.</li>
              <li>그림은 화면에 맞게 줄여서 올립니다. 내 컴퓨터의 원본은 그대로입니다.</li>
              <li>
                링크는 <b className="text-slate-800">{RETENTION_DAYS}일 동안</b> 열리고, 그 뒤에는 자동으로 지워집니다.
              </li>
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={start}
                className="px-4 py-2 bg-blue-600 border border-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700"
              >
                올리고 링크 만들기
              </button>
            </div>
          </>
        )}

        {step === 'working' && (
          <div role="status" aria-live="polite">
            <p className="text-sm text-slate-700 mb-3">
              {progress?.phase === 'upload'
                ? `올리는 중… ${progress.percent}%`
                : `그림을 준비하는 중… ${progress?.done ?? 0} / ${progress?.total ?? pages.length}`}
            </p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-slate-400">끝날 때까지 이 창을 닫지 마세요.</p>
          </div>
        )}

        {step === 'done' && shared && (
          <>
            <p className="text-sm text-slate-700 mb-3">아래 주소를 복사해서 보내면, 받은 사람이 바로 책을 펼쳐 볼 수 있습니다.</p>
            <div className="flex gap-2 mb-3">
              <input
                ref={linkInputRef}
                readOnly
                value={shared.link}
                onFocus={e => e.currentTarget.select()}
                aria-label="책 링크 주소"
                className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700"
              />
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 shrink-0 px-4 py-2 bg-blue-600 border border-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '복사했습니다' : '복사'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              {shared.expiresAt
                ? `${formatDate(shared.expiresAt)}까지 열립니다. 그 뒤에는 자동으로 지워집니다.`
                : `올린 날부터 ${RETENTION_DAYS}일 동안 열립니다.`}{' '}
              주소를 아는 사람은 누구나 볼 수 있습니다.
            </p>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <div role="alert" className="flex items-start gap-2 px-3 py-3 mb-5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{errorText}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
              <button
                onClick={start}
                className="px-4 py-2 bg-blue-600 border border-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700"
              >
                다시 시도
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
