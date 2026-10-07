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
          className="w-full h-full object-contain select-none pointer-events-none"
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

const DEFAULT_RATIO = 1.4; // 이미지 크기를 읽지 못했을 때 쓰는 기본 비율 (세로형)

// 이미지들의 (세로/가로) 비율 중 가장 많은 비율을 책 한 페이지의 비율로 선택
// (표지만 비율이 달라도 나머지 이미지에 맞춰지도록, 동률이면 앞쪽 이미지 우선)
const pickBookRatio = (ratios: number[]) => {
  const valid = ratios.filter(r => Number.isFinite(r) && r > 0);
  if (valid.length === 0) return DEFAULT_RATIO;

  let best = valid[0];
  let bestCount = 0;
  for (const r of valid) {
    const count = valid.filter(o => Math.abs(o - r) / r < 0.03).length;
    if (count > bestCount) {
      best = r;
      bestCount = count;
    }
  }
  return best;
};

export const FlipBook = forwardRef<FlipBookRef, FlipBookProps>(({ images }, ref) => {
  const bookRef = useRef<any>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [aspectRatio, setAspectRatio] = useState<number | null>(null); // null = 이미지 크기 측정 중
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPageCount, setTotalPageCount] = useState(images.length);

  // 이미지 원본 비율에 책 크기를 자동으로 맞추기 위해 모든 이미지의 크기를 먼저 읽는다.
  // 측정이 끝나기 전에 책을 만들면 잘못된 크기로 고정되므로, 끝난 뒤에 책을 그린다.
  useEffect(() => {
    let cancelled = false;
    setAspectRatio(null);

    Promise.all(
      images.map(
        src =>
          new Promise<number>(resolve => {
            const img = new Image();
            img.onload = () => resolve(img.naturalHeight / img.naturalWidth);
            img.onerror = () => resolve(0);
            img.src = src;
          })
      )
    ).then(ratios => {
      if (!cancelled) setAspectRatio(pickBookRatio(ratios));
    });

    return () => {
      cancelled = true;
    };
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

  // 이미지 비율은 그대로 두고, 화면에 들어가는 가장 큰 한 페이지 크기(너비, 높이) 계산
  // (PC는 두 페이지를 나란히 펼치고 좌우에 화살표 영역이 필요하므로 그만큼 빼고 계산)
  const getBookSize = (ratio: number) => {
    const maxPageWidth = isMobile ? windowSize.width * 0.95 : (windowSize.width - 240) / 2;
    const maxPageHeight = windowSize.height * 0.8;

    // 너비 기준과 높이 기준 중 더 작은 쪽에 맞춘다 (가로형·세로형·정사각형 모두 동일하게 적용)
    const w = Math.min(maxPageWidth, maxPageHeight / ratio, 900);

    return { width: Math.floor(w), height: Math.floor(w * ratio) };
  };

  // 이미지 크기 측정 중에는 책을 만들지 않는다
  if (aspectRatio === null) {
    return (
      <div className="flex items-center justify-center w-full h-full py-24 text-slate-400 text-sm">
        책을 준비하는 중입니다...
      </div>
    );
  }

  const size = getBookSize(aspectRatio);

  // 마지막 페이지 여부 확인 (표지 포함 고려)
  // react-pageflip에서 showCover: true인 경우 페이지 인덱스 계산이 달라질 수 있음
  const isLastPage = currentPage >= images.length - (isMobile ? 1 : 2);

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full py-8">
      <div className="relative shadow-2xl rounded-lg overflow-visible">
        {/* @ts-ignore */}
        <HTMLFlipBook
          key={`${isMobile ? 'mobile' : 'desktop'}-${aspectRatio.toFixed(3)}`}
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
