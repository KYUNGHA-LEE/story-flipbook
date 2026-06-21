import * as React from 'react';
import { useState, useEffect, useRef, Component } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { FlipBook, FlipBookRef } from './components/FlipBook';
import { BookOpen, RefreshCw, Share2, Copy, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, isFirebaseConfigured, auth, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { collection, addDoc, getDoc, getDocs, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { LogIn, LogOut, User as UserIcon, AlertCircle } from 'lucide-react';

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
      let errorMessage = "알 수 없는 오류가 발생했습니다.";
      try {
        if (this.state.error?.message) {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError.error?.includes("insufficient permissions")) {
            errorMessage = "권한이 부족합니다. 로그인 상태를 확인해주세요.";
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

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
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedBookId, setSavedBookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const flipBookRef = useRef<FlipBookRef>(null);

  // Auth 상태 감시
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // URL 파라미터에서 bookId 확인
  useEffect(() => {
    if (!isFirebaseConfigured || !isAuthReady) return;
    const params = new URLSearchParams(window.location.search);
    const bookId = params.get('bookId');
    if (bookId) {
      loadBook(bookId);
    }
  }, [isAuthReady]);

  // Firestore에서 책 데이터 불러오기
  const loadBook = async (bookId: string) => {
    if (!isAuthenticated()) {
      alert('책을 보려면 로그인이 필요합니다.');
      return;
    }
    setIsLoading(true);
    try {
      let bookDoc;
      try {
        bookDoc = await getDoc(doc(db, 'books', bookId));
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `books/${bookId}`);
      }

      if (bookDoc && bookDoc.exists()) {
        let pagesSnap;
        try {
          pagesSnap = await getDocs(query(collection(db, 'books', bookId, 'pages'), orderBy('pageNumber')));
        } catch (e) {
          handleFirestoreError(e, OperationType.LIST, `books/${bookId}/pages`);
        }

        if (pagesSnap) {
          const imageUrls = pagesSnap.docs.map(doc => doc.data().imageData);
          setImages(imageUrls);
          setIsReady(true);
          setSavedBookId(bookId);
        }
      } else {
        alert('존재하지 않는 책입니다.');
      }
    } catch (error) {
      console.error('Error loading book:', error);
      throw error; // Re-throw to be caught by ErrorBoundary
    } finally {
      setIsLoading(false);
    }
  };

  const isAuthenticated = () => !!auth.currentUser;

  // 이미지 파일들을 브라우저에서 접근 가능한 URL로 변환하여 상태에 저장
  const handleImagesSelected = (files: File[]) => {
    const sortedFiles = [...files].sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    
    const urls = sortedFiles.map(file => URL.createObjectURL(file));
    setImages(urls);
    setIsReady(true);
    setSavedBookId(null); // 새로운 이미지가 업로드되면 저장 상태 초기화
  };

  // 이미지를 압축하고 리사이징하는 함수 (Firestore 1MB 제한 해결)
  const compressImage = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 최대 해상도 제한 (가로/세로 최대 1200px)
        const MAX_SIZE = 1200;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // JPEG 형식으로 압축 (품질 0.7)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  // 책 저장하기
  const handleSave = async () => {
    if (!isFirebaseConfigured) {
      alert('Firebase가 설정되지 않아 저장 기능을 사용할 수 없습니다.');
      return;
    }
    if (!isAuthenticated()) {
      try {
        await signInWithGoogle();
      } catch (e) {
        return;
      }
    }
    if (images.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      // 1. 책 메타데이터 저장
      let bookRef;
      try {
        bookRef = await addDoc(collection(db, 'books'), {
          title: 'My FlipBook',
          createdAt: serverTimestamp(),
          authorUid: auth.currentUser?.uid,
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'books');
      }

      if (bookRef) {
        // 2. 각 페이지 저장 (압축 후 저장)
        for (let i = 0; i < images.length; i++) {
          const compressedData = await compressImage(images[i]);
          try {
            await addDoc(collection(db, 'books', bookRef.id, 'pages'), {
              pageNumber: i,
              imageData: compressedData,
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `books/${bookRef.id}/pages`);
          }
        }

        setSavedBookId(bookRef.id);
        // URL 업데이트 (새로고침 없이)
        const newUrl = `${window.location.origin}${window.location.pathname}?bookId=${bookRef.id}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
      }
    } catch (error) {
      console.error('Error saving book:', error);
      throw error; // Re-throw to be caught by ErrorBoundary
    } finally {
      setIsSaving(false);
    }
  };

  // 공유 링크 복사
  const handleCopyLink = () => {
    if (!savedBookId) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?bookId=${savedBookId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  // 다시 업로드하기
  const handleReset = () => {
    // blob URL들 해제
    images.forEach(url => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
    setImages([]);
    setIsReady(false);
    setSavedBookId(null);
    // URL 파라미터 제거
    const newUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <p className="text-slate-600 font-medium">책을 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      {/* 배경 장식 */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-indigo-50 rounded-full blur-3xl opacity-50" />
      </div>

      <header className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              FlipBook
            </h1>
            <p className="text-xs font-medium text-slate-500">Made by 이경하선생님</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-xs font-bold text-slate-700 hidden sm:inline">{user.displayName}</span>
              <button onClick={logout} className="p-1 hover:text-red-500 transition-colors" title="로그아웃">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              로그인
            </button>
          )}

          <div className="flex items-center gap-3">
            {isReady && (
              <>
                {isFirebaseConfigured ? (
                  !savedBookId ? (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-md disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4" />
                          저장 및 링크 생성
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyLink}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-all shadow-md"
                      >
                        {copySuccess ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copySuccess ? '링크 복사됨!' : '링크 복사하기'}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="px-4 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium border border-slate-200">
                    저장 기능 비활성화됨
                  </div>
                )}
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  다른 책 만들기
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-160px)]">
        <AnimatePresence mode="wait">
          {!isReady ? (
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
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 w-full max-w-4xl">
                {[
                  { title: "영구 저장 및 공유", desc: isFirebaseConfigured ? "책을 저장하면 고유 링크가 생성되어 언제든 다시 볼 수 있습니다" : "Firebase 설정이 필요합니다 (현재 비활성화됨)" },
                  { title: "반응형 뷰어", desc: "PC에서는 양면 펼침, 모바일에서는 단일 페이지 최적화" },
                  { title: "직관적 조작", desc: "스와이프, 클릭, 키보드 단축키를 모두 지원합니다" }
                ].map((feature, i) => (
                  <div key={i} className={`p-6 bg-white rounded-2xl border border-slate-100 shadow-sm ${!isFirebaseConfigured && i === 0 ? 'opacity-60 grayscale-[0.5]' : ''}`}>
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

      <footer className="max-w-7xl mx-auto px-6 py-8 text-center text-slate-400 text-sm">
        <p>© 2026 3D FlipBook Maker. 모든 이미지는 로컬에서만 처리됩니다.</p>
      </footer>
    </div>
  );
}
