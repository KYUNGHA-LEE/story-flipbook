// "HTML로 저장"한 책 파일 안에 그대로 들어가는 스크립트. (앱의 src/components/FlipBook.tsx 와 같은 방식으로 책을 보여 준다)
// 이 파일은 앱에서 실행되지 않고, 글자 그대로 저장 파일에 담긴다(src/lib/bookHtml.ts). 그래서 오래된 브라우저도 읽을 수 있는 문법만 쓴다.
// 책장 넘김은 함께 담기는 page-flip(St.PageFlip)이 맡는다. 인터넷 연결 없이 파일만으로 열린다.
(function () {
  'use strict';

  var root = document.documentElement;
  // 스크립트가 도는 곳에서는 쪽 그림 목록을 숨기고 넘기는 책으로 보여 준다. 실패하면 이 표시를 떼어 목록이 다시 보이게 한다.
  root.className += ' js';

  var MOBILE_WIDTH = 768; // 이보다 좁으면 한 장씩 보기
  var DEFAULT_RATIO = 1.4; // 그림 크기를 읽지 못했을 때 쓰는 기본 비율 (세로형)

  var srcs = []; // 쪽 그림 주소 (파일 안에 담긴 data URL)
  var ratio = DEFAULT_RATIO; // 책 한 쪽의 세로/가로 비율
  var book = null; // St.PageFlip
  var mobile = false;
  var list = []; // 지금 책에 넣은 쪽 (null = 흰 쪽)
  var blankAdded = false; // PC 에서 뒤표지 앞에 흰 쪽을 넣었는지
  var cur = 0; // 지금 쪽 번호 (list 기준)
  var leaving = false; // 책장을 넘기는 중
  var pageW = 0;
  var pageH = 0;
  var lastW = 0;
  var lastH = 0;
  var ui = null;

  function showList() {
    root.className = root.className.replace(/(^|\s)js(?!\S)/g, '');
    if (ui && ui.stage && ui.stage.parentNode) ui.stage.parentNode.removeChild(ui.stage);
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.appendChild(document.createTextNode(text));
    return node;
  }

  // 그림들의 (세로/가로) 비율 중 가장 많은 비율을 책 한 쪽의 비율로 고른다 (같은 수이면 앞쪽 그림 우선)
  function pickRatio(ratios) {
    var valid = [];
    var i, j, count;
    for (i = 0; i < ratios.length; i++) {
      if (isFinite(ratios[i]) && ratios[i] > 0) valid.push(ratios[i]);
    }
    if (!valid.length) return DEFAULT_RATIO;
    var best = valid[0];
    var bestCount = 0;
    for (i = 0; i < valid.length; i++) {
      count = 0;
      for (j = 0; j < valid.length; j++) {
        if (Math.abs(valid[j] - valid[i]) / valid[i] < 0.03) count++;
      }
      if (count > bestCount) {
        best = valid[i];
        bestCount = count;
      }
    }
    return best;
  }

  function measure(done) {
    var ratios = [];
    var left = srcs.length;
    function one(i) {
      var img = new Image();
      img.onload = function () {
        ratios[i] = img.naturalHeight / img.naturalWidth;
        if (--left === 0) done(ratios);
      };
      img.onerror = function () {
        ratios[i] = 0;
        if (--left === 0) done(ratios);
      };
      img.src = srcs[i];
    }
    for (var i = 0; i < srcs.length; i++) one(i);
  }

  // 화면에 들어가는 가장 큰 한 쪽 크기. PC 는 두 쪽을 나란히 펼치고 양옆에 화살표 자리가 필요하다.
  function fitSize() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var extra = ui.notice.hidden ? 0 : ui.notice.offsetHeight + 16;
    var maxW = mobile ? vw * 0.95 : (vw - 240) / 2;
    var maxH = Math.max(160, vh - 130 - extra);
    var w = Math.max(120, Math.floor(Math.min(maxW, maxH / ratio, 900)));
    pageW = w;
    pageH = Math.floor(w * ratio);
  }

  function makePage(src) {
    var page = make('div', 'page');
    if (src) {
      var img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.src = src;
      page.appendChild(img);
    }
    return page;
  }

  function makeEndPage() {
    var page = make('div', 'page');
    var box = make('div', 'end');
    box.appendChild(make('div', 'mark', '↺'));
    box.appendChild(make('h2', '', '끝까지 다 읽으셨네요!'));
    box.appendChild(make('p', '', '처음부터 다시 보고 싶으신가요?'));
    // 버튼 안에는 글자만 넣는다 (다른 요소가 들어가면 누를 때 책장이 넘어간다)
    var again = make('button', '', '처음으로 돌아가기');
    again.type = 'button';
    again.onclick = goHome;
    box.appendChild(again);
    page.appendChild(box);
    return page;
  }

  // 책 쪽 번호 <-> 그림 번호 (PC 의 흰 쪽, 휴대폰의 "끝" 쪽 때문에 서로 다를 수 있다)
  function imageOfPage(index) {
    var n = srcs.length;
    if (blankAdded) {
      if (index >= n) return n - 1; // 뒤표지
      if (index === n - 1) return n - 2; // 흰 쪽 → 그 앞 그림
    }
    return Math.max(0, Math.min(index, n - 1));
  }
  function pageOfImage(index) {
    if (blankAdded && index === srcs.length - 1) return srcs.length;
    return index;
  }

  function build(startImage) {
    var n = srcs.length;
    mobile = window.innerWidth < MOBILE_WIDTH;
    // PC 는 앞표지 한 장 → 속지 두 장씩 → 뒤표지 한 장. 뒤표지가 한 장으로 보이려면 전체 쪽수가 짝수여야 하므로,
    // 홀수이면 뒤표지 바로 앞에 흰 쪽을 하나 넣는다. 예) 5쪽: [1] [2·3] [4·흰 쪽] [5]
    blankAdded = !mobile && n >= 3 && n % 2 === 1;
    list = blankAdded ? srcs.slice(0, n - 1).concat([null, srcs[n - 1]]) : srcs.slice();
    fitSize();
    lastW = window.innerWidth;
    lastH = window.innerHeight;

    if (book) {
      try {
        book.destroy();
      } catch (err) {
        /* 이미 치워진 책 */
      }
      book = null;
    }
    while (ui.holder.firstChild) ui.holder.removeChild(ui.holder.firstChild);
    // 책 틀의 너비를 정해 준다: 휴대폰은 한 쪽, PC 는 두 쪽
    ui.holder.style.width = (mobile ? pageW : pageW * 2) + 'px';

    var el = make('div', 'flip-book');
    ui.holder.appendChild(el);
    var pages = [];
    var i;
    for (i = 0; i < list.length; i++) pages.push(makePage(list[i]));
    if (mobile) pages.push(makeEndPage()); // PC 는 뒤표지가 한 장으로 끝나도록 붙이지 않는다
    for (i = 0; i < pages.length; i++) el.appendChild(pages[i]);

    cur = pageOfImage(Math.max(0, Math.min(startImage, n - 1)));
    leaving = false;

    book = new St.PageFlip(el, {
      width: pageW,
      height: pageH,
      size: 'fixed',
      maxShadowOpacity: 0.5,
      showCover: !mobile,
      usePortrait: mobile,
      mobileScrollSupport: true,
      useMouseEvents: true,
      swipeDistance: 30,
      showPageCorners: true,
      disableFlipByClick: false,
      clickEventForward: true,
      startPage: cur,
      flippingTime: 800,
      startZIndex: 0,
      autoSize: true
    });
    book.loadFromHTML(pages);
    book.on('flip', function (e) {
      cur = e.data;
      leaving = false;
      render();
    });
    book.on('changeState', function (e) {
      if (e.data === 'flipping') {
        // 표지에서 넘기기 시작하면 책을 미리 가운데로 옮겨 펼침과 함께 움직이게 한다
        leaving = true;
        render();
      } else if (e.data === 'read') {
        // 넘기다 만 경우에도 실제 위치와 맞춘다
        leaving = false;
        cur = book.getCurrentPageIndex();
        render();
      }
    });

    ui.hintText.nodeValue = mobile
      ? '화면을 옆으로 밀어 페이지를 넘겨보세요'
      : '키보드 방향키 또는 마우스 드래그로 페이지를 넘겨보세요';
    // 책을 새로 만들 때는 미끄러지는 움직임 없이 바로 제자리에 놓는다 (처음 열 때 책이 옆에서 밀려 들어오지 않게)
    ui.shifter.style.transition = 'none';
    render();
    void ui.shifter.offsetWidth;
    ui.shifter.style.transition = '';
  }

  function render() {
    var last = list.length - 1;
    var atFirst = cur <= 0;
    var atLast = cur >= last;
    // 표지 한 장만 보일 때(PC)는 그 표지가 화면 가운데에 오도록 책을 반 쪽만큼 옮긴다
    var shift = 0;
    // (앞표지는 책 틀의 오른쪽 절반에, 뒤표지는 왼쪽 절반에 놓인다. 한 쪽뿐인 책은 "마지막 쪽"으로 다뤄져 왼쪽에 놓인다.)
    if (!mobile && list.length === 1) {
      shift = pageW / 2;
    } else if (!mobile && !leaving) {
      if (atFirst) shift = -pageW / 2;
      else if (list.length % 2 === 0 && atLast) shift = pageW / 2;
    }
    ui.shifter.style.transform = 'translateX(' + shift + 'px)';
    // 앞표지에서는 "이전", 뒤표지에서는 "다음"을 숨긴다 (넘길 쪽이 없다)
    ui.prev.hidden = mobile || atFirst;
    ui.next.hidden = mobile || atLast;
    ui.home.hidden = mobile || !atLast || last <= 0;
  }

  function goPrev() {
    if (book) book.flipPrev();
  }
  function goNext() {
    if (book) book.flipNext();
  }
  function goHome() {
    if (!book) return;
    book.turnToPage(0);
    cur = 0;
    leaving = false;
    render();
  }

  function arrow(className, label, path, onClick) {
    var button = make('button', 'nav ' + className);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.innerHTML =
      '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
      path +
      '"/></svg></span>';
    button.onclick = onClick;
    return button;
  }

  function buildStage() {
    ui = {};
    ui.stage = make('div');
    ui.stage.id = 'stage';
    ui.notice = make('p');
    ui.notice.id = 'notice';
    ui.notice.hidden = true;
    ui.shifter = make('div');
    ui.shifter.id = 'shifter';
    ui.holder = make('div');
    ui.prev = arrow('prev', '이전 쪽', 'm15 18-6-6 6-6', goPrev);
    ui.next = arrow('next', '다음 쪽', 'm9 18 6-6-6-6', goNext);
    ui.shifter.appendChild(ui.holder);
    ui.shifter.appendChild(ui.prev);
    ui.shifter.appendChild(ui.next);
    ui.hint = make('div');
    ui.hint.id = 'hint';
    var text = make('span');
    ui.hintText = document.createTextNode('');
    text.appendChild(ui.hintText);
    ui.home = make('button', '', '처음으로 돌아가기');
    ui.home.type = 'button';
    ui.home.id = 'home';
    ui.home.hidden = true;
    ui.home.onclick = goHome;
    ui.hint.appendChild(text);
    ui.hint.appendChild(ui.home);
    ui.stage.appendChild(ui.notice);
    ui.stage.appendChild(ui.shifter);
    ui.stage.appendChild(ui.hint);
    document.body.insertBefore(ui.stage, document.body.firstChild);
  }

  function start() {
    try {
      var holder = document.getElementById('pages');
      var imgs = holder ? holder.getElementsByTagName('img') : [];
      for (var i = 0; i < imgs.length; i++) {
        var src = imgs[i].getAttribute('src') || '';
        if (src.indexOf('data:image/') === 0) srcs.push(src);
      }
      if (!srcs.length || typeof St === 'undefined' || !St.PageFlip) {
        showList();
        return;
      }
      buildStage();

      // 파일이 끝까지 받아지지 않으면 뒤쪽 그림이 없다. 저장할 때 적어 둔 쪽수와 비교해 알려 준다.
      var expected = parseInt(root.getAttribute('data-pages') || '', 10);
      if (expected > srcs.length) {
        ui.notice.appendChild(
          document.createTextNode(
            '끝까지 받아지지 않은 파일입니다. ' +
              expected +
              '쪽 가운데 ' +
              srcs.length +
              '쪽까지만 들어 있습니다. 책 전체를 보려면 파일을 다시 받아 주세요.'
          )
        );
        ui.notice.hidden = false;
      }

      measure(function (ratios) {
        try {
          ratio = pickRatio(ratios);
          build(0);
        } catch (err) {
          showList();
          return;
        }

        document.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowLeft' || e.keyCode === 37) goPrev();
          else if (e.key === 'ArrowRight' || e.keyCode === 39) goNext();
        });

        // 창 크기가 바뀌면 책을 그 크기에 맞게 다시 만든다 (보던 쪽은 그대로).
        // 휴대폰은 주소창이 들락거리며 높이만 바뀌는 일이 잦아서, 너비가 그대로면 다시 만들지 않는다.
        var timer = null;
        window.addEventListener('resize', function () {
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () {
            timer = null;
            var w = window.innerWidth;
            var h = window.innerHeight;
            if (w === lastW && (h === lastH || mobile)) return;
            try {
              build(imageOfPage(cur));
            } catch (err) {
              showList();
            }
          }, 200);
        });
      });
    } catch (err) {
      showList();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
