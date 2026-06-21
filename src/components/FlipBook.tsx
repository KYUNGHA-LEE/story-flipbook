import React, { forwardRef, useEffect, useRef, useState, useImperativeHandle, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface PageProps {
  image?: string;
  number?: number;
  children?: React.ReactNode;
}

const Page = forwardRef<HTMLDivElement, PageProps>((props, ref) => {
  return (
    <div className="bg-white shadow-lg overflow-hidden relative w-full h-full" ref={ref}>
      {props.image ? (
        <img
          src={props.image}
          alt="Book Page"
          className="w-full h-full object-fill select-none pointer-events-none"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-50">
          {props.children}
        </div>
      )}
    </div>
  );
});

interface FlipBookProps {
  images: string[];
}

export interface FlipBookRef {
  prev: () => void;
  next: () => void;
}

export const FlipBook = forwardRef<FlipBookRef, FlipBookProps>(({ images }, ref) => {
  const bookRef = useRef<any>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [aspectRatio, setAspectRatio] = useState(1.4); // 기본값 (세로형)
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPageCount, setTotalPageCount] = useState(images.length);

  // 이미지 비율 자동 맞춤을 위해 첫 번째 이미지 로드
  useEffect(() => {
    if (images.length > 0) {
      const img = new Image();
      img.src = images[0];
      img.onload = () => {
        const ratio = img.height / img.width;
        setAspectRatio(ratio);
      };
    }
  }, [images]);

  // 화면 크기 감지 및 모바일 모드 전환 (768px 미만일 때 단일 페이지 모드)
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setWindowSize({ width, height: window.innerHeight });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 부모 컴포넌트(App.tsx)에서 키보드 이벤트 등으로 책장을 넘길 수 있도록 함수 노출
  useImperativeHandle(ref, () => ({
    prev: () => bookRef.current?.pageFlip()?.flipPrev(),
    next: () => bookRef.current?.pageFlip()?.flipNext(),
  }));

  // 페이지 넘김 효과음 트리거 함수
  const playPageTurnSound = () => {
    console.log('페이지 넘김 효과음 재생 트리거');
  };

  // 페이지가 넘어갈 때마다 실행되는 콜백
  const onFlip = useCallback((e: any) => {
    setCurrentPage(e.data);
    playPageTurnSound();
  }, []);

  // 처음으로 돌아가기
  const goToStart = () => {
    bookRef.current?.pageFlip()?.turnToPage(0);
  };

  // 기기 환경에 따른 책의 크기(너비, 높이) 계산
  const getBookSize = () => {
    const maxWidth = isMobile ? windowSize.width * 0.95 : windowSize.width * 0.45;
    const maxHeight = windowSize.height * 0.8;
    
    let w = Math.min(maxWidth, 600);
    let h = w * aspectRatio;
    
    // 높이가 너무 크면 높이 기준으로 너비 재조정
    if (h > maxHeight) {
      h = maxHeight;
      w = h / aspectRatio;
    }
    
    return { width: Math.floor(w), height: Math.floor(h) };
  };

  const size = getBookSize();

  // 마지막 페이지 여부 확인 (표지 포함 고려)
  // react-pageflip에서 showCover: true인 경우 페이지 인덱스 계산이 달라질 수 있음
  const isLastPage = currentPage >= images.length - (isMobile ? 1 : 2);

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full py-8">
      <div className="relative shadow-2xl rounded-lg overflow-visible">
        {/* @ts-ignore */}
        <HTMLFlipBook
          key={isMobile ? 'mobile' : 'desktop'}
          width={size.width}
          height={size.height}
          size="fixed"
          minWidth={200}
          maxWidth={1000}
          minHeight={200}
          maxHeight={1533}
          maxShadowOpacity={0.5}
          showCover={!isMobile}
          mobileScrollSupport={true}
          onFlip={onFlip}
          className="flip-book"
          style={{ margin: '0 auto' }}
          ref={bookRef}
          useMouseEvents={true}
          swipeDistance={30}
          showPageCorners={true}
          disableFlipByClick={false}
          startPage={0}
          flippingTime={800}
          usePortrait={isMobile}
          startZIndex={0}
          autoSize={true}
          clickEventForward={true}
        >
          {images.map((img, index) => (
            <Page key={index} image={img} />
          ))}
          
          {/* 마지막 "The End" 페이지 추가 */}
          <Page>
            <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                <RotateCcw className="w-10 h-10 text-blue-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">끝까지 다 읽으셨네요!</h3>
                <p className="text-slate-500">처음부터 다시 보고 싶으신가요?</p>
              </div>
              <button
                onClick={goToStart}
                className="mt-4 px-8 py-3 bg-blue-600 text-white rounded-full font-bold shadow-lg hover:bg-blue-700 transition-all transform hover:scale-105 active:scale-95"
              >
                처음으로 돌아가기
              </button>
            </div>
          </Page>
        </HTMLFlipBook>

        {/* PC 전용 클릭 영역 네비게이션 */}
        {!isMobile && (
          <>
            <div 
              className="absolute left-[-100px] top-0 bottom-0 w-[100px] flex items-center justify-center cursor-pointer group"
              onClick={() => bookRef.current?.pageFlip()?.flipPrev()}
            >
              <div className="p-3 rounded-full bg-white/10 backdrop-blur-md group-hover:bg-white/30 transition-all">
                <ChevronLeft className="w-8 h-8 text-slate-400 group-hover:text-slate-100" />
              </div>
            </div>
            <div 
              className="absolute right-[-100px] top-0 bottom-0 w-[100px] flex items-center justify-center cursor-pointer group"
              onClick={() => bookRef.current?.pageFlip()?.flipNext()}
            >
              <div className="p-3 rounded-full bg-white/10 backdrop-blur-md group-hover:bg-white/30 transition-all">
                <ChevronRight className="w-8 h-8 text-slate-400 group-hover:text-slate-100" />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-8 flex items-center gap-6 text-slate-400 text-sm">
        <p>키보드 방향키 또는 마우스 드래그로 페이지를 넘겨보세요</p>
      </div>
    </div>
  );
});
