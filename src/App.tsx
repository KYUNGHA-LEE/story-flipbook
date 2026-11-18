import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { FlipBook, FlipBookRef } from './components/FlipBook';
import { ShareDialog } from './components/ShareDialog';
import { MySiteGuide } from './components/MySiteGuide';
import { BookOpen, RefreshCw, AlertCircle, Download, FolderOpen, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BookPage, filesToPages, revokePages, savePagesAsJson, loadPagesFromJson, isJsonFile } from './lib/bookFile';
import { idFromLocation, isShareAvailable, loadSharedBook, ShareError, shareErrorText, type SharedInfo } from './lib/shareBook';

// 머리글 오른쪽에 보이는 수정 날짜. 앱을 고칠 때마다 그날 날짜로 바꾼다.
const UPDATED_DATE = '2026.11.18';

// 파일 크기를 "3.2MB" / "850KB" 처럼 보여 준다
const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

// Error Boundary Component
export class ErrorBoundary extends React.Component<any, any> {
  state: any;
  props: any;
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || "알 수 없는 오류가 발생했습니다.";

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-red-100">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4">문제가 발생했습니다</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [pages, setPages] = useState<BookPage[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [busy, setBusy] = useState<'save' | 'load' | null>(null);
  const [saveProgress, setSaveProgress] = useState<string | null>(null); // JSON 저장 중 "줄인 쪽/전체 쪽"
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const flipBookRef = useRef<FlipBookRef>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);

  // 링크 공유: shared = 지금 열린 책의 링크(내가 방금 만들었거나, 링크로 들어와서 연 책)
  const [shared, setShared] = useState<SharedInfo | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedLoading, setSharedLoading] = useState(() => idFromLocation() !== null);
  const sharedLoadStarted = useRef(false);

  // 링크 저장소는 "이 사이트를 올린 사람"의 것만 쓴다. 저장소가 연결된 사이트에서만 [링크 만들기] 버튼을 보인다.
  // null = 아직 확인 중, false = 저장소 없음(원본 사이트 등)
  const [shareEnabled, setShareEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    isShareAvailable().then(ok => {
      if (alive) setShareEnabled(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 주소 뒤에 ?mysite 를 붙여 열면 "내 사이트 만들기" 안내를 보여 준다
  const [guideOpen, setGuideOpen] = useState(() => new URLSearchParams(window.location.search).has('mysite'));
  const closeGuide = () => {
    window.history.replaceState(null, '', window.location.pathname);
    setGuideOpen(false);
  };

  // 플립북은 images 배열이 바뀔 때마다 책 크기를 다시 재므로, 페이지가 바뀔 때만 새 배열을 만든다
  const images = useMemo(() => pages.map(page => page.url), [pages]);

  // 지금 열려 있는 책의 blob URL 해제 후 새 페이지로 교체
  const replacePages = (next: BookPage[]) => {
    revokePages(pages);
    setPages(next);
    setIsReady(next.length > 0);
  };

  // 다른 책으로 바뀌면 앞 책의 링크 정보는 버리고, 주소의 책 번호(?b=)도 지운다
  const forgetShared = () => {
    setShared(null);
    if (idFromLocation() !== null) window.history.replaceState(null, '', window.location.pathname);
  };

  // 주소에 책 번호가 있으면(링크로 들어온 경우) 그 책을 받아 바로 펼친다
  useEffect(() => {
    const id = idFromLocation();
    if (id === null || sharedLoadStarted.current) return;
    sharedLoadStarted.current = true;
    loadSharedBook(id)
      .then(({ pages: loaded, info }) => {
        setPages(loaded);
        setIsReady(true);
        setShared(info);
      })
      .catch(err => {
        setNotice({ type: 'error', text: err instanceof ShareError ? err.message : shareErrorText('server') });
      })
      .finally(() => setSharedLoading(false));
  }, []);

  // 이미지 파일들을 브라우저에서 접근 가능한 URL로 변환하여 상태에 저장
  const handleImagesSelected = (files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      // 업로드 상자에 저장한 책(JSON)을 넣은 경우: 거절하지 않고 그 책을 연다
      const jsonFile = files.find(isJsonFile);
      if (jsonFile) {
        void loadBookFile(jsonFile);
        return;
      }
      setNotice({ type: 'error', text: '이미지 파일이나 저장한 책(JSON) 파일을 선택해 주세요.' });
      return;
    }
    setNotice(null);
    forgetShared();
    replacePages(filesToPages(imageFiles));
  };

  // 다시 업로드하기
  const handleReset = () => {
    setNotice(null);
    forgetShared();
    replacePages([]);
  };

  // 지금 책을 JSON 파일로 저장 (그림은 화면에 알맞은 크기로 줄여 담는다)
  const handleSave = async () => {
    if (busy || pages.length === 0) return;
    setBusy('save');
    setNotice(null);
    try {
      const { bytes } = await savePagesAsJson(pages, (done, total) => setSaveProgress(`${done}/${total}`));
      setNotice({
        type: 'success',
        text: `${pages.length}장짜리 책을 JSON 파일(${formatSize(bytes)})로 저장했습니다. 다운로드 폴더를 확인해 주세요.`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '저장하지 못했습니다.' });
    } finally {
      setBusy(null);
      setSaveProgress(null);
    }
  };

  // 저장해 둔 JSON 파일 하나를 열어 책으로 펼친다 ([불러오기] 버튼과 업로드 상자가 함께 쓴다)
  const loadBookFile = async (file: File) => {
    if (busy) return;
    setBusy('load');
    setNotice(null);
    try {
      const { pages: loaded, incomplete } = await loadPagesFromJson(file);
      forgetShared();
      replacePages(loaded);
      if (incomplete) {
        // 끝이 잘린 파일: 온전한 쪽까지만 열렸다는 것을 분명히 알린다
        setNotice({
          type: 'error',
          text: `끝까지 받아지지 않은 파일입니다. 온전한 ${loaded.length}쪽까지만 열었고, ${loaded.length + 1}쪽부터는 파일에 없습니다. 책 전체를 보려면 파일을 다시 받아 주세요.`,
        });
      }
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '불러오지 못했습니다.' });
    } finally {
      setBusy(null);
    }
  };

  // [불러오기] 버튼으로 고른 JSON 파일
  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 불러오기가 동작하도록 초기화
    if (file) void loadBookFile(file);
  };

  // 키보드 네비게이션 지원
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isReady) return;
      if (e.key === 'ArrowLeft') {
        flipBookRef.current?.prev();
      } else if (e.key === 'ArrowRight') {
        flipBookRef.current?.next();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReady]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      {/* 배경 장식 */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-indigo-50 rounded-full blur-3xl opacity-50" />
      </div>

      {/* 머리글: 왼쪽 앱 이름, 오른쪽 제작자·수정 날짜. 좁은 화면에서는 버튼이 아랫줄로 내려간다 */}
      <header className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap items-center gap-x-4 gap-y-4">
        <div className="flex items-center gap-3 mr-auto">
          <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            FlipBook
          </h1>
        </div>

        {/* 저장해 둔 JSON 을 고르는 입력창 (업로드 화면·책 보기 화면의 불러오기 버튼이 함께 사용) */}
        <input
          ref={loadInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleLoadFile}
          className="hidden"
        />

        <div className="order-last w-full flex flex-wrap items-center gap-3 md:order-none md:w-auto empty:hidden">
          {isReady && (
            <>
              <button
                onClick={handleSave}
                disabled={busy !== null}
                title="그림을 화면에 알맞은 크기로 줄여 파일 하나로 저장합니다"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 border border-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                {busy === 'save' ? `저장 중...${saveProgress ? ` ${saveProgress}` : ''}` : 'JSON으로 저장'}
              </button>
              {(shareEnabled || shared) && (
                <button
                  onClick={() => setShareOpen(true)}
                  disabled={busy !== null}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Link2 className="w-4 h-4" />
                  {shared ? '링크 보기' : '링크 만들기'}
                </button>
              )}
              <button
                onClick={() => loadInputRef.current?.click()}
                disabled={busy !== null}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FolderOpen className="w-4 h-4" />
                {busy === 'load' ? '불러오는 중...' : '불러오기'}
              </button>
              <button
                onClick={handleReset}
                disabled={busy !== null}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4" />
                다른 책 만들기
              </button>
            </>
          )}
        </div>

        <div className="text-right text-xs text-slate-500 leading-snug whitespace-nowrap">
          made by <b className="text-sm font-bold text-slate-600">이경하</b>
          <span className="block mt-0.5 text-[11px] text-slate-400">Claude 수정 · {UPDATED_DATE}</span>
        </div>
      </header>

      {notice && (
        <div className="max-w-7xl mx-auto px-6">
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            className={`flex items-start justify-between gap-4 px-4 py-3 rounded-xl border text-sm ${
              notice.type === 'error'
                ? 'bg-red-50 border-red-100 text-red-700'
                : 'bg-green-50 border-green-100 text-green-700'
            }`}
          >
            <p>{notice.text}</p>
            <button onClick={() => setNotice(null)} className="font-bold shrink-0" aria-label="알림 닫기">
              ×
            </button>
          </div>
        </div>
      )}


      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-160px)]">
        <AnimatePresence mode="wait">
          {guideOpen ? (
            <motion.div
              key="guide"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center"
            >
              <MySiteGuide shareEnabled={shareEnabled} onClose={closeGuide} />
            </motion.div>
          ) : sharedLoading ? (
            <motion.div
              key="shared-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="status"
              className="flex flex-col items-center gap-4 text-slate-500"
            >
              <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm">링크의 책을 불러오는 중…</p>
            </motion.div>
          ) : !isReady ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full flex flex-col items-center gap-8"
            >
              <div className="text-center max-w-xl">
                <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
                  당신의 이야기를 <br />
                  <span className="text-blue-600">입체적인 책</span>으로 만나보세요
                </h2>
                <p className="text-slate-500 text-lg">
                  그림책, 포트폴리오, 사진첩 이미지를 업로드하면 <br />
                  실제 종이 책을 넘기는 듯한 3D 효과를 즉시 적용해 드립니다.
                </p>
              </div>

              <ImageUpload onImagesSelected={handleImagesSelected} />

              <div className="flex flex-col items-center gap-2 -mt-2">
                <button
                  onClick={() => loadInputRef.current?.click()}
                  disabled={busy !== null}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <FolderOpen className="w-4 h-4" />
                  {busy === 'load' ? '불러오는 중...' : '저장한 책(JSON) 불러오기'}
                </button>
                <p className="text-xs text-slate-400">책을 만든 뒤 "JSON으로 저장"으로 내려받은 파일을 다시 열 수 있습니다.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 w-full max-w-4xl">
                {[
                  { title: "원본 비율 그대로", desc: "가로형·세로형·정사각형 이미지에 맞춰 책 크기가 자동으로 정해집니다" },
                  { title: "반응형 뷰어", desc: "PC에서는 양면 펼침, 모바일에서는 단일 페이지 최적화" },
                  { title: "직관적 조작", desc: "스와이프, 클릭, 키보드 단축키를 모두 지원합니다" }
                ].map((feature, i) => (
                  <div key={i} className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-2">{feature.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="viewer"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-col items-center"
            >
              <FlipBook ref={flipBookRef} images={images} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {shareOpen && isReady && (
        <ShareDialog pages={pages} shared={shared} onShared={setShared} onClose={() => setShareOpen(false)} />
      )}

      <footer className="max-w-7xl mx-auto px-6 py-8 text-center text-slate-400 text-sm">
        <p>
          © 2026 3D FlipBook Maker.{' '}
          {shareEnabled || shared
            ? '이미지는 내 기기에서만 처리되고, [링크 만들기]를 누를 때만 인터넷에 올라갑니다.'
            : '모든 이미지는 로컬에서만 처리됩니다.'}
        </p>
      </footer>
    </div>
  );
}
