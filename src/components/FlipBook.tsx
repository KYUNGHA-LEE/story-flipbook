import React, { forwardRef, useEffect, useMemo, useRef, useState, useImperativeHandle, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface PageProps {
  image?: string;
  number?: number;
  blank?: boolean; // 그림 없는 흰 쪽 (뒤표지 안쪽을 채울 때)
  children?: React.ReactNode;
}

const Page = forwardRef<HTMLDivElement, PageProps>((props, ref) => {
  return (
    <div className="bg-white shadow-lg overflow-hidden relative w-full h-full" ref={ref}>
      {props.blank ? null : props.image ? (
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
  // 표지(한 장)에서 책장을 넘기기 시작한 순간 true — 책을 미리 가운데로 옮겨 펼침과 함께 움직이게 한다
  const [leavingCover, setLeavingCover] = useState(false);

  // PC(두 쪽 펼침)에서 책에 넣을 쪽. 앞표지와 뒤표지가 한 장씩 따로 보이려면 전체 쪽수가 짝수여야 하므로,
  // 홀수이면 뒤표지 바로 앞에 흰 쪽(null)을 하나 넣는다. 예) 5쪽: [1] [2·3] [4·흰 쪽] [5]
  const spreadPages = useMemo<(string | null)[]>(() => {
    if (images.length >= 3 && images.length % 2 === 1) {
      return [...images.slice(0, -1), null, images[images.length - 1]];
    }
    return images;
  }, [images]);

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
    setLeavingCover(false);
    playPageTurnSound();
  }, []);

  // 책장이 움직이기 시작할 때(flipping)와 멈췄을 때(read)를 알려 주는 콜백
  const onChangeState = useCallback((e: any) => {
    if (e.data === 'flipping') {
      setLeavingCover(true);
    } else if (e.data === 'read') {
      // 넘기다 만 경우에도 실제 위치와 맞춘다
      setLeavingCover(false);
      const index = bookRef.current?.pageFlip()?.getCurrentPageIndex();
      if (typeof index === 'number') setCurrentPage(index);
    }
  }, []);

  // 화면 모드나 책이 바뀌면 책이 첫 쪽부터 다시 만들어지므로 위치도 처음으로 되돌린다
  useEffect(() => {
    setCurrentPage(0);
    setLeavingCover(false);
  }, [isMobile, aspectRatio, images]);

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

  // PC 는 앞표지 한 장 → 속지 두 장씩 → 뒤표지 한 장으로 보여 준다. 휴대폰은 한 장씩 그대로.
  const pageList: (string | null)[] = isMobile ? images : spreadPages;
  const lastIndex = pageList.length - 1;
  const atFirst = currentPage <= 0;
  const atLast = currentPage >= lastIndex;

  // 표지 한 장만 보이는 상태인지 (PC 만). 넘기기 시작하면 바로 펼친 모양으로 본다.
  const closed: 'front' | 'back' | null =
    isMobile || leavingCover ? null : atFirst ? 'front' : pageList.length % 2 === 0 && atLast ? 'back' : null;
  // 표지 한 장만 보일 때는 그 표지가 화면 가운데에 오도록 책을 반 쪽만큼 옮긴다
  const shiftX = closed === 'front' ? -size.width / 2 : closed === 'back' ? size.width / 2 : 0;

  const pageElements = pageList.map((img, index) =>
    img === null ? <Page key={index} blank /> : <Page key={index} image={img} />
  );
  if (isMobile) {
    // 휴대폰(한 장씩 보기)에서는 마지막에 "끝" 쪽을 붙인다. PC 는 뒤표지가 한 장으로 끝나도록 붙이지 않는다.
    pageElements.push(
      <Page key="the-end">
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
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full py-8">
      <div
        className="relative overflow-visible"
        style={{ transform: `translateX(${shiftX}px)`, transition: 'transform 600ms ease' }}
      >
        {/* @ts-ignore */}
        <HTMLFlipBook
          key={`${isMobile ? 'mobile' : 'desktop'}-${aspectRatio.toFixed(3)}-${pageList.length}`}
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
          onChangeState={onChangeState}
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
          {pageElements}
        </HTMLFlipBook>

        {/* PC 전용 클릭 영역 네비게이션. 책과 함께 움직이므로 표지에서는 표지 바로 옆에 온다.
            앞표지에서는 "이전", 뒤표지에서는 "다음"을 숨긴다(넘길 쪽이 없고, 빈자리 건너편에 떠 있게 되므로). */}
        {!isMobile && (
          <>
            {!atFirst && (
              <div
                className="absolute left-[-100px] top-0 bottom-0 w-[100px] flex items-center justify-center cursor-pointer group"
                onClick={() => bookRef.current?.pageFlip()?.flipPrev()}
              >
                <div className="p-3 rounded-full bg-white/10 backdrop-blur-md group-hover:bg-white/30 transition-all">
                  <ChevronLeft className="w-8 h-8 text-slate-400 group-hover:text-slate-100" />
                </div>
              </div>
            )}
            {!atLast && (
              <div
                className="absolute right-[-100px] top-0 bottom-0 w-[100px] flex items-center justify-center cursor-pointer group"
                onClick={() => bookRef.current?.pageFlip()?.flipNext()}
              >
                <div className="p-3 rounded-full bg-white/10 backdrop-blur-md group-hover:bg-white/30 transition-all">
                  <ChevronRight className="w-8 h-8 text-slate-400 group-hover:text-slate-100" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-slate-400 text-sm">
        <p>키보드 방향키 또는 마우스 드래그로 페이지를 넘겨보세요</p>
        {/* PC 에서는 "끝" 쪽 대신, 마지막 쪽에 이르면 책 아래에 처음으로 돌아가는 버튼을 보인다 */}
        {!isMobile && atLast && lastIndex > 0 && (
          <button
            onClick={goToStart}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            처음으로 돌아가기
          </button>
        )}
      </div>
    </div>
  );
});
