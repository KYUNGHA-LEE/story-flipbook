import { ExternalLink, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { RETENTION_DAYS } from '../lib/shareBook';

// 이 플립북 사이트를 "내 Vercel 계정"에 복사해 만드는 주소.
// stores 값이 있어야, 복사하는 과정에서 링크 저장소(Vercel Blob · 공개)가 그 사람 계정에 함께 만들어진다.
// (Vercel 문서: https://vercel.com/docs/deploy-button/source)
const SOURCE_REPO = 'https://github.com/KYUNGHA-LEE/story-flipbook';
export const DEPLOY_URL = `https://vercel.com/new/clone?${new URLSearchParams({
  'repository-url': SOURCE_REPO,
  'project-name': 'my-flipbook',
  'repository-name': 'my-flipbook',
  stores: JSON.stringify([{ type: 'blob', access: 'public' }]),
}).toString()}`;

interface MySiteGuideProps {
  shareEnabled: boolean | null; // null = 아직 확인 중
  onClose: () => void;
}

const STEPS = [
  <>아래 <b>[내 사이트 만들기 시작]</b> 버튼을 누릅니다. 새 탭에 Vercel 화면이 열립니다.</>,
  <><b>GitHub 계정</b>으로 로그인합니다. Vercel 이 처음이면 가입 화면이 먼저 나옵니다.</>,
  <>이 플립북의 <b>복사본을 내 GitHub 에</b> 만듭니다. 이름 칸에는 <code className="px-1 bg-slate-100 rounded">my-flipbook</code> 이 들어 있고, 그대로 두어도 됩니다.</>,
  <><b>저장소(Blob)를 만드는 창</b>이 나오면 만듭니다. 공개(Public)로 정해져 있습니다. 링크로 올린 책이 여기에 보관됩니다.</>,
  <>배포가 끝나면 <code className="px-1 bg-slate-100 rounded">…vercel.app</code> 으로 끝나는 <b>내 주소</b>가 나옵니다.</>,
  <>내 주소를 열어 책을 만들면 위쪽에 <b>[링크 만들기]</b> 버튼이 보입니다.</>,
];

// 교육생용 안내: 링크 공유를 쓰려면 이 사이트를 자기 Vercel 계정에 복사해 "내 사이트"를 만든다
export function MySiteGuide({ shareEnabled, onClose }: MySiteGuideProps) {
  return (
    <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8 break-keep">
      <h2 className="text-2xl font-extrabold text-slate-900 mb-3">내 플립북 사이트 만들기</h2>
      <p className="text-slate-600 leading-relaxed mb-5">
        책을 링크로 보내려면 그림을 올려 둘 <b className="text-slate-800">저장소</b>가 필요합니다. 이 사이트를 내 계정에 복사하면 내 저장소와 내 주소가 생기고,
        그 주소에서 [링크 만들기]를 쓸 수 있습니다.
      </p>

      <div
        role="status"
        className={`flex items-start gap-2 px-4 py-3 mb-6 rounded-xl border text-sm leading-relaxed ${
          shareEnabled
            ? 'bg-green-50 border-green-100 text-green-800'
            : 'bg-amber-50 border-amber-100 text-amber-800'
        }`}
      >
        {shareEnabled ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
        <p>
          {shareEnabled === null
            ? '지금 보고 있는 사이트에 저장소가 있는지 확인하는 중…'
            : shareEnabled
              ? '지금 보고 있는 이 사이트에는 링크 저장소가 연결되어 있습니다. 책을 만들면 위쪽에 [링크 만들기] 버튼이 보입니다.'
              : '지금 보고 있는 이 사이트에는 링크 저장소가 없어서 [링크 만들기] 버튼이 보이지 않습니다. 아래 순서로 내 사이트를 만들어 보세요.'}
        </p>
      </div>

      <h3 className="font-bold text-slate-800 mb-2">준비물</h3>
      <ul className="text-sm text-slate-600 leading-relaxed list-disc pl-5 mb-6 space-y-1">
        <li>
          <b className="text-slate-800">GitHub 계정</b> — 없으면 github.com 에서 먼저 가입합니다.
        </li>
        <li>Vercel 은 GitHub 계정으로 가입하고 로그인합니다. 무료 요금제(Hobby)로 만들 수 있습니다.</li>
      </ul>

      <h3 className="font-bold text-slate-800 mb-2">순서</h3>
      <ol className="text-sm text-slate-600 leading-relaxed mb-3 space-y-2">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-slate-400 mb-5">Vercel 화면은 영어로 나오고, 화면 모양은 바뀔 수 있습니다.</p>

      <div className="flex flex-wrap gap-3 mb-8">
        <a
          href={DEPLOY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 border border-blue-600 rounded-lg text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-sm"
        >
          <ExternalLink className="w-4 h-4" />
          내 사이트 만들기 시작
        </a>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          플립북으로 돌아가기
        </button>
      </div>

      <h3 className="font-bold text-slate-800 mb-2">알아 둘 점</h3>
      <ul className="text-sm text-slate-600 leading-relaxed list-disc pl-5 mb-6 space-y-1">
        <li>
          내 사이트 주소를 아는 사람은 <b className="text-slate-800">누구나 그 사이트에서 링크를 만들 수 있고</b>, 그때 내 저장소가 쓰입니다.
        </li>
        <li>링크로 올린 책은 {RETENTION_DAYS}일 뒤 자동으로 지워집니다.</li>
        <li>
          무료 저장소에는 한도가 있습니다(저장 1GB · 한 달 전송 10GB 등, 2026년 11월 Vercel 안내 기준). 한도를 넘으면 30일 동안 저장소가 막혀 이미 만든
          링크도 열리지 않습니다.
        </li>
        <li>얼굴 사진이나 이름·연락처 같은 개인정보가 든 책은 링크로 올리지 마세요.</li>
      </ul>

      <h3 className="font-bold text-slate-800 mb-2">내 사이트에 [링크 만들기] 버튼이 안 보이면</h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        내 주소 뒤에 <code className="px-1 bg-slate-100 rounded">?mysite</code> 를 붙여 열면 이 안내가 나오고, 맨 위에 저장소가 연결되어 있는지 표시됩니다.
        "없다"고 나오면 Vercel 의 내 프로젝트에서 Storage 로 들어가 Blob 저장소(Public)를 만들어 연결한 뒤, 다시 배포(Redeploy)합니다.
      </p>
    </div>
  );
}
