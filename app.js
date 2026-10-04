'use strict';

/* =====================================================================
   나의 기록장
   ---------------------------------------------------------------------
   ✏️ 글자를 바꾸고 싶다면 바로 아래 "1. 설정" 부분만 고치면 돼요.
      - label  : 화면에 보이는 항목 이름
      - options: 고르기 목록 (예: 운동 종류) - 따옴표 안의 글자만 바꾸거나 추가하세요
      - required: true 이면 꼭 써야 하는 칸
   ⚠️ 따옴표(' ')와 쉼표(,)는 지우지 않게 조심해 주세요.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. 설정 (항목 이름과 선택지)
   --------------------------------------------------------------------- */
// 화면에서는 뺐지만, 예전에 적어 둔 값은 지우지 않고 보관하는 칸
const HIDDEN_KEYS = ['minutes'];

// 하루가 바뀌는 시각: 새벽 4시 전에 남긴 기록은 전날 기록으로 쳐요. (자정 기준으로 돌리려면 0)
const DAY_STARTS_AT = 4;

// 연습량(살짝 / 적당히 / 듬뿍). 시간을 숫자로 적지 않고 버튼으로만 골라요.
//   v: 저장되는 값, icon: 버튼과 카드에 보이는 그림, label: 이름
const AMOUNTS = [
  { v: 1, icon: '●○○', label: '살짝' },
  { v: 2, icon: '●●○', label: '적당히' },
  { v: 3, icon: '●●●', label: '듬뿍' },
];

// 화면에서는 뺐지만, 저장된 값은 지우지 않고 보관하는 칸 (종류별: 저장 이름 → 예전 화면 이름)
//   예전 기록과 백업에는 그대로 남아 있고, 그 기록을 수정해서 저장해도 지워지지 않아요. 카드·복사 글·돌아보기에는 나오지 않아요.
const RETIRED = {
  violin: { feedbackId: '오늘 해본 것 연결 (예전)', whatDid: '오늘 한 것', part: '연습한 부분', ask: '레슨 때 물어볼 것', mood: '하고 나서 기분', good: '오늘 잘 된 것', next: '다음에 해볼 것', tempo: '템포 (기록 전체)', homework: '다음 레슨까지 과제 (예전)' },
  workout: { feedbackId: '오늘 해본 것 연결 (예전)', mood: '하고 나서 기분', plan: '🗓 이번 주 표에서 체크해 만든 기록' }, // plan: 루틴표 체크로 자동으로 만든 기록의 표시 = 그 블록 번호+1 (예전에는 true) (고쳐 저장해도 남아요)
  englishArticle: { feedbackId: '오늘 해본 것 연결 (예전)', title: '기사 제목', phrases: '가져갈 표현', speak: '말해 볼 주제로 표시', thought: '내 생각 한 줄 (예전)' },
  art: { srcImage: '원본 사진 (예전)' },
  claudeFeedback: { todo: '해볼 것 (예전)', todoDone: '해봤음 (예전)', todoHidden: '힌트 숨김 (예전)' },
};

// 🎨 그림 종류와 한 기록에 붙일 수 있는 사진 수
//   예전 기록의 "단계"는 종류로 읽어요: 그대로 모작·조금 바꿔 그리기 → 모작, 창작 → 창작, 값이 없으면 모작
const ART_KINDS = ['크로키', '모작', '창작'];
const ART_STAGE_TO_KIND = { '그대로 모작': '모작', '조금 바꿔 그리기': '모작', '창작': '창작' };
const ART_MAX_PHOTOS = 30;

// 🎻 교재 칩의 처음 목록이에요. 그 뒤로는 바이올린 기록 창의 "⚙︎ 교재 관리"에서 더하고·숨기고·순서를 바꿔요. (그 목록은 백업에 함께 들어가요)
const TEXTBOOKS_DEFAULT = ['스즈키 4권'];

/* ---------------------------------------------------------------------
   입력 칸 설정 (SCHEMAS)
   - 위에서부터 차례로 "기본 층"이에요. 항상 보이고, 이것만 채워도 저장돼요.
   - legacy: true 는 예전 칸이에요. 새 기록에서는 안 보이고, 값이 들어 있는 예전 기록을 고칠 때만 보여요. (카드에는 값이 있으면 계속 보여요)
   - only: 해당 종류일 때만 보이는 칸   placeholder: 회색 예시 문장   suggest: true 는 전에 쓴 값을 최근 순으로 제안
   - type: text / textarea / number / date / select / choice(버튼 하나) / multi(칸 여러 개) / bookLines(교재별 한 줄) / image / images
   - keep: 이 창에서 고치지 않아도 그대로 보관할 칸 (복기 창에서 적는 값 등)
   --------------------------------------------------------------------- */
const AMOUNT_FIELD = { key: 'amount', label: '연습량 - 선택', type: 'choice', choices: AMOUNTS, hint: '시간 대신 느낌으로 골라요. 다시 누르면 선택이 풀려요.' };
const WORKOUT_AMOUNT_FIELD = { ...AMOUNT_FIELD, label: '운동량 - 선택' }; // 운동은 "운동량", 바이올린·그림은 "연습량"이에요

const SCHEMAS = {
  // 🧘 운동 기록: 날짜 · 거리 · 운동량 · 한 줄, 이게 전부예요 ("더 적기"는 없어요). 운동은 종류를 나누지 않아요.
  //   예전 기록의 kind(요가·슬로조깅·근력·유산소)는 지우지 않고 그대로 두지만 화면에는 쓰지 않고, 새 기록의 kind 는 '운동'이에요.
  workout: {
    label: '운동 기록',
    keep: [...Object.keys(RETIRED.workout), 'kind'], // 화면에서 뺀 칸(기분 · 종류)의 예전 값은 그대로 보관
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'distance', label: '거리 (km) - 선택', type: 'number', min: 0, step: 0.01, placeholder: '예: 3.2' },
      WORKOUT_AMOUNT_FIELD,
      // 한 줄 (예전 "한 줄 메모", "몸이 어땠나 한 줄", "달리며 든 생각 한 줄"이 모두 여기에 모여요)
      { key: 'memo', label: '한 줄 - 선택', type: 'text', flat: true, placeholder: '예: 퇴근 후 짧게 했다' },
    ],
  },
  // 🎻 바이올린 기록 (연습 / 레슨)
  violin: {
    label: '바이올린 기록',
    kindKey: 'kind',
    keep: ['stage', ...Object.keys(RETIRED.violin)], // 예전에 고른 "이 곡 지금 어디쯤?"(곡 노트에서 보여요)과, 화면에서 뺀 칸(오늘 한 것·연습한 부분·물어볼 것·기분·잘 된 것·다음에 해볼 것·기록 전체 템포)의 예전 값은 이 창에서 고치지 않아도 그대로 보관
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'kind', label: '종류', type: 'select', options: ['연습', '레슨'], required: true },
      // 교재 칩을 켜면 그 교재의 "곡 이름이나 번호" 한 줄 칸이 생겨요. 저장은 books: [{ name, piece, tempo }] (칩 순서). 하루에 기록 하나는 그대로예요.
      //   곡 줄(교재마다 한 줄 + 그 밖에 연습한 곡) 아래에는 템포와 "🎙 녹음 붙이기"가 있어요. 그 밖에 곡의 템포는 otherTempo 에 저장돼요.
      { key: 'books', label: '교재 - 선택', type: 'bookLines', manage: 'books', only: '연습' },
      { key: 'piece', label: '그 밖에 연습한 곡 - 선택', type: 'text', only: '연습', suggest: true, aux: 'other', placeholder: '예: 비발디 a단조 1악장, 자이츠 협주곡 5번' },
      { key: 'otherTempo', label: '그 밖에 연습한 곡의 템포', type: 'number', hidden: true }, // 입력은 "그 밖에 연습한 곡" 줄 아래의 템포 칸에서 해요
      { ...AMOUNT_FIELD, only: '연습' },
      { key: 'feedback', label: '선생님 피드백', type: 'textarea', only: '레슨', placeholder: '예: 활을 줄에 수직으로 두는 연습을 더 하면 좋겠다고 하셨다' },
      { key: 'praise', label: '선생님이 좋다고 한 것', type: 'text', only: '레슨', placeholder: '예: 활 쓰는 자세가 안정적이라고 하셨다' },
      { key: 'newLearn', label: '새로 배운 것 한 줄', type: 'text', only: '레슨', placeholder: '예: 자리를 옮길 때 팔꿈치를 먼저 움직인다' },
      { key: 'hard', label: '어려웠던 점 (예전 칸)', type: 'textarea', only: '연습', legacy: true }, // 예전 값이 있는 기록을 고칠 때만 보여요
    ],
  },
  // ✅ 오늘의 경제 루틴: 하루에 기록 하나. 입력 창 없이 경제 화면에서 바로 체크해요.
  //   checks: { 항목id: true } (한 것만) / letters: 읽은 뉴스레터 / note: 오늘 한 줄
  econRoutine: {
    label: '경제 루틴',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
    ],
  },
  // 🎨 그림 기록 (사진 여러 장 = 기록 하나. 종류는 크로키 / 모작 / 창작). 칸: 사진 · 종류 · 연습량 · 한 줄 · 날짜
  //   예전 칸(image·stage·origin·diff·carry·nextChips·course·refs)은 화면에서 입력 칸으로는 없지만 지우지 않고 보관해요. (상세 창 맨 아래 "예전 메모"로 읽기만 해요)
  art: {
    label: '그림 기록',
    kindKey: 'artKind',
    keep: ['stage', 'origin', 'diff', 'carry', 'nextChips', 'course', 'refs', 'mood', 'srcImage', 'liked', 'next'], // 예전 칸(원본 사진 · 마음에 드는 곳 · 다음에 해볼 것 포함)은 그대로 보관해요
    fields: [
      { key: 'images', label: '사진', type: 'images', noun: '그림 사진', max: ART_MAX_PHOTOS, hint: '여러 장을 한 번에 올리면 기록 하나로 묶여요. ◀ ▶ 로 순서를 바꾸고, 빼기로 한 장씩 뺄 수 있어요.' },
      { key: 'artKind', label: '종류', type: 'choice', choices: ART_KINDS },
      AMOUNT_FIELD,
      { key: 'topic', label: '한 줄 - 선택', type: 'text', placeholder: '예: 손 크로키 1분씩' },
      { key: 'date', label: '날짜', type: 'date', required: true, small: true },
      { key: 'image', label: '내 그림 (예전 칸)', type: 'image', hidden: true }, // 예전에 한 장만 넣던 칸. 동기화가 이미지를 올릴 수 있도록 남겨 두고, 화면에는 나오지 않아요.
      { key: 'srcImage', label: '원본 사진 (예전 칸)', type: 'image', hidden: true }, // 예전 "더 적기"의 원본 사진. 입력 칸은 없어졌지만 동기화가 이미지를 파일로 올릴 수 있도록 남겨 둬요 (화면에는 나오지 않아요).
    ],
  },
  // 📰 영어 기사 (주 1회, 읽고 정리해요): 날짜 · 링크 · 요약 3줄
  englishArticle: {
    label: '영어 기사',
    keep: Object.keys(RETIRED.englishArticle), // 화면에서 뺀 칸(제목·가져갈 표현·말해 볼 주제·내 생각)의 예전 값은 그대로 보관
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'link', label: '기사 링크 - 선택', type: 'text', placeholder: '붙여 넣으면 도메인(예: theguardian.com)이 카드에 나와요' },
      { key: 'sum', label: '요약 3줄 - 선택', type: 'multi', keys: ['sum1', 'sum2', 'sum3'], placeholders: ['1. What happened', '2. Why it matters', "3. What's next / my takeaway"], hint: '영어로 한두 줄만 써도 저장돼요.' },
    ],
  },
  // 💬 클로드에게 받은 피드백: scope('all'|'violin'|'econ'|'english'|'drawing' · 예전에 저장된 'exercise' 도 있어요) / period('day'|'week'|'month'|'card') / rangeStart·rangeEnd / targetId(카드에서 보낸 기록) / question / text(붙여 넣은 답변) / strengths(잘한 점 줄 목록)
  //   (예전에 저장한 todo·todoDone·todoHidden 은 화면에서만 빠졌고 값은 그대로 남아 있어요. RETIRED 참고)
  claudeFeedback: {
    label: '클로드 피드백',
    fields: [
      { key: 'date', label: '받은 날짜', type: 'date' },
      { key: 'question', label: '물어본 것', type: 'text' },
      { key: 'text', label: '받은 답변', type: 'textarea' },
      { key: 'strengths', label: '잘한 점', type: 'text' },
    ],
  },
  // 📒 경제 용어 노트: term(용어) / meaning(내 말로 한 줄). date 는 노트에 처음 적은 날이에요.
  econTerm: {
    label: '경제 용어',
    fields: [
      { key: 'date', label: '적은 날', type: 'date' },
      { key: 'term', label: '용어', type: 'text', required: true },
      { key: 'meaning', label: '내 말로 한 줄', type: 'text' },
    ],
  },
  // 🗓 이번 주 표 (한 주에 기록 하나. id 는 'wp-<그 주 일요일 날짜>', date 는 그 주 일요일): weight(몸무게 kg) / tutor(이번 주만 바꾼 과외 { add, edit, del }) / ex(📥 로 붙여 넣은 그 주 운동 { 요일번호: { blocks } }) / memo(그 주 메모) / skip(체크를 풀어 둔 운동 "요일번호:종류")
  //   운동 체크는 따로 저장하지 않고 운동 기록(type 'workout')에서 읽어요. 설정 값 'tutorBase'(과외 기본 시간표)는 config 로 저장돼요.
  weekPlan: {
    label: '이번 주 표',
    fields: [
      { key: 'date', label: '주 시작(일요일)', type: 'date' },
      { key: 'weight', label: '몸무게 (kg)', type: 'number' },
      { key: 'tutor', label: '이번 주만 바꾼 과외', type: 'text' },
      { key: 'ex', label: '이번 주 운동 (붙여 넣은 것)', type: 'text' },
      { key: 'memo', label: '이번 주 메모', type: 'text' },
      { key: 'skip', label: '체크를 풀어 둔 운동', type: 'text' },
    ],
  },
  // 😴 쉰 날 (쉬는 날도 기록이에요)
  rest: {
    label: '쉰 날',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'memo', label: '메모 - 선택', type: 'text' },
    ],
  },
  // ⚙︎ 설정 값 (교재 목록·클로드 요청 문구처럼 백업에 함께 들어가야 하는 작은 설정. 화면에는 나타나지 않아요)
  config: {
    label: '설정 값',
    fields: [
      { key: 'date', label: '날짜', type: 'date' },
    ],
  },
  // 🎵 곡 메모 (곡 노트 창에서 곡마다 한 줄씩 남겨요. 백업 파일에도 들어가요)
  piecenote: {
    label: '곡 메모',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'piece', label: '곡 이름', type: 'text', required: true },
      { key: 'memo', label: '곡 메모', type: 'text' },
      // 📚 레퍼토리 책장: status 가 'done' 이면 "마무리한 곡"(doneAt 은 마무리한 날). 비어 있으면 연습 중이에요.
      { key: 'status', label: '상태', type: 'text' },
    ],
  },
};

// 메뉴 이름 (위쪽 탭): 📅 캘린더는 항상 맨 앞에 보여요. 아래 탭들은 ⚙ 백업·설정 › "메뉴 보이기"에서 보이기 · 접어 두기 · 순서를 정해요.
//   접어 둔 탭은 메뉴 끝의 ‹ 버튼 안에 있어요. (기록은 숨기지 않아요: 캘린더 · 돌아보기 · 🤖 범위에는 그대로 나와요)
const CAL_TAB = { id: 'cal', label: '📅 캘린더' };
const MENU_TABS = [
  { id: 'week', label: '🗓 이번 주', first: true }, // 캘린더 바로 뒤 (저장된 메뉴 순서에 아직 없으면 맨 앞에 끼워요)
  { id: 'violin', label: '🎻 바이올린' },
  { id: 'econ', label: '📚 경제 루틴' },
  { id: 'english', label: '📰 영어' },
  { id: 'art', label: '🎨 그림' },
];
const MENU_FOLDED_DEFAULT = ['art']; // 처음에는 🎨 그림만 접어 둬요
const TABS = [CAL_TAB, ...MENU_TABS];

// 빈 화면 문구: "다음에 뭘 하면 되는지"만 알려 줘요. (평가나 재촉하는 말은 넣지 않아요. 여기서 고치면 모든 화면에 반영돼요)
const EMPTY_TEXT = {
  feedback: '아직 받은 피드백이 없어요. 위에서 복사해서 클로드에게 물어보세요.', // 📅 캘린더 › 🤖 클로드 피드백 › 받은 피드백
  violin: '아직 기록이 없어요. 위의 + 바이올린 기록으로 오늘 연습을 남겨 보세요. 10분도 괜찮아요.',
  shelf: '곡 이름을 적은 기록이 생기면 여기에 책처럼 꽂혀요.',
  english: '이번 주 기사 하나를 올려 보세요. 세 줄이면 돼요.',
  pastNotes: '저장한 한 줄이 여기에 쌓여요.', // 경제 루틴 "지난 한 줄 보기"
  terms: '새로 알게 된 용어를 내 말로 한 줄씩 적어 보세요. 클로드 피드백에서 알려 준 용어도 좋아요.', // 📒 용어 노트
};
// 캘린더가 시작되는 달 (이 달부터 앞으로 계속 이어져요)
const CALENDAR_START = '2026-01';

// 💮 도장 토스트: 기록을 저장하면 화면 아래에 카드 하나가 잠깐 나타나요.
//   첫 줄 = 그때그때 다른 칭찬 한 줄 / 둘째 줄 = 방금 저장한 내용 · 왼쪽 도장 자리에는 늘 💮 가 찍혀요. (숫자 · 비교 · 할 일 · 재촉하는 말은 넣지 않아요)
//   칭찬은 이 순서로 골라요: ① 그 기록에 맞춘 문장(며칠 만에 다시 · 새 곡 · 또 만난 곡 · 같은 날 다른 영역 …) ② 저장해 둔 클로드 피드백의 "잘한 점" 한 줄 ③ 클로드가 써 준 "도장 문구"(받은 지 STAMP_FRESH_DAYS일 안의 것 먼저) ④ 아래 영역별 기본 문구.
//   기본 문구는 한 바퀴를 다 돌기 전에는 같은 문구가 다시 나오지 않아요(이 기기에만 기억해요). 문구는 마음대로 고치거나 더해도 돼요.
//   workout / practice(바이올린 연습) / lesson / routine(경제 루틴) / english(영어) / art / rest / feedback(받은 피드백 저장) : 영역별 문구
//   general : 위에 없는 종류일 때, night : 밤에 저장했을 때(NIGHT_START시 ~ 다음 날 NIGHT_END시)
const STAMPS = {
  general: ['기록장에 남겨 뒀어요', '도장 꾹!', '잘 적어 뒀어요', '남기는 것만으로 충분해요', '오늘의 기록 완료', '잠깐 숨 돌리기', '이렇게 쌓이는 거예요', '기록장이 반가워해요', '오늘도 여기에 왔어요', '조용히 남겨 뒀어요', '잘 챙겼어요', '이 정도면 충분해요', '오늘의 나를 적어 뒀어요', '천천히 해도 괜찮아요', '기록하는 손이 멋져요', '여기까지 온 것도 기록이에요', '한 칸 남겼어요'],
  practice: ['참 잘했어요', '오늘도 활을 잡았어요', '소리가 쌓이고 있어요', '한 소절 남겼어요', '활이 지나간 자리', '악기를 꺼낸 것부터 멋져요', '오늘의 소리를 담았어요', '줄 위에서 보낸 시간이 소중해요', '손끝이 기억해 둬요', '방 안에 음악이 흘렀어요', '천천히 울려 퍼졌어요', '음 하나하나가 쌓여요', '활 끝까지 정성이 닿았어요', '악기 케이스를 연 것만으로 충분해요', '오늘도 현을 울렸어요', '귀가 조금 더 열렸을 거예요', '활이 노래했어요'],
  lesson: ['레슨 잘 다녀왔어요', '배운 것을 적어 뒀어요', '선생님 말씀을 남겼어요', '새로 배운 걸 챙겼어요', '레슨 기록, 잘 남겼어요', '레슨에서 들은 말이 보물이 돼요', '배움이 한 겹 쌓였어요', '듣고 적는 것도 실력이에요', '배우러 가는 발걸음이 멋져요', '선생님 말씀이 기록장에 안착했어요', '오늘 배운 것, 잘 모셔 뒀어요', '레슨 다녀온 나에게 박수', '잘 듣고 왔어요', '배운 건 이제 내 거예요', '수업 뒤 정리까지 해냈어요', '레슨 시간을 알차게 썼어요'],
  workout: ['몸이 고마워해요', '몸을 한번 풀었어요', '숨을 크게 쉬었어요', '오늘도 몸을 챙겼어요', '한 걸음 남겼어요', '몸이 기억해요', '움직인 것만으로 충분해요', '근육이 웃고 있어요', '몸과 친해지는 시간이었어요', '가볍게 움직여서 좋았어요', '땀 한 방울도 기록이에요', '몸을 돌봐 준 하루예요', '기지개부터 시작해도 괜찮아요', '잘 움직였어요', '숨이 편해졌을 거예요', '내 몸에게 인사했어요', '몸이 가벼워지는 시간이에요'],
  routine: ['오늘도 한 걸음', '오늘의 경제 한 칸', '가볍게 체크했어요', '흐름 하나 잡았어요', '차곡차곡 쌓여요', '오늘도 체크했어요', '세상 돌아가는 걸 살짝 들여다봤어요', '귀와 눈이 한 뼘 넓어졌어요', '경제 공부 습관이 자라요', '가볍게 접해도 남는 게 있어요', '오늘의 경제 감각 충전', '알아가는 중이에요', '뉴스 한 모금, 잘 마셨어요', '공부할 시간을 내 줬어요', '조금씩 익숙해지고 있어요', '오늘도 세상을 읽었어요', '경제 한 칸을 챙겼어요'],
  english: ['기사 하나 읽었어요', '영어 한 줄 남겼어요', '오늘도 영어 한 칸', '읽고 정리했어요', '영어 감을 켜 뒀어요', '요약까지 해냈어요', '핵심을 잘 짚었어요', '읽는 눈이 즐거웠어요', '내 말로 정리했어요', '문장 사이를 잘 걸었어요', '기사 한 편의 여유', '영어와 오늘도 만났어요', '생각까지 담았어요', '읽은 것을 남겼어요', '잘 읽고 잘 정리했어요', '영어 근육을 살짝 썼어요'],
  art: ['오늘도 그렸어요', '선 하나 더 그었어요', '손이 움직였어요', '그림 한 칸 남겼어요', '종이 위에 오늘이 남았어요', '눈과 손이 만났어요', '연필 소리가 들리는 것 같아요', '색이든 선이든 충분해요', '그리는 시간이 반짝였어요', '오늘의 선을 모아 뒀어요', '손끝에서 풍경이 나왔어요', '그림 앞에 앉은 것만으로 멋져요', '자유롭게 그은 선이 좋아요', '마음을 한 장에 담았어요', '이 그림, 잘 간직해 뒀어요', '그린 만큼 눈이 열려요'],
  rest: ['쉬는 것도 기록이에요', '충전하는 날이에요', '푹 쉬었어요', '쉬는 날도 기록이에요', '오늘은 쉬어 가요', '쉼도 연습의 일부예요', '아무것도 안 해도 괜찮아요', '잘 쉬는 것도 재주예요', '내일의 힘을 모으는 날', '숨 고르는 하루', '편안한 하루를 남겼어요', '쉬어야 오래 가요', '오늘은 나를 돌본 날', '느긋하게 보냈어요', '푹 자고 푹 쉬었어요', '쉼표를 찍었어요'],
  feedback: ['피드백, 잘 받아 뒀어요', '잘한 점을 담아 뒀어요', '읽을거리 하나 쌓였어요', '답변을 잘 챙겼어요', '피드백 한 칸 남겼어요', '칭찬을 잘 모셔 뒀어요', '좋은 말이 기록장에 들어왔어요', '다시 읽고 싶은 답변이에요', '잘한 점이 반짝여요', '응원을 받아 왔어요', '받아 적는 마음이 예뻐요', '답변 속 잘한 점, 저장 완료', '돌아볼 거리가 생겼어요', '기록장에 응원이 도착했어요', '귀한 말씀 잘 챙겼어요', '잘 받아 두었어요'],
  night: ['늦은 밤까지 수고했어요', '오늘 하루도 잘 마무리했어요', '밤에도 남겼어요', '이제 쉬어도 돼요', '오늘 하루도 여기까지', '이제 푹 쉬어요', '고요한 밤에 남겼어요', '하루의 끝에 기록장을 열었어요', '밤이 깊어도 챙겼어요', '불을 끄기 전에 남겼어요', '오늘도 정말 애썼어요', '별빛 아래 마무리했어요', '잘 자요, 오늘도 수고했어요', '늦어도 괜찮아요, 남겼으니까요', '하루를 잘 접었어요', '포근한 밤이에요', '오늘 밤은 편히 쉬어요'],
};
const STAMP_FRESH_DAYS = 10; // 클로드가 써 준 "도장 문구"는 받은 지 이만큼 날 안의 것을 먼저 써요
// 💮 도장 모음판에 찍히는 작은 그림: 기록을 저장할 때 영역마다 하나를 골라 기록에 남겨 둬요. (토스트의 도장 자리에는 늘 💮)
const STAMP_ICONS = {
  general: ['🌱', '📌', '🍀', '☕', '✨', '📓'],
  practice: ['🎻', '🎼', '🎶'], lesson: ['🎓', '📝', '🎼'], workout: ['🧘', '🌿', '🍃', '☀️', '🏃'],
  routine: ['🎧', '📮', '📰', '✅', '💡'], english: ['📰', '✍', '🔤', '☕'], art: ['🎨', '✏️', '🖌️'], rest: ['😴'],
  night: ['🌙', '⭐', '🌃', '🛌'],
};
const NIGHT_START = 22; // 밤 10시부터
const NIGHT_END = 4;    // 새벽 4시 전까지는 밤 문구를 써요 (하루가 바뀌는 시각 DAY_STARTS_AT 과 같아요)
const STAMP_TOAST_MS = 3500; // 도장 토스트가 보이는 시간 (누르면 바로 닫혀요)

// "그때의 나": 캘린더 아래에, 몇 달 전 오늘의 기록이 있으면 하나만 보여줘요. (위에서부터 먼저 있는 것 하나)
const MEMORY_LOOKBACKS = [{ months: 1, label: '한 달 전' }, { months: 3, label: '석 달 전' }, { months: 12, label: '1년 전' }];

// 사진을 저장할 때 긴 변의 최대 크기(픽셀). 커질수록 선명하지만 저장 공간을 더 써요.
const IMAGE_MAX_SIZE = 1600;

// ✅ 오늘의 경제 루틴 (경제 화면의 체크 목록)
//   id: 저장되는 이름 (한 번 정하면 바꾸지 마세요)  icon: 그림  label: 화면에 보이는 이름  chips: 읽은 것을 눌러 표시하는 칩 (있으면 체크 옆에 나타나요)
//   항목을 더하거나 빼도 예전 기록은 그대로예요. (목록에 없는 id는 화면에서 조용히 무시돼요)
const ECON_ROUTINES = [
  { id: 'podcast', icon: '🎧', label: '경제 팟캐스트 듣기' },
  { id: 'newsletter', icon: '📮', label: '뉴스레터 읽기', chips: ['잘쓸레터', '머니레터'] },
];

// 🎙 녹음: 한 곡에 붙일 수 있는 개수, 한 파일의 최대 길이(초)와 크기(바이트)
//   곡마다 처음 올린 녹음("🌱 첫 녹음")은 항상 보관되고 백업 파일에도 들어가요. 나머지는 이 브라우저 안에만 저장돼요.
const AUDIO_MAX_PER_PIECE = 5;
const AUDIO_MAX_SECONDS = 300;              // 5분
const AUDIO_MAX_BYTES = 15 * 1024 * 1024;   // 15MB

// 🍂 계절 장식: 달마다 위쪽 제목 옆과 화면 오른쪽 아래 모서리에 이모지 하나가 나타나요. (1월부터 12월 순서. 마음대로 바꿔도 돼요)
const SEASON_DECOR = ['⛄', '🧣', '🌱', '🌸', '🌿', '☔', '🍉', '🌻', '🌾', '🍂', '🍁', '❄️'];

// 🤖 클로드 피드백: 범위마다 "내 정보"와 "요청 문구"의 처음 값이에요. (화면의 "✎ 내 정보·요청 문구"에서 고치면 그 값이 우선이고, 백업에도 들어가요.
//   내가 고친 문구는 건드리지 않고, 기본값 그대로인 것만 새 기본값을 따라가요)
//   복사되는 글 순서: 내 정보 → 요청 문구 + 공통 답변 형식 → 이번에 특히 물어볼 것 → 지난번 피드백에서(잘한 점 한 줄) → 기록 본문 → 요약 한 줄
//   🌈 전체는 기록이 있는 영역만 "── 🎻 바이올린 ──" 처럼 나누어 한 글로 모아요.
const CLAUDE_SCOPES = [
  { id: 'all', icon: '🌈', label: '전체',
    info: '여러 취미를 기록하고 있어요. 바이올린(메인 취미), 경제 공부 루틴, 영어 기사 요약, 그림(사이드). 완벽주의 때문에 쉬었다 하다를 반복해 온 편이라, 조금씩이라도 꾸준히 쌓는 게 목표예요. 평일은 밤 11시쯤 일이 끝나요.',
    request: "맨 위에 '이번 기간 한 줄 총평'을 쓰고, 기록이 있는 영역만 영역별로 잘한 점과 달라진 점을 짧게 써 줘. 경제 영역은 한 줄 메모에 나온 개념을 쉽게 풀어 줘." },
  { id: 'violin', icon: '🎻', label: '바이올린',
    info: '바이올린 취미 4년차(메인 취미). 비브라토를 배우는 중이고, 쉬었다 하다를 반복해서 기본기가 얕은 편이에요. 교재와 곡은 기록에 나와요. 평일엔 밤늦게 짧게 연습해요.',
    request: '교재·곡별로 연습 흐름을 봐 주고, 곡별 템포가 바뀌었으면 짚어 줘.' },
  { id: 'econ', icon: '📚', label: '경제 루틴',
    info: '경제 공부 입문 중이에요. 경제 팟캐스트와 뉴스레터(잘쓸레터, 머니레터)로 루틴을 만들고 있어요.',
    request: "한 줄 메모에 나온 경제 개념을 하나씩 쉽게 풀어 줘(왜 그런지 + 내 생활·돈과 어떻게 이어지는지, 2~3줄). 메모가 질문이면 답도 간단히, 잘못 이해한 부분이 있으면 부드럽게 바로잡아 줘. 용어 노트에 적어 둘 만한 용어가 있으면 '용어 — 쉬운 설명' 형식으로 1~2개 알려 줘." },
  { id: 'english', icon: '📰', label: '영어',
    info: '영어 강사라 영어는 능숙한 편이에요. 주 1회 기사를 읽고 3줄 요약으로 감을 유지해요.',
    request: '요약이 기사 핵심을 잘 잡았는지 봐 주고, 더 자연스럽게 고친 버전을 짧게 보여 줘.' },
  { id: 'drawing', icon: '🎨', label: '그림',
    info: '그림은 사이드 취미. 이제 크로키부터 주 1~2회 그리려고 함. 모작 위주였고, 창작할 실력을 키우는 게 목표.',
    request: '올린 그림을 보고 잘한 점과 달라진 점을 봐 줘.' },
];
// 모든 요청 문구 끝에 자동으로 붙는 공통 답변 형식 (읽는 즐거움과 쌓이는 기록으로만 남도록: 점수·평가·할 일은 빼 달라고 해요)
const CLAUDE_COMMON = "답변은 이 순서로 써 줘.\n1. 잘한 점: 기록에서 근거를 들어 구체적으로 1~2개.\n2. 달라진 점·패턴: 지난번 피드백 이후 바뀐 것, 기록에서 보이는 흐름을 1~2개. 숫자(템포·거리·횟수)가 바뀌었으면 꼭 짚어 줘.\n따뜻하되 핵심만, 항목마다 2~3줄 이내로. 점수·평가, '더 해야 한다'거나 '다음엔 이렇게 하라'는 말은 빼 줘. 할 일을 주지 말고, 지금까지 한 것을 봐 줘.";
// 복사하는 글 맨 끝에 붙는 부탁: 답변 끝에 "도장 문구:" 줄을 써 달라고 해요. 받은 답변을 저장할 때 이 줄들을 읽어 💮 도장 칭찬으로 써요.
const CLAUDE_STAMP_ASK = "마지막에 '도장 문구:' 아래에 다음 기록 때 도장에 쓸 짧은 칭찬 문구 6개를 한 줄에 하나씩(20자 안팎, 이번 기록 내용을 살려서, 숫자·비교·할 일 없이) 써 줘.";
// 예전 기본값 (이 글 그대로 저장돼 있으면 "고치지 않은 것"으로 보고 새 기본값을 따라가요. 조금이라도 고친 문구는 그대로 남아요)
const CLAUDE_OLD_DEFAULTS = {
  all: {
    info: ['여러 취미를 기록하고 있어요. 바이올린(메인 취미), 요가·슬로조깅, 경제 공부 루틴, 영어 기사 요약, 그림(사이드). 완벽주의 때문에 쉬었다 하다를 반복해 온 편이라, 조금씩이라도 꾸준히 쌓는 게 목표예요. 평일은 밤 11시쯤 일이 끝나요.',
      '여러 취미를 기록하고 있어요. 바이올린(메인 취미), 운동, 경제 공부 루틴, 영어 기사 요약, 그림(사이드). 완벽주의 때문에 쉬었다 하다를 반복해 온 편이라, 조금씩이라도 꾸준히 쌓는 게 목표예요. 평일은 밤 11시쯤 일이 끝나요.'],
  },
  violin: {
    info: ['바이올린 취미 4년차(메인 취미). 스즈키 4권 수준. 지금 비브라토 배우는 중. 쉬었다 하다를 반복해서 기본기가 얕고 연습량도 많지 않음. 평일은 밤늦게 짧게 연습하는 편.'],
    request: ['아래 기록을 보고 부담 없는 다음 연습을 제안해 줘.'],
  },
  econ: {
    info: ['경제 공부 입문 중. 경제 팟캐스트와 뉴스레터(잘쓸레터, 머니레터)로 루틴을 만드는 중.'],
    request: ['아래 기록과 한 줄 메모를 보고 이번 흐름을 쉽게 정리해 주고, 다음에 눈여겨볼 것 하나를 알려 줘.'],
  },
  drawing: {
    request: ['원본과 내 그림(첨부)을 비교해서 다음에 연습할 것을 알려 줘.'],
  },
  english: {
    info: ['영어 강사라 영어는 능숙한 편. 주 1회 기사를 읽고 3줄 요약으로 감을 유지하는 중.'],
    request: ['요약을 더 자연스럽고 간결하게 고쳐 주고 바꾼 이유를 짧게 알려 줘. 기사를 직접 확인할 수 있으면 요약 내용이 맞는지도 봐 줘.'],
  },
};


/* ---------------------------------------------------------------------
   2. 작은 도구들 (날짜, 글자 처리)
   --------------------------------------------------------------------- */
const pad = (n) => String(n).padStart(2, '0');
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toStr(d); };
// 오늘 날짜 (새벽 DAY_STARTS_AT시 전이면 아직 어제로 쳐요)
const todayStr = () => {
  const d = new Date();
  if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1);
  return toStr(d);
};
// 🗓 한 주는 일요일부터 토요일까지예요. 주 키는 "그 주 일요일 날짜"(예: 2026-10-04)이고, 월요일 날짜나 ISO 주('2026-W41')로 적힌 값도 같은 주의 일요일로 읽어요.
const weekStartOf = (s) => addDays(s, -parseDate(s).getDay());
function weekKey(v) {
  const iso = /^(\d{4})-W(\d{2})$/.exec(String(v || ''));
  if (iso) { const jan4 = new Date(Number(iso[1]), 0, 4); const mon = new Date(jan4); mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (Number(iso[2]) - 1) * 7); return weekStartOf(toStr(mon)); } // ISO 주(월요일 시작) → 그 월요일이 든 일~토 주
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? weekStartOf(v) : '';
}
// "10월 2주 (10/4~10/10)": 달은 그 주의 목요일이 든 달, N주는 그 달의 첫 목요일이 든 주를 1주로 세요.
function weekLabel(sunday) {
  const thu = parseDate(addDays(sunday, 4));
  const f = (d) => { const x = parseDate(d); return `${x.getMonth() + 1}/${x.getDate()}`; };
  return `${thu.getMonth() + 1}월 ${Math.ceil(thu.getDate() / 7)}주 (${f(sunday)}~${f(addDays(sunday, 6))})`;
}
const dayLabel = (s) => {
  const d = parseDate(s);
  const y = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}년 `;
  return `${y}${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
};
const shortDay = (s) => { const d = parseDate(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

const fmtNum = (n) => (Math.round(n * 100) / 100).toString();
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
const byOldest = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0);

// 여러 줄 글자를 화면에 안전하게 보여주기 (내용이 비어 있으면 아무것도 안 보여줘요)
function textBlock(label, value) {
  if (!value) return '';
  return `<div class="label">${esc(label)}</div><p class="pre">${esc(value)}</p>`;
}

// 링크 목록: http(s)로 시작하거나 주소처럼 보이는 줄만 클릭 가능한 링크로 바꿔요
function linksBlock(text, label = '참고 링크') {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const html = lines.map((line) => {
    let url = null;
    if (/^https?:\/\/\S+$/i.test(line)) url = line;
    else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(line)) url = `https://${line}`;
    return url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(line)}</a>`
      : esc(line);
  }).join('<br>');
  return `<div class="label">${esc(label)}</div><p class="pre links">${html}</p>`;
}

// 칸에 값이 들어 있는지 (글자·목록·숫자 모두)
const hasValue = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? v > 0 : typeof v === 'string' ? v.trim() !== '' : !!v);
// 카드·창에서 "- 선택" 꼬리는 떼고 보여줘요
const cleanLabel = (l) => String(l).replace(/\s*-\s*선택$/, '').replace(/\s*\(예전 칸\)$/, '');
// 자동완성용: 그 종류의 기록에서 전에 쓴 값을 최근 순으로 (같은 값은 한 번만)
function suggestions(type, key) {
  const seen = new Set();
  const out = [];
  ofType(type).filter((r) => typeof r[key] === 'string' && r[key].trim()).sort(byNewest).forEach((r) => {
    const v = r[key].trim();
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  });
  return out.slice(0, 40);
}
// 다른 곳(기능 확장 프로젝트)에서 만든 기록은 연습량이 글자로 들어 있어요. 이 앱의 값으로 맞춰서 읽어요.
const LEGACY_AMOUNT = { '살짝': 1, '약간': 1, '적당히': 2, '중': 2, '듬뿍': 3, '많이': 3 };
function normalizeRecord(r) {
  if (typeof r.amount === 'string' && r.amount !== '') r.amount = LEGACY_AMOUNT[r.amount.trim()] || Number(r.amount) || '';
  return r;
}

/* ---------------------------------------------------------------------
   3. 저장소
      기본: 브라우저의 IndexedDB (그림 이미지도 저장 가능)
      IndexedDB를 못 쓰는 환경이면 localStorage로 대신 저장해요.
   --------------------------------------------------------------------- */
const Store = {
  mode: 'indexeddb',
  db: null,

  async init() {
    try {
      if (!window.indexedDB) throw new Error('no indexedDB');
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('my-journal', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('records', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
    } catch (err) {
      this.mode = 'localstorage';
      try { localStorage.getItem('x'); } catch (e2) { this.mode = 'memory'; }
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  },

  _tx(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('records', mode);
      const store = tx.objectStore('records');
      const result = fn(store);
      tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('aborted'));
    });
  },

  // 다른 사이트와 같은 주소(예: 내아이디.github.io)를 쓰더라도 섞이지 않도록 이름에 앱 이름을 넣어요. (예전 이름 'journal.records'는 읽어서 옮겨요)
  _lsRead() {
    try {
      const cur = localStorage.getItem('my-journal.records');
      return JSON.parse(cur !== null ? cur : (localStorage.getItem('journal.records') || '[]'));
    } catch (e) { return []; }
  },
  _lsWrite(list) { localStorage.setItem('my-journal.records', JSON.stringify(list)); try { localStorage.removeItem('journal.records'); } catch (e) { /* 괜찮아요 */ } },
  _mem: [],

  async all() {
    if (this.mode === 'indexeddb') return this._tx('readonly', (s) => s.getAll());
    return this.mode === 'localstorage' ? this._lsRead() : this._mem.slice();
  },
  async get(id) { // 한 줄만 꺼내요 (동기화 정보 같은 작은 것용)
    if (this.mode === 'indexeddb') return this._tx('readonly', (s) => s.get(id));
    return (this.mode === 'localstorage' ? this._lsRead() : this._mem).find((r) => r.id === id);
  },
  async putMany(list, opts = {}) {
    await this._putMany(list);
    if (list.some((r) => r.type !== 'meta')) { // 설정 저장만으로는 동기화를 하지 않아요
      if (!opts.silent && window.Sync) window.Sync.notify(); // ☁ 동기화(sync.js). silent 는 동기화가 가져온 것을 쓸 때예요
    }
  },
  async remove(ids) {
    await this._remove(ids);
  },
  async _putMany(list) {
    if (this.mode === 'indexeddb') return this._tx('readwrite', (s) => { list.forEach((r) => s.put(r)); });
    const map = new Map((this.mode === 'localstorage' ? this._lsRead() : this._mem).map((r) => [r.id, r]));
    list.forEach((r) => map.set(r.id, r));
    const merged = [...map.values()];
    if (this.mode === 'localstorage') this._lsWrite(merged); else this._mem = merged;
  },
  async _remove(ids) {
    if (this.mode === 'indexeddb') return this._tx('readwrite', (s) => { ids.forEach((id) => s.delete(id)); });
    const keep = (this.mode === 'localstorage' ? this._lsRead() : this._mem).filter((r) => !ids.includes(r.id));
    if (this.mode === 'localstorage') this._lsWrite(keep); else this._mem = keep;
  },
};

/* ---------------------------------------------------------------------
   3-2. 녹음 저장소
      녹음 파일은 용량이 커서 기록(records)과 다른 IndexedDB('my-journal-audio')에 파일 그대로 저장해요.
      (기록이 든 'my-journal' 저장소는 건드리지 않아서, 예전 기록과 백업은 그대로 열려요.)
   --------------------------------------------------------------------- */
const AudioStore = {
  db: null,
  ok() { return !!this.db; },
  async init() {
    if (Store.mode !== 'indexeddb') return;
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('my-journal-audio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('audio', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
    } catch (e) { this.db = null; }
  },
  _tx(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('audio', mode);
      const out = fn(tx.objectStore('audio'));
      tx.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('aborted'));
    });
  },
  all() { return this.ok() ? this._tx('readonly', (s) => s.getAll()) : Promise.resolve([]); },
  get(id) { return this._tx('readonly', (s) => s.get(id)); },
  put(rec) { return this._tx('readwrite', (s) => { s.put(rec); }); },
  remove(ids) { return this._tx('readwrite', (s) => { ids.forEach((id) => s.delete(id)); }); },
  clear() { return this.ok() ? this._tx('readwrite', (s) => { s.clear(); }) : Promise.resolve(); },
  // 한 줄을 읽고 고치는 일을 한 번에 해요. (☁ 동기화와 화면이 같은 녹음을 동시에 고쳐도 서로 덮어쓰지 않게요)
  //   fn(옛 줄 또는 undefined) → 새 줄 / null 이면 지워요 / undefined 면 그대로 둬요. fn 은 바로 끝나는 함수여야 해요.
  update(id, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('audio', 'readwrite');
      const store = tx.objectStore('audio');
      let result;
      const req = store.get(id);
      req.onsuccess = () => {
        result = fn(req.result);
        if (result === null) store.delete(id); else if (result !== undefined) store.put(result);
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('aborted'));
    });
  },
};

/* ---------------------------------------------------------------------
   4. 앱 상태
   --------------------------------------------------------------------- */
let records = [];   // 전체 기록 (메모리에 복사해 두고 화면에 사용)
let audios = [];    // 녹음 정보 (파일 자체는 빼고 이름·날짜·메모만. 파일은 재생할 때 꺼내 와요)
//   local: 이 기기에 파일이 있나 (☁ 로 다른 기기에서 정보만 받은 녹음은 false 예요) · rf: Drive에 올라간 파일의 id · updatedAt: 바꾼 시각
let audioTombs = []; // 지운 녹음의 "삭제 표시" (☁ 동기화용. 기록의 삭제 표시와 같은 방식으로 60일 남아요)
// 마지막 백업 날짜, 축하 한 줄 끄기, 녹음을 백업에서 빼기, 계절 장식 끄기, 업데이트 정리를 이미 했는지(cleanupV2 · cleanupV3 · artKindV1 · workoutLiteV1 · quickFlagV1 · weekLegacyV1),
// 캘린더 아래 '🤖 클로드 피드백'을 펼쳐 두었는지(claudeBoxOpen, 이 기기에서만 기억해요)
let settings = { lastBackupAt: null, celebrateOff: false, audioSkip: false, seasonOff: false, cleanupV2: false, cleanupV3: false, artKindV1: false, workoutLiteV1: false, quickFlagV1: false, booksV1: false, tempoV1: false, weekLegacyV1: false, simplifyV2: false, claudeBoxOpen: false };

const ui = {
  tab: 'cal',         // 처음 열면 캘린더 (이번 달)
  // 영역 화면의 칩 (다른 메뉴에서 들어올 때마다 첫 칩으로 돌아가요: 📖 기록)
  vnView: 'records',  // 바이올린: records | shelf
  econView: 'routine', // 경제 루틴: routine | terms (📒 용어 노트)
  termAdding: false,  // 용어 노트: "＋ 용어 추가" 칸이 열려 있는지
  termEdit: null,     // 용어 노트: 그 자리에서 고치는 중인 용어 id
  termQuery: '',      // 용어 노트: 찾는 말
  noteDraft: null,    // 경제 루틴 "오늘 한 줄"에 쓰는 중이지만 아직 저장하지 않은 글 { date, text }
  noteSavedUntil: 0,  // 한 줄을 저장한 직후 "저장됨 ✓"를 보여 주는 시각
  claudePeriod: 'week', // 🤖 클로드 피드백 ① 보내기: 기간 day(오늘) | week(지난주) | month(지난달). 처음 열 때는 지난주 (직접 고르면 그 선택을 따라요)
  claudeScope: 'all', // 범위 all(🌈 전체) | violin | econ | english | drawing
  claudeQuestion: {}, // 범위마다 "이번에 특히 물어볼 것" (피드백을 저장하면 비워져요)
  claudePending: null, // 복사한 뒤 받은 답변을 저장할 때 쓰는 범위·기간 (카드에서 보냈으면 targetId 도 있어요)
  fbOpen: false,      // ② 받은 답변 저장 칸이 펼쳐져 있는지 (복사하면 저절로 펼쳐지고, 저장하면 접혀요)
  fbSaveScope: null,  // ② 에서 작은 칩으로 바꾼 범위 (없으면 복사한 범위)
  fbScope: 'all',     // ③ 받은 피드백 모아보기의 범위 칩: all | violin | econ | english | drawing
  fbCount: 5,         // ③ 에 보이는 개수 (처음 5개, "더 보기"로 5개씩)
  fbOpenText: new Set(), // 답변 "더 보기"를 펼쳐 둔 피드백
  query: '',
  artOpen: null,      // 상세 창으로 열어 둔 그림 기록
  artPhoto: 0,        // 상세 창에서 보고 있는 사진 번호
  weekStart: null,      // 🗓 이번 주 탭에서 보고 있는 주의 일요일 날짜 (null 이면 이번 주)
  wkAiWeek: null,       // 🗓 📥 클로드 시간표 붙여 넣기 창이 반영할 주(일요일 날짜)
  calMonth: null,       // 캘린더에서 보고 있는 달 (예: '2026-09')
  calHidden: new Set(), // 캘린더에서 잠시 숨긴 종류
  dayOpen: null,        // 캘린더에서 열어 둔 날짜
  backToDay: null,      // 입력 창을 닫고 돌아갈 날짜
};
const ofType = (type) => records.filter((r) => r.type === type);

/* ---------------------------------------------------------------------
   5. 기록 저장/수정/삭제
   --------------------------------------------------------------------- */
// 기록을 저장해요. 바꾼 시각(updatedAt)은 여기서 항상 새로 정해요. (☁ 동기화가 "어느 쪽이 바뀌었나"를 알아보는 기준이에요)
async function saveRecord(rec) {
  const i = records.findIndex((r) => r.id === rec.id);
  const prev = i >= 0 ? records[i].updatedAt || 0 : 0;
  rec.updatedAt = Math.max(Date.now(), prev + 1);
  try {
    await Store.putMany([rec]);
  } catch (err) {
    alert('저장하지 못했어요. 저장 공간이 부족할 수 있어요. (그림 파일이 너무 크지 않은지 확인해 주세요.)');
    return false;
  }
  if (i >= 0) records[i] = rec; else records.push(rec);
  if (tombstones.length) tombstones = tombstones.filter((t) => t.id !== rec.id); // 지웠던 흔적 위에 다시 저장한 경우
  return true;
}

/* 지운 기록의 흔적("삭제 표시"). 지운 기록은 저장소에서 없애지 않고, 같은 id 자리에 이 작은 표시만 남겨요.
   ☁ 동기화에서 "지운 것"과 "아직 못 받은 것"을 구분하려고요. 화면과 백업 파일에는 나타나지 않고, 60일 뒤 정리돼요. */
let tombstones = [];
const isTomb = (r) => !!(r && r.deletedAt);
function makeTomb(r) {
  const at = Math.max(Date.now(), (r.updatedAt || 0) + 1);
  return { id: r.id, type: r.type, date: r.date, deletedAt: at, updatedAt: at };
}
const isSyncedRecord = (r) => !!r && !r.sample && !!SCHEMAS[r.type];

async function deleteRecord(id) {
  const old = records.find((r) => r.id === id);
  if (old && isSyncedRecord(old)) {
    const t = makeTomb(old);
    await Store.putMany([t]); // 같은 id 자리를 삭제 표시로 바꿔요
    tombstones = [...tombstones.filter((x) => x.id !== id), t];
  } else {
    await Store.remove([id]); // 예시 기록처럼 동기화하지 않는 것은 흔적 없이 지워요
  }
  records = records.filter((r) => r.id !== id);
}

// ☁ 동기화가 가져온 변경을 저장소와 화면에 반영해요. put: 기록, tombs: 삭제 표시, drop: 흔적 없이 지울 id
async function applySyncChanges({ put = [], tombs = [], drop = [] }) {
  const rows = [...put, ...tombs];
  if (rows.length) await Store.putMany(rows, { silent: true });
  if (drop.length) await Store.remove(drop);
  const ids = new Set([...put.map((r) => r.id), ...tombs.map((r) => r.id), ...drop]);
  records = records.filter((r) => !ids.has(r.id)).concat(put);
  tombstones = tombstones.filter((t) => !ids.has(t.id)).concat(tombs);
}

// 입력 중이면 잠깐 미뤘다가 그려요 (동기화가 가져온 변경 때문에 쓰던 글이 사라지지 않게)
let renderDeferred = false;
const typingInView = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !!view.contains(a); };
function renderSoon() {
  if (typingInView()) { renderDeferred = true; return; }
  render();
  refreshDay();
}
document.addEventListener('focusout', () => {
  if (!renderDeferred) return;
  setTimeout(() => { if (renderDeferred && !typingInView()) { renderDeferred = false; render(); refreshDay(); } }, 250);
});

/* ---------------------------------------------------------------------
   7. 화면 그리기 - 공통 부분
   --------------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);
const view = $('#view');
const dlg = $('#dlg');

/* ---------------------------------------------------------------------
   메뉴 보이기 · 접기 (맥 메뉴 막대처럼). 설정 값 'menu' = { order: [탭 id…], folded: [접어 둔 탭 id…], open: ‹ › 펼침 }
   교재 목록·클로드 요청 문구처럼 일반 설정 값이라서 ☁ 동기화와 백업 파일에 같이 들어가요. (값이 없으면 기본값)
   --------------------------------------------------------------------- */
function menuState() {
  const v = getConfig('menu', null) || {};
  const ids = MENU_TABS.map((t) => t.id);
  const saved = Array.isArray(v.order) ? v.order.filter((id, i, a) => ids.includes(id) && a.indexOf(id) === i) : [];
  const fresh = ids.filter((id) => !saved.includes(id));
  const order = [...fresh.filter((id) => menuTab(id).first), ...saved, ...fresh.filter((id) => !menuTab(id).first)]; // 저장 뒤에 새로 생긴 탭은 맨 뒤에 (🗓 이번 주처럼 first 인 탭은 맨 앞에)
  const folded = Array.isArray(v.folded) ? v.folded.filter((id) => ids.includes(id)) : MENU_FOLDED_DEFAULT;
  return { order, folded: new Set(folded), open: !!v.open };
}
const menuTab = (id) => MENU_TABS.find((t) => t.id === id);
async function saveMenu(patch) {
  const m = menuState();
  await setConfig('menu', { order: m.order, folded: [...m.folded], open: m.open, ...patch });
  renderTabs();
}

function renderTabs() {
  const m = menuState();
  const tab = (t, cls = '') => `<button type="button" class="tab${cls ? ` ${cls}` : ''}${t.id === ui.tab ? ' active' : ''}" data-act="tab" data-id="${t.id}">${esc(t.label)}</button>`;
  const shown = m.order.filter((id) => !m.folded.has(id)).map(menuTab);
  const folded = m.order.filter((id) => m.folded.has(id)).map(menuTab);
  const peek = !m.open && folded.find((t) => t.id === ui.tab); // 접어 둔 탭의 화면을 보는 동안에는 그 탭만 메뉴에 임시로 보여요
  $('#tabs').innerHTML = [CAL_TAB, ...shown].map((t) => tab(t)).join('')
    + (m.open ? folded.map((t) => tab(t, 'folded')).join('') : peek ? tab(peek, 'folded') : '')
    + (folded.length ? `<button type="button" class="tab fold-toggle" data-act="menuFold" aria-expanded="${m.open}" aria-label="${m.open ? '접어 둔 메뉴 접기' : '접어 둔 메뉴 펼치기'}" title="${m.open ? '접어 둔 메뉴 접기' : '접어 둔 메뉴 펼치기'}">${m.open ? '›' : '‹'}</button>` : '');
}

function render() {
  if (!TABS.some((t) => t.id === ui.tab)) ui.tab = 'cal'; // 없어진 메뉴(예전 '오늘')는 캘린더로
  renderTabs();
  if (ui.tab === 'violin') renderViolin();
  else if (ui.tab === 'english') renderEnglish();
  else if (ui.tab === 'econ') renderEcon();
  else if (ui.tab === 'cal') renderCalendar();
  else if (ui.tab === 'week') renderWeek();
  else renderArt();
  applySeason();
  syncPlayButtons();
}


// 연습량 ●●○ (카드 머리줄에 작게 붙어요. 안 적었으면 아무것도 안 보여요)
const amountOf = (r) => AMOUNTS.find((a) => a.v === Number(r.amount));
const amountWord = (r) => (r && r.type === 'workout' ? '운동량' : '연습량'); // 운동은 "운동량", 바이올린·그림은 "연습량"
function marksHTML(r) {
  const a = amountOf(r);
  return a ? `<span class="amt" role="img" aria-label="${amountWord(r)} ${a.label}" title="${amountWord(r)} ${a.label}">${a.icon} ${a.label}</span>` : '';
}

// 칩 선택지 하나를 {v, icon, label}로 맞춰요 (글자만 있는 것도 돼요)
const normChoice = (c) => (c !== null && typeof c === 'object' ? c : { v: c, label: String(c) });

// 칩(버튼) 칸: 하나만 고르는 것(연습량·기분 등)과 여러 개 고르는 것(multi). 고른 값은 숨은 칸(name)에 들어가요.
// 하나짜리는 다시 누르면 풀려요. (여러 개짜리는 JSON 목록으로 들어가요)
function choiceHTML(name, choices, value, multi = false, extra = '') {
  const list = choices.map(normChoice);
  const sel = multi ? (Array.isArray(value) ? value.map(String) : []) : [value === undefined || value === null ? '' : String(value)];
  const known = new Set(list.map((c) => String(c.v)));
  // 선택지에서 빠진 예전 값도, 이미 골랐던 것이면 버튼으로 남겨 둬요 (수정해서 저장해도 사라지지 않게)
  const all = [...list, ...sel.filter((v) => v !== '' && !known.has(v)).map((v) => ({ v, label: v }))];
  return `<div class="choice" role="group" data-multi="${multi ? 1 : 0}">
    <input type="hidden" id="f_${name}" name="${name}" value="${esc(multi ? JSON.stringify(sel) : sel[0])}">
    ${all.map((c) => {
      const on = sel.includes(String(c.v));
      return `<button type="button" class="choice-btn${on ? ' on' : ''}" data-act="pick" data-val="${esc(c.v)}" aria-pressed="${on}">${c.icon ? `<span class="ci">${c.icon}</span> ` : ''}${esc(c.label)}</button>`;
    }).join('')}${extra}
  </div>`;
}
// 칩 칸의 선택지 (목록이 자주 바뀌는 칸은 choices 를 함수로 두어요)
const choicesOf = (f) => (typeof f.choices === 'function' ? f.choices() : f.choices);
// 칩 칸에서 고른 값 읽기 (연습량처럼 숫자 선택지면 숫자로)
function readChoice(form, f) {
  const raw = form.elements[f.key].value;
  if (f.type === 'chips') { try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  if (raw === '') return '';
  return typeof normChoice(choicesOf(f)[0]).v === 'number' ? Number(raw) : raw;
}
// 이 종류의 기록에 '연습량' 칸이 있는지 (바이올린은 연습에만, 투자·쉼에는 없어요)
const supportsAmount = (type, kind) => !!SCHEMAS[type] && SCHEMAS[type].fields.some((f) => f.key === 'amount' && (!f.only || f.only === kind));

function actionButtons(type, id, extra = '') {
  return `<div class="actions">${extra}
    <button type="button" class="btn ghost small" data-act="edit" data-type="${type}" data-id="${esc(id)}">수정</button>
    <button type="button" class="btn danger small" data-act="del" data-type="${type}" data-id="${esc(id)}">삭제</button>
  </div>`;
}

/* ---------------------------------------------------------------------
   7-2. 🕰 그때의 나 (캘린더 아래)
   --------------------------------------------------------------------- */
// n달 전 같은 날짜 (그 달에 그 날짜가 없으면 그 달의 마지막 날)
function monthsAgo(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(y, m - 1 - n, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return toStr(t);
}

// 그때의 나: 한 달 전 → 석 달 전 → 1년 전 중 기록이 있는 첫 날에서 하나 (그림이 있으면 그림 먼저)
const hasArtPic = (r) => r.type === 'art' && artPhotos(r).length > 0;
function memoryPick(today) {
  const pool = records.filter((r) => r.type !== 'rest' && r.date && catOf(r) && (r.type !== 'econRoutine' || hasValue(r.note))); // 경제 루틴은 한 줄을 남긴 날만
  for (const look of MEMORY_LOOKBACKS) {
    const date = monthsAgo(today, look.months);
    const list = pool.filter((r) => r.date === date).sort((a, b) => (hasArtPic(b) ? 1 : 0) - (hasArtPic(a) ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));
    if (list.length) return { label: look.label, date, rec: list[0] };
  }
  return null;
}

function memoryText(r) {
  const raw = { workout: r.memo, violin: r.kind === '레슨' ? r.feedback : (r.good || r.hard), econRoutine: r.note, englishArticle: r.sum1, art: r.topic }[r.type] || '';
  const t = String(raw).replace(/\s+/g, ' ').trim();
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

function memoryHTML(today) {
  const m = memoryPick(today);
  if (!m) return '';
  const { rec } = m;
  const c = catOf(rec);
  const text = memoryText(rec);
  return `<section class="card memory">
    <h3>🕰 그때의 나 <span class="meta">· ${esc(m.label)}</span></h3>
    <button type="button" class="memory-body" data-act="calDay" data-date="${m.date}" title="그날 기록 보기">
      ${hasArtPic(rec) ? `<img class="memory-img" src="${esc(artPhotos(rec)[0])}" alt="${esc(rec.topic || '그림')}">` : ''}
      <span class="memory-text">
        <span class="meta">${esc(dayLabel(m.date))}</span>
        <span><b>${iconOf(rec)} ${esc(calTitle(rec))}</b> ${marksHTML(rec)}</span>
        ${text ? `<span class="memory-line">${esc(text)}</span>` : ''}
      </span>
    </button>
  </section>`;
}

// 쉰 날 기록 (하루에 하나만)
async function saveRest(date) {
  if (records.some((r) => r.type === 'rest' && r.date === date)) { toast('이 날은 이미 쉼으로 남겨 두었어요.'); return null; }
  const rec = { id: newId(), type: 'rest', date, createdAt: Date.now(), updatedAt: Date.now() };
  assignStamp(rec);
  return (await saveRecord(rec)) ? rec : null;
}

// 😴 쉰 날: 누르면 남기고, 다시 누르면 지워요
async function toggleRest(date) {
  const old = records.find((r) => r.type === 'rest' && r.date === date);
  if (old) {
    if (hasValue(old.memo) && !confirm('쉰 날 표시와 적어 둔 메모를 지울까요?')) return;
    await deleteRecord(old.id);
    render(); refreshDay();
    toast('쉰 날 표시를 지웠어요.', 2500);
    return;
  }
  const rec = await saveRest(date);
  if (!rec) return;
  render(); refreshDay();
  afterNewRecord(rec);
}

function restButtonHTML(date) {
  const on = records.some((r) => r.type === 'rest' && r.date === date);
  const word = date === todayStr() ? '오늘은' : '이 날은';
  return `<button type="button" class="btn ghost purple${dlg.open ? ' small' : ''}" data-act="rest" data-date="${date}" aria-pressed="${on}"${on ? ' title="다시 누르면 쉰 날 표시를 지워요"' : ''}>😴 ${on ? '쉰 날로 남겼어요 ✓' : `${word} 쉼`}</button>`;
}

/* ---------------------------------------------------------------------
   8. 메뉴 1: 운동·바이올린
   --------------------------------------------------------------------- */
// 카드에 보여 줄 칸들: 스키마 순서대로, 값이 있는 칸만. 칩은 작은 표시로 먼저, 글은 제목+내용으로 그 아래에.
// (skip: 카드 머리줄 등에서 이미 보여준 칸)
// opts.readonly: 체크 목록을 눌러서 바꿀 수 없는 글자로만 보여줘요 (예전 메모용)
function guideHTML(type, r, skip = [], opts = {}) {
  const tags = [];
  const blocks = [];
  SCHEMAS[type].fields.forEach((f) => {
    const value = r[f.key];
    if (['date', 'image', 'images', 'number', 'select', 'multi', 'bookLines'].includes(f.type) || f.key === 'amount' || skip.includes(f.key) || !hasValue(value)) return;
    const label = cleanLabel(f.label);
    if (f.type === 'choice' || f.type === 'chips') {
      const list = Array.isArray(value) ? value : [value];
      tags.push(`<div class="chip-line"><span class="chip-label">${esc(label)}</span>${list.map((v) => `<span class="tag chip-tag">${esc(v)}</span>`).join('')}</div>`);
    } else if (f.links) {
      blocks.push(linksBlock(value, label));
    } else {
      blocks.push(textBlock(label, value));
    }
  });
  return `${tags.join('')}${blocks.join('')}`;
}

function workoutCard(r) {
  const parts = [];
  if (r.distance) parts.push(`${esc(fmtNum(r.distance))}km`);
  return `<div class="card" data-rid="${esc(r.id)}">
    <div class="item-head">
      <div><span class="tag">운동</span> ${parts.join(' · ')} ${marksHTML(r)}</div>
      ${actionButtons('workout', r.id)}
    </div>
    ${r.memo ? `<p class="pre">${esc(r.memo)}</p>` : ''}
  </div>`;
}

// 쉰 날 카드 (쉬는 날도 기록이에요)
function restCard(r) {
  return `<div class="card">
    <div class="item-head">
      <div><span class="tag rest">😴 쉰 날</span> ${r.memo ? esc(r.memo) : '<span class="meta">쉬는 것도 기록이에요.</span>'}</div>
      ${actionButtons('rest', r.id)}
    </div>
  </div>`;
}

const pieceButton = (p) => `<button type="button" class="piece-link" data-act="piece" data-piece="${esc(p)}">${esc(p)}</button>`;

// 🎻 카드의 곡 줄: 교재마다 "스즈키 5권 · 비발디 사단조 1악장 · ♩60 · 🎙" 한 줄씩 (없는 값은 생략 · 곡이 없는 교재는 이름만), "그 밖에 연습한 곡"은 마지막 줄. 곡 이름을 누르면 곡 노트예요.
//   🎙 은 그 곡 줄에 붙인 녹음이에요: 하나면 누르는 대로 재생·멈춤, 여럿이면 곡 노트(녹음 목록)가 열려요.
function bookLinesHTML(r) {
  const lines = lineRows(r).filter((l) => l.book || l.piece).map((l) => {
    const t = l.piece ? tempoOfPiece(r, l.piece) : 0;
    const recs = lineAudios(r, l);
    const mic = recs.length === 1
      ? `<button type="button" class="rec-play" data-act="playRec" data-aid="${esc(recs[0].id)}" title="녹음 듣기${recs[0].memo ? ` · ${esc(recs[0].memo)}` : ''}" aria-label="${esc(l.piece)} 녹음 재생" aria-pressed="false">🎙</button>`
      : recs.length ? `<button type="button" class="rec-play" data-act="piece" data-piece="${esc(l.piece)}" title="곡 노트에서 녹음 듣기" aria-label="${esc(l.piece)} 녹음">🎙</button>` : '';
    return `<div class="book-line">${[l.book ? `<span class="book-nm">${esc(l.book)}</span>` : '', l.piece ? `<b>${pieceButton(l.piece)}</b>` : '', t ? `<span class="line-tempo" title="템포 ${t} BPM">♩${t}</span>` : '', mic].filter(Boolean).join(' · ')}</div>`;
  });
  return `<div class="book-lines">${lines.length ? lines.join('') : '<span class="meta">(곡 이름 미입력)</span>'}</div>`;
}

function violinCard(r) {
  if (r.kind === '레슨') {
    return `<div class="card" data-rid="${esc(r.id)}">
      <div class="item-head">
        <div><span class="tag lesson">레슨</span> ${marksHTML(r)}</div>
        ${actionButtons('violin', r.id, claudeBtns(r))}
      </div>
      ${textBlock('선생님 피드백', r.feedback)}
      ${guideHTML('violin', r, ['feedback'])}
    </div>`;
  }
  return `<div class="card" data-rid="${esc(r.id)}">
    <div class="item-head">
      <div><span class="tag violin">바이올린</span> ${marksHTML(r)} ${recMarksHTML(r)}</div>
      ${actionButtons('violin', r.id, claudeBtns(r))}
    </div>
    ${bookLinesHTML(r)}
    ${guideHTML('violin', r, ['kind', 'piece', 'books', 'feedback'])}
  </div>`;
}

/* ---------------------------------------------------------------------
   ⚙︎ 설정 값 기록 (교재 목록 등): 백업에 함께 들어가도록 일반 기록(type 'config')으로 저장해요
   --------------------------------------------------------------------- */
const configRec = (key) => records.find((r) => r.type === 'config' && r.key === key);
const getConfig = (key, fallback) => { const r = configRec(key); return r && r.value !== undefined ? r.value : fallback; };
async function setConfig(key, value) {
  const old = configRec(key);
  return saveRecord({ id: old ? old.id : `cfg-${key}`, type: 'config', key, value, date: todayStr(), createdAt: old ? old.createdAt : Date.now(), updatedAt: Date.now() });
}

// 🎻 교재 목록: [{ name, hidden }] 순서대로. 숨겨도 예전 기록의 교재 이름은 그대로 보여요.
function textbookList() {
  const v = getConfig('textbooks', null);
  const list = Array.isArray(v) ? v : TEXTBOOKS_DEFAULT.map((name) => ({ name, hidden: false }));
  return list.filter((b) => b && typeof b.name === 'string' && b.name.trim()).map((b) => ({ name: b.name.trim(), hidden: !!b.hidden }));
}
const textbookChoices = () => textbookList().filter((b) => !b.hidden).map((b) => b.name);
const MANAGE_BOOKS_BTN = '<button type="button" class="btn ghost small manage-btn" data-act="manageBooks">⚙︎ 교재 관리</button>';

// 🎻 교재별 한 줄: books = [{ name, piece, tempo }] (교재 칩 순서, tempo 는 적었을 때만). 예전 기록의 books(교재 이름만 있는 목록)도 읽어요 (그때는 곡이 빈칸).
//   piece(예전 "곡 이름" 칸)는 이제 "그 밖에 연습한 곡"이고, 그 템포는 otherTempo 예요. 예전 기록은 한 번만 새 모양으로 옮겨요 (booksCopy · tempoCopy)
const tempoNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const bookRows = (r) => (r && Array.isArray(r.books) ? r.books : [])
  .map((b) => (b !== null && typeof b === 'object'
    ? { name: String(b.name || '').trim(), piece: String(b.piece || '').trim(), ...(tempoNum(b.tempo) ? { tempo: tempoNum(b.tempo) } : {}) }
    : { name: String(b === undefined || b === null ? '' : b).trim(), piece: '' }))
  .filter((b) => b.name);

// 곡 줄: 교재마다 한 줄(칩 순서) + 맨 끝에 "그 밖에 연습한 곡". line 은 줄의 이름표예요 ('b:교재 이름' · 'o')
function lineRows(r) {
  const out = bookRows(r).map((b) => ({ line: `b:${b.name}`, book: b.name, piece: b.piece, tempo: b.tempo || 0 }));
  out.push({ line: 'o', book: '', piece: pieceKey(r && r.piece), tempo: tempoNum(r && r.otherTempo) });
  return out;
}
// 한 기록에서 그 곡의 템포: 곡 줄에 적은 템포 → 없으면 아직 줄로 옮기지 않은 예전 기록의 기록 단위 템포(그 기록에 적은 모든 곡에 적용돼요)
function tempoOfPiece(r, name) {
  const hit = lineRows(r).find((l) => l.piece === name && l.tempo);
  return hit ? hit.tempo : tempoNum(r && r.tempo);
}
// 그 곡 줄에 붙인 녹음 (녹음은 곡 이름 + 그 기록 id 로 이어져요)
const lineAudios = (r, l) => (l.piece ? audios.filter((a) => a.recId === r.id && a.piece === l.piece).sort(byOldest) : []);

// 한 기록에 적힌 곡들: 교재별 한 줄(칩 순서) → 그 밖에 연습한 곡. 같은 곡은 하나로 (어느 교재에서 나왔는지는 books 에 모아요)
function piecesOf(r) {
  const out = [];
  const add = (name, book) => {
    const k = pieceKey(name);
    if (!k) return;
    const hit = out.find((p) => p.name === k);
    if (hit) { if (book && !hit.books.includes(book)) hit.books.push(book); return; }
    out.push({ name: k, books: book ? [book] : [] });
  };
  bookRows(r).forEach((b) => add(b.piece, b.name));
  add(r && r.piece, '');
  return out;
}
const pieceNamesOf = (r) => piecesOf(r).map((p) => p.name);

// 교재 칸 자동완성: 그 교재의 한 줄 칸에 적었던 값만 최근 순
function bookPieceSuggestions(name) {
  const seen = new Set();
  const out = [];
  ofType('violin').filter((r) => r.kind !== '레슨').sort(byNewest).forEach((r) => bookRows(r).forEach((b) => {
    if (b.name === name && b.piece && !seen.has(b.piece)) { seen.add(b.piece); out.push(b.piece); }
  }));
  return out.slice(0, 40);
}

// 곡 이름 자동완성용: 지금까지 쓴 곡 (최근에 쓴 순)
function knownPieces() {
  const seen = new Set();
  const out = [];
  ofType('violin').filter((r) => r.kind !== '레슨').sort(byNewest).forEach((r) => pieceNamesOf(r).forEach((p) => { if (!seen.has(p)) { seen.add(p); out.push(p); } }));
  return out;
}
// "그 밖에 연습한 곡" 자동완성
const pieceSuggestions = () => knownPieces().slice(0, 40);

// 곡별 템포 변화 그래프 (외부 도구 없이 SVG로 그려요)
function tempoChartSVG(pts) {
  const W = 600, H = 280, L = 48, R = 36, T = 28, B = 44;
  const vals = pts.map((p) => p.tempo);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) { lo -= 10; hi += 10; } else { const g = Math.max(5, Math.round((hi - lo) * 0.15)); lo -= g; hi += g; }
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((n) => n >= (hi - lo) / 4) || 100; // 눈금은 5·10 단위처럼 딱 떨어지게
  lo = Math.max(0, Math.floor(lo / step) * step);
  hi = Math.ceil(hi / step) * step;
  const t0 = parseDate(pts[0].date).getTime();
  const t1 = parseDate(pts[pts.length - 1].date).getTime();
  const x = (d) => (t1 === t0 ? (L + W - R) / 2 : L + ((parseDate(d).getTime() - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  let grid = '';
  for (let v = lo; v <= hi; v += step) {
    grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  let xlabels = '';
  let lastX = -999;
  pts.forEach((p, i) => {
    const px = x(p.date);
    if (i === 0 || i === pts.length - 1 || px - lastX >= 70) {
      if (i === pts.length - 1 && px - lastX < 70 && i !== 0) return; // 겹치면 마지막 날짜는 표 쪽에서 봐요
      xlabels += `<text class="axis-label" x="${px}" y="${H - 16}" text-anchor="middle">${esc(shortDay(p.date))}</text>`;
      lastX = px;
    }
  });
  const line = pts.length > 1 ? `<polyline class="line" points="${pts.map((p) => `${x(p.date)},${y(p.tempo)}`).join(' ')}"/>` : '';
  const dots = pts.map((p) => `<circle class="dot" cx="${x(p.date)}" cy="${y(p.tempo)}" r="5"/><text class="val" x="${x(p.date)}" y="${y(p.tempo) - 12}" text-anchor="middle">${p.tempo}</text>`).join('');
  const alt = pts.map((p) => `${shortDay(p.date)} ${p.tempo}BPM`).join(', ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="템포 변화: ${esc(alt)}">${grid}${line}${dots}${xlabels}</svg>`;
}

// 🎵 곡 노트: 곡 이름(보라색 밑줄)을 누르면 열려요. 곡 메모, 처음 연습한 날, 연습량, 지금 단계, 잘 된 것, 템포 변화를 한곳에 모아요.
const pieceNoteOf = (piece) => records.find((r) => r.type === 'piecenote' && r.piece === piece);

function openPiece(piece) {
  const prac = ofType('violin').filter((r) => r.kind !== '레슨' && pieceNamesOf(r).includes(piece)).sort(byOldest);
  const note = pieceNoteOf(piece);
  const goods = prac.filter((r) => hasValue(r.good)).sort(byNewest);
  const lastStage = prac.filter((r) => hasValue(r.stage)).sort(byNewest)[0];
  const hards = prac.filter((r) => hasValue(r.hard)).sort(byNewest);
  const byDay = new Map(); // 같은 날 여러 번 연습했으면 마지막 기록을 써요
  prac.forEach((r) => { const t = tempoOfPiece(r, piece); if (t) byDay.set(r.date, { date: r.date, tempo: t }); }); // 그 곡 줄의 템포 (줄로 옮기지 않은 예전 기록은 기록 단위 템포)
  const pts = [...byDay.values()];
  const tempo = !pts.length
    ? '<p class="meta">템포(BPM)가 적힌 연습 기록이 없어요. 연습 기록의 곡 줄 아래 "템포"에 숫자를 적으면 여기에 그래프가 그려져요.</p>'
    : `${tempoChartSVG(pts)}
      ${pts.length === 1 ? '<p class="meta">템포가 적힌 기록이 하나뿐이에요. 두 번 이상 적으면 선으로 이어져요.</p>' : ''}
      <table class="tempo-table"><thead><tr><th>날짜</th><th>템포 (BPM)</th></tr></thead>
      <tbody>${pts.map((p) => `<tr><td>${esc(dayLabel(p.date))}</td><td>${p.tempo}</td></tr>`).join('')}</tbody></table>`;
  const done = !!note && note.status === 'done';
  openDlg(`<div class="row between piece-head"><h2>🎼 ${esc(piece)}</h2>
      <button type="button" class="btn ghost purple small" data-act="pieceDone" data-piece="${esc(piece)}" aria-pressed="${done}"${done ? ' title="다시 누르면 연습 중으로 되돌려요"' : ''}>${done ? '📕 마무리한 곡 ✓' : '📕 이 곡 마무리'}</button></div>
    <form id="pieceMemoForm" class="field piece-memo" data-piece="${esc(piece)}" novalidate>
      <label for="pieceMemo">곡 메모 - 선택</label>
      <div class="row">
        <input id="pieceMemo" name="memo" type="text" maxlength="200" value="${esc(note ? note.memo : '')}" placeholder="예: 좋아하는 부분, 이 곡을 고른 이유">
        <button type="submit" class="btn purple small">저장</button>
      </div>
    </form>
    ${prac.length ? `<div class="stats">
      <div class="stat"><b>${esc(dayLabel(prac[0].date))}</b><span>처음 연습한 날</span></div>
      ${lastStage ? `<div class="stat"><b>${esc(lastStage.stage)}</b><span>지금 단계 · ${esc(shortDay(lastStage.date))} 기준</span></div>` : ''}
    </div>` : '<div class="empty">아직 이 곡의 연습 기록이 없어요.</div>'}
    <section class="audio-sec" id="pieceAudio" data-piece="${esc(piece)}">${pieceAudioInner(piece)}</section>
    ${goods.length ? `<div class="label">잘 된 것 모아보기</div>
      <ul class="note-list">${goods.map((r) => `<li><span class="meta">${esc(shortDay(r.date))}</span><span class="pre">${esc(r.good)}</span></li>`).join('')}</ul>` : ''}
    <div class="label">템포 변화</div>
    ${tempo}
    ${hards.length ? `<div class="label">어려웠던 점 모아보기 <span class="meta">(예전 칸)</span></div>
      <ul class="note-list">${hards.map((r) => `<li><span class="meta">${esc(shortDay(r.date))}</span><span class="pre">${esc(r.hard)}</span></li>`).join('')}</ul>` : ''}
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`, true);
}

async function savePieceMemo(piece, memo) {
  const old = pieceNoteOf(piece);
  if (!memo && !(old && old.status === 'done')) { // 메모도 없고 마무리 표시도 없으면 곡 메모 기록은 필요 없어요
    if (old) await deleteRecord(old.id);
  } else {
    const { sample, ...keep } = old || {}; // 예시를 고치면 내 기록이 돼요
    const ok = await saveRecord({
      ...keep, id: old ? old.id : newId(), type: 'piecenote', piece, memo,
      date: todayStr(), createdAt: old ? old.createdAt : Date.now(), updatedAt: Date.now(),
    });
    if (!ok) return;
  }
  openPiece(piece);
  toast(memo ? '곡 메모를 남겼어요.' : '곡 메모를 비웠어요.', 2500);
}

// 📕 이 곡 마무리: 누르면 마무리한 곡(책장에 꽂혀요), 다시 누르면 연습 중(책상 위)으로 돌아가요. 곡 메모와 같은 기록(piecenote)에 status 로 저장돼요.
async function togglePieceDone(piece) {
  const old = pieceNoteOf(piece);
  const done = !(old && old.status === 'done');
  if (!done && old && !hasValue(old.memo)) { // 되돌렸는데 남길 메모도 없으면 기록 자체를 지워요
    await deleteRecord(old.id);
  } else {
    const { sample, ...keep } = old || {}; // 예시를 고치면 내 기록이 돼요
    const ok = await saveRecord({
      ...keep, id: old ? old.id : newId(), type: 'piecenote', piece, memo: old ? old.memo || '' : '',
      status: done ? 'done' : '', doneAt: done ? todayStr() : '',
      date: old ? old.date : todayStr(), createdAt: old ? old.createdAt : Date.now(), updatedAt: Date.now(),
    });
    if (!ok) return;
  }
  render();
  openPiece(piece);
  toast(done ? '📕 이 곡을 마무리했어요. 책장에 꽂아 뒀어요.' : '다시 연습 중인 곡으로 돌려놨어요.', 2500);
}

// 목록 맨 위 요약 한 줄 (이번 주, 작게). 값이 없는 부분은 빼고, 아무것도 없으면 줄 자체를 그리지 않아요. 숫자 합계는 없어요.
//   바이올린: "이 주에 연습한 곡: …"  (운동은 요약 줄이 없어요)
function areaLineHTML() {
  const start = weekStartOf(todayStr());
  const end = addDays(start, 6);
  const inWeek = (r) => r.date >= start && r.date <= end;
  const parts = [];
  const prac = ofType('violin').filter(inWeek).filter((r) => r.kind !== '레슨'); // 연습 기록만
  const pieces = [...new Set(prac.flatMap(pieceNamesOf))];
  if (pieces.length) parts.push(`이 주에 연습한 곡: ${pieces.map(pieceButton).join(', ')}`);
  return parts.length ? `<p class="meta area-line">${parts.join(' · ')}</p>` : '';
}

// 글 만들기에 쓰는 작은 도구들
const oneLine = (s) => String(s || '').trim().replace(/\s*\n\s*/g, ' / ');
const mdLabel = (s) => { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()} (${'일월화수목금토'[d.getDay()]})`; };

// 글을 복사하고 알려줘요. 자동 복사가 안 되면 글을 창에 보여 줘서 직접 복사할 수 있게 해요.
async function copyText(text, okMsg, title = '복사할 글') {
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { /* 아래의 예전 방식으로 다시 해 봐요 */ }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
  }
  if (ok) toast(okMsg, 4000);
  else openDlg(`<h2>${esc(title)}</h2><p class="meta" style="margin-top:0">자동으로 복사하지 못했어요. 아래 글을 직접 선택해서 복사해 주세요. (Ctrl+C)</p><textarea class="copy-text" readonly>${esc(text)}</textarea><div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`, true);
  return ok;
}

/* ---------------------------------------------------------------------
   📚 레퍼토리 책장: 연습 중인 곡은 "책상 위"에 펼친 악보로, 마무리한 곡은 "책장"에 책등으로 꽂혀요.
   (곡 노트의 📕 이 곡 마무리 버튼으로 옮겨요. 개수나 완료율은 보여주지 않아요.)
   --------------------------------------------------------------------- */
function repertoire() {
  const prac = ofType('violin').filter((r) => r.kind !== '레슨' && pieceNamesOf(r).length);
  const names = new Set([...prac.flatMap(pieceNamesOf), ...ofType('piecenote').filter((n) => n.status === 'done').map((n) => n.piece)]); // 같은 곡이 여러 교재에 있어도 하나로
  return [...names].map((name) => {
    const mine = prac.filter((r) => pieceNamesOf(r).includes(name)).sort(byOldest);
    const note = pieceNoteOf(name);
    const stage = mine.filter((r) => hasValue(r.stage)).sort(byNewest)[0];
    const books = [...new Set([...mine].reverse().flatMap((r) => (piecesOf(r).find((p) => p.name === name) || { books: [] }).books))]; // 이 곡을 적은 교재들 (최근에 쓴 교재부터)
    return {
      name, note, done: !!note && note.status === 'done', doneAt: note && note.doneAt ? note.doneAt : '', books,
      firstDate: mine.length ? mine[0].date : '', lastDate: mine.length ? mine[mine.length - 1].date : '',
      stage: stage ? stage.stage : '', hasAudio: audios.some((a) => a.piece === name),
    };
  });
}

const monthLabel = (date) => { const d = parseDate(date); return `${d.getFullYear()}년 ${d.getMonth() + 1}월`; };

function shelfHTML() {
  const all = repertoire();
  if (!all.length) return `<div class="empty">${esc(EMPTY_TEXT.shelf)}</div>`;
  const desk = all.filter((p) => !p.done).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || a.name.localeCompare(b.name, 'ko'));
  const shelf = all.filter((p) => p.done).sort((a, b) => (a.doneAt || '').localeCompare(b.doneAt || '') || a.name.localeCompare(b.name, 'ko'));
  const mic = (p) => (p.hasAudio ? '<span class="book-mic" title="녹음이 있어요" aria-label="녹음 있음">🎙</span>' : '');
  const book = (p) => `<button type="button" class="book" data-act="piece" data-piece="${esc(p.name)}" title="${esc(p.name)} · 곡 노트 열기">
      <span class="book-page left"><b>${esc(p.name)}</b>${p.books.length ? `<span class="book-tags">${p.books.map((b) => `<span class="tag small">${esc(b)}</span>`).join('')}</span>` : ''}${p.firstDate ? `<span class="meta">${esc(monthLabel(p.firstDate))}에 처음 연습</span>` : ''}</span>
      <span class="book-page right">${p.stage ? `<span>${esc(p.stage)}</span>` : ''}${p.note && hasValue(p.note.memo) ? `<span class="meta">${esc(p.note.memo)}</span>` : ''}${p.lastDate ? `<span class="meta">마지막 연습 ${esc(shortDay(p.lastDate))}</span>` : ''}${mic(p)}</span>
    </button>`;
  const spine = (p, i) => `<button type="button" class="spine c${i % 3}" data-act="piece" data-piece="${esc(p.name)}" title="${esc(p.name)}${p.books.length ? ` · ${esc(p.books.join(', '))}` : ''}${p.firstDate ? ` · ${esc(monthLabel(p.firstDate))}에 처음 연습` : ''}" aria-label="${esc(p.name)} 곡 노트 열기">
      <span class="spine-title">${esc(p.name)}</span>${p.firstDate ? `<span class="spine-month">${esc(p.firstDate.slice(2, 4))}.${esc(p.firstDate.slice(5, 7))}</span>` : ''}${p.hasAudio ? '<span class="spine-mic" aria-hidden="true">🎙</span>' : ''}
    </button>`;
  return `<section class="shelf-sec">
    <h3 class="shelf-h">✏️ 책상 위</h3>
    ${desk.length ? `<div class="desk">${desk.map(book).join('')}</div>` : '<p class="meta shelf-empty">지금 연습 중인 곡이 여기에 펼쳐져요. 바이올린 연습 기록에 곡 이름을 적으면 올라와요.</p>'}
    <h3 class="shelf-h">📚 책장</h3>
    <div class="shelf">${shelf.map(spine).join('')}</div>
    ${shelf.length ? '' : '<p class="meta shelf-empty">마무리한 곡은 곡 노트의 <b>📕 이 곡 마무리</b>를 누르면 여기에 꽂혀요.</p>'}
  </section>`;
}

// 영역 위쪽 칩 줄 (key: ui 안의 보기 이름, cur: 지금 보기)
const viewChips = (key, cur, items) => items.map(([id, text]) => `<button type="button" class="chip ${cur === id ? 'active' : ''}" data-act="setView" data-key="${key}" data-id="${id}" aria-pressed="${cur === id}">${text}</button>`).join('');

// 날짜별로 묶은 기록 카드 목록
function dayGroupedHTML(list, cardFn, emptyText) {
  if (!list.length) return `<div class="empty">${esc(emptyText)}</div>`;
  let out = '';
  let lastDate = '';
  list.forEach((r) => {
    if (r.date !== lastDate) { out += `<div class="day">${esc(dayLabel(r.date))}</div>`; lastDate = r.date; }
    out += cardFn(r);
  });
  return out;
}

// 영역 화면의 공통 틀 (위에서 아래로): 제목·설명 한 줄 → ＋ 기록 버튼 → 칩 줄(첫 칩이 기본) → [기록 보기] 요약 한 줄 → 목록
function renderViolin() {
  const mode = ui.vnView;
  const list = ofType('violin').sort(byNewest);
  view.innerHTML = `
    <h2 class="page-title">바이올린</h2>
    <p class="page-sub">손을 쓴 날을 가볍게 남겨요. 잘했는지 못했는지 점수는 매기지 않아요.</p>
    <div class="row actions-row add-row">
      <button type="button" class="btn" data-act="add" data-type="violin">＋ 바이올린 기록</button>
    </div>
    <div class="chips">${viewChips('vnView', mode, [['records', '📖 기록'], ['shelf', '📚 레퍼토리 책장']])}</div>
    ${mode === 'shelf' ? shelfHTML() : `${areaLineHTML('violin')}${dayGroupedHTML(list, violinCard, EMPTY_TEXT.violin)}`}`;
}

/* ---------------------------------------------------------------------
   9. 메뉴 4: 경제 루틴
   --------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   ✅ 오늘의 경제 루틴: 입력 창 없이 체크만 해요. 날짜마다 기록 하나(type 'econRoutine')가 생기고,
   체크를 모두 풀고 한 줄·태그도 비어 있으면 그 기록은 저절로 사라져요.
   --------------------------------------------------------------------- */
const routineOn = (date) => records.find((r) => r.type === 'econRoutine' && r.date === date);
const routineChecked = (r, id) => !!(r && r.checks && r.checks[id]);
const chipRoutine = () => ECON_ROUTINES.find((x) => Array.isArray(x.chips) && x.chips.length); // 칩(읽은 뉴스레터)이 달린 항목
const routineIcons = (r) => ECON_ROUTINES.filter((x) => routineChecked(r, x.id)).map((x) => x.icon); // 목록에 없는 id는 조용히 무시
const dayWithDow = (s) => `${shortDay(s)} (${'일월화수목금토'[parseDate(s).getDay()]})`;
const noteDay = (s) => (s.slice(0, 4) === String(new Date().getFullYear()) ? shortDay(s) : `${s.slice(0, 4)}년 ${shortDay(s)}`);

// 한 날의 루틴 기록을 바꿔요. 순서대로 하나씩 실행해서, 한 줄 저장과 체크가 서로 덮어쓰지 않아요.
let routineQueue = Promise.resolve();
function updateRoutine(date, patch) {
  const run = async () => {
    const old = routineOn(date);
    const { sample, ...keep } = old || {}; // 예시를 고치면 내 기록이 돼요
    const rec = {
      ...keep, id: old ? old.id : newId(), type: 'econRoutine', date, createdAt: old ? old.createdAt : Date.now(),
      checks: { ...(keep.checks || {}) }, letters: [...(keep.letters || [])], note: keep.note || '',
    };
    delete rec.tags; // 예전 태그 값은 고칠 때 함께 정리돼요
    patch(rec);
    rec.updatedAt = Date.now();
    const empty = !Object.values(rec.checks).some(Boolean) && !rec.letters.length && !rec.note;
    if (empty) { if (old) await deleteRecord(old.id); return null; }
    if (!old) assignStamp(rec);
    return (await saveRecord(rec)) ? rec : undefined; // null: 비어서 지움, undefined: 저장 못 함
  };
  routineQueue = routineQueue.then(run, run);
  return routineQueue;
}

// 체크했을 때 도장 토스트 (꺼 두었으면 나오지 않아요)
function routineToast(rec) {
  const s = stampPhrases.get(rec.id) || pickStamp(rec);
  stampPhrases.delete(rec.id);
  if (!settings.celebrateOff) stampToast({ head: s.text, line: savedLine(rec) });
}

const refreshRoutineViews = () => { render(); refreshDay(); };

async function setRoutineCheck(date, id, on) {
  if (date > todayStr() || !ECON_ROUTINES.some((x) => x.id === id)) return; // 미래 날짜는 체크할 수 없어요
  const was = routineChecked(routineOn(date), id);
  const item = ECON_ROUTINES.find((x) => x.id === id);
  const rec = await updateRoutine(date, (r) => {
    if (on) r.checks[id] = true;
    else { delete r.checks[id]; if (item.chips) r.letters = []; } // 체크를 풀면 그 칩 표시도 함께 풀려요
  });
  if (rec === undefined) return;
  refreshRoutineViews();
  if (on && !was && rec) routineToast(rec);
}

// 뉴스레터 칩: 누르면 그 뉴스레터를 읽은 것으로 표시하고, 뉴스레터 체크가 안 되어 있으면 함께 체크해요
async function toggleRoutineChip(date, chip) {
  const cr = chipRoutine();
  if (!cr || date > todayStr()) return;
  const was = routineChecked(routineOn(date), cr.id);
  const rec = await updateRoutine(date, (r) => {
    const i = r.letters.indexOf(chip);
    if (i >= 0) r.letters.splice(i, 1); else { r.letters.push(chip); r.checks[cr.id] = true; }
  });
  if (rec === undefined) return;
  refreshRoutineViews();
  if (!was && rec && routineChecked(rec, cr.id)) routineToast(rec);
}

// 오늘 한 줄: 입력 칸 오른쪽의 [저장] 버튼이나 Enter 로 저장해요. (저절로 저장되지는 않아요)
//   쓰는 중인 글은 ui.noteDraft 에 두어서, 체크를 눌러 화면이 다시 그려져도 사라지지 않아요.
const noteSavedText = (date) => { const r = routineOn(date); return r && r.note ? r.note : ''; };
const noteDraftText = (date) => (ui.noteDraft && ui.noteDraft.date === date ? ui.noteDraft.text : noteSavedText(date));
const noteDirty = (date) => !!ui.noteDraft && ui.noteDraft.date === date && ui.noteDraft.text.trim() !== noteSavedText(date);

// 저장 버튼 자리: 고친 글이 있으면 [저장], 방금 저장했으면 잠깐 "저장됨 ✓", 그 밖에는 눌리지 않는 흐린 [저장]
function noteBtnHTML(date) {
  if (noteDirty(date)) return '<button type="submit" class="btn small rt-save" id="rtSave">저장</button>';
  if (ui.noteSavedUntil > Date.now()) return '<span class="rt-saved" id="rtSave" role="status">저장됨 ✓</span>';
  return '<button type="submit" class="btn small rt-save" id="rtSave" disabled>저장</button>';
}
function syncNoteBtn(date) {
  const el = $('#rtSave');
  if (el) el.outerHTML = noteBtnHTML(date);
}

async function saveRoutineNote(date) {
  const input = $('#rtNote');
  const text = (input && input.dataset.date === date ? input.value : noteDraftText(date)).trim();
  if (text === noteSavedText(date)) { ui.noteDraft = null; syncNoteBtn(date); return true; }
  const rec = await updateRoutine(date, (r) => { r.note = text; });
  if (rec === undefined) return false;
  ui.noteDraft = null;
  ui.noteSavedUntil = Date.now() + 2200;
  setTimeout(() => { if (ui.noteSavedUntil <= Date.now()) syncNoteBtn(date); }, 2300);
  refreshRoutineViews();
  return true;
}

// 다른 탭으로 가기 전에: 저장하지 않은 한 줄이 있으면 물어봐요. 저장하고 가면 true, 취소하면 그 자리에 머물러요(쓰던 글은 그대로).
async function confirmLeaveNote() {
  const date = todayStr();
  if (ui.tab !== 'econ' || !noteDirty(date)) return true;
  if (!confirm('저장하지 않은 한 줄이 있어요. 저장할까요?')) return false;
  return saveRoutineNote(date);
}

// 지난 한 줄 보기: 날짜 + 한 줄만 최신순 (작은 창)
function openPastNotes() {
  const list = ofType('econRoutine').filter((r) => hasValue(r.note)).sort(byNewest);
  openDlg(`<h2>지난 한 줄</h2>
    ${list.length
    ? `<ul class="note-list">${list.map((r) => `<li><span class="meta">${esc(noteDay(r.date))}</span><span class="pre">${esc(r.note)}</span></li>`).join('')}</ul>`
    : `<p class="meta">${esc(EMPTY_TEXT.pastNotes)}</p>`}
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`);
}

// 체크 목록 (경제 화면)
function routineRowsHTML(date) {
  const rec = routineOn(date);
  return `<div class="rt-list">${ECON_ROUTINES.map((x) => {
    const on = routineChecked(rec, x.id);
    const chips = Array.isArray(x.chips) && x.chips.length
      ? `<span class="rt-chips${on ? '' : ' faint'}">${x.chips.map((c) => {
        const sel = !!(rec && Array.isArray(rec.letters) && rec.letters.includes(c));
        return `<button type="button" class="chip small${sel ? ' active' : ''}" data-act="routineChip" data-date="${date}" data-chip="${esc(c)}" aria-pressed="${sel}">${esc(c)}</button>`;
      }).join('')}</span>` : '';
    return `<div class="rt-row${on ? ' on' : ''}" data-routine-row="${esc(x.id)}">
      <label class="rt-main"><input type="checkbox" class="rt-check" data-routine="${esc(x.id)}" data-date="${date}" ${on ? 'checked' : ''}><span class="rt-icon" aria-hidden="true">${x.icon}</span><span class="rt-label">${esc(x.label)}</span></label>${chips}
    </div>`;
  }).join('')}</div>`;
}

function routineNoteHTML(date) {
  return `<div class="rt-note">
    <label class="rt-h" for="rtNote">오늘 한 줄 <span class="meta">(선택)</span></label>
    <form id="rtNoteForm" class="rt-note-form" data-date="${date}" novalidate>
      <input id="rtNote" class="rt-note-in" type="text" maxlength="300" autocomplete="off" data-routine-note data-date="${date}" value="${esc(noteDraftText(date))}" placeholder="오늘 기억나는 흐름 하나 (예: 환율이 올라 수입 물가가 걱정된다는 얘기)">
      ${noteBtnHTML(date)}
    </form>
  </div>`;
}

// 이번 주(일요일부터 오늘까지)에 체크한 것만 🎧 📮 작은 도장으로 날짜 순서대로 붙여 보여줘요. (요일 칸 · 빈 칸 · 숫자 없이. 도장을 누르면 그 날짜만 작게 나와요)
//   지난 날짜의 체크는 📅 캘린더의 날짜 창에서 켜고 꺼요.
function routineWeekHTML() {
  const today = todayStr();
  const sun = weekStartOf(today);
  const stamps = [];
  for (let d = sun; d <= today; d = addDays(d, 1)) {
    ECON_ROUTINES.forEach((x) => { if (routineChecked(routineOn(d), x.id)) stamps.push({ d, x }); });
  }
  return `<div class="wk">
    ${stamps.length ? `<div class="rt-h">이번 주</div>
    <div class="wk-stamps">${stamps.map(({ d, x }) => `<button type="button" class="wk-stamp" data-act="routineStamp" data-date="${d}" title="${esc(dayWithDow(d))}" aria-label="${esc(`${dayWithDow(d)} ${x.label}`)}">${x.icon}</button>`).join('')}</div>
    <p class="meta wk-stamp-say" id="wkStampSay" role="status" hidden></p>` : ''}
    <button type="button" class="link-btn past-notes" data-act="pastNotes">지난 한 줄 보기</button>
    <button type="button" class="link-btn term-link" data-act="termsOpen">${termsAll().length ? '📒 용어 노트' : '📒 용어 노트 시작하기'}</button>
    <p class="meta wk-note">지난 날 체크는 📅 캘린더에서 그 날짜를 눌러 해요.</p>
  </div>`;
}

function routineScreenHTML() {
  const today = todayStr();
  return `<section class="routine card">
    <div class="rt-date">${esc(dayWithDow(today))}</div>
    ${routineRowsHTML(today)}
    ${routineNoteHTML(today)}
    ${routineWeekHTML()}
  </section>`;
}

function renderEcon() {
  view.dataset.today = todayStr(); // 밤새 열어 두었다가 날짜가 바뀌면 다시 그리려고 기억해 둬요
  view.innerHTML = `
    <h2 class="page-title">경제 루틴</h2>
    <p class="page-sub">매일 조금씩, 가볍게 점검해요.</p>
    <div class="chips">${viewChips('econView', ui.econView, [['routine', '✅ 오늘 루틴'], ['terms', '📒 용어 노트']])}</div>
    ${ui.econView === 'terms' ? termsScreenHTML() : routineScreenHTML()}`;
}

/* ---------------------------------------------------------------------
   📒 용어 노트: 새로 알게 된 경제 용어를 "용어 + 내 말로 한 줄"로 적어 둬요. (type 'econTerm' · date = 처음 적은 날)
   가나다순에 자음 제목(ㄱ ㄴ …), 숫자·기호는 "기타", 영어 용어는 맨 뒤 "A–Z". ☁ 동기화와 백업 파일에 같이 들어가요.
   --------------------------------------------------------------------- */
const termsAll = () => ofType('econTerm').filter((t) => !t.sample);
const termKey = (s) => String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase(); // 같은 용어인지 볼 때: 띄어쓰기·대소문자 차이는 무시
const TERM_CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const TERM_CHO_BASE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' }; // 쌍자음은 짝이 되는 자음 제목 아래에 모아요
const TERM_GROUPS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function termGroup(term) {
  const c = String(term || '').trim().normalize('NFC').charAt(0);
  const code = c.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) { const ini = TERM_CHO[Math.floor((code - 0xAC00) / 588)]; const g = TERM_CHO_BASE[ini] || ini; return { label: g, order: TERM_GROUPS.indexOf(g) }; }
  if (code >= 0x3131 && code <= 0x314E) { const g = TERM_CHO_BASE[c] || c; const i = TERM_GROUPS.indexOf(g); if (i >= 0) return { label: g, order: i }; }
  if (/[A-Za-z]/.test(c)) return { label: 'A–Z', order: 100 };
  return { label: '기타', order: 50 };
}
const termsBetween = (start, end) => termsAll().filter((t) => t.date >= start && t.date <= end).sort(byOldest);
const termsLine = (terms) => `새로 정리한 용어: ${terms.map((t) => (hasValue(t.meaning) ? `${oneLine(t.term)} — ${oneLine(t.meaning)}` : oneLine(t.term))).join(' / ')}`;

function termFormHTML(t) {
  return `<form id="termForm" class="card term-form" data-id="${t ? esc(t.id) : ''}" novalidate>
    <div class="field"><label for="tm_term">용어</label><input id="tm_term" name="term" type="text" maxlength="60" autocomplete="off" value="${t ? esc(t.term) : ''}" placeholder="예: 금리"></div>
    <div class="field"><label for="tm_meaning">내 말로 한 줄</label><input id="tm_meaning" name="meaning" type="text" maxlength="200" autocomplete="off" value="${t ? esc(t.meaning || '') : ''}" placeholder="예: 돈을 빌리고 빌려줄 때 붙는 값"></div>
    <p class="error" id="termErr" role="alert"></p>
    <div class="row"><button type="submit" class="btn">저장</button><button type="button" class="btn ghost" data-act="termCancel">취소</button>${t ? `<button type="button" class="btn danger" data-act="termDelete" data-id="${esc(t.id)}">삭제</button>` : ''}</div>
  </form>`;
}
function termListHTML() {
  const all = termsAll();
  if (!all.length) return `<div class="empty">${esc(EMPTY_TEXT.terms)}</div>`;
  const q = termKey(ui.termQuery);
  const shown = all.filter((t) => !q || termKey(t.term).includes(q) || termKey(t.meaning).includes(q));
  if (!shown.length) return '<div class="empty">찾는 용어가 없어요.</div>';
  const collator = new Intl.Collator(['ko', 'en'], { sensitivity: 'base', numeric: true });
  const groups = new Map();
  shown.forEach((t) => { const g = termGroup(t.term); if (!groups.has(g.label)) groups.set(g.label, { ...g, list: [] }); groups.get(g.label).list.push(t); });
  return [...groups.values()].sort((a, b) => a.order - b.order).map((g) => `<section class="term-group" data-group="${esc(g.label)}">
    <h3 class="term-h">${esc(g.label)}</h3>
    ${g.list.sort((a, b) => collator.compare(a.term, b.term)).map((t) => (ui.termEdit === t.id
    ? `<div class="term-row editing" data-rid="${esc(t.id)}">${termFormHTML(t)}</div>`
    : `<div class="term-row" data-rid="${esc(t.id)}"><button type="button" class="term-main" data-act="termEdit" data-id="${esc(t.id)}" title="눌러서 고치기"><b class="term-name">${esc(t.term)}</b>${hasValue(t.meaning) ? `<span class="term-meaning">${esc(t.meaning)}</span>` : '<span class="term-meaning faint">내 말로 한 줄을 적어 보세요</span>'}</button></div>`)).join('')}
  </section>`).join('');
}
function termsScreenHTML() {
  return `<section class="terms">
    <div class="row actions-row add-row term-bar">
      <button type="button" class="btn" data-act="termAdd">＋ 용어 추가</button>
      <input id="termSearch" class="search" type="search" placeholder="용어 찾기" value="${esc(ui.termQuery)}" aria-label="용어 찾기" autocomplete="off">
    </div>
    <div id="termAddBox">${ui.termAdding ? termFormHTML(null) : ''}</div>
    <div id="termList">${termListHTML()}</div>
  </section>`;
}
function refreshTerms() {
  const list = $('#termList'); if (list) list.innerHTML = termListHTML();
  const box = $('#termAddBox'); if (box) box.innerHTML = ui.termAdding ? termFormHTML(null) : '';
}
function flashTerm(id) {
  setTimeout(() => {
    const el = document.querySelector(`#termList [data-rid="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2000);
  }, 40);
}
async function saveTerm(form) {
  const id = form.dataset.id;
  const term = form.elements.term.value.trim().replace(/\s+/g, ' ');
  const meaning = form.elements.meaning.value.trim();
  const err = $('#termErr');
  if (!term) { err.textContent = '용어를 적어 주세요.'; return; }
  const dup = termsAll().find((t) => termKey(t.term) === termKey(term) && t.id !== id);
  if (dup) {
    if (id) { err.textContent = '이미 있는 용어예요.'; return; }
    toast('이미 있어요. 그 용어로 가 볼게요.', 3000); // 같은 용어를 다시 추가하면 그 용어로 이동해요
    ui.termAdding = false; ui.termQuery = '';
    render(); flashTerm(dup.id);
    return;
  }
  if (id) {
    const old = records.find((x) => x.id === id);
    if (!old) return;
    if (!(await saveRecord({ ...old, term, meaning, updatedAt: Date.now() }))) return;
    ui.termEdit = null;
    refreshTerms();
    toast('용어를 고쳤어요.', 2500);
    return;
  }
  const at = Date.now();
  const rec = { id: newId(), type: 'econTerm', date: todayStr(), term, meaning, createdAt: at, updatedAt: at };
  if (!(await saveRecord(rec))) return;
  ui.termAdding = false; ui.termQuery = '';
  render(); flashTerm(rec.id);
  if (settings.celebrateOff) toast('용어를 저장했어요', 3000);
  else stampToast({ head: pickStamp({ type: 'econRoutine' }).text, line: term }); // 경제 칭찬 + 둘째 줄에 용어 이름
}
async function deleteTerm(id) {
  const t = records.find((x) => x.id === id);
  if (!t) return;
  if (!confirm(`'${t.term}' 용어를 지울까요?\n지운 용어는 되돌릴 수 없어요.`)) return;
  await deleteRecord(id);
  ui.termEdit = null;
  render();
}

// 다른 화면의 기록으로 이동해서 잠깐 표시해 줘요 (도장 모음판 등에서)
function goToRecord(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  closeDlg();
  if (r.type === 'econRoutine') { ui.tab = 'econ'; ui.econView = 'routine'; }
  else if (r.type === 'art') { ui.tab = 'art'; }
  else if (r.type === 'englishArticle') { ui.tab = 'english'; }
  else if (r.type === 'violin') { ui.tab = 'violin'; ui.vnView = 'records'; }
  const inDay = r.type !== 'econRoutine' && r.type !== 'art' && r.type !== 'englishArticle' && r.type !== 'violin'; // 운동 · 쉼은 따로 목록이 없어서 그날의 기록 창으로 가요
  ui.query = '';
  render();
  if (inDay) openDay(r.date);
  setTimeout(() => {
    const el = document.querySelector(`[data-rid="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2000);
  }, 60);
}

/* ---------------------------------------------------------------------
   10. 🎨 그림 (갤러리 하나. 지금까지 그린 것을 큰 썸네일 격자로만 보여요. 날짜별 묶음·빈 칸·숫자는 없어요)
   --------------------------------------------------------------------- */
// 종류: 새 기록은 artKind 에, 예전 기록은 "단계"로 읽어요 (그대로 모작·조금 바꿔 그리기 → 모작, 창작 → 창작, 없으면 모작)
const artKindOf = (r) => (ART_KINDS.includes(r.artKind) ? r.artKind : (ART_STAGE_TO_KIND[r.stage] || '모작'));
// 사진: 새 기록은 images(여러 장), 예전 기록은 image(한 장)
const artPhotos = (r) => (Array.isArray(r.images) && r.images.length ? r.images : (r.image ? [r.image] : []));
const artCount = (r) => Math.max(1, artPhotos(r).length); // 그린 양은 사진 수로 세요 (사진이 없는 예전 기록은 1장)
const artTitle = (r) => r.topic || artKindOf(r);

function artTileHTML(r) {
  const photos = artPhotos(r);
  const say = `${dayLabel(r.date)}, ${artKindOf(r)}${r.topic ? `, ${r.topic}` : ''}`;
  return `<button type="button" class="art-tile" data-act="artOpen" data-id="${esc(r.id)}" data-rid="${esc(r.id)}" aria-label="${esc(say)}">
    <span class="art-thumb">${photos[0] ? `<img src="${esc(photos[0])}" alt="" loading="lazy" decoding="async">` : '<span class="art-noimg">사진 없음</span>'}</span>
    <span class="art-cap"><span>${esc(shortDay(r.date))}</span><span class="tag art-kind small">${esc(artKindOf(r))}</span></span>
  </button>`;
}

function artGalleryHTML() {
  const list = ofType('art').sort(byNewest);
  if (!list.length) return '<div class="empty">그리고 싶은 날, 그린 그림을 올려 보세요. 사진을 끌어다 놓거나 붙여넣어도 돼요.</div>';
  return `<div class="art-grid">${list.map(artTileHTML).join('')}</div>`;
}

function renderArt() {
  view.innerHTML = `
    <h2 class="page-title">🎨 그림</h2>
    <p class="page-sub">그리고 싶은 날 놀러 오는 곳이에요. 안 그려도 괜찮아요.</p>
    <div class="row actions-row add-row">
      <button type="button" class="btn" data-act="add" data-type="art">＋ 그림 올리기</button>
    </div>
    ${artGalleryHTML()}`;
}

// 예전에 적어 둔 값 (원작자·원본과 다른 점·가져갈 것·참고 강의 등). 지우지 않고 읽기만 해요.
function legacyArtMemoHTML(r) {
  const rows = [];
  const add = (label, v) => { if (hasValue(v)) rows.push([label, Array.isArray(v) ? v.join('·') : v]); };
  add('단계', r.stage); add('원작자', r.origin); add('원본과 다른 점', r.diff); add('내 그림에 가져갈 것', r.carry);
  add('다음엔 바꿔 그려 보기', r.nextChips); add('참고한 강의·영상', r.course);
  add('마음에 드는 곳', r.liked); add('다음에 해볼 것', r.next);
  const refs = hasValue(r.refs) ? linksBlock(r.refs, '참고 링크') : '';
  if (!rows.length && !refs) return '';
  return `<div class="legacy-memo"><div class="label">예전 메모 <span class="meta">(읽기만 해요)</span></div>
    ${rows.map(([l, v]) => `<p class="pre"><span class="meta">${esc(l)}</span> ${esc(v)}</p>`).join('')}${refs}</div>`;
}

// 썸네일을 누르면 열리는 상세 창: 사진 크게(여러 장이면 ◀ ▶)
function openArt(id, i = 0) {
  const r = records.find((x) => x.id === id && x.type === 'art');
  if (!r) return;
  const photos = artPhotos(r);
  ui.artOpen = id;
  ui.artPhoto = Math.min(Math.max(0, i), Math.max(0, photos.length - 1));
  const mine = photos.length
    ? `<figure class="art-fig"><img class="art-img" id="artMainImg" src="${esc(photos[ui.artPhoto])}" alt="${esc(artTitle(r))}">
        ${photos.length > 1 ? `<div class="art-nav"><button type="button" class="btn ghost small" data-act="artNav" data-d="-1" aria-label="이전 사진">◀</button><button type="button" class="btn ghost small" data-act="artNav" data-d="1" aria-label="다음 사진">▶</button></div>` : ''}
        </figure>`
    : '<div class="art-noimg">사진 없음</div>';
  openDlg(`<div class="art-detail" data-rid="${esc(r.id)}">
    <div class="item-head">
      <div><span class="tag art-kind">${esc(artKindOf(r))}</span> <span class="meta">${esc(dayLabel(r.date))}</span> ${marksHTML(r)}</div>
    </div>
    ${r.topic ? `<h2 style="margin:6px 0 10px">${esc(r.topic)}</h2>` : ''}
    <div class="art-main">${mine}</div>
    <div class="row" style="margin-top:12px">
      ${feedbackBadge(r)}
      <button type="button" class="btn ghost small" data-act="edit" data-type="art" data-id="${esc(r.id)}">수정</button>
      <button type="button" class="btn danger small" data-act="del" data-type="art" data-id="${esc(r.id)}">삭제</button>
    </div>
    ${legacyArtMemoHTML(r)}
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>
  </div>`, 'roomy');
}
// 사진 넘기기: 창을 다시 그리지 않고 사진만 바꿔요
function artNav(d) {
  const r = records.find((x) => x.id === ui.artOpen);
  const img = $('#artMainImg');
  if (!r || !img) return;
  const photos = artPhotos(r);
  ui.artPhoto = (ui.artPhoto + d + photos.length) % photos.length;
  img.src = photos[ui.artPhoto];
}
// 열려 있는 상세 창을 새로 그려요 (피드백을 붙여 넣거나 고친 뒤)
function refreshArtDetail() { if (dlg.open && ui.artOpen && dlg.querySelector('.art-detail')) openArt(ui.artOpen, ui.artPhoto); }

// 캘린더 날짜 창 안의 그림 카드 (작은 사진 + 종류·한 줄. 사진을 누르면 상세 창)
function artDayCard(r) {
  const photos = artPhotos(r);
  return `<div class="card art-day" data-rid="${esc(r.id)}">
    <div class="item-head">
      <div class="art-day-main">
        <button type="button" class="art-day-thumb" data-act="artOpen" data-id="${esc(r.id)}" aria-label="그림 크게 보기">${photos[0] ? `<img src="${esc(photos[0])}" alt="">` : '🎨'}</button>
        <div><div><span class="tag art-kind">${esc(artKindOf(r))}</span> ${marksHTML(r)}</div>${r.topic ? `<div class="pre">${esc(r.topic)}</div>` : ''}</div>
      </div>
      ${actionButtons('art', r.id, claudeBtns(r))}
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------
   10-1. 📰 영어 (주 1회 기사를 읽고 세 줄로 정리해요. 링크의 제목을 가져오는 등 밖으로 나가는 요청은 없어요)
   --------------------------------------------------------------------- */
function linkHref(link) {
  const t = String(link || '').trim();
  return !t ? '' : /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function domainOf(link) {
  const href = linkHref(link);
  if (!href) return '';
  try { return new URL(href).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

function englishCard(r) {
  const dom = domainOf(r.link);
  const sums = [r.sum1, r.sum2, r.sum3].map((t, i) => ({ n: i + 1, t: String(t || '').trim() })).filter((x) => x.t);
  return `<article class="card en-card" data-rid="${esc(r.id)}">
    <div class="item-head">
      <div class="meta">${esc(dayLabel(r.date))}${dom ? ` · <a href="${esc(linkHref(r.link))}" target="_blank" rel="noopener noreferrer" class="en-dom">${esc(dom)}</a>` : ''}</div>
    </div>
    ${sums.length ? `<ol class="en-sum">${sums.map((x) => `<li value="${x.n}">${esc(x.t)}</li>`).join('')}</ol>` : ''}
    <div class="row card-btns" style="margin-top:10px">
      ${feedbackBadge(r)}
      <button type="button" class="btn ghost small" data-act="edit" data-type="englishArticle" data-id="${esc(r.id)}">✍ 수정</button>
      <button type="button" class="btn danger small" data-act="del" data-type="englishArticle" data-id="${esc(r.id)}">삭제</button>
    </div>
  </article>`;
}

// 이번 주(일~토) 표시: 기록이 하나라도 있으면 ✓ (연속 주 수·빠진 주는 세지 않아요)
function englishWeekLabel() {
  const sun = weekStartOf(todayStr());
  const sat = addDays(sun, 6);
  const has = ofType('englishArticle').some((r) => r.date >= sun && r.date <= sat);
  const f = (d) => `${parseDate(d).getMonth() + 1}/${parseDate(d).getDate()}`;
  return `이번 주 ${has ? '✓ ' : ''}(${f(sun)} ~ ${f(sat)})`;
}

function englishBodyHTML() {
  const arts = ofType('englishArticle').sort(byNewest);
  return `<p class="meta area-line" id="enWeek">${esc(englishWeekLabel())}</p>${arts.length ? arts.map(englishCard).join('') : `<div class="empty">${esc(EMPTY_TEXT.english)}</div>`}`;
}

function renderEnglish() {
  view.innerHTML = `
    <h2 class="page-title">영어</h2>
    <p class="page-sub">일주일에 기사 하나, 세 줄로 정리해요.</p>
    <div class="row actions-row add-row">
      <button type="button" class="btn" data-act="add" data-type="englishArticle">＋ 이번 주 기사 추가</button>
    </div>
    ${englishBodyHTML()}`;
}

/* ---------------------------------------------------------------------
   🗓 이번 주 (주간 루틴표): 폰에서 매일 열어 보는 한 주(일~토) 표예요. 점수·비율·연속 같은 말은 없어요.
   항상 "표"로만 보여요: 사진 같은 주간 시간표(가로 7열 일~토 · 세로 시간축). 운동 블록을 누르면 "했어요" 체크(✓)가 켜지고 꺼져요.
   운동은 종류를 나누지 않아요(모두 "운동", 색도 하나). 저장된 kind 값은 지우지 않고 그대로 두지만 화면에는 쓰지 않아요.
   데이터 (모두 ☁ 동기화·백업에 같이 들어가요):
   - 설정 값 'tutorBase'   = 과외 기본 시간표 [{ from(적용이 시작되는 주의 일요일 날짜, ''면 처음부터), blocks: [{ id, d(0=일~6=토), name, s('H:MM'), e, m('대면'|'온라인') }] }]
                             "앞으로 계속"으로 고치면 그 주부터 새 시간표가 시작돼요. 지나간 주는 그때 시간표 그대로 보여요.
   - 기록 'weekPlan'       = 한 주에 하나 (id 'wp-<일요일 날짜>'): { weight, tutor: { add, edit, del }(이번 주만 바꾼 과외), ex: { 요일번호: { blocks: [{ name, kind('운동'), optional, s, e }] } }(📥 로 붙여 넣은 그 주 운동. 운동 블록은 이것만 써요), memo(그 주 메모), skip: [체크를 푼 운동 "요일:블록번호"(예전: "요일:종류")] }
   (설정 값 'weekView'(예전 [목록][표] 보기)와 'weekRoutine'(예전 운동 루틴)은 이제 읽지 않아요. 값이 남아 있어도 괜찮아요 · 지우거나 바꾸지 않아요.)
   운동 체크는 따로 저장하지 않고 운동 기록(type 'workout')에서 읽어요. 체크하면 그 날짜의 운동 기록이 하나 생기고(kind '운동', plan: 그 블록 번호+1), 풀면 그 기록이 지워져요.
   (운동 탭에서 한 줄·운동량 같은 것을 더한 기록은 지우지 않고 "남겨 둘게요" 하고 체크 표시만 꺼요.)
   --------------------------------------------------------------------- */
const EX_KIND = '운동'; // 운동 블록·운동 기록에 새로 저장하는 kind (종류를 나누지 않아요)
const EX_WORDS = ['운동', '근력', '유산소', '요가', '슬로조깅']; // 시간표 글에서 운동 블록 끝에 붙어 있어도 알아듣는 말 (전부 운동 하나로 읽어요)
const DOW = '일월화수목금토';
const hhmm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim()); if (!m) return ''; const h = Number(m[1]); const mi = Number(m[2]); return h < 24 && mi < 60 ? `${h}:${pad(mi)}` : ''; };
const timeMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const blockTime = (b) => (b.s ? (b.e ? `${b.s}~${b.e}` : b.s) : '');

/* ---- 운동 블록 (그 주 기록 weekPlan.ex: 📥 로 붙여 넣은 것만) ---- */
// 운동 블록: { name, kind, optional, s(시작, 없을 수 있어요), e(끝, 없을 수 있어요) }
//   kind 는 화면에 쓰지 않아요. 예전에 저장된 값(근력·유산소…)은 그대로 보관하고, 새로 만드는 블록은 '운동'이에요.
function normExBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const kind = typeof b.kind === 'string' && b.kind.trim() ? b.kind.trim() : EX_KIND;
  return { name: String(b.name || '').trim().slice(0, 300) || EX_KIND, kind, optional: !!b.optional, s: hhmm(b.s), e: hhmm(b.e) };
}
/* ---- 과외 기본 시간표 (설정 값 'tutorBase') ---- */
function normBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const d = Number(b.d); const name = String(b.name || '').trim();
  if (!Number.isInteger(d) || d < 0 || d > 6 || !name) return null;
  const s = hhmm(b.s); const e = hhmm(b.e);
  return { id: String(b.id || `${d}|${name}|${s}|${e}`), d, name, s, e, m: b.m === '대면' ? '대면' : '온라인' };
}
const tutorVersions = () => {
  const v = getConfig('tutorBase', null);
  return (Array.isArray(v) ? v : []).filter((x) => x && Array.isArray(x.blocks))
    .map((x) => ({ from: weekKey(x.from) || '', blocks: x.blocks.map(normBlock).filter(Boolean) }))
    .sort((a, b) => a.from.localeCompare(b.from));
};
const tutorBaseEmpty = () => !tutorVersions().some((v) => v.blocks.length);
// 그 주에 적용되는 기본 시간표 (그 주 이전에 시작한 것 중 가장 나중 것)
const baseBlocksFor = (sun) => { const vs = tutorVersions().filter((v) => v.from <= sun); return vs.length ? vs[vs.length - 1].blocks : []; };
const BLOCK_KEYS = ['name', 's', 'e', 'm'];
const cleanPatch = (p) => { const o = {}; if (p && typeof p === 'object') BLOCK_KEYS.forEach((k) => { if (p[k] !== undefined) o[k] = p[k]; }); return o; };

/* ---- 그 주 기록 (record 'weekPlan') ---- */
const weekPlanOf = (sun) => records.find((r) => r.type === 'weekPlan' && r.id === `wp-${sun}`);
const planTutor = (p) => {
  const t = p && p.tutor && typeof p.tutor === 'object' ? p.tutor : {};
  return { add: (Array.isArray(t.add) ? t.add : []).map(normBlock).filter(Boolean), edit: t.edit && typeof t.edit === 'object' ? { ...t.edit } : {}, del: Array.isArray(t.del) ? t.del.map(String) : [] };
};
// 체크를 푼 운동 표시: "요일번호:블록번호" (예전에는 "요일번호:종류", 더 예전에는 요일 숫자 하나였어요. 숫자는 그 요일의 운동 모두예요)
const planSkip = (p) => (p && Array.isArray(p.skip) ? p.skip.filter((t) => (typeof t === 'number' ? Number.isInteger(t) && t >= 0 && t <= 6 : typeof t === 'string' && /^[0-6]:[^\s:]+$/.test(t))) : []);
const skipToks = (dow, blk, idx) => [`${dow}:${idx}`, ...(blk.kind && blk.kind !== EX_KIND ? [`${dow}:${blk.kind}`] : [])]; // 이 블록을 가리키는 표시들 (예전 종류 표시 포함)
const isSkipped = (plan, dow, blk, idx) => { const s = planSkip(plan); return s.includes(dow) || skipToks(dow, blk, idx).some((t) => s.includes(t)); };
const planWeight = (p) => (p && Number(p.weight) > 0 ? Number(p.weight) : 0);
const planMemo = (p) => (p && typeof p.memo === 'string' ? p.memo.trim() : '');
// 그 주의 운동: { 요일번호: { blocks } } (📥 로 붙여 넣은 요일만. 붙여 넣지 않은 주는 운동 블록이 없어요)
const planEx = (p) => {
  const e = p && p.ex && typeof p.ex === 'object' ? p.ex : {};
  const out = {};
  for (let d = 0; d < 7; d += 1) { const v = e[d]; if (v && typeof v === 'object' && Array.isArray(v.blocks)) out[d] = { blocks: v.blocks.map(normExBlock).filter(Boolean) }; }
  return out;
};
const planUsed = (p) => { const t = planTutor(p); return !!(t.add.length || t.del.length || Object.keys(t.edit).length || Object.keys(planEx(p)).length || planMemo(p)); }; // "이번 주만" 바꾼 것이 있나

// 그 주 그 요일의 운동 블록: 📥 로 붙여 넣은 것만 (없으면 빈 목록)
const exBlocksOf = (sun, dow) => (planEx(weekPlanOf(sun))[dow] || { blocks: [] }).blocks;

// 그 주에 보이는 과외 블록: 기본 시간표 − 이번 주만 지운 것 + 이번 주만 바꾼 것 + 이번 주만 더한 것
function tutorBlocksOf(sun) {
  const t = planTutor(weekPlanOf(sun));
  const out = baseBlocksFor(sun).filter((b) => !t.del.includes(b.id)).map((b) => {
    const patch = cleanPatch(t.edit[b.id]);
    return { ...b, ...patch, s: hhmm(patch.s !== undefined ? patch.s : b.s), e: hhmm(patch.e !== undefined ? patch.e : b.e), m: (patch.m !== undefined ? patch.m : b.m) === '대면' ? '대면' : '온라인', src: 'base', once: Object.keys(patch).length > 0 };
  });
  t.add.forEach((b) => out.push({ ...b, src: 'add', once: true }));
  return out;
}

// 그 주 과외 회수·시간 합계 (지금 보이는 과외 블록만, 운동은 빼요. 시간 = 끝 − 시작이고 끝 시간이 없는 블록은 회수에만 들어가요)
function tutorTotals(sun) {
  const blocks = tutorBlocksOf(sun);
  const min = blocks.reduce((n, b) => { const s = timeMin(b.s); const e = timeMin(b.e); return s !== null && e !== null && e > s ? n + e - s : n; }, 0);
  return { count: blocks.length, min };
}
function tutorTotalText({ count, min }) {
  if (!count) return '과외 없음';
  const h = Math.floor(min / 60); const m = min % 60;
  const time = [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ');
  return `과외 ${count}회${time ? ` · ${time}` : ''}`;
}

// 한 주 기록을 바꿔요. 순서대로 하나씩 실행해서 서로 덮어쓰지 않아요. 아무것도 안 남으면 그 기록은 저절로 사라져요.
let weekQueue = Promise.resolve();
function updateWeekPlan(sun, patch) {
  const run = async () => {
    const id = `wp-${sun}`;
    const old = weekPlanOf(sun);
    const { sample, ...keep } = old || {};
    const rec = { ...keep, id, type: 'weekPlan', date: sun, createdAt: old ? old.createdAt : Date.now(), weight: planWeight(old) || '', tutor: planTutor(old), skip: [...planSkip(old)], ex: planEx(old), memo: planMemo(old) };
    patch(rec);
    rec.skip = [...new Set(rec.skip)].sort((a, b) => String(a).localeCompare(String(b)));
    const t = rec.tutor;
    Object.keys(t.edit).forEach((k) => { const c = cleanPatch(t.edit[k]); if (Object.keys(c).length) t.edit[k] = c; else delete t.edit[k]; });
    const tidy = {}; // 비어 있는 칸은 적지 않아요
    if (t.add.length) tidy.add = t.add;
    if (Object.keys(t.edit).length) tidy.edit = t.edit;
    if (t.del.length) tidy.del = [...new Set(t.del)];
    const used = Object.keys(tidy).length > 0;
    if (used) rec.tutor = tidy; else delete rec.tutor;
    if (!(Number(rec.weight) > 0)) rec.weight = '';
    const exKeys = Object.keys(rec.ex || {});
    if (!exKeys.length) delete rec.ex;
    rec.memo = String(rec.memo || '').trim();
    if (!rec.memo) delete rec.memo;
    const empty = !rec.weight && !rec.skip.length && !used && !exKeys.length && !rec.memo;
    rec.updatedAt = Date.now();
    if (empty) { if (old) await deleteRecord(old.id); return null; }
    return (await saveRecord(rec)) ? rec : undefined; // null: 비어서 지움, undefined: 저장 못 함
  };
  weekQueue = weekQueue.then(run, run);
  return weekQueue;
}

/* ---- 운동 체크 ↔ 운동 기록 ---- */
// 그 날짜의 운동 블록마다 체크로 읽히는 운동 기록 (블록 하나에 기록 하나).
//   ① 표에서 만든 기록은 만들 때의 블록 번호(plan = 번호+1)의 블록에 붙고 ② 예전에 종류가 달랐던 기록은 같은 종류의 블록에 붙고
//   ③ 나머지(운동 탭에서 남긴 기록 등)는 아직 짝이 없는 블록을 앞에서부터 채워요. 종류는 더 이상 나누지 않아요.
function dayAssign(date, blocks) {
  const recs = ofType('workout').filter((r) => !r.sample && r.date === date).sort(byOldest);
  const per = blocks.map(() => []);
  let left = [];
  recs.forEach((r) => { const k = typeof r.plan === 'number' ? r.plan - 1 : -1; if (k >= 0 && k < blocks.length && !per[k].length) per[k].push(r); else left.push(r); });
  left = left.filter((r) => { // 예전 종류가 남아 있는 기록은 같은 종류의 블록으로
    if (!r.kind || r.kind === EX_KIND) return true;
    const k = blocks.findIndex((b, i) => !per[i].length && b.kind === r.kind);
    if (k < 0) return true;
    per[k].push(r); return false;
  });
  let n = 0;
  per.forEach((hit) => { if (!hit.length && n < left.length) { hit.push(left[n]); n += 1; } });
  return per;
}
// 블록마다 체크 켜짐 여부 (풀어 둔 표시가 있으면 꺼짐)
const dayChecks = (date, dow, blocks, plan) => dayAssign(date, blocks).map((hit, i) => hit.length > 0 && !isSkipped(plan, dow, blocks[i], i));
// 운동 탭에서 한 줄·운동량·거리를 더한 기록은 "고친 기록"이라 지우지 않아요
const planTouched = (r) => hasValue(r.memo) || !!amountOf(r) || Number(r.distance) > 0;
let weekChecking = false;
async function setWeekCheck(date, idx, on) {
  if (weekChecking) return;
  weekChecking = true;
  try {
    const dow = parseDate(date).getDay(); const sun = weekStartOf(date);
    const blocks = exBlocksOf(sun, dow); const blk = blocks[idx];
    if (!blk || date > todayStr()) return; // 없는 블록·아직 안 온 날은 체크할 수 없어요
    const has = dayAssign(date, blocks)[idx];
    if (on) {
      const plan = weekPlanOf(sun);
      if (isSkipped(plan, dow, blk, idx)) { const gone = [dow, ...skipToks(dow, blk, idx)]; await updateWeekPlan(sun, (p) => { p.skip = p.skip.filter((x) => !gone.includes(x)); }); }
      if (has.length) { render(); return; } // 이 블록에 이미 운동 기록이 있으면 새로 만들지 않아요
      const rec = { id: newId(), type: 'workout', date, kind: EX_KIND, plan: idx + 1, createdAt: Date.now(), updatedAt: Date.now() };
      assignStamp(rec);
      if (!(await saveRecord(rec))) { render(); return; }
      render(); refreshDay();
      afterNewRecord(rec); // 💮 도장 토스트
      return;
    }
    const auto = has.filter((r) => r.plan && !planTouched(r)); // 표에서 만들고 아직 안 고친 기록만 지워요
    for (const r of auto) await deleteRecord(r.id);
    const left = has.length - auto.length;
    if (left > 0) { // 운동 탭에서 직접 남기거나 고친 기록은 남겨 두고, 체크 표시만 꺼요
      await updateWeekPlan(sun, (p) => { p.skip.push(`${dow}:${idx}`); });
      toast('운동 기록은 남겨 둘게요. 요일 머리를 눌러 그날 기록에서 고치거나 지울 수 있어요.', 3500);
    } else if (auto.length) toast('체크를 풀고, 그때 만든 운동 기록도 지웠어요.', 2500);
    render(); refreshDay();
  } finally { weekChecking = false; }
}

/* ---- 과외 블록 고치기 (이번 주만 / 앞으로 계속) ---- */
const sameOp = (a, b) => a.d === b.d && a.name === b.name && a.s === b.s && a.e === b.e && a.m === b.m;
function applyOp(blocks, op) {
  if (op.type === 'del') return blocks.filter((b) => b.id !== op.id);
  if (op.type === 'edit') return blocks.map((b) => (b.id === op.id ? { ...b, ...cleanPatch(op.patch) } : b));
  return blocks.some((b) => b.id === op.block.id) ? blocks : [...blocks, op.block]; // add
}
// 기본 시간표를 "그 주부터" 바꿔요. 그 주 이전은 그대로고, 그 뒤에 따로 시작하는 시간표가 있으면 거기에도 같은 변경을 해요.
async function applyTutorBase(fromWeek, op) {
  let vs = tutorVersions();
  const from = vs.length ? fromWeek : ''; // 아직 시간표가 없으면 처음부터 적용해요
  if (!vs.some((v) => v.from === from)) {
    const prev = [...vs].reverse().find((v) => v.from < from);
    vs.push({ from, blocks: prev ? prev.blocks.map((b) => ({ ...b })) : [] });
    vs.sort((a, b) => a.from.localeCompare(b.from));
  }
  vs = vs.map((v) => (v.from >= from ? { ...v, blocks: applyOp(v.blocks, op) } : v));
  return setConfig('tutorBase', vs);
}

/* ---------------------------------------------------------------------
   시간표 글 (📥 붙여 넣기가 읽어요. 매주 예약 작업이 만든 시간표를 붙여 넣어요). 한 줄에 한 요일(일~토), 블록은 " / "로 구분, 각 블록은 "이름 시작~끝 종류":
     [시간표]
     일: 휴식
     월: 학생A 9:00~11:00 온라인 / 숄더 요가 12:00~12:30 운동 선택 / 경사 걷기 13:00~13:30 운동
     화: 아로마 요가 10:00 운동 / 학생B 18:00~20:00 대면
     메모: 수·금은 아침 수업이 있어 휴식
   종류: 온라인·대면 = 과외, 운동(예전처럼 근력·유산소·요가·슬로조깅이라고 써도 알아듣고, 전부 운동 하나로 읽어요) = 운동 (뒤에 "선택"이 붙으면 선택 운동) · 끝 시간이 없으면 시작만 · 운동은 시간이 없어도 돼요 · "휴식"/"없음"이면 그 요일은 비어요.
   앞뒤 설명 글과 ``` 표시는 무시하고, [시간표] 표시가 있으면 마지막 [시간표] 아래를, 없으면 "일:"~"토:" 줄을 찾아 읽어요.
   --------------------------------------------------------------------- */
const TUTOR_MODES = ['온라인', '대면'];
const SCHED_KINDS = [...TUTOR_MODES, ...EX_WORDS];
const DAY_LINE_RE = /^[\s>*•\-`]*\**\s*([일월화수목금토])\s*(?:요일)?\s*\**\s*[:：]\s*(.*?)[\s`]*$/;
const MEMO_LINE_RE = /^[\s>*•\-`]*\**\s*메모\s*\**\s*[:：]\s*(.*?)[\s`]*$/;
const REST_RE = /^(휴식|쉼|없음|없어요|-|—)$/;
const T_RE = '(\\d{1,2}:\\d{2})';
const BLOCK_TIME_RE = new RegExp(`^(.+?)\\s+${T_RE}(?:\\s*[~∼～–-]\\s*${T_RE})?(?:\\s+(${SCHED_KINDS.join('|')}))?(?:\\s*\\(?\\s*(선택)\\s*\\)?)?$`);
const BLOCK_NOTIME_RE = new RegExp(`^(.+?)\\s+(${EX_WORDS.join('|')})(?:\\s*\\(?\\s*(선택)\\s*\\)?)?$`);
// 블록 하나 → { tutor } 또는 { ex } 또는 { why }
function parseBlockText(part, d) {
  const t = part.trim();
  let m = BLOCK_TIME_RE.exec(t);
  let name; let s = ''; let e = ''; let kind = ''; let optional = false;
  if (m) { [, name, s, e, kind] = m; optional = m[5] === '선택'; s = hhmm(s); e = e ? hhmm(e) : ''; if (!s || (m[3] && !e)) return { why: `"${t}" 의 시간이 올바르지 않아요` }; }
  else if ((m = BLOCK_NOTIME_RE.exec(t))) { [, name, kind] = m; optional = m[3] === '선택'; }
  else return { why: `"${t}" 은 읽지 못했어요 (이름 9:00~11:00 온라인 · 이름 13:00~13:30 운동)` };
  if (e && timeMin(e) <= timeMin(s)) return { why: `"${t}" 은 끝나는 시간이 시작보다 늦어야 해요` };
  name = name.trim().replace(/\s+/g, ' ');
  if (EX_WORDS.includes(kind)) return { ex: { name: name.slice(0, 300), kind: EX_KIND, optional, s, e } }; // 근력·유산소·요가·운동 모두 운동 하나
  return { tutor: { id: newId(), d, name: name.slice(0, 30), s, e, m: kind === '대면' ? '대면' : '온라인' } }; // 종류가 없으면 온라인 과외
}
// 글 전체 → { days: [{ present, tutors, ex }] × 7, memo, bad: [{ line, why }], dup: [요일번호], any }
function parseSchedule(text) {
  let lines = String(text || '').split(/\r?\n/);
  const mk = lines.map((l, i) => (/^[\s`>*-]*\**\s*\[\s*시간표\s*\]/.test(l) ? i : -1)).filter((i) => i >= 0);
  let inBlock = false;
  if (mk.length) { // [시간표] 표시가 있으면 마지막 표시 아래만, 코드 블록이 끝나는 ``` 에서 멈춰요
    lines = lines.slice(mk[mk.length - 1] + 1);
    const end = lines.findIndex((l) => /^\s*```/.test(l));
    if (end >= 0) lines = lines.slice(0, end);
    inBlock = true;
  }
  const days = Array.from({ length: 7 }, () => ({ present: false, tutors: [], ex: [] }));
  const bad = []; const dup = []; let memo = '';
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line || /^`{3}/.test(line)) return;
    const mm = MEMO_LINE_RE.exec(line);
    if (mm) { memo = mm[1].slice(0, 300); return; }
    const dm = DAY_LINE_RE.exec(line);
    if (!dm) { if (inBlock) bad.push({ line, why: '요일(일~토) 한 글자와 ":"로 시작해야 해요' }); return; }
    const d = DOW.indexOf(dm[1]);
    const rest = dm[2].replace(/\*\*/g, '').trim();
    const found = { present: true, tutors: [], ex: [] }; let why = '';
    if (rest && !REST_RE.test(rest)) {
      for (const part of rest.split(/\s*\/\s*/)) {
        const r = parseBlockText(part, d);
        if (r.why) { why = r.why; break; }
        if (r.tutor) found.tutors.push(r.tutor); else found.ex.push(r.ex);
      }
    }
    if (why) { bad.push({ line, why }); return; }
    if (days[d].present && !dup.includes(d)) dup.push(d);
    days[d] = found; // 같은 요일이 여러 번 나오면 마지막 줄을 읽어요
  });
  return { days, memo, bad, dup, any: days.some((x) => x.present) };
}
const parsedCounts = (ps) => ({ tutors: ps.days.reduce((n, d) => n + d.tutors.length, 0), ex: ps.days.reduce((n, d) => n + d.ex.length, 0) });

/* ---- 📥 클로드 시간표 붙여 넣기 → 지금 보는 주에만 반영 ---- */
// 붙여 넣은 글을 그 주에 얹은 "결과" (적힌 요일은 붙여 넣은 것, 안 적힌 요일은 지금 모습 그대로)
function weekModel(sun, ps) {
  const curT = tutorBlocksOf(sun);
  const days = Array.from({ length: 7 }, (_, d) => {
    if (ps && ps.days[d].present) return { tutors: ps.days[d].tutors, ex: ps.days[d].ex };
    return { tutors: curT.filter((b) => b.d === d), ex: exBlocksOf(sun, d) };
  });
  return { sun, days, memo: ps ? ps.memo : planMemo(weekPlanOf(sun)) };
}
function aiPreviewHTML(sun, text) {
  if (!String(text || '').trim()) return '<p class="meta">클로드의 답을 붙여 넣으면 여기에 이 주의 표가 미리 보여요.</p>';
  const ps = parseSchedule(text);
  const c = parsedCounts(ps);
  const missing = ps.days.map((d, i) => (d.present ? '' : DOW[i])).filter(Boolean);
  return `${ps.bad.map((b) => `<p class="wkp-bad">읽지 못한 줄: ${esc(b.line)}<br><span>${esc(b.why)} — 이 줄은 건너뛰어요</span></p>`).join('')}
    ${ps.any ? `<p class="meta">읽은 요일 ${7 - missing.length}개 · 과외 ${c.tutors}개 · 운동 ${c.ex}개${ps.memo ? ' · 메모 있음' : ''}${ps.dup.length ? ` · ${ps.dup.map((d) => DOW[d]).join('·')}요일은 여러 번 나와서 마지막 줄을 읽었어요` : ''}</p>
    ${missing.length && missing.length < 7 ? `<p class="meta">적지 않은 요일(${esc(missing.join('·'))})은 지금 모습 그대로 둬요.</p>` : ''}
    <div class="wkt-prevwrap">${weekTableHTML(weekModel(sun, ps), { preview: true })}</div>` : '<p class="meta">읽을 수 있는 요일 줄이 아직 없어요. ("월: 이름 9:00~11:00 온라인 / …" 모양이에요)</p>'}`;
}
function openWeekAi() {
  const sun = ui.weekStart || weekStartOf(todayStr());
  ui.wkAiWeek = sun; // 반영 대상은 이 창을 연 순간 보고 있던 주 하나예요
  openDlg(`<h2>📥 ${esc(weekLabel(sun))}에 반영해요</h2>
    <p class="meta" style="margin-top:0">클로드의 답을 통째로 붙여 넣어도 돼요. 앞뒤 설명 글과 코드 블록 표시(\`\`\`)는 무시하고 시간표 줄만 읽어요. 과외는 이 주에만 바뀌고(기본 시간표는 그대로), 운동은 이 주에만 표에 나타나요. 다음 주는 과외만 기본 시간표로 돌아가요.</p>
    <div class="field"><label for="wkAiText">클로드가 써 준 시간표</label><textarea id="wkAiText" rows="8" spellcheck="false" placeholder="[시간표]&#10;일: 휴식&#10;월: 학생A 9:00~11:00 온라인 / 숄더 요가 12:00~12:30 운동 선택"></textarea></div>
    <div id="wkAiPrev" class="wkp-prevbox">${aiPreviewHTML(sun, '')}</div>
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button><button type="button" class="btn" id="wkAiGo" data-act="wkAiApply" disabled>이번 주에 반영</button></div>`, true);
}
function syncWeekAi() {
  const ta = $('#wkAiText'); const box = $('#wkAiPrev'); const go = $('#wkAiGo');
  if (!ta || !box) return;
  box.innerHTML = aiPreviewHTML(ui.wkAiWeek, ta.value);
  if (go) go.disabled = !parseSchedule(ta.value).any;
}
// 읽은 요일의 과외·운동을 그 주 기록에 덮어써요 (기본 시간표는 건드리지 않아요)
async function applyWeekAi() {
  const ta = $('#wkAiText');
  const sun = ui.wkAiWeek;
  if (!ta || !sun) return;
  const ps = parseSchedule(ta.value);
  if (!ps.any) return;
  const beforeChecked = Array.from({ length: 7 }, (_, d) => dayChecks(addDays(sun, d), d, exBlocksOf(sun, d), weekPlanOf(sun)).some(Boolean));
  const base = baseBlocksFor(sun);
  await updateWeekPlan(sun, (p) => {
    ps.days.forEach((day, i) => {
      if (!day.present) return;
      base.filter((b) => b.d === i).forEach((b) => { if (!p.tutor.del.includes(b.id)) p.tutor.del.push(b.id); delete p.tutor.edit[b.id]; }); // 그 요일의 기본 과외는 이 주에서 빼고
      p.tutor.add = p.tutor.add.filter((b) => b.d !== i).concat(day.tutors);                                                                    // 붙여 넣은 과외로 채워요
      p.ex[i] = { blocks: day.ex };
    });
    p.memo = ps.memo;
  });
  // 운동이 사라진 요일의 체크는 풀려요. 이미 만들어진 운동 기록은 지우지 않아요.
  const lost = ps.days.map((day, i) => (day.present && beforeChecked[i] && !day.ex.length ? DOW[i] : '')).filter(Boolean);
  if (dlg.open) closeDlg();
  render();
  toast(`이 주에 반영했어요.${lost.length ? ` 운동이 없어진 요일(${lost.join('·')})의 운동 기록은 남겨 둘게요.` : ''}`, lost.length ? 5000 : 3000);
}
// ↺ 이번 주를 기본 시간표로: 이 주만 바꾼 과외·📥 로 붙여 넣은 운동·메모를 지워요 (체크는 그대로, 저장돼 있는 몸무게도 그대로)
async function resetWeekToBase() {
  const sun = ui.weekStart || weekStartOf(todayStr());
  if (!planUsed(weekPlanOf(sun))) return;
  if (!confirm(`${weekLabel(sun)}을 기본 시간표로 되돌릴까요?\n이 주에만 바꿔 둔 과외·붙여 넣은 운동·메모가 지워져요. (운동 체크는 그대로예요)`)) return;
  await updateWeekPlan(sun, (p) => { p.tutor = { add: [], edit: {}, del: [] }; p.ex = {}; p.memo = ''; });
  render();
  toast('이 주를 기본 시간표로 되돌렸어요.', 2500);
}

/* ---- 기본 시간표 붙여 넣기 (🗓 화면의 버튼 · ⚙ 설정). 같은 시간표 글을 읽어요 ---- */
const blockText = (b) => `${b.name} ${blockTime(b)} ${b.m || EX_KIND}${b.optional ? ' 선택' : ''}`.replace(/\s+/g, ' ');
function pastePreviewHTML(text) {
  if (!String(text || '').trim()) return '';
  const ps = parseSchedule(text);
  const c = parsedCounts(ps);
  const rows = ps.days.map((d, i) => ({ w: DOW[i], d })).filter((x) => x.d.present && x.d.tutors.length);
  return `${rows.length ? `<ul class="wkp-prev">${rows.map((x) => `<li><b>${x.w}</b> ${x.d.tutors.slice().sort((a, b) => timeMin(a.s) - timeMin(b.s)).map((b) => esc(blockText(b))).join(' · ')}</li>`).join('')}</ul>` : ''}
    ${ps.bad.map((b) => `<p class="wkp-bad">읽지 못한 줄: ${esc(b.line)}<br><span>${esc(b.why)} — 이 줄은 건너뛰어요</span></p>`).join('')}
    ${c.tutors ? `<p class="meta">과외 ${c.tutors}개를 넣어요.</p>` : '<p class="meta">넣을 과외가 아직 없어요.</p>'}
    <p class="meta">운동 줄은 읽지 않아요(운동은 📥로).</p>`;
}
function pasteBoxHTML() {
  const has = !tutorBaseEmpty();
  return `<section class="card wkp-paste" id="wkPaste">
    <h3>📋 기본 시간표 붙여 넣기</h3>
    <p class="meta">한 줄에 한 요일, 블록은 " / "로 나눠요. 과외는 "이름 9:00~11:00 온라인"처럼 써요. 클로드가 써 준 시간표 글도 그대로 읽고, 과외만 넣어요(운동 줄은 읽지 않아요). (이 주에만 반영하거나 운동까지 넣으려면 🗓 화면의 📥 를 써요)</p>
    <textarea id="wkPasteText" rows="6" spellcheck="false" aria-label="기본 시간표" placeholder="월: 학생A 9:00~11:00 온라인 / 학생B 18:00~19:00 대면&#10;화: 학생C 16:00~17:30 온라인&#10;일: 휴식"></textarea>
    <div id="wkPastePrev" class="wkp-prevbox"></div>
    ${has ? `<div class="wkp-how" role="radiogroup" aria-label="이미 있는 시간표"><label class="wkp-pill"><input type="radio" name="wkHow" value="merge" checked> 합치기</label><label class="wkp-pill"><input type="radio" name="wkHow" value="over"> 덮어쓰기</label></div><p class="meta">덮어쓰면 이번 주부터 새 과외 시간표가 되고, 지난 주 과외는 그대로예요.</p>` : ''}
    <div class="row"><button type="button" class="btn" id="wkPasteGo" data-act="wkPasteApply" disabled>이대로 넣기</button><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>
  </section>`;
}
// 붙여 넣기 칸은 창("📋 기본 시간표 붙여 넣기") 안에 있어요.
const wkq = (sel) => { const root = dlg.open && dlg.querySelector('#wkPaste'); return root ? root.querySelector(sel) : null; };
const pasteBlocks = (ps) => parsedCounts(ps).tutors; // 📋 는 과외만 읽어요 (운동 줄은 무시)
function syncPasteBox() {
  const ta = wkq('#wkPasteText'); const box = wkq('#wkPastePrev'); const go = wkq('#wkPasteGo');
  if (!ta || !box) return;
  box.innerHTML = pastePreviewHTML(ta.value);
  if (go) go.disabled = !pasteBlocks(parseSchedule(ta.value));
}
async function applyPaste() {
  const ta = wkq('#wkPasteText');
  if (!ta) return;
  const ps = parseSchedule(ta.value);
  if (!pasteBlocks(ps)) return;
  const how = (wkq('input[name=wkHow]:checked') || {}).value || 'merge';
  const thisWeek = weekStartOf(todayStr());
  const tutors = ps.days.flatMap((d) => d.tutors);
  const first = tutorBaseEmpty();
  const vs = tutorVersions();
  if (tutors.length) {
    if (first) await setConfig('tutorBase', [{ from: '', blocks: tutors }]); // 처음 넣는 시간표는 모든 주에 적용돼요
    else if (how === 'over') await setConfig('tutorBase', [...vs.filter((v) => v.from < thisWeek), { from: thisWeek, blocks: tutors }]);
    else {
      const cur = baseBlocksFor(thisWeek);
      for (const b of tutors) if (!cur.some((c) => sameOp(c, b))) await applyTutorBase(thisWeek, { type: 'add', block: b });
    }
  }
  if (dlg.open) closeDlg();
  render();
  const c = parsedCounts(ps);
  toast(`시간표를 넣었어요. (과외 ${c.tutors}개)`, 3000);
}

/* ---- 표: 가로 7열 일~토 · 세로 시간축. 과외는 읽기만, 운동 블록은 눌러서 "했어요" 체크(✓) ---- */
const WKT_PX = 48;                                  // 한 시간의 높이(px)
const WKT_EX_MIN = 30; const WKT_TUTOR_MIN = 60;    // 끝 시간이 없는 운동은 30분, 과외는 60분으로 그려요
function weekTableHTML(model, opts = {}) {
  const { sun, days, memo } = model;
  const today = todayStr();
  const checks = opts.checks || {};
  // 시간 범위: 그 주 블록 중 가장 이른 시각 ~ 가장 늦은 시각을 정시로 (블록이 없으면 9~22시)
  const items = days.map((day, d) => [
    ...day.tutors.filter((b) => timeMin(b.s) !== null).map((b) => ({ d, kind: 't', b, s: timeMin(b.s), e: timeMin(b.e) !== null ? timeMin(b.e) : timeMin(b.s) + WKT_TUTOR_MIN })),
    ...day.ex.map((b, i) => ({ d, kind: 'x', b, i, s: timeMin(b.s), e: timeMin(b.e) !== null ? timeMin(b.e) : (timeMin(b.s) !== null ? timeMin(b.s) + WKT_EX_MIN : null) })).filter((x) => x.s !== null),
  ]);
  const flat = items.flat();
  let h0 = 9; let h1 = 22;
  if (flat.length) { h0 = Math.floor(Math.min(...flat.map((x) => x.s)) / 60); h1 = Math.ceil(Math.max(...flat.map((x) => x.e)) / 60); }
  h1 = Math.min(24, Math.max(h1, h0 + 3)); h0 = Math.max(0, Math.min(h0, h1 - 3));
  const H = (h1 - h0) * WKT_PX;
  const lanes = (list) => { // 겹치는 블록은 옆으로 나란히
    const sorted = list.slice().sort((a, b) => a.s - b.s || a.e - b.e);
    let cluster = []; let clusterEnd = -1;
    const flush = () => { const n = cluster.reduce((m, x) => Math.max(m, x.lane + 1), 1); cluster.forEach((x) => { x.n = n; }); cluster = []; };
    sorted.forEach((x) => {
      if (cluster.length && x.s >= clusterEnd) { flush(); clusterEnd = -1; }
      const used = new Set(cluster.filter((c) => c.e > x.s).map((c) => c.lane));
      let lane = 0; while (used.has(lane)) lane += 1;
      x.lane = lane; cluster.push(x); clusterEnd = Math.max(clusterEnd, x.e);
    });
    flush();
    return sorted;
  };
  const cls = (x) => (x.kind === 't' ? (x.b.m === '대면' ? 't-face' : 't-online') : `ex${x.b.optional ? ' opt' : ''}`); // 운동은 종류와 상관없이 같은 색(파랑), 선택 운동은 점선
  const cols = days.map((day, d) => {
    const date = addDays(sun, d);
    const blocks = lanes(items[d]).map((x) => {
      const top = ((x.s - h0 * 60) / 60) * WKT_PX; const hgt = Math.max(x.kind === 'x' ? 28 : 16, ((x.e - x.s) / 60) * WKT_PX - 1); // 운동 블록은 눌러야 해서 너무 낮아지지 않게
      const name = x.kind === 'x' ? (x.b.name.split('(')[0].trim() || x.b.name) : x.b.name;
      const time = x.kind === 't' ? blockTime(x.b) : blockTime(x.b);
      const on = x.kind === 'x' && checks[`${d}:${x.i}`];
      const label = `${DOW[d]}요일 ${x.b.name} ${time}${x.kind === 't' ? ` ${x.b.m}` : `${x.b.optional ? ' 선택' : ''} 운동`}${on ? ' (했어요)' : ''}`;
      const style = `top:${top}px;height:${hgt}px;left:calc(${x.lane} * 100% / ${x.n});width:calc(100% / ${x.n} - 2px)`;
      const inner = `<span class="wkt-n">${esc(name)}</span>${hgt >= 36 ? `<span class="wkt-t">${esc(time).replace('~', '~<wbr>')}</span>` : ''}${on ? '<span class="wkt-ck" aria-hidden="true">✓</span>' : ''}`;
      const c = `wkt-b ${cls(x)}${hgt < 36 ? ' short' : hgt < 60 ? ' mid' : ''}`;
      return !opts.preview && x.kind === 'x' // 운동 블록: 눌러서 했어요 체크 (아직 안 온 날은 눌러도 안 돼요)
        ? `<button type="button" class="${c}${on ? ' on' : ''}" style="${style}" data-act="wkCheck" data-date="${date}" data-i="${x.i}" aria-pressed="${on ? 'true' : 'false'}" ${date > today ? 'disabled' : ''} title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`
        : `<div class="${c}" style="${style}" title="${esc(label)}">${inner}</div>`;
    }).join('');
    const empty = !day.tutors.length && !day.ex.length;
    return `<div class="wkt-col${date === today ? ' today' : ''}" data-d="${d}" style="height:${H}px">${blocks}${empty ? '<span class="wkt-rest">휴식</span>' : ''}</div>`;
  }).join('');
  const untimed = days.map((day, d) => [...day.ex.map((b, i) => ({ ...b, ex: true, i })).filter((b) => timeMin(b.s) === null), ...day.tutors.filter((b) => timeMin(b.s) === null)]);
  const chip = (b, d) => { // 시간이 없는 블록: 작은 이름표 (운동은 눌러서 했어요 체크)
    const nm = esc((b.name || '').split('(')[0].trim() || b.name);
    if (!b.ex) return `<span class="wkt-chip ${b.m === '대면' ? 't-face' : 't-online'}">${nm}</span>`;
    const on = checks[`${d}:${b.i}`]; const date = addDays(sun, d);
    const label = `${DOW[d]}요일 ${b.name}${b.optional ? ' 선택' : ''} 운동${on ? ' (했어요)' : ''}`;
    return opts.preview
      ? `<span class="wkt-chip ex${b.optional ? ' opt' : ''}">${nm}</span>`
      : `<button type="button" class="wkt-chip ex${b.optional ? ' opt' : ''}${on ? ' on' : ''}" data-act="wkCheck" data-date="${date}" data-i="${b.i}" aria-pressed="${on ? 'true' : 'false'}" ${date > today ? 'disabled' : ''} title="${esc(label)}" aria-label="${esc(label)}">${on ? '✓ ' : ''}${nm}</button>`;
  };
  const anyUntimed = untimed.some((u) => u.length);
  const heads = Array.from({ length: 7 }, (_, d) => { // 요일 머리를 누르면 그날의 기록 창(캘린더의 날짜 창)이 열려요: 운동 기록 보기 · 더하기 · 고치기 · 지우기
    const date = addDays(sun, d); const x = parseDate(date); const inner = `<span>${DOW[d]}</span><small>${x.getMonth() + 1}/${x.getDate()}</small>`; const cls = `wkt-head d${d}${date === today ? ' today' : ''}`;
    return opts.preview ? `<div class="${cls}">${inner}</div>` : `<button type="button" class="${cls}" data-act="calDay" data-date="${date}" title="눌러서 이 날의 기록 보기" aria-label="${esc(`${DOW[d]}요일 ${x.getMonth() + 1}월 ${x.getDate()}일 기록 보기`)}">${inner}</button>`;
  }).join('');
  const legend = opts.preview ? '' : `<div class="wkt-legend" aria-label="범례"><span class="wkt-lg"><i class="wkt-sw t-online"></i>온라인 과외</span><span class="wkt-lg"><i class="wkt-sw t-face"></i>대면 과외</span><span class="wkt-lg"><i class="wkt-sw ex"></i>운동</span></div>`;
  const axis = Array.from({ length: h1 - h0 + 1 }, (_, i) => `<span style="top:${i * WKT_PX}px">${h0 + i}</span>`).join('');
  return `<div class="wkt-scroll"><div class="wkt" style="--wkt-h:${WKT_PX}px">
    <div class="wkt-corner"></div>${heads}
    <div class="wkt-axis" style="height:${H}px">${axis}</div>${cols}
    ${anyUntimed ? `<div class="wkt-axis2">시간 미정</div>${untimed.map((u, d) => `<div class="wkt-un">${u.map((b) => chip(b, d)).join('')}</div>`).join('')}` : ''}
  </div></div>
  ${legend}
  ${memoHTML(memo)}`;
}

// 그 주 메모를 보여 줄 때만 "; " 로 나눠서 한 줄에 하나씩 보여요. (저장된 메모는 지금처럼 한 줄 글자 그대로예요)
//   첫 토막 맨 앞의 "N주차 · K단계"(또는 "K단계")는 맨 윗줄에 제목처럼 두고, 그 뒤 " · " 다음 내용은 아랫줄부터 시작해요.
//   각 줄 맨 앞의 요일(일~토)은 운동 블록과 같은 뮤트톤 파랑으로 눈에 띄게 해요. "; " 가 없는 예전 메모(예: "1단계")는 지금처럼 "메모: …" 한 줄이에요.
const MEMO_HEAD = /^((?:\d+\s*주차\s*·\s*)?\d+\s*단계)(?:\s*·\s*(.*))?$/;
function memoParts(memo) {
  const chunks = String(memo || '').split(/;\s+/).map((s) => s.trim()).filter(Boolean);
  const lines = [];
  let head = '';
  if (chunks.length) {
    const m = MEMO_HEAD.exec(chunks[0]);
    if (m) { head = m[1]; chunks.shift(); if (m[2]) lines.push(m[2].trim()); }
  }
  lines.push(...chunks);
  return { head, lines };
}
function memoHTML(memo) {
  const text = String(memo || '').trim();
  if (!text) return '';
  if (!/;\s+/.test(text.replace(/;\s*$/, ''))) return `<p class="meta wkt-memo">메모: ${esc(text)}</p>`; // "; " 가 없는 예전 메모는 지금처럼 한 줄 그대로예요
  const { head, lines } = memoParts(text);
  if (!lines.length) return `<p class="meta wkt-memo">메모: ${esc(text)}</p>`;
  const row = (t) => {
    const m = /^([일월화수목금토])\s+(.+)$/.exec(t);
    return m ? `<span class="wkm-l wkm-day"><b class="wkm-d">${m[1]}</b>${esc(m[2])}</span>` : `<span class="wkm-l">${esc(t)}</span>`;
  };
  return `<div class="meta wkt-memo wkt-memo-lines" role="note" aria-label="메모">${head ? `<span class="wkm-h">${esc(head)}</span>` : ''}${lines.map(row).join('')}</div>`;
}

/* ---- 화면 (항상 표) ---- */
const weekBtnHTML = (here) => `<button type="button" class="btn ghost small cal-today-btn${here ? ' dim' : ''}" data-act="wkToday"${here ? ' aria-disabled="true"' : ''} title="${here ? '지금 이번 주예요' : '이번 주로 가요'}" aria-label="이번 주로 가기">이번 주</button>`;

function renderWeek() {
  const today = todayStr();
  view.dataset.today = today; // 밤새 열어 두었다가 날짜가 바뀌면 다시 그리려고 기억해 둬요
  const thisWeek = weekStartOf(today);
  const sun = weekKey(ui.weekStart || '') || thisWeek;
  ui.weekStart = sun === thisWeek ? null : sun;
  const plan = weekPlanOf(sun);
  const checks = {};
  for (let d = 0; d < 7; d += 1) dayChecks(addDays(sun, d), d, exBlocksOf(sun, d), plan).forEach((on, i) => { if (on) checks[`${d}:${i}`] = true; });
  view.innerHTML = `
    <h2 class="page-title">이번 주</h2>
    <p class="page-sub">과외 일정과 이번 주 운동을 한눈에 봐요. 운동은 📥로 붙여 넣은 것만 표에 보이고, 했다고 블록을 한 번만 눌러요. 그날 기록을 보거나 운동을 더 적으려면 요일 머리(일·월…)를 눌러요. 점수나 비교는 없어요.</p>
    <p class="meta wkp-hours">${esc(tutorTotalText(tutorTotals(sun)))}</p>
    <div class="wkp-head">
      ${weekBtnHTML(sun === thisWeek)}
      <button type="button" class="btn ghost small" data-act="wkShift" data-d="-1" aria-label="지난 주">◀</button>
      <strong class="wkp-label">${esc(weekLabel(sun))}</strong>
      <button type="button" class="btn ghost small" data-act="wkShift" data-d="1" aria-label="다음 주">▶</button>
    </div>
    <div class="wkp-bar">
      <button type="button" class="btn ghost small" data-act="wkAi">📥 클로드 시간표 붙여 넣기</button>
    </div>
    ${weekTableHTML(weekModel(sun, null), { checks })}
    <div class="row wkp-tools"><button type="button" class="btn ghost small" data-act="wkPaste">📋 기본 시간표 붙여 넣기</button>${planUsed(plan) ? '<button type="button" class="btn ghost small" data-act="wkReset">↺ 이번 주를 기본 시간표로</button>' : ''}</div>`;
}

/* ---------------------------------------------------------------------
   10-2. 메뉴 4: 캘린더 (2026년부터, 한눈에 보기)
   --------------------------------------------------------------------- */
// 달력에 표시할 종류 (icon: 달력에 보이는 그림, label: 이름, chip: 위쪽 종류 버튼)
const CAL_CATS = [
  { id: 'workout', chip: 'workout', icon: '🧘', label: '운동', test: (r) => r.type === 'workout' },
  { id: 'practice', chip: 'violin', icon: '🎻', label: '바이올린 연습', test: (r) => r.type === 'violin' && r.kind !== '레슨' },
  { id: 'lesson', chip: 'violin', icon: '🎓', label: '레슨', test: (r) => r.type === 'violin' && r.kind === '레슨' },
  { id: 'routine', chip: 'routine', icon: '✅', label: '경제 루틴', iconOnly: true, test: (r) => r.type === 'econRoutine' },
  { id: 'english', chip: 'english', icon: '📰', label: '영어', iconOnly: true, test: (r) => r.type === 'englishArticle' },
  { id: 'art', chip: 'art', icon: '🎨', label: '그림', test: (r) => r.type === 'art' },
  { id: 'rest', chip: 'rest', icon: '😴', label: '쉼', test: (r) => r.type === 'rest' },
];
// 달력 위쪽의 종류 버튼 (바이올린 버튼 하나가 연습과 레슨을 함께 켜고 꺼요)
const CAL_CHIPS = [
  { id: 'workout', icon: '🧘', label: '운동' },
  { id: 'violin', icon: '🎻', label: '바이올린' },
  { id: 'routine', icon: '🎧', label: '경제 루틴' },
  { id: 'english', icon: '📰', label: '영어' },
  { id: 'art', icon: '🎨', label: '그림' },
  { id: 'rest', icon: '😴', label: '쉼' },
];
const catOf = (r) => CAL_CATS.find((c) => c.test(r));
// 기록 하나의 그림
const iconOf = (r) => (catOf(r) || {}).icon || '📝';

function calTitle(r) {
  switch (r.type) {
    case 'workout': return '운동';
    case 'violin': return r.kind === '레슨' ? '레슨' : (pieceNamesOf(r)[0] || '연습');
    case 'econRoutine': return '경제 루틴';
    case 'englishArticle': return domainOf(r.link) || '영어 기사';
    case 'rest': return '쉼';
    default: return r.topic || artKindOf(r);
  }
}

const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

// 머리 줄 맨 앞의 [오늘] 버튼 (캘린더와 도장 모음판이 함께 써요). 항상 같은 자리에 있어요.
// 다른 달을 보고 있으면 이번 달로 가기만 해요. 이미 이번 달이면 흐리게 보이고, 눌러도 아무 일도 없어요.
const todayBtnHTML = (act, here) => `<button type="button" class="btn ghost small cal-today-btn${here ? ' dim' : ''}" data-act="${act}"${here ? ' aria-disabled="true"' : ''} title="${here ? '지금 이번 달이에요' : '이번 달로 가요'}" aria-label="오늘로 가기">오늘</button>`;

function renderCalendar() {
  const today = todayStr();
  view.dataset.today = today; // 밤새 창을 열어 두었다가 날짜가 바뀌면 다시 그리려고 기억해 둬요
  if (!ui.calMonth) ui.calMonth = today.slice(0, 7);
  if (ui.calMonth < CALENDAR_START) ui.calMonth = CALENDAR_START;
  const [y, m] = ui.calMonth.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay(); // 일요일 시작
  const dayCount = new Date(y, m, 0).getDate();

  // 이 달의 기록을 날짜별·종류별로 모아요
  const byDate = new Map();
  records.forEach((r) => {
    if (!r.date || r.date.slice(0, 7) !== ui.calMonth) return;
    const c = catOf(r);
    if (!c) return;
    if (c.id === 'routine' && !routineIcons(r).length) return; // 체크한 항목이 없는 날(한 줄만 남긴 날)은 달력에 표시하지 않아요
    if (ui.calHidden.has(c.chip)) return;
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    const g = byDate.get(r.date);
    if (!g.has(c.id)) g.set(c.id, []);
    g.get(c.id).push(r);
  });

  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push('<div class="cal-cell blank" aria-hidden="true"></div>');
  for (let d = 1; d <= dayCount; d += 1) {
    const date = `${ui.calMonth}-${pad(d)}`;
    const groups = CAL_CATS.filter((c) => byDate.get(date) && byDate.get(date).has(c.id)).map((c) => ({ c, items: byDate.get(date).get(c.id) }));
    const say = groups.length ? groups.map((g) => g.c.label).join(', ') : '기록 없음';
    const withAmt = groups.flatMap((g) => g.items).filter((r) => amountOf(r) && supportsAmount(r.type, r.kind));
    const top = Math.max(0, ...withAmt.map((r) => amountOf(r).v)); // 그날 가장 높은 연습량·운동량
    const topRec = withAmt.find((r) => amountOf(r).v === top);
    const onlyRest = groups.length > 0 && groups.every((g) => g.c.id === 'rest');
    const shade = `${groups.length && !onlyRest ? ' has' : ''}${onlyRest ? ' rest-only' : ''}${top ? ` amt${top}` : ''}`;
    cells.push(`<button type="button" class="cal-cell${shade}${date === today ? ' today' : ''}" data-act="calDay" data-date="${date}" aria-label="${esc(dayLabel(date))}, ${esc(say)}${top ? `, ${amountWord(topRec)} ${AMOUNTS[top - 1].label}` : ''}">
      <span class="cal-num">${d}</span>
      <span class="cal-marks">${groups.map((g) => (g.c.iconOnly
        ? `<span class="cal-mark icon-only ${g.c.id}" title="${esc(g.c.label)}">${(g.c.id === 'routine' ? routineIcons(g.items[0]) : [g.c.icon]).map((i) => `<span class="cal-ico">${i}</span>`).join('')}</span>` // 그림만 (루틴은 그날 체크한 항목, 영어는 📰)
        : `<span class="cal-mark${g.c.id === 'rest' ? ' rest' : ''}" title="${esc(g.c.label)}"><span class="cal-ico">${g.c.icon}</span><span class="cal-t">${esc(calTitle(g.items[0]))}</span></span>`)).join('')}</span>
    </button>`);
  }

  const startYear = Number(CALENDAR_START.slice(0, 4));
  const latest = records.reduce((a, r) => Math.max(a, Number((r.date || '0').slice(0, 4)) || 0), 0);
  const lastYear = Math.max(new Date().getFullYear(), latest) + 10; // 앞으로 10년 이상 넉넉히
  const yearOpts = [];
  for (let yy = startYear; yy <= lastYear; yy += 1) yearOpts.push(`<option value="${yy}" ${yy === y ? 'selected' : ''}>${yy}년</option>`);
  const monthOpts = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${i + 1}월</option>`).join('');
  const older = records.some((r) => r.date && r.date.slice(0, 7) < CALENDAR_START);

  view.innerHTML = `
    <h2 class="page-title">캘린더</h2>
    <p class="page-sub">${startYear}년부터 이어지는 달력이에요. 날짜를 누르면 그날의 기록을 보고, 기록을 더할 수 있어요.</p>
    <div class="cal-head">
      ${todayBtnHTML('calToday', ui.calMonth === today.slice(0, 7))}
      <button type="button" class="btn ghost small" data-act="calShift" data-d="-1" ${ui.calMonth <= CALENDAR_START ? 'disabled' : ''}>◀ 이전 달</button>
      <span class="cal-pick"><select class="search" data-cal="year" aria-label="연도" style="min-width:0">${yearOpts.join('')}</select>
      <select class="search" data-cal="month" aria-label="월" style="min-width:0">${monthOpts}</select></span>
      <button type="button" class="btn ghost small" data-act="calShift" data-d="1">다음 달 ▶</button>
    </div>
    <div class="chips">${CAL_CHIPS.filter((c) => c.id !== 'art' || records.some((r) => r.type === 'art')).map((c) => `<button type="button" class="chip ${ui.calHidden.has(c.id) ? '' : 'active'}" data-act="calCat" data-id="${c.id}" aria-pressed="${!ui.calHidden.has(c.id)}">${c.icon} ${esc(c.label)}</button>`).join('')}</div>
    <div class="cal-grid" role="grid" aria-label="${y}년 ${m}월">
      ${['일', '월', '화', '수', '목', '금', '토'].map((w) => `<div class="cal-dow">${w}</div>`).join('')}
      ${cells.join('')}
    </div>
    <div class="row" style="margin-top:14px">
      <button type="button" class="btn purple" data-act="recap">📖 ${ui.calMonth === today.slice(0, 7) ? '이번 달' : `${m}월`} 돌아보기</button>
      <button type="button" class="btn ghost purple" data-act="board">💮 도장 모음판</button>
    </div>
    ${older ? `<p class="meta">${startYear}년 이전 기록은 달력에 나타나지 않아요. (각 메뉴의 목록에서는 볼 수 있어요.)</p>` : ''}
    ${claudeBoxHTML()}
    ${memoryHTML(today)}`;
}

/* ---------------------------------------------------------------------
   💮 도장 모음판: 기록을 남기고 받은 도장이 받은 순서대로 한 달에 한 장씩 차곡차곡 붙어요.
   (날짜 칸이나 빈 칸은 없고, 받은 도장만 쌓여요. 예전 기록은 종류에 맞는 기본 도장으로 보여요.)
   --------------------------------------------------------------------- */
const stampOf = (r) => (r.type === 'rest' ? '😴' : r.stamp || iconOf(r));
const byReceived = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);
const dowOf = (date) => '일월화수목금토'[parseDate(date).getDay()];

function stampButtons(list) {
  return `<div class="board">${list.map((r, i) => {
    const tip = `${shortDay(r.date)} (${dowOf(r.date)}) · ${calTitle(r)}`;
    return `<button type="button" class="board-stamp t${i % 2}" style="--rot:${((i * 37) % 13) - 6}deg" data-act="${r.stampMsg ? 'boardSay' : 'boardGo'}" data-id="${esc(r.id)}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${esc(stampOf(r))}</button>`;
  }).join('')}</div>`;
}

function openBoard(ym) {
  ui.boardMonth = ym;
  const [y, m] = ym.split('-').map(Number);
  const list = records.filter((r) => r.date && r.date.slice(0, 7) === ym && catOf(r)).sort(byReceived);
  openDlg(`
    <h2>💮 도장 모음판</h2>
    <div class="row board-nav">
      ${todayBtnHTML('boardToday', ym === todayStr().slice(0, 7))}
      <button type="button" class="btn ghost small" data-act="boardShift" data-d="-1" ${ym <= CALENDAR_START ? 'disabled' : ''}>◀ 이전 달</button>
      <strong>${y}년 ${m}월</strong>
      <button type="button" class="btn ghost small" data-act="boardShift" data-d="1">다음 달 ▶</button>
    </div>
    ${list.length ? stampButtons(list) : '<div class="empty">이 달에 받은 도장이 아직 없어요.</div>'}
    <div class="stamp-say" id="stampSay" role="status" hidden></div>
    <p class="meta" style="margin:10px 0 0">기록을 남길 때 받은 도장이 받은 순서대로 붙어요. 도장에 마우스를 올리면 날짜와 기록 제목이 보이고, 누르면 그때 받은 칭찬이 다시 보여요. (칭찬이 없던 예전 도장은 그 기록으로 가요)</p>
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`, true);
}

// 칭찬이 있는 도장을 누르면 그때 받은 칭찬이 모음판 아래에 다시 보여요 (거기서 그 기록으로도 갈 수 있어요)
function showStampSay(id) {
  const r = records.find((x) => x.id === id);
  const box = $('#stampSay');
  if (!r || !box || !r.stampMsg) return;
  const line = savedLine(r);
  box.replaceChildren();
  const seal = document.createElement('span'); seal.className = 'ss-seal'; seal.setAttribute('aria-hidden', 'true'); seal.textContent = '💮';
  const body = document.createElement('span'); body.className = 'ss-body';
  const msg = document.createElement('span'); msg.className = 'ss-msg'; msg.textContent = r.stampMsg;
  const meta = document.createElement('span'); meta.className = 'meta'; const title = calTitle(r);
  meta.textContent = `${shortDay(r.date)} (${dowOf(r.date)}) · ${title}${line && !title.includes(line) ? ` · ${line}` : ''}`; // 제목에 이미 있는 내용은 되풀이하지 않아요
  body.append(msg, meta);
  const go = document.createElement('button'); go.type = 'button'; go.className = 'btn ghost small'; go.dataset.act = 'boardGo'; go.dataset.id = r.id; go.textContent = '기록 보기';
  box.append(seal, body, go);
  box.hidden = false;
}

// 도장을 누르면 그 기록으로 (쉰 날은 그날의 기록 창으로)
function goToStamp(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  if (r.type === 'rest') { openDay(r.date); return; }
  goToRecord(id);
}

// 도장에 마우스를 올리면 날짜와 기록 제목이 말풍선으로 나타나요 (창 가장자리에서도 잘리지 않게 화면 안으로 맞춰요)
function showStampTip(btn) {
  let tip = dlg.querySelector('.stamp-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'stamp-tip'; tip.setAttribute('role', 'tooltip'); dlg.append(tip); }
  tip.textContent = btn.dataset.tip || '';
  tip.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8}px`;
}
function hideStampTip() { const tip = dlg.querySelector('.stamp-tip'); if (tip) tip.hidden = true; }
document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('.board-stamp'); if (b) showStampTip(b); });
document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('.board-stamp')) hideStampTip(); });
document.addEventListener('focusin', (e) => { const b = e.target.closest && e.target.closest('.board-stamp'); if (b) showStampTip(b); });
document.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('.board-stamp')) hideStampTip(); });

/* ---------------------------------------------------------------------
   🍂 계절 장식: 달마다 제목 옆과 오른쪽 아래 모서리에 이모지 하나 (움직이지 않아요)
   --------------------------------------------------------------------- */
function applySeason() {
  const icon = settings.seasonOff ? '' : (SEASON_DECOR[parseDate(todayStr()).getMonth()] || '');
  const t = $('#seasonIcon');
  const c = $('#seasonCorner');
  if (t) t.textContent = icon;
  if (c) { c.textContent = icon; c.hidden = !icon; }
}

/* ---------------------------------------------------------------------
   📖 이번 달 돌아보기 (숫자 없이, 이 달에 남긴 것의 내용만 모아 보여줘요. 횟수·점수·지난달과의 비교는 없어요)
   --------------------------------------------------------------------- */
// ✏️ 항목을 더하려면 이 배열에 { id, build } 를 하나 추가하면 돼요.
//   build(c) 는 { title, html } 을 돌려주면 창에 순서대로 나타나고, 보여줄 게 없으면 null 을 돌려주면 그 항목은 빠져요. (빈 칸이나 "없어요" 문구는 그리지 않아요)
//   c.real : 이 달의 기록 전부   c.all : 모든 기록   c.ym / c.y / c.m : 보고 있는 달

/* 🏅 이번 달 처음: 기록에서 저절로 찾아요. "처음"인 일만 한 줄로 (몇 번째·최고·가장 먼 거리 같은 숫자 없이).
   첫 곡 · 첫 교재 · 첫 레슨 / 처음 한 운동 / 경제 루틴 첫 기록 / 첫 기사 / 첫 그림 */
const slashDay = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
function recapFirsts(all, ym) {
  const ev = [];
  const push = (date, icon, text) => { if ((date || '').slice(0, 7) === ym) ev.push({ date, i: ev.length, text: `${slashDay(date)} ${icon} ${text}` }); };
  const by = (fn) => all.filter(fn).sort(byOldest); // 날짜순 (같은 날은 만든 순서)
  // 🎻
  const vio = by((r) => r.type === 'violin');
  const seenPiece = new Set(); const seenBook = new Set();
  vio.filter((r) => r.kind !== '레슨').forEach((r) => {
    pieceNamesOf(r).forEach((name) => { if (!seenPiece.has(name)) { seenPiece.add(name); push(r.date, '🎻', `${name} — 처음 연습한 곡이에요`); } });
    bookRows(r).forEach((b) => { if (!seenBook.has(b.name)) { seenBook.add(b.name); push(r.date, '🎻', `${b.name} — 처음 쓴 교재예요`); } });
  });
  const lesson = vio.find((r) => r.kind === '레슨');
  if (lesson) push(lesson.date, '🎻', '첫 레슨 — 레슨을 처음 기록했어요');
  // 🧘
  const wk = by((r) => r.type === 'workout');
  if (wk[0]) push(wk[0].date, '🧘', '운동 — 처음 한 운동이에요');
  // 📚
  const routine = by((r) => r.type === 'econRoutine' && routineIcons(r).length);
  if (routine[0]) push(routine[0].date, '📚', '경제 루틴 — 첫 기록이에요');
  // 📰
  const arts = by((r) => r.type === 'englishArticle');
  if (arts[0]) push(arts[0].date, '📰', '첫 기사 — 영어 기사를 처음 남겼어요');
  // 🎨
  const pics = by((r) => r.type === 'art');
  if (pics[0]) push(pics[0].date, '🎨', '첫 그림 — 처음 올렸어요');
  return ev.sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i).map((e) => e.text);
}

// 돌아보기 항목 중 ⚙ 백업·설정에서 끌 수 있는 것: label 이 있는 항목. 끈 항목 id 는 설정 값(recapOff)으로 저장돼서 ☁ 동기화·백업에 들어가요.
const recapOff = () => { const v = getConfig('recapOff', []); return Array.isArray(v) ? v : []; };
const RECAP_SECTIONS = [
  { id: 'piece', build: (c) => { // 이 달에 연습한 곡 이름 (처음 연습한 날 순서)
    const names = [];
    c.real.filter((r) => r.type === 'violin' && r.kind !== '레슨').sort(byOldest).forEach((r) => pieceNamesOf(r).forEach((k) => { if (!names.includes(k)) names.push(k); }));
    return names.length ? { title: '연습한 곡', html: `<p class="recap-big">${names.map((n) => `🎼 ${pieceButton(n)}`).join('<br>')}</p>` } : null;
  } },
  { id: 'firsts', label: '🏅 이번 달 처음', build: (c) => {
    const rows = recapFirsts(c.all, c.ym);
    return rows.length ? { title: '🏅 이번 달 처음', html: `<ul class="note-list">${rows.map((t) => `<li><span class="pre">${esc(t)}</span></li>`).join('')}</ul>` } : null;
  } },
  { id: 'feedbackGood', label: '💬 이달의 피드백에서', build: (c) => { // 그달 저장한 피드백의 "잘한 점"을 날짜순으로, 범위 아이콘과 함께
    const fbs = c.all.filter((r) => r.type === 'claudeFeedback' && (r.date || '').slice(0, 7) === c.ym && strengthsOf(r).length).sort(byOldest);
    const rows = fbs.flatMap((f) => strengthsOf(f).map((x) => `${slashDay(f.date)} ${scopeMeta(f.scope).icon} ${x}`));
    return rows.length ? { title: '💬 이달의 피드백에서', html: `<ul class="note-list">${rows.map((t) => `<li><span class="pre">${esc(t)}</span></li>`).join('')}</ul>` } : null;
  } },
  { id: 'routine', build: (c) => { // 경제 "오늘 한 줄"
    const notes = c.real.filter((r) => r.type === 'econRoutine' && hasValue(r.note)).sort(byNewest);
    return notes.length ? { title: '경제 오늘 한 줄', html: `<ul class="note-list">${notes.map((r) => `<li><span class="meta">${esc(shortDay(r.date))}</span><span class="pre">${esc(r.note)}</span></li>`).join('')}</ul>` } : null;
  } },
  { id: 'english', build: (c) => { // 읽은 기사: 도메인 · 요약 첫 줄
    const rows = c.real.filter((r) => r.type === 'englishArticle').sort(byOldest).map((r) => ({ r, dom: domainOf(r.link), line: [r.sum1, r.sum2, r.sum3].map((t) => String(t || '').trim()).find(Boolean) || '' })).filter((x) => x.dom || x.line);
    return rows.length ? { title: '읽은 기사', html: `<ul class="note-list">${rows.map((x) => `<li><span class="meta">${esc(shortDay(x.r.date))}</span><span class="pre">${x.dom ? `<b>${esc(x.dom)}</b>` : ''}${x.dom && x.line ? ' — ' : ''}${esc(x.line)}</span></li>`).join('')}</ul>` } : null;
  } },
  { id: 'art', build: (c) => { // 그림 썸네일 (기록마다 첫 장, 최근 6개까지)
    const thumbs = c.real.filter((r) => r.type === 'art' && artPhotos(r).length).sort(byOldest).slice(-6);
    return thumbs.length ? { title: '그림', html: `<div class="recap-thumbs">${thumbs.map((r) => `<img class="recap-thumb" src="${esc(artPhotos(r)[0])}" alt="${esc(artTitle(r))}" title="${esc(shortDay(r.date))}">`).join('')}</div>` } : null;
  } },
  { id: 'lessons', build: (c) => {
    const ls = c.real.filter((r) => r.type === 'violin' && r.kind === '레슨' && ((r.feedback || '').trim() || hasValue(r.praise) || hasValue(r.newLearn))).sort(byOldest);
    if (!ls.length) return null;
    return { title: '레슨 피드백 모음', html: ls.map((r) => `<div class="recap-quote"><div class="meta">${esc(dayLabel(r.date))}</div>${hasValue(r.feedback) ? `<p class="pre">${esc(r.feedback)}</p>` : ''}${hasValue(r.praise) ? `<p class="pre">👍 ${esc(r.praise)}</p>` : ''}${hasValue(r.newLearn) ? `<p class="pre">📝 ${esc(r.newLearn)}</p>` : ''}</div>`).join('') };
  } },
];

function openRecap() {
  const ym = ui.calMonth || todayStr().slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const real = records.filter((r) => r.date && r.date.slice(0, 7) === ym && catOf(r));
  const all = records.filter((r) => !r.sample && r.date);
  const c = { ym, y, m, real, all };
  const off = recapOff();
  const sections = RECAP_SECTIONS.filter((sec) => !off.includes(sec.id)).map((sec) => sec.build(c)).filter(Boolean);
  openDlg(`
    <h2>📖 ${y}년 ${m}월 돌아보기</h2>
    <p class="meta" style="margin-top:0">숫자나 비교 없이, 이 달에 남긴 것을 모아 봤어요.</p>
    ${sections.length
      ? sections.map((sec) => `<section class="recap-sec"><h3>${esc(sec.title)}</h3>${sec.html}</section>`).join('')
      : '<p class="meta">남긴 기록이 생기면 여기에 모여요.</p>'}
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`, true);
}

// 날짜 창 안의 경제 루틴 카드 (체크한 것·읽은 뉴스레터·한 줄·태그를 보여줘요. 체크 켜고 끄기는 경제 화면의 "이번 주"에서 해요)
function routineDayCard(r) {
  const items = ECON_ROUTINES.filter((x) => routineChecked(r, x.id));
  const letters = Array.isArray(r.letters) ? r.letters : [];
  return `<div class="card" data-rid="${esc(r.id)}">
    <div><span class="tag">✅ 경제 루틴</span> ${items.length ? items.map((x) => `<span class="rt-day-item">${x.icon} ${esc(x.label)}</span>`).join(' · ') : '<span class="meta">체크한 항목은 없어요</span>'}</div>
    ${letters.length ? `<div class="chip-line"><span class="chip-label">읽은 뉴스레터</span>${letters.map((c) => `<span class="tag chip-tag">${esc(c)}</span>`).join('')}</div>` : ''}
    ${hasValue(r.note) ? textBlock('오늘 한 줄', r.note) : ''}
  </div>`;
}

// 날짜를 누르면 그날의 기록을 한 창에 모아 보여줘요
//   오늘과 지난 날짜에는 ✅ 경제 루틴 체크 목록(뉴스레터 칩 포함)이 나와서 그 자리에서 켜고 끌 수 있어요. 미래 날짜에는 없어요.
function openDay(date) {
  ui.dayOpen = date;
  const list = records.filter((r) => r.date === date && catOf(r)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const card = { workout: workoutCard, violin: violinCard, econRoutine: routineDayCard, englishArticle: englishCard, art: artDayCard, rest: restCard };
  const open = date <= todayStr();
  const rt = routineOn(date);
  const cards = list.filter((r) => r.type !== 'econRoutine' || !open).map((r) => card[r.type](r));
  const routineSec = open ? `<section class="card day-routine"${rt ? ` data-rid="${esc(rt.id)}"` : ''}>
      <div><span class="tag">✅ 경제 루틴</span></div>
      ${routineRowsHTML(date)}
      ${rt && hasValue(rt.note) ? textBlock('오늘 한 줄', rt.note) : ''}
    </section>` : '';
  const add = [['workout', '운동'], ['violin', '바이올린'], ['englishArticle', '영어 기사']]
    .map(([t, l]) => `<button type="button" class="btn ghost small" data-act="addOn" data-type="${t}" data-date="${date}">＋ ${l}</button>`).join('')
    + restButtonHTML(date);
  openDlg(`
    <h2>${esc(dayLabel(date))}</h2>
    <div class="day-list">${cards.join('')}${!list.length ? '<div class="empty">기록이 없어요.</div>' : ''}${routineSec}</div>
    <div class="label" style="margin:14px 0 6px">이 날짜에 기록 더하기</div>
    <div class="row actions-row">${add}</div>
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`, true);
}

// 날짜 창 안에서 지우거나 체크했을 때 창의 내용을 새로 고쳐요
function refreshDay() {
  if (ui.dayOpen && dlg.open && dlg.querySelector('.day-list')) openDay(ui.dayOpen);
}

/* ---------------------------------------------------------------------
   10-3. 그림 올리기 편하게 (끌어다 놓기 · 붙여넣기 · 여러 장 한 번에)
   --------------------------------------------------------------------- */
let toastTimer = null;
function hideToast() {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.hidden = true;
  try { if (el.hidePopover && el.matches(':popover-open')) el.hidePopover(); } catch (e) { /* 괜찮아요 */ }
}

// 토스트 칸을 비우고 다시 보여줘요. 칸은 하나뿐이라서, 연달아 부르면 이전 것을 바꿔치기해요 (쌓이지 않아요)
function showToastEl(el, ms) {
  el.hidden = false;
  // popover로 띄우면 열려 있는 창(날짜 창 등) 위에도 보여요. 못 쓰는 브라우저에서는 그냥 아래쪽에 떠요.
  try { if (el.showPopover) { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } } catch (e) { /* 괜찮아요 */ }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}

// 일반 알림 (동기화 오류·"저장했어요" 같은 짧은 안내): 어두운 한 줄이에요
function toast(msg, ms = 6000) {
  const el = $('#toast');
  el.className = 'toast';
  el.replaceChildren();
  const text = document.createElement('span');
  text.textContent = msg;
  el.append(text);
  showToastEl(el, ms);
}

// 💮 도장 토스트: 왼쪽 도장 자리 + 칭찬 한 줄(굵게) · 방금 저장한 내용(작게). 값이 없는 줄은 그리지 않아요.
//   누르면 바로 닫혀요. (도장이 찍히는 움직임은 style.css 의 seal-thump 예요)
function stampToast({ head, line = '' }, ms = STAMP_TOAST_MS) {
  const el = $('#toast');
  el.className = 'toast stamp-toast';
  el.replaceChildren();
  const seal = document.createElement('span');
  seal.className = 'st-seal';
  seal.setAttribute('aria-hidden', 'true');
  seal.textContent = '💮';
  const body = document.createElement('span');
  body.className = 'st-body';
  [['st-head', head], ['st-line', line]].forEach(([cls, text]) => {
    if (!text) return;
    const row = document.createElement('span');
    row.className = cls;
    row.textContent = text;
    body.append(row);
  });
  el.append(seal, body);
  showToastEl(el, ms);
}
$('#toast').addEventListener('click', () => { if ($('#toast').classList.contains('stamp-toast')) hideToast(); });

/* ---------------------------------------------------------------------
   💮 칭찬 도장 (새 기록을 저장한 뒤 잠깐 나타나요. 점수나 평가가 아니라 '남겼다'는 사실을 칭찬해요. 숫자 · 비교 · 할 일 · 재촉하는 말은 없어요)
   --------------------------------------------------------------------- */
const STAMP_BAG_KEY = 'my-journal.stampBag'; // 이 기기에서만: 영역마다 이번 바퀴에 이미 나온 문구 (동기화·백업에는 들어가지 않아요)
let stampBagMem = {};                        // localStorage 를 못 쓰면 이 창이 열려 있는 동안만 기억해요
function stampBagRead() {
  try {
    const raw = localStorage.getItem(STAMP_BAG_KEY);
    if (raw === null) return {};
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch (e) { return stampBagMem; } // localStorage 를 못 쓰거나 값이 깨졌으면 이 창이 열려 있는 동안 기억해 둔 것을 써요
}
function stampBagWrite(v) {
  stampBagMem = v;
  try { localStorage.setItem(STAMP_BAG_KEY, JSON.stringify(v)); } catch (e) { /* 괜찮아요 */ }
}
const randOf = (list) => list[Math.floor(Math.random() * list.length)];
// 영역 기본 문구 하나: 한 바퀴를 다 돌기 전에는 같은 문구가 나오지 않고, 새 바퀴의 첫 문구는 바로 전 문구를 피해요
function pickFromBag(area, pool) {
  const bag = stampBagRead();
  const used = Array.isArray(bag[area]) ? bag[area] : [];
  let fresh = pool.filter((t) => !used.includes(t));
  let round = used;
  if (!fresh.length) { // 한 바퀴를 다 돌았어요
    round = [];
    const last = used[used.length - 1];
    fresh = pool.length > 1 ? pool.filter((t) => t !== last) : pool.slice();
  }
  const text = randOf(fresh);
  stampBagWrite({ ...bag, [area]: [...round, text] });
  return text;
}
// 직접 만든 문장·피드백 문장이 바로 이어서 두 번 나오지 않게 (영역 상관없이 최근 몇 개만 기억)
const recentPraise = () => { const b = stampBagRead(); return Array.isArray(b._recent) ? b._recent : []; };
function rememberPraise(text) { const bag = stampBagRead(); stampBagWrite({ ...bag, _recent: [...recentPraise(), text].slice(-8) }); }

// 칭찬으로 써도 되는 글인지: 숫자 · 비교 · 할 일 · 재촉하는 말이 들어 있으면 쓰지 않아요 (클로드가 써 준 글을 거를 때)
const PRAISE_BAD = /[0-9０-９]|보다|지난|목표|점수|대비|비교|평균|연속|해\s?보세요|하세요|하면 좋|하길|필요|서둘|빨리|어서|꼭 |늘었|늘려|줄었|줄여|더 해|다음엔|다음에는|다음 /;
const praiseOk = (t) => { const x = String(t || '').trim(); return x.length >= 2 && x.length <= 60 && !PRAISE_BAD.test(x); };

const STAMP_AREA_LABEL = { practice: '바이올린', lesson: '바이올린', workout: '운동', routine: '경제', english: '영어', art: '그림' };
const STAMP_AREA_SCOPE = { practice: 'violin', lesson: 'violin', workout: 'all', routine: 'econ', english: 'english', art: 'drawing' }; // 운동은 클로드 피드백 범위가 없어서 🌈 전체로 받은 잘한 점만 써요
// 그 기록에 맞춘 문장들 (조건이 맞는 것만)
function contextPraise(rec) {
  const out = [];
  const c = catOf(rec);
  const area = c ? c.id : 'general';
  const others = records.filter((r) => r.id !== rec.id && r.date && catOf(r));
  const today = todayStr();
  const h = new Date().getHours();
  // 며칠 만에 다시 (오늘 남기는 기록일 때만)
  if (rec.date === today && area !== 'rest') {
    const before = others.filter((r) => r.date < rec.date && catOf(r).id !== 'rest').map((r) => r.date).sort().pop();
    if (before && daysBetween(before, rec.date) >= 3) out.push('다시 켰어요. 다시 시작하는 게 제일 어려운 거예요', '돌아왔어요. 돌아온 것만으로 충분해요', '다시 펼친 게 반가워요');
  }
  // 영역별
  if (area === 'practice') {
    const names = pieceNamesOf(rec);
    const p = names[0];
    if (p) {
      const seen = others.some((r) => r.type === 'violin' && r.kind !== '레슨' && pieceNamesOf(r).includes(p));
      if (seen) out.push(`${withJosa(p, '을/를')} 또 만났어요`, `${withJosa(p, '과/와')} 다시 마주 앉았어요`);
      else out.push('새 곡을 펼쳤어요', '새 악보와 첫인사를 했어요');
    }
    if (Number(rec.amount) === 1) out.push('짧아도 연습이에요', '살짝만 켜도 연습이에요');
  } else if (area === 'lesson') {
    out.push('레슨 다녀온 날, 잘 남겼어요', '레슨에서 들은 걸 챙겼어요');
    if (hasValue(rec.praise)) out.push('선생님께 들은 좋은 말을 남겼어요');
    if (hasValue(rec.newLearn)) out.push('새로 배운 것을 한 줄로 챙겼어요');
  } else if (area === 'workout') {
    if (Number(rec.distance) > 0) out.push('밖에서 걸었어요', '바깥 공기도 마셨어요', '발걸음을 남겼어요');
    if (Number(rec.amount) === 1) out.push('살짝 움직여도 운동이에요', '가볍게도 충분해요');
  } else if (area === 'english') {
    const dom = domainOf(rec.link);
    if (dom) out.push(`${dom} 기사를 읽었어요`, `${dom}에서 한 편 건져 왔어요`);
  } else if (area === 'routine') {
    const icons = routineIcons(rec);
    if (icons.length > 1) out.push('듣고 읽고, 경제 공부를 잘 챙겼어요');
    else if (icons[0] === '🎧') out.push('귀로 경제를 들었어요');
    else if (icons[0] === '📮') out.push('뉴스레터를 읽었어요');
    if (hasValue(rec.note)) out.push('오늘의 한 줄까지 남겼어요');
  } else if (area === 'art') {
    const k = artKindOf(rec);
    if (k === '크로키') out.push('손이 먼저 움직였어요');
    else if (k === '모작') out.push('눈으로 배우며 그렸어요');
    else if (k === '창작') out.push('내 선으로 그렸어요');
    if (Number(rec.amount) === 1) out.push('짧게 그려도 그림이에요');
  }
  // 같은 날 다른 영역도 남긴 날
  if (area !== 'rest') {
    const labels = [];
    const add = (id) => { const l = STAMP_AREA_LABEL[id]; if (l && !labels.includes(l)) labels.push(l); };
    ['practice', 'lesson', 'workout', 'routine', 'english', 'art'].forEach((id) => { if (id === area || others.some((r) => r.date === rec.date && catOf(r).id === id)) add(id); });
    if (labels.length >= 2) out.push(`${rec.date === today ? '오늘' : '그날'}은 ${labels.slice(0, 3).map((l) => `${l}도`).join(' ')} 챙겼어요`);
  }
  // 밤 · 이른 아침 (지금 시각)
  if (h >= NIGHT_START || h < NIGHT_END) out.push('늦은 밤에도 남겼어요', '밤 시간을 알차게 썼어요');
  else if (h < 7) out.push('이른 아침부터 움직였어요', '아침 공기와 함께 시작했어요', '하루를 일찍 열었어요');
  return out;
}
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

// 저장해 둔 클로드 피드백의 "잘한 점" 한 줄 (같은 영역 · 🌈 전체 것만)
function feedbackPraise(rec) {
  const c = catOf(rec);
  const scope = c ? STAMP_AREA_SCOPE[c.id] : '';
  if (!scope) return [];
  return ofType('claudeFeedback').filter((f) => !f.sample && (f.scope === scope || f.scope === 'all')).sort(byCreatedDesc).slice(0, 3)
    .flatMap((f) => strengthsOf(f).map((x) => oneLine(x))).filter((x) => x.length <= 40 && praiseOk(x));
}
// 클로드가 써 준 "도장 문구" (설정 값 stampLines = { lines, savedAt, scope })
function stampLinesNow() {
  const v = getConfig('stampLines', null);
  if (!v || typeof v !== 'object' || !Array.isArray(v.lines)) return { lines: [], fresh: false, scope: '' };
  const lines = v.lines.map((x) => String(x || '').trim()).filter(praiseOk);
  const fresh = Number(v.savedAt) > 0 && Date.now() - Number(v.savedAt) <= STAMP_FRESH_DAYS * 86400000;
  return { lines, fresh, scope: typeof v.scope === 'string' ? v.scope : '' };
}

// 도장 하나 고르기: text = 토스트의 칭찬 한 줄, icon = 💮 도장 모음판에 찍히는 그림
//   출처는 ① 기록에 맞춘 문장 ② 피드백의 잘한 점 ③ 클로드가 써 준 도장 문구 ④ 영역별 기본 문구 중에서 (기본 문구는 늘 후보에 있어요)
function pickStamp(rec) {
  const h = new Date().getHours();
  const night = h >= NIGHT_START || h < NIGHT_END;
  const c = catOf(rec);
  const area = night ? 'night' : (c && STAMPS[c.id] ? c.id : 'general');
  const recent = recentPraise();
  const notRecent = (list) => list.filter((t) => !recent.includes(t));
  const sources = [];
  const ctx = notRecent(contextPraise(rec));
  if (ctx.length) sources.push({ w: 5, get: () => randOf(ctx) });
  const sl = stampLinesNow();
  const myScope = c ? STAMP_AREA_SCOPE[c.id] : '';
  const lines = notRecent(sl.lines);
  if (lines.length) {
    const sameArea = !sl.scope || sl.scope === 'all' || sl.scope === myScope;
    sources.push({ w: Math.max(1, (sl.fresh ? 4 : 1) - (sameArea ? 0 : 1)), get: () => randOf(lines) });
  }
  const fb = notRecent(feedbackPraise(rec));
  if (fb.length) sources.push({ w: 1, get: () => randOf(fb) });
  sources.push({ w: 3, get: () => pickFromBag(area, STAMPS[area]) });
  let r = Math.random() * sources.reduce((n, x) => n + x.w, 0);
  const src = sources.find((x) => { r -= x.w; return r < 0; }) || sources[sources.length - 1];
  const text = src.get();
  rememberPraise(text);
  const icons = STAMP_ICONS[area] || STAMP_ICONS.general;
  return { icon: randOf(icons), text };
}

// 방금 저장한 내용 한 줄 (둘째 줄). 값이 없으면 빈 글자라서 그 줄은 나오지 않아요.
function savedLine(rec) {
  const amount = amountOf(rec) ? amountOf(rec).label : '';
  const join = (...a) => a.filter(Boolean).join(' · ');
  switch (rec.type) {
    case 'violin': return rec.kind === '레슨' ? '레슨 기록' : join(pieceNamesOf(rec)[0], amount); // 첫 교재의 곡(없으면 그 밖에 연습한 곡) · 연습량
    case 'workout': return join('운동', rec.distance ? `${fmtNum(rec.distance)}km` : '', amount);
    case 'econRoutine': return routineIcons(rec).join(' '); // 체크한 항목 (🎧 📮)
    case 'englishArticle': return domainOf(rec.link);
    case 'art': return join(artKindOf(rec), amount);
    default: return '';
  }
}

// 새 기록을 저장하기 직전에 부르면, 이 기록이 받는 도장을 골라서 기록에 남겨 둬요(stamp = 모음판 그림, stampMsg = 그때 받은 칭찬). 💮 도장 모음판이 이 값을 써요.
// 쉰 날은 늘 😴 도장이에요.
const stampPhrases = new Map();
function assignStamp(rec) {
  const s = pickStamp(rec);
  if (rec.type === 'rest') s.icon = '😴';
  rec.stamp = s.icon;
  rec.stampMsg = s.text;
  stampPhrases.set(rec.id, s);
  return rec;
}

// 도장 토스트: 💮 + 칭찬 한 줄 + 방금 저장한 내용 (꺼 두었으면 나오지 않아요). 새 기록을 저장한 직후에 불러요.
function afterNewRecord(rec) {
  const s = stampPhrases.get(rec.id) || { text: rec.stampMsg || pickStamp(rec).text };
  stampPhrases.delete(rec.id);
  if (settings.celebrateOff) return;
  stampToast({ head: s.text, line: savedLine(rec) });
}

// 사진 파일(여러 장도 돼요) → 사진이 붙은 새 그림 올리기 창. 여러 장은 기록 하나로 묶여요.
async function addArtFromFiles(files) {
  const imgs = files.filter(isImage);
  if (!imgs.length) { toast('이미지 파일(사진)만 올릴 수 있어요.'); return; }
  openForm('art', undefined, undefined, { artKind: '크로키' });
  const dateInput = $('#f_date');
  if (dateInput) dateInput.value = dateOfFile(imgs[0]); // 사진 파일의 날짜를 미리 넣어 둬요 (바꿀 수 있어요)
  await attachShots(imgs);
}

const hasFiles = (e) => !!(e.dataTransfer && [...e.dataTransfer.types].includes('Files'));
const imgFormOpen = () => dlg.open && !!dlg.querySelector('#dropZone, .dropzone[data-key]');
const firstImageKey = () => { const z = dlg.querySelector('.dropzone[data-key]'); return z ? z.dataset.key : 'image'; };
const multiFormOpen = () => dlg.open && !!dlg.querySelector('#dropZone[data-multi]');
// 사진을 화면에 바로 놓았을 때 새 기록이 만들어지는 화면: 🎨 그림(그림 기록)
const dropTarget = () => (dlg.open ? null : ui.tab === 'art' ? 'art' : null);
const DROP_HINT = { art: '🖼 여기에 놓으면 그림 올리기 창이 열려요' };
let dragTimer = null;

function endDrag() {
  clearTimeout(dragTimer);
  $('#dropOverlay').hidden = true;
  document.querySelectorAll('.dropzone.over').forEach((z) => z.classList.remove('over'));
  document.querySelectorAll('.audio-drop.over, [data-line-zone].over').forEach((a) => a.classList.remove('over'));
}

document.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); // 이렇게 해야 브라우저가 사진을 열어 버리면서 기록장이 사라지지 않아요
  document.querySelectorAll('.dropzone').forEach((z) => z.classList.toggle('over', !!(e.target.closest && e.target.closest('.dropzone') === z)));
  document.querySelectorAll('.audio-drop').forEach((a) => a.classList.toggle('over', !!(e.target.closest && e.target.closest('.audio-drop'))));
  const zoneNow = e.target.closest && e.target.closest('[data-line-zone]'); // 곡 줄에 끌어다 놓기: 그 줄이 연하게 표시돼요
  document.querySelectorAll('[data-line-zone]').forEach((z) => z.classList.toggle('over', z === zoneNow));
  const target = dropTarget();
  if (target) {
    const box = $('#dropOverlay');
    box.firstElementChild.textContent = DROP_HINT[target];
    box.hidden = false;
  }
  clearTimeout(dragTimer);
  dragTimer = setTimeout(endDrag, 250); // 끌고 있는 동안만 안내를 보여줘요
});

document.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  endDrag();
  const files = [...e.dataTransfer.files];
  const target = dropTarget();
  const lineZone = e.target.closest && e.target.closest('[data-line-zone]'); // 바이올린 기록 창의 곡 줄
  if (dlg.open && lineZone && dlg.querySelector('#recForm[data-type=violin]') && files.some(isAudioFile)) { // 🎙 그 줄의 곡에 붙일 녹음
    const line = lineZone.dataset.lineZone;
    if (!needPieceFirst(line)) await stageLineFiles(line, files);
    return;
  }
  if (dlg.open && dlg.querySelector('#recForm[data-type=violin]') && files.some(isAudioFile)) { toast('녹음은 붙일 곡 줄에 놓아 주세요.'); return; }
  if (dlg.open && dlg.querySelector('.audio-drop') && files.some(isAudioFile)) { await stageAudioFiles(files); return; } // 🎙 곡 노트의 녹음
  if (!dlg.open && files.some(isAudioFile) && !files.some(isImage)) { toast('녹음 파일은 곡 노트나 바이올린 기록 창의 곡 줄에 놓아 주세요.'); return; }
  if (imgFormOpen()) {
    const imgs = files.filter(isImage);
    if (!imgs.length) { $('#formError').textContent = '이미지 파일(사진)만 넣을 수 있어요.'; return; }
    const onSingle = e.target.closest && e.target.closest('.dropzone[data-key]'); // 한 장짜리 칸(원본 사진)에 놓았으면 그 칸에 들어가요
    if (multiFormOpen() && !onSingle) await attachShots(imgs);
    else {
      const zone = onSingle; // 놓은 자리의 칸에 들어가요
      const key = zone ? zone.dataset.key : firstImageKey();
      if (await attachImage(imgs[0], key) && imgs.length > 1) {
        const note = $(`#imgNote_${key}`);
        if (note) note.textContent = '한 칸에는 그림을 한 장만 넣을 수 있어서 첫 번째만 넣었어요. 여러 장은 🎨 그림 화면에 한꺼번에 놓아 보세요.';
      }
    }
  } else if (target === 'art') {
    await addArtFromFiles(files);
  } else if (!dlg.open) {
    toast('사진은 🎨 그림 화면에 끌어다 놓아 주세요.');
  }
});

// Ctrl+V(붙여넣기): 캡처하거나 복사한 그림을 바로 넣어요
document.addEventListener('paste', async (e) => {
  const imgs = [...(e.clipboardData ? e.clipboardData.files : [])].filter(isImage);
  if (!imgs.length) return;
  const target = dropTarget();
  if (imgFormOpen()) { e.preventDefault(); if (multiFormOpen()) await attachShots(imgs); else await attachImage(imgs[0], firstImageKey()); }
  else if (target === 'art') { e.preventDefault(); await addArtFromFiles(imgs); }
});

/* ---------------------------------------------------------------------
   10-4. 🎙 바이올린 녹음 (휴대폰으로 녹음한 파일을 곡에 붙여 두고, 나중에 처음과 지금을 들어 봐요)
   --------------------------------------------------------------------- */
const AUDIO_MIME_BY_EXT = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', amr: 'audio/amr', wma: 'audio/x-ms-wma', aif: 'audio/aiff', aiff: 'audio/aiff', caf: 'audio/x-caf', '3gp': 'audio/3gpp' };
const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
const pieceKey = (p) => String(p || '').trim();
const fmtMB = (bytes) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)}MB`;

// 오디오 파일인지 (형식 이름이 audio/ 로 시작하거나, 형식이 비어 있고 확장자가 녹음 파일일 때)
function isAudioFile(f) {
  if (!f) return false;
  const t = typeof f.type === 'string' ? f.type : '';
  if (t.startsWith('audio/')) return true;
  return (!t || t === 'application/octet-stream' || t === 'video/mp4') && !!AUDIO_MIME_BY_EXT[extOf(f.name)];
}

// 파일 이름 안의 날짜 찾기: 20260930 · 2026-09-30 · 2026.09.30 · 260930 (삼성 음성 녹음 "음성 260930_143012.m4a", 카카오톡 "KakaoTalk_20260930_…")
function dateFromFileName(name) {
  const base = String(name || '').replace(/\.[^.]*$/, '');
  const found = [];
  const add = (re, toYMD) => { for (const m of base.matchAll(re)) found.push({ i: m.index, ymd: toYMD(m) }); };
  add(/(?<!\d)(20\d{2})[-._ /](\d{1,2})[-._ /](\d{1,2})(?!\d)/g, (m) => [+m[1], +m[2], +m[3]]);
  add(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/g, (m) => [+m[1], +m[2], +m[3]]);
  add(/(?<!\d)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g, (m) => [2000 + +m[1], +m[2], +m[3]]);
  add(/(?<!\d)(\d{2})[-._](\d{2})[-._](\d{2})(?!\d)/g, (m) => [2000 + +m[1], +m[2], +m[3]]);
  const today = todayStr();
  for (const { ymd: [y, mo, d] } of found.sort((a, b) => a.i - b.i)) {
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && toStr(dt) <= today) return toStr(dt);
  }
  return '';
}
// 녹음한 날: ① 파일 이름 안의 날짜 ② 없으면 파일의 날짜 (카카오톡·구글 드라이브로 옮기면 파일 날짜가 옮긴 날로 바뀔 수 있어서요)
const recordingDateOf = (f) => dateFromFileName(f.name) || dateOfFile(f);

// 녹음 길이(초). 읽을 수 없으면 NaN (그럴 땐 파일 크기만 봐요)
function probeDuration(file) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (d) => { if (done) return; done = true; URL.revokeObjectURL(url); a.removeAttribute('src'); resolve(d); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => finish(Number.isFinite(a.duration) ? a.duration : NaN);
    a.onerror = () => finish(NaN);
    setTimeout(() => finish(NaN), 4000);
    a.src = url;
  });
}

const audiosOf = (piece) => audios.filter((a) => a.piece === pieceKey(piece)).sort(byOldest);

/* ---- 올리려고 고른 녹음들 (아직 저장 전. 날짜와 메모를 고칠 수 있어요) ---- */
let staged = [];
const TOO_LONG_MSG = "5분 이내 녹음만 올릴 수 있어요. 녹음 앱 설정에서 음질을 '중간'으로 낮추면 파일이 작아져요.";

async function stageAudioFiles(files) {
  const note = $('#audioNote');
  const say = (t) => { if (note) note.textContent = t; };
  const good = files.filter(isAudioFile);
  const notAudio = files.length - good.length;
  if (!good.length) { say('녹음 파일(m4a, mp3, wav, aac 등)만 올릴 수 있어요.'); return; }
  let tooBig = 0;
  let room = AUDIO_MAX_PER_PIECE - staged.filter((s) => !s.line).length;
  let over = 0;
  for (const f of good) {
    if (f.size > AUDIO_MAX_BYTES) { tooBig += 1; continue; }
    const dur = await probeDuration(f);
    if (dur > AUDIO_MAX_SECONDS + 0.5) { tooBig += 1; continue; }
    if (room <= 0) { over += 1; continue; }
    staged.push({ sid: newId(), file: f, name: f.name || '녹음', date: recordingDateOf(f), memo: '' });
    room -= 1;
  }
  say([tooBig ? TOO_LONG_MSG : '', notAudio ? `녹음 파일이 아닌 ${notAudio}개는 뺐어요.` : '', over ? `한 번에 ${AUDIO_MAX_PER_PIECE}개까지 고를 수 있어서 ${over}개는 뺐어요.` : ''].filter(Boolean).join(' '));
  renderStaged();
}

function stagedHTML() { // 곡 노트에서 올리려고 고른 녹음 (날짜·메모를 고칠 수 있어요)
  const plain = staged.filter((s) => !s.line); // 곡 줄에 고른 녹음(line 이 있는 것)은 바이올린 기록 창의 그 줄에서 보여요
  if (!plain.length) return '';
  return `<div class="stage-list">${plain.map((s) => `<div class="stage-row">
      <div class="stage-name">🎙 <b>${esc(s.name)}</b> <span class="meta">${esc(fmtMB(s.file.size))}</span></div>
      <label class="stage-f"><span class="meta">녹음한 날</span><input type="date" data-stage="date" data-sid="${esc(s.sid)}" value="${esc(s.date)}" max="${todayStr()}"></label>
      <label class="stage-f grow"><span class="meta">메모 - 선택</span><input type="text" maxlength="120" data-stage="memo" data-sid="${esc(s.sid)}" value="${esc(s.memo)}" placeholder="예: 2마디 음정 신경 씀"></label>
      <button type="button" class="btn ghost small" data-act="unstage" data-sid="${esc(s.sid)}">빼기</button>
    </div>`).join('')}
    <div class="row"><button type="button" class="btn purple small" data-act="uploadStaged">올리기</button></div>
  </div>`;
}
function renderStaged() {
  const box = $('#audioStage');
  if (box) box.innerHTML = stagedHTML();
}

// 곡에 녹음 하나 저장. 곡에 이미 5개가 있으면 (첫 녹음을 뺀) 가장 오래된 것을 지울지 물어봐요. 저장하면 true
async function addRecording(piece, { file, date, memo, name, recId }) {
  piece = pieceKey(piece);
  if (!AudioStore.ok()) { alert('이 브라우저에서는 녹음을 저장할 수 없어요. 크롬에서 열어 주세요.'); return false; }
  const list = audiosOf(piece);
  let victim = null;
  if (list.length >= AUDIO_MAX_PER_PIECE) {
    victim = list.find((a) => !a.first);
    if (!victim) return false;
    const what = `${dayLabel(victim.date)}${victim.memo ? ` · ${victim.memo}` : ''}`;
    if (!confirm(`'${piece}'에는 녹음이 ${AUDIO_MAX_PER_PIECE}개 있어요.\n가장 오래된 녹음(첫 녹음 제외)을 지우고 올릴까요?\n\n지워지는 녹음: ${what}`)) return false;
  }
  const mime = file.type && file.type.startsWith('audio/') ? file.type : (AUDIO_MIME_BY_EXT[extOf(file.name)] || 'audio/mpeg');
  const at = Date.now();
  const meta = { id: newId(), piece, date: date || todayStr(), memo: memo || '', createdAt: at, updatedAt: at, size: file.size, mime, name: name || file.name || '', first: list.length === 0, recId: recId || '' };
  try {
    await AudioStore.put({ ...meta, blob: new Blob([file], { type: mime }) });
  } catch (e) { alert('녹음을 저장하지 못했어요. 저장 공간이 부족할 수 있어요.'); return false; }
  audios.push({ ...meta, local: true });
  if (victim) await dropAudio(victim.id);
  if (window.Sync) window.Sync.notify(); // ☁ 로그인 상태면 Drive에도 올라가요 (파일을 먼저, 정보는 그 뒤에)
  return true;
}

/* ---- 녹음 저장소 ↔ 메모리 (☁ 동기화가 같이 써요) ---- */
const isAudioTomb = (r) => !!(r && r.deletedAt);
// 저장된 줄 → 화면용 정보. 파일은 빼고, 이 기기에 파일이 있는지만 local 로 알려요. (바꾼 시각이 없던 예전 녹음은 올린 시각으로 봐요)
function audioInfo(row) { const { blob, ...meta } = row; meta.local = !!blob; if (!meta.updatedAt) meta.updatedAt = meta.createdAt || 0; return meta; }
function loadAudioRows(rows) {
  audioTombs = rows.filter(isAudioTomb);
  audios = rows.filter((r) => !isAudioTomb(r)).map(audioInfo);
}
async function reloadAudios() { if (AudioStore.ok()) loadAudioRows(await AudioStore.all()); }
// 바꾼 시각(updatedAt)이 없던 예전 녹음에 올린 시각을 한 번 적어 둬요 (☁ 동기화가 기준으로 써요)
async function backfillAudioTimes(rows) {
  for (const r of rows) {
    if (isAudioTomb(r) || r.updatedAt) continue;
    try { await AudioStore.update(r.id, (cur) => (cur && !cur.updatedAt ? { ...cur, updatedAt: cur.createdAt || Date.now() } : undefined)); } catch (e) { /* 괜찮아요. 이번 사용에는 올린 시각으로 봐요 */ }
  }
}

// ☁ 동기화가 가져온 녹음 변경을 반영해요.
//   put: 녹음 정보 줄 (파일이 없어도 돼요. 이 기기에 이미 있는 파일은 그대로 남겨요) · tombs: 삭제 표시 · drop: 흔적 없이 지울 id
async function applyAudioChanges({ put = [], tombs = [], drop = [] }) {
  if (!AudioStore.ok()) return;
  for (const r of put) await AudioStore.update(r.id, (cur) => ({ ...(cur && !isAudioTomb(cur) ? cur : {}), ...r }));
  for (const t of tombs) await AudioStore.update(t.id, () => ({ ...t })); // 같은 id 자리를 삭제 표시로 바꿔요 (파일도 함께 사라져요)
  if (drop.length) await AudioStore.remove(drop);
  const gone = new Set([...tombs.map((t) => t.id), ...drop]);
  gone.forEach((id) => { if (cardPlayer.aid === id && cardPlayer.el) cardPlayer.el.pause(); audioB64.delete(id); });
  const putMap = new Map(put.map((r) => [r.id, r]));
  audios = audios.filter((a) => !gone.has(a.id)).map((a) => (putMap.has(a.id) ? { ...a, ...putMap.get(a.id) } : a))
    .concat(put.filter((r) => !gone.has(r.id) && !audios.some((a) => a.id === r.id)).map((r) => ({ ...r, local: false })));
  const ids = new Set([...putMap.keys(), ...gone]);
  audioTombs = audioTombs.filter((t) => !ids.has(t.id)).concat(tombs);
}

// 고른 녹음들을 곡에 붙여요 (날짜가 이른 것부터. 곡의 첫 녹음이 되는 건 가장 먼저 저장된 것이에요)
async function commitStaged(piece, recId) {
  const list = staged.filter((s) => !s.line).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  staged = staged.filter((s) => s.line);
  let added = 0;
  for (const s of list) {
    if (await addRecording(piece, { file: s.file, date: s.date, memo: s.memo.trim(), name: s.name, recId })) added += 1;
  }
  if (added) render();
  return added;
}

const audioB64 = new Map(); // 백업용으로 한 번 바꿔 둔 글자 (녹음 파일은 그대로라서 다시 바꾸지 않아요)
async function dropAudio(id) {
  const a = audios.find((x) => x.id === id);
  if (!a) return;
  if (cardPlayer.aid === id && cardPlayer.el) cardPlayer.el.pause();
  // 파일은 지우고, 같은 id 자리에 작은 "삭제 표시"만 남겨요. (☁ 다른 기기가 "지운 것"과 "아직 못 받은 것"을 구분하게요. rf: Drive 파일을 휴지통으로 보내려고 기억해 둬요)
  const at = Math.max(Date.now(), (a.updatedAt || 0) + 1);
  const tomb = { id, piece: a.piece, deletedAt: at, updatedAt: at, rf: a.rf || '' };
  try { await AudioStore.put(tomb); } catch (e) { try { await AudioStore.remove([id]); } catch (e2) { /* 이미 없어도 괜찮아요 */ } }
  audios = audios.filter((x) => x.id !== id);
  audioTombs = [...audioTombs.filter((t) => t.id !== id), tomb];
  audioB64.delete(id);
  if (window.Sync) window.Sync.notify();
}

async function deleteRecording(id) {
  const a = audios.find((x) => x.id === id);
  if (!a) return;
  const msg = a.first
    ? `🌱 첫 녹음이에요. 지우면 되돌릴 수 없어요.\n(${dayLabel(a.date)})\n그래도 지울까요?`
    : `이 녹음을 지울까요? 되돌릴 수 없어요.\n(${dayLabel(a.date)}${a.memo ? ` · ${a.memo}` : ''})`;
  if (!confirm(msg)) return;
  await dropAudio(id);
  refreshAudioUI();
}

async function saveAudioMemo(id, memo) {
  const a = audios.find((x) => x.id === id);
  if (!a || a.memo === memo) return;
  const at = Math.max(Date.now(), (a.updatedAt || 0) + 1); // 바꾼 시각은 늘 앞으로만 가요 (☁ 동기화가 어느 쪽이 바뀌었나 알아보는 기준이에요)
  try {
    await AudioStore.update(id, (row) => (row ? { ...row, memo, updatedAt: at } : undefined));
  } catch (e) { return; }
  const cur = audios.find((x) => x.id === id) || a;
  cur.memo = memo; cur.updatedAt = at;
  toast('녹음 메모를 남겼어요.', 1800);
  if (window.Sync) window.Sync.notify();
}

/* ---- 재생 (한 번에 하나만 재생돼요) ---- */
let playing = null;
function playExclusive(el) {
  if (playing && playing !== el) { try { playing.pause(); } catch (e) { /* 괜찮아요 */ } }
  playing = el;
}
async function hydrateAudio(root) {
  for (const el of [...root.querySelectorAll('audio[data-aid]')]) {
    if (el.dataset.ready) continue;
    el.dataset.ready = '1';
    el.addEventListener('play', () => playExclusive(el));
    try {
      const full = await AudioStore.get(el.dataset.aid);
      if (full && full.blob && el.isConnected) el.src = URL.createObjectURL(full.blob);
    } catch (e) { /* 파일을 못 찾으면 재생 칸만 비어 있어요 */ }
  }
}
function revokeAudioUrls(root) {
  root.querySelectorAll('audio').forEach((a) => {
    try { a.pause(); } catch (e) { /* 괜찮아요 */ }
    if (playing === a) playing = null;
    if (a.src && a.src.startsWith('blob:')) URL.revokeObjectURL(a.src);
  });
}

// 바이올린 카드의 작은 🎙: 누르면 창을 열지 않고 바로 재생, 다시 누르면 멈춰요
const cardPlayer = { el: null, aid: null, url: '' };
function syncPlayButtons() {
  document.querySelectorAll('.rec-play').forEach((b) => {
    const on = b.dataset.sid
      ? !!stagedPlayer.el && !stagedPlayer.el.paused && stagedPlayer.sid === b.dataset.sid // 저장 전에 고른 녹음
      : !!cardPlayer.el && !cardPlayer.el.paused && cardPlayer.aid === b.dataset.aid;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
async function toggleCardPlay(aid) {
  if (!cardPlayer.el) {
    const el = new Audio();
    ['play', 'pause', 'ended'].forEach((ev) => el.addEventListener(ev, syncPlayButtons));
    el.addEventListener('play', () => playExclusive(el));
    cardPlayer.el = el;
  }
  const el = cardPlayer.el;
  if (cardPlayer.aid === aid && !el.paused) { el.pause(); return; }
  const info = audios.find((x) => x.id === aid);
  if (info && !info.local && !(await fetchAudioFile(aid))) return; // 다른 기기에서 올린 녹음이면 Drive에서 먼저 받아요 (진행은 ☁ 표시로 보여요)
  let full = null;
  try { full = await AudioStore.get(aid); } catch (e) { /* 아래에서 알려줘요 */ }
  if (!full || !full.blob) { toast('녹음 파일을 찾을 수 없어요.'); return; }
  if (cardPlayer.url) URL.revokeObjectURL(cardPlayer.url);
  cardPlayer.url = URL.createObjectURL(full.blob);
  cardPlayer.aid = aid;
  el.src = cardPlayer.url;
  try { await el.play(); } catch (e) { toast('재생하지 못했어요. 이 브라우저에서 열 수 없는 형식일 수 있어요.'); }
  syncPlayButtons();
}
// 곡 줄에 붙지 않은 녹음만 머리 줄에 작게 (곡 줄에 붙은 것은 그 줄의 🎙 이에요. 예: 곡 이름을 나중에 바꿔서 줄과 이어지지 않는 녹음)
const recMarksHTML = (r) => audios.filter((a) => a.recId === r.id && !lineRows(r).some((l) => l.piece && l.piece === a.piece)).sort(byOldest).map((a) => `<button type="button" class="rec-play" data-act="playRec" data-aid="${esc(a.id)}" title="녹음 듣기${a.memo ? ` · ${esc(a.memo)}` : ''}" aria-label="녹음 재생" aria-pressed="false">🎙</button>`).join('');

/* ---- 녹음 목록 (곡 노트와 입력 창에서 같이 써요) ---- */
// 재생 칸. 다른 기기에서 올려서 아직 이 기기에 파일이 없는 녹음은 "☁ 눌러서 받기" 버튼이에요 (받고 나면 재생 칸으로 바뀌어요)
function audioPlayerHTML(a) {
  return a.local
    ? `<audio class="rec-player" controls preload="metadata" data-aid="${esc(a.id)}"></audio>`
    : `<button type="button" class="btn ghost small rec-fetch" data-act="fetchAudio" data-aid="${esc(a.id)}">${esc(window.Sync ? window.Sync.fetchLabel(a) : '☁ Drive에 있어요')}</button>`;
}
function audioRowHTML(a) {
  return `<div class="rec-row" data-aid="${esc(a.id)}">
    <div class="rec-row-head">
      ${a.first ? '<span class="tag first-rec">🌱 첫 녹음</span>' : ''}<span class="rec-date">${esc(dayLabel(a.date))}</span>
      <input class="rec-memo" type="text" maxlength="120" data-audio-memo="${esc(a.id)}" value="${esc(a.memo)}" placeholder="메모 - 선택" aria-label="녹음 메모">
      <span class="rec-cloud" data-aid="${esc(a.id)}">${esc(window.Sync ? window.Sync.audioBadge(a) : '')}</span>
      <button type="button" class="btn ghost small" data-act="saveAudio" data-aid="${esc(a.id)}" title="녹음 파일을 이 컴퓨터(기기)에 저장해요">⬇ 파일로 저장</button>
      <button type="button" class="btn danger small" data-act="delAudio" data-aid="${esc(a.id)}">삭제</button>
    </div>
    ${audioPlayerHTML(a)}
  </div>`;
}

// 다른 기기에서 올린 녹음의 파일을 Drive에서 받아 이 기기에 보관해요. 이 기기에 파일이 있으면 true
async function fetchAudioFile(aid) {
  const a = audios.find((x) => x.id === aid);
  if (!a) return false;
  if (a.local) return true;
  if (!window.Sync || !(await window.Sync.fetchAudio(aid))) return false;
  const now = audios.find((x) => x.id === aid);
  if (dlg.open) refreshAudioUI(); else render();
  return !!(now && now.local);
}

// ⬇ 파일로 저장: 원래 파일 형식 그대로. 이름은 원래 파일 이름이 있으면 그것, 없으면 "곡이름_날짜.확장자"
const AUDIO_EXT_BY_MIME = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/amr': 'amr', 'audio/x-ms-wma': 'wma', 'audio/aiff': 'aiff', 'audio/x-caf': 'caf', 'audio/3gpp': '3gp' };
function audioFileName(a) {
  const clean = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  const ext = extOf(a.name) || AUDIO_EXT_BY_MIME[a.mime] || 'm4a';
  if (a.name && clean(a.name)) return extOf(a.name) ? clean(a.name) : `${clean(a.name)}.${ext}`;
  return `${clean(a.piece) || '녹음'}_${a.date || todayStr()}.${ext}`;
}
async function saveAudioFile(aid) {
  const a = audios.find((x) => x.id === aid);
  if (!a) return;
  if (!a.local && !(await fetchAudioFile(aid))) return; // 다른 기기에서 올린 것이면 Drive에서 받은 다음 저장해요
  let full = null;
  try { full = await AudioStore.get(aid); } catch (e) { /* 아래에서 알려줘요 */ }
  if (!full || !full.blob) { toast('녹음 파일을 찾을 수 없어요.'); return; }
  const name = audioFileName(audios.find((x) => x.id === aid) || a);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(full.blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  toast(`⬇ "${name}" 파일로 저장했어요. (다운로드 폴더를 확인해 주세요)`, 4000);
}

// 처음 vs 지금: 첫 녹음(없으면 가장 오래된 것)과 가장 최근 녹음을 나란히
function audioPairHTML(list) {
  if (list.length < 2) return '';
  const start = list.find((a) => a.first) || list[0];
  const now = list.filter((a) => a.id !== start.id).pop();
  const col = (title, a) => `<div class="rec-pair-col"><div class="label" style="margin-top:0">${title} <span class="meta">${esc(dayLabel(a.date))}${a.memo ? ` · ${esc(a.memo)}` : ''}</span></div>
    ${audioPlayerHTML(a)}</div>`;
  return `<div class="rec-pair"><div class="label" style="margin:0 0 6px">처음 vs 지금</div><div class="rec-pair-cols">${col(start.first ? '🌱 처음 (첫 녹음)' : '처음', start)}${col('지금', now)}</div></div>`;
}

const AUDIO_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac';
const AUDIO_HINT = `m4a · mp3 · wav · aac · 한 파일 5분(15MB)까지 · 곡마다 최대 ${AUDIO_MAX_PER_PIECE}개`;

function pieceAudioInner(piece) {
  const list = audiosOf(piece);
  if (!AudioStore.ok()) return '<h3 class="audio-h">🎙 녹음</h3><p class="meta">이 브라우저에서는 녹음을 저장할 수 없어요. 크롬에서 열어 주세요.</p>';
  return `<h3 class="audio-h">🎙 녹음</h3>
    <input id="p_audio" type="file" accept="${AUDIO_ACCEPT}" multiple class="sr-only" data-audio-input>
    <label class="audio-drop" for="p_audio"><span>🎙 녹음 올리기</span><small>파일을 끌어다 놓거나 눌러서 고르세요 · ${esc(AUDIO_HINT)}</small></label>
    <div class="hint" id="audioNote"></div>
    <div class="audio-stage" id="audioStage"></div>
    ${audioPairHTML(list)}
    ${list.length ? `<div class="rec-list">${list.map(audioRowHTML).join('')}</div>` : '<p class="meta" style="margin:6px 0 0">아직 올린 녹음이 없어요. 휴대폰 녹음 파일을 올려 두면 나중에 처음과 지금을 나란히 들어 볼 수 있어요.</p>'}`;
}

// 녹음이 바뀐 뒤: 뒤의 화면(카드의 🎙, 책장)과 열려 있는 창의 녹음 칸을 새로 그려요
function refreshAudioUI() {
  render();
  const swap = (box, html) => { revokeAudioUrls(box); box.innerHTML = html; hydrateAudio(box); renderStaged(); };
  if (!dlg.open) return;
  const pb = dlg.querySelector('#pieceAudio');
  if (pb) swap(pb, pieceAudioInner(pb.dataset.piece));
  renderAllLineRecs(); // 바이올린 기록 창의 곡 줄에 붙은 녹음 (지우면 바로 반영)
}

/* ---- 백업에 넣기: 곡마다 첫 녹음만 (⚙ 에서 "녹음은 백업에서 빼기"를 켜면 하나도 넣지 않아요) ---- */
const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});

async function audiosForBackup() {
  if (settings.audioSkip || !AudioStore.ok()) return [];
  const out = [];
  for (const a of audios.filter((x) => x.first)) {
    let data = audioB64.get(a.id);
    if (!data) {
      const full = await AudioStore.get(a.id);
      if (!full || !full.blob) continue;
      data = await blobToDataURL(full.blob);
      audioB64.set(a.id, data);
    }
    out.push({ id: a.id, piece: a.piece, date: a.date, memo: a.memo, createdAt: a.createdAt, mime: a.mime, name: a.name, size: a.size, first: true, recId: a.recId, data });
  }
  return out;
}

// 백업 파일에서 녹음 불러오기. 이 브라우저에 이미 있는 녹음은 지우지도 덮어쓰지도 않아요. 새로 넣은 개수를 돌려줘요.
async function importAudios(payload) {
  const list = payload && Array.isArray(payload.audios) ? payload.audios : [];
  if (!list.length || !AudioStore.ok()) return 0;
  let added = 0;
  for (const a of list) {
    try {
      if (!a || typeof a.id !== 'string' || typeof a.data !== 'string' || !pieceKey(a.piece)) continue;
      const mine = audios.find((x) => x.id === a.id);
      if (mine && mine.local) continue; // 이 기기에 이미 있는 녹음은 그대로 둬요
      const have = audiosOf(a.piece);
      if (!mine && have.length >= AUDIO_MAX_PER_PIECE) continue;
      const blob = await (await fetch(a.data)).blob();
      const gone = audioTombs.find((t) => t.id === a.id); // 지웠던 녹음을 백업에서 되살리는 경우는 "새로 고친 것"으로 봐요 (☁ 동기화에서 삭제가 다시 덮어쓰지 않게)
      const at = Math.max(Date.now(), gone ? gone.updatedAt + 1 : 0, mine ? mine.updatedAt + 1 : 0);
      const meta = { id: a.id, piece: pieceKey(a.piece), date: typeof a.date === 'string' ? a.date : todayStr(), memo: typeof a.memo === 'string' ? a.memo : '', createdAt: Number(a.createdAt) || Date.now(), updatedAt: at, size: blob.size, mime: typeof a.mime === 'string' && a.mime ? a.mime : blob.type || 'audio/mpeg', name: typeof a.name === 'string' ? a.name : '', first: !!a.first && !have.some((x) => x.first && x.id !== a.id), recId: typeof a.recId === 'string' ? a.recId : '', ...(mine && mine.rf ? { rf: mine.rf } : {}) };
      await AudioStore.put({ ...meta, blob: new Blob([blob], { type: meta.mime }) });
      audios = audios.filter((x) => x.id !== a.id).concat({ ...meta, local: true });
      audioTombs = audioTombs.filter((t) => t.id !== a.id);
      added += 1;
    } catch (e) { /* 이 녹음만 건너뛰어요 */ }
  }
  if (added && window.Sync) window.Sync.notify();
  return added;
}

/* ---------------------------------------------------------------------
   10-5. 🎻 교재 관리 (바이올린 기록 창의 "⚙︎ 교재 관리"): 추가 · 숨기기 · 순서 바꾸기 · 숨긴 교재 다시 보이기
   숨겨도 지우는 게 아니라서, 예전 기록에는 교재 이름이 그대로 보여요.
   --------------------------------------------------------------------- */
const dlg2 = document.getElementById('dlg2');

function openBooksManager(msg = '') {
  const list = textbookList();
  const visIdx = list.map((b, i) => (b.hidden ? -1 : i)).filter((i) => i >= 0);
  const row = (i, pos) => `<li class="bk-row"><span class="bk-name">${esc(list[i].name)}</span>
      <span class="bk-btns">
        <button type="button" class="btn ghost small" data-act="bookMove" data-i="${i}" data-d="-1" ${pos === 0 ? 'disabled' : ''} aria-label="${esc(list[i].name)} 위로">▲</button>
        <button type="button" class="btn ghost small" data-act="bookMove" data-i="${i}" data-d="1" ${pos === visIdx.length - 1 ? 'disabled' : ''} aria-label="${esc(list[i].name)} 아래로">▼</button>
        <button type="button" class="btn ghost small" data-act="bookHide" data-i="${i}">숨기기</button>
      </span></li>`;
  const hidden = list.map((b, i) => (b.hidden ? i : -1)).filter((i) => i >= 0);
  dlg2.innerHTML = `<div class="dlg-body">
    <h2>⚙︎ 교재 관리</h2>
    <form id="bookAddForm" class="row" novalidate>
      <input id="bookNew" class="search" type="text" maxlength="40" autocomplete="off" placeholder="교재 이름 (예: 스즈키 5권)" style="flex:1">
      <button type="submit" class="btn purple">추가</button>
    </form>
    <p class="hint" id="bookMsg" role="status">${esc(msg)}</p>
    ${visIdx.length ? `<ul class="bk-list">${visIdx.map((i, pos) => row(i, pos)).join('')}</ul>` : '<p class="meta">보이는 교재가 없어요. 위에서 추가해 보세요.</p>'}
    ${hidden.length ? `<div class="label" style="margin-top:14px">숨긴 교재 <span class="meta">(예전 기록에는 그대로 보여요)</span></div>
      <ul class="bk-list dim">${hidden.map((i) => `<li class="bk-row"><span class="bk-name">${esc(list[i].name)}</span><span class="bk-btns"><button type="button" class="btn ghost small" data-act="bookShow" data-i="${i}">다시 보이기</button></span></li>`).join('')}</ul>` : ''}
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg2">닫기</button></div>
  </div>`;
  if (!dlg2.open) dlg2.showModal();
  const input = dlg2.querySelector('#bookNew');
  if (input && !msg) input.focus();
}

// 목록을 바꾸고 저장한 뒤, 열려 있는 창의 교재 칩도 새로 그려요 (이미 고른 것은 그대로 남아요)
async function saveBooks(list, msg = '') {
  await setConfig('textbooks', list);
  openBooksManager(msg);
  refreshBooksChips();
}

function refreshBooksChips() {
  const box = dlg.querySelector('.field[data-key=books] .choice');
  if (!box) return;
  readBookDraft();
  const cur = selectedBookNames();
  box.outerHTML = choiceHTML('books', textbookChoices(), cur, true, MANAGE_BOOKS_BTN);
  const input = dlg.querySelector('input[name=books]'); // 교재 순서를 바꿨을 수 있어서 칩 순서대로 다시 적어요
  input.value = JSON.stringify([...input.closest('.choice').querySelectorAll('.choice-btn.on')].map((b) => b.dataset.val));
  syncBookRows();
}

async function addBook(name) {
  name = name.trim();
  if (!name) return;
  const list = textbookList();
  const same = list.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (same && !same.hidden) { openBooksManager('이미 있는 교재예요.'); return; }
  if (same) { same.hidden = false; await saveBooks(list, `숨겨 둔 "${same.name}"을 다시 보이게 했어요.`); return; }
  list.push({ name, hidden: false });
  await saveBooks(list, `"${name}"을 더했어요.`);
}

async function moveBook(i, d) { // 보이는 교재끼리 위·아래로 자리를 바꿔요
  const list = textbookList();
  let j = i + d;
  while (j >= 0 && j < list.length && list[j].hidden) j += d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await saveBooks(list);
}

async function hideBook(i, hide) {
  const list = textbookList();
  if (!list[i]) return;
  list[i].hidden = hide;
  await saveBooks(list, hide ? `"${list[i].name}"을 숨겼어요. 예전 기록에는 그대로 보여요.` : `"${list[i].name}"을 다시 보이게 했어요.`);
}

dlg2.addEventListener('close', () => { dlg2.innerHTML = ''; });
dlg2.addEventListener('cancel', (e) => { e.preventDefault(); dlg2.close(); });

/* ---------------------------------------------------------------------
   10-6. 🤖 클로드에게 보내기 + 💬 받은 피드백
   기록 → 글로 복사 → 클로드에게 붙여 넣기 → 받은 답변 저장(잘한 점이 쌓여요). 해야 할 일은 만들지 않아요.
   (밖으로 나가는 요청은 없어요. 복사하고 붙여 넣는 방식이에요.)
   --------------------------------------------------------------------- */
const COPY_SCOPES = ['all', 'violin', 'econ', 'english', 'drawing']; // 🤖 클로드 피드백의 범위 칩 (① 보내기 · ② 받은 답변 저장). 🌈 전체가 맨 앞이에요.
const AREA_SCOPES = COPY_SCOPES.filter((id) => id !== 'all'); // 영역 하나씩 (③ 받은 피드백의 범위 칩 · 🌈 전체 글의 영역 순서)
// 기간 칩: 오늘 · 지난주 · 지난달. 저장되는 period 이름은 'day' | 'week' | 'month' 그대로예요 (예전에 '이번 주'·'이번 달'로 저장된 피드백도 같은 이름이고, 저장된 날짜 범위(rangeStart·rangeEnd) 그대로 보여요)
const PERIODS = [{ id: 'day', label: '오늘' }, { id: 'week', label: '지난주' }, { id: 'month', label: '지난달' }];
const RETIRED_SCOPES = { exercise: { id: 'exercise', icon: '🧘', label: '운동' } }; // 범위 칩에서는 빠졌지만, 예전에 이 범위로 저장된 피드백은 지우지 않고 🧘 로 보여요 (🌈 전체에서만 보여요)
const scopeMeta = (id) => CLAUDE_SCOPES.find((x) => x.id === id) || RETIRED_SCOPES[id] || CLAUDE_SCOPES.find((x) => x.id === 'violin');
const byCreatedDesc = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

/* ---- 내 정보·요청 문구 (범위마다. 고치면 Store에 저장되고 백업에 들어가요) ---- */
const claudeStored = () => getConfig('claudeSettings', {}) || {};
function claudeField(scope, key) {
  const st = claudeStored()[scope];
  const mine = st && typeof st[key] === 'string' ? st[key] : null;
  const old = (CLAUDE_OLD_DEFAULTS[scope] || {})[key] || [];
  return mine !== null && !old.includes(mine) ? mine : scopeMeta(scope)[key]; // 내가 고친 문구는 그대로, 예전 기본값 그대로인 것만 새 기본값을 따라가요
}
const claudeInfo = (scope) => claudeField(scope, 'info');
const claudeRequest = (scope) => claudeField(scope, 'request');

/* ---- 기간과 기록 모으기 ---- */
// 오늘 = 오늘 하루(새벽 4시 전은 전날) · 지난주 = 바로 전 주 일요일~토요일 · 지난달 = 바로 전 달 1일~말일
function claudeRange(period) {
  const t = todayStr();
  if (period === 'week') { const s = addDays(weekStartOf(t), -7); return [s, addDays(s, 6)]; }
  if (period === 'month') {
    const d = parseDate(t);
    return [toStr(new Date(d.getFullYear(), d.getMonth() - 1, 1)), toStr(new Date(d.getFullYear(), d.getMonth(), 0))];
  }
  return [t, t];
}
// 복사 글·② 에 적는 기간: "오늘(10/4)" · "지난주(9/27~10/3)" · "지난달(9/1~9/30)"
function periodText(period, start, end) {
  const name = (PERIODS.find((p) => p.id === period) || {}).label || '';
  if (!start) return name;
  return period === 'day' ? `${name}(${slashDay(start)})` : `${name}(${slashDay(start)}~${slashDay(end || start)})`;
}
const SCOPE_TYPE = { violin: 'violin', econ: 'econRoutine', english: 'englishArticle', drawing: 'art' };
const scopeRecords = (scope, start, end) => ofType(SCOPE_TYPE[scope]).filter((r) => r.date >= start && r.date <= end).sort(byOldest);
// 그 기간에 기록이 있는 영역만 (📚 경제 루틴은 그 기간에 새로 정리한 용어도 함께). only 를 주면 그 영역 하나만 봐요.
function claudeGroups(start, end, only = null) {
  return (only ? [only] : AREA_SCOPES)
    .map((sc) => ({ scope: sc, list: scopeRecords(sc, start, end), terms: sc === 'econ' ? termsBetween(start, end) : [] }))
    .filter((g) => g.list.length || g.terms.length);
}

// 기록 한 줄 (채운 칸만)
function claudeLine(r) {
  const bits = [mdLabel(r.date)];
  const add = (label, v) => { if (hasValue(v)) bits.push(label ? `${label}: ${oneLine(v)}` : oneLine(v)); };
  const feel = () => { if (amountOf(r)) bits.push(`${amountWord(r)}: ${amountOf(r).label}`); };
  if (r.type === 'violin' && r.kind === '레슨') {
    bits.push('레슨');
    add('선생님 피드백', r.feedback); add('좋다고 한 것', r.praise); add('새로 배운 것', r.newLearn);
    feel();
  } else if (r.type === 'violin') {
    // 곡 줄마다 "곡 (템포 60 · 녹음 1개 있음)" — 템포·녹음은 있을 때만이고, 녹음은 "있음"만 알려요
    const lines = lineRows(r);
    const note = (l) => { const t = l.piece ? tempoOfPiece(r, l.piece) : 0; const n = lineAudios(r, l).length; const a = [t ? `템포 ${t}` : '', n ? `녹음 ${n}개 있음` : ''].filter(Boolean); return a.length ? ` (${a.join(' · ')})` : ''; };
    const other = lines[lines.length - 1];
    const books = lines.filter((l) => l.book);
    if (other.piece) bits.push(`${books.length ? '그 밖에 연습한 곡' : '곡'}: ${oneLine(other.piece)}${note(other)}`);
    if (books.length) bits.push(`교재: ${books.map((l) => (l.piece ? `${l.book} · ${oneLine(l.piece)}${note(l)}` : l.book)).join(' / ')}`);
    add('교재 위치', r.bookPart); // 아직 옮기지 않은 예전 기록에만 있어요
    feel(); add('단계', r.stage);
  } else if (r.type === 'econRoutine') {
    ECON_ROUTINES.filter((x) => routineChecked(r, x.id)).forEach((x) => {
      const chips = x.chips && Array.isArray(r.letters) ? r.letters.filter((c) => x.chips.includes(c)) : [];
      bits.push(`${x.icon} ${x.label}${chips.length ? `(${chips.join(', ')})` : ''}`);
    });
    add('한 줄', r.note);
  } else if (r.type === 'englishArticle') {
    add('링크', r.link);
    const sums = [r.sum1, r.sum2, r.sum3].map((t, i) => (String(t || '').trim() ? `${i + 1}) ${oneLine(t)}` : '')).filter(Boolean);
    if (sums.length) bits.push(`요약: ${sums.join(' ')}`);
  } else if (r.type === 'art') { // 그림: 종류 · 장수 · 한 줄 · 마음에 드는 곳 · 다음에 해볼 것
    bits.push(`종류: ${artKindOf(r)}`);
    bits.push(`${artCount(r)}장`);
    add('한 줄', r.topic); feel();
  }
  return bits.join(' · ');
}

// 지난주·지난달 요약 한 줄 (쉰 날·빈 날은 쓰지 않아요)
function claudeSummary(scope, list) {
  if (scope === 'econ') return ECON_ROUTINES.map((x) => `${x.icon} ${list.filter((r) => routineChecked(r, x.id)).length}번`).join(' · ');
  if (scope === 'english') return `기사 ${list.length}개`;
  const days = new Set(list.map((r) => r.date)).size;
  return [`기록한 날 ${days}일`, ...AMOUNTS.map((a) => `${a.label} ${list.filter((r) => amountOf(r) && supportsAmount(r.type, r.kind) && amountOf(r).v === a.v).length}`)].join(' · ');
}

/* ---- 지난번 피드백에서: 지난번에 저장한 "잘한 점" 한 줄 (클로드가 그 뒤 달라진 점을 볼 수 있게. 예시 피드백은 넣지 않아요) ---- */
const strengthsOf = (f) => (f && Array.isArray(f.strengths) ? f.strengths : []).map((x) => String(x || '').trim()).filter(Boolean);
function lastStrength(scope) {
  const f = ofType('claudeFeedback').filter((x) => !x.sample && x.scope === scope && strengthsOf(x).length).sort(byCreatedDesc)[0];
  return f ? oneLine(strengthsOf(f)[0]) : '';
}
function lastFeedbackBlock(scope) {
  const s = lastStrength(scope);
  return s ? `지난번 피드백에서: ${s}` : '';
}
function lastFeedbackBlockAll() { // 영역별 최근 한 줄씩 (🌈 전체로 받은 것도 한 줄)
  const rows = [...AREA_SCOPES, 'all'].map((sc) => { const s = lastStrength(sc); return s ? `${scopeMeta(sc).icon} ${s}` : ''; }).filter(Boolean);
  return rows.length ? ['지난번 피드백에서:', ...rows].join('\n') : '';
}

// 복사되는 글(영역 하나): 내 정보 → 요청(+공통 답변 형식) → 물어볼 것 → 지난번 피드백에서 → 기록 본문(+새로 정리한 용어) → 요약 한 줄 (블록 사이는 빈 줄 하나)
function claudeText({ scope, period, list, terms = [], question = '', start = '', end = '' }) {
  const blocks = [];
  const info = String(claudeInfo(scope) || '').trim();
  if (info) blocks.push(info);
  blocks.push(`${String(claudeRequest(scope) || '').trim()}\n${CLAUDE_COMMON}`.trim());
  if (question.trim()) blocks.push(`이번에 특히 물어볼 것: ${oneLine(question)}`);
  const prev = lastFeedbackBlock(scope);
  if (prev) blocks.push(prev);
  const body = [...[...list].sort(byOldest).map(claudeLine), ...(terms.length ? [termsLine(terms)] : [])];
  if (body.length) blocks.push([start ? `기간: ${periodText(period, start, end)}` : '', ...body].filter(Boolean).join('\n'));
  if ((period === 'week' || period === 'month') && list.length) blocks.push(claudeSummary(scope, list));
  blocks.push(CLAUDE_STAMP_ASK);
  return blocks.join('\n\n');
}

// 🌈 전체: 그 기간에 기록이 있는 영역만 모아서 한 글로. 영역마다 "── 🎻 바이올린 ──" + 그 영역 요청 문구 한 줄 + 기록 + 요약 한 줄
const claudeCount = (g) => g.list.length + g.terms.length;
function claudeSection(g, period) {
  const meta = scopeMeta(g.scope);
  const lines = [`── ${meta.icon} ${meta.label} ──`];
  const req = oneLine(claudeRequest(g.scope));
  if (req) lines.push(req);
  [...g.list].sort(byOldest).forEach((r) => lines.push(claudeLine(r)));
  if (g.terms.length) lines.push(termsLine(g.terms));
  if ((period === 'week' || period === 'month') && g.list.length) lines.push(claudeSummary(g.scope, g.list));
  return lines.join('\n');
}
function claudeTextAll({ period, groups, question = '', start = '', end = '' }) {
  const blocks = [];
  const info = String(claudeInfo('all') || '').trim();
  if (info) blocks.push(info);
  blocks.push(`${String(claudeRequest('all') || '').trim()}\n${CLAUDE_COMMON}`.trim());
  if (question.trim()) blocks.push(`이번에 특히 물어볼 것: ${oneLine(question)}`);
  const prev = lastFeedbackBlockAll();
  if (prev) blocks.push(prev);
  if (start) blocks.push(`기간: ${periodText(period, start, end)}`);
  groups.forEach((g) => blocks.push(claudeSection(g, period)));
  blocks.push(CLAUDE_STAMP_ASK);
  return blocks.join('\n\n');
}

/* ---- 받은 피드백 저장·바꾸기 ---- */
const feedbackPhrase = () => pickFromBag('feedback', STAMPS.feedback);

// strengths = 잘한 점으로 담을 줄들 (없어도 돼요). 🌈 전체로 받은 답변은 영역 구분 없이 scope 'all' 로 저장돼요.
async function saveFeedback({ scope, period, rangeStart, rangeEnd, targetId = '', question = '', text = '', strengths = [] }) {
  text = text.trim();
  if (!text) { toast('붙여 넣은 답변을 적어 주세요.', 3000); return null; }
  const lastAt = ofType('claudeFeedback').reduce((m, f) => Math.max(m, f.createdAt || 0), 0);
  const at = Math.max(Date.now(), lastAt + 1); // 받은 순서가 항상 구분되게 (아주 짧은 사이에 저장해도)
  const rec = { id: newId(), type: 'claudeFeedback', date: todayStr(), scope, period, rangeStart, rangeEnd, targetId, question, text, strengths: strengths.map((x) => String(x).trim()).filter(Boolean), createdAt: at, updatedAt: at };
  if (!(await saveRecord(rec))) return null;
  if (settings.celebrateOff) toast('피드백을 저장했어요', 3000);
  else stampToast({ head: feedbackPhrase(), line: '💬 피드백을 저장했어요' }); // 도장은 새로 받지 않아요
  return rec;
}

// 모아보기(③)만 새로 그려요. 위에서 쓰던 답변 칸(②)은 그대로 남아요. (캘린더가 아니면 화면 전체를 새로 그려요)
function refreshFbList() { const el = $('#fbList'); if (el) el.innerHTML = fbListInner(); }
const refreshFeedbackViews = () => { render(); refreshDay(); refreshArtDetail(); };
function afterFeedbackChange() {
  if ($('#fbList')) { refreshFbList(); syncClaudeBox(); } // 복사할 글의 "지난번 피드백에서"도 같이 바뀌어요
  else refreshFeedbackViews();
}

/* ---- 기록 카드 안의 💬 (💬 N = 캘린더의 받은 피드백으로 이동) ---- */
const feedbacksOf = (id) => ofType('claudeFeedback').filter((f) => f.targetId === id).sort(byCreatedDesc);
const claudeBtns = (r) => feedbackBadge(r); // 카드에는 🤖 가 없어요 (클로드에게 보내기는 📅 캘린더 한 곳에서). 받은 피드백이 있으면 💬 N 만 보여요
function feedbackBadge(r) {
  const n = feedbacksOf(r.id).length;
  return n ? `<button type="button" class="btn ghost small fb-badge" data-act="fbGo" data-id="${esc(r.id)}" title="받은 피드백을 캘린더에서 보기">💬 ${n}</button>` : '';
}

// 받은 피드백의 기간 이름. 저장된 날짜 범위(rangeStart·rangeEnd)를 그대로 보여 주고, 이름은 그 범위가 저장한 날을 포함하면 예전 이름(이번 주·이번 달), 아니면 지난주·지난달이에요
const periodLabel = (f) => {
  if (f.period === 'card') return '카드';
  if (f.period === 'day') return '오늘';
  const past = !!(f.rangeEnd && f.date && f.rangeEnd < f.date); // 범위가 저장한 날보다 앞이면 지난 기간이에요
  if (f.period === 'week') return past ? '지난주' : '이번 주';
  if (f.period === 'month') return past ? '지난달' : '이번 달';
  return '';
};
function fbRangeText(f) {
  if (!f.rangeStart || f.period === 'card' || f.period === 'day') return '';
  return ` (${slashDay(f.rangeStart)}~${slashDay(f.rangeEnd || f.rangeStart)})`;
}

/* ---- 피드백 한 건 (③ 받은 피드백) ---- */
function fbAnswerHTML(f) {
  const text = stripStampSection(f.text).trim();
  if (!text) return '';
  const long = text.split('\n').length > 3 || text.length > 200;
  const open = ui.fbOpenText.has(f.id);
  return `<p class="pre fb-answer${long && !open ? ' clamp' : ''}">${esc(text)}</p>${long ? `<button type="button" class="link-btn" data-act="fbMore" data-id="${esc(f.id)}">${open ? '접기' : '더 보기'}</button>` : ''}`;
}
function fbItemHTML(f) {
  const target = f.targetId && records.find((x) => x.id === f.targetId);
  const sc = scopeMeta(f.scope);
  const st = strengthsOf(f);
  return `<div class="card fb-item" data-rid="${esc(f.id)}">
    <div class="meta">${esc(dayLabel(f.date))} · <span class="fb-scope" title="${esc(sc.label)}" aria-label="${esc(sc.label)}">${sc.icon}</span> · ${esc(periodLabel(f))}${esc(fbRangeText(f))}</div>
    ${hasValue(f.question) ? `<p class="fb-q"><span class="meta">물어본 것</span> ${esc(f.question)}</p>` : ''}
    ${st.length ? `<div class="fb-strengths-view"><div class="fb-str-title">💬 잘한 점</div><ul class="fb-str-list">${st.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${fbAnswerHTML(f)}
    <div class="row" style="margin-top:8px">
      <button type="button" class="btn ghost small" data-act="fbEdit" data-id="${esc(f.id)}">수정</button>
      <button type="button" class="btn danger small" data-act="fbDelete" data-id="${esc(f.id)}">삭제</button>
      ${target ? `<button type="button" class="btn ghost small" data-act="goto" data-id="${esc(f.targetId)}">기록 보기</button>` : ''}
    </div>
  </div>`;
}

// ③ 받은 피드백 (모아보기): 범위 칩 · 최신순 카드 · 처음엔 최근 5개, "더 보기"로 5개씩
const fbFiltered = () => ofType('claudeFeedback').filter((f) => ui.fbScope === 'all' || f.scope === ui.fbScope).sort(byCreatedDesc);
function fbListInner() {
  const all = fbFiltered();
  const shown = all.slice(0, ui.fbCount);
  const rest = all.length - shown.length;
  const chip = (id, label, say) => `<button type="button" class="chip ${ui.fbScope === id ? 'active' : ''}" data-act="fbScope" data-id="${id}" aria-pressed="${ui.fbScope === id}" title="${esc(say)}" aria-label="${esc(say)}">${label}</button>`;
  return `<div class="label fb-list-title">💬 받은 피드백</div>
    <div class="chips fb-scopes">${chip('all', '전체', '전체')}${AREA_SCOPES.map((id) => chip(id, scopeMeta(id).icon, scopeMeta(id).label)).join('')}</div>
    ${shown.length ? shown.map(fbItemHTML).join('') : `<div class="empty">${esc(EMPTY_TEXT.feedback)}</div>`}
    ${rest > 0 ? `<div class="row"><button type="button" class="btn ghost small" data-act="fbListMore">더 보기</button></div>` : ''}`;
}

function openFeedbackEdit(id) {
  const f = records.find((x) => x.id === id);
  if (!f) return;
  openDlg(`<h2>💬 피드백 수정</h2>
    <form id="fbEditForm" data-id="${esc(id)}" novalidate>
      <div class="field"><label for="fe_q">물어본 것</label><input id="fe_q" name="question" type="text" value="${esc(f.question || '')}"></div>
      <div class="field"><label for="fe_t">받은 답변</label><textarea id="fe_t" name="text" rows="8">${esc(f.text || '')}</textarea></div>
      <div class="field"><label for="fe_s">잘한 점 <span class="meta">(한 줄에 하나)</span></label><textarea id="fe_s" name="strengths" rows="4">${esc(strengthsOf(f).join('\n'))}</textarea></div>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">취소</button><button type="submit" class="btn">저장</button></div>
    </form>`, 'roomy');
}
async function saveFeedbackEdit(form) {
  const f = records.find((x) => x.id === form.dataset.id);
  if (!f) return;
  const { sample, ...keep } = f; // 예시를 고치면 내 기록이 돼요 (예전에 저장한 해볼 것 값은 그대로 남아요)
  const strengths = form.elements.strengths.value.split('\n').map((x) => x.trim()).filter(Boolean);
  await saveRecord({ ...keep, question: form.elements.question.value.trim(), text: form.elements.text.value.trim(), strengths, updatedAt: Date.now() });
  closeDlg();
  afterFeedbackChange();
  toast('피드백을 고쳤어요.', 2500);
}

/* ---- 받은 답변에서 "잘한 점" 줄 찾기 ----
   "잘한 점" 항목(제목 줄 · "1. 잘한 점" · "**잘한 점**" · "잘한 점: …")을 찾아, 그 아래 번호·글머리표 줄을 모아요.
   마크다운 기호(**, #, >, 번호·글머리표)는 떼고, 줄마다 80자가 넘으면 문장이 끝나는 곳 → 쉼표 → 띄어쓰기에서 줄여요.
   다음 항목(달라진 점·패턴 · 영역 제목 · # 제목 · 굵은 제목)이 나오면 거기서 멈추고, 🌈 전체 답변처럼 "잘한 점"이 여러 번 나오면 모두 모아요.
   번호·글머리표 줄이 하나도 없으면 제목 바로 아래 첫 문단의 줄을 써요. 아무것도 못 찾으면 빈 목록이에요 (답변만 저장돼요). */
const STRENGTH_MAX = 80;
const STRENGTH_CAP = 10;
const LIST_NUM = /^(?:\d{1,2}\s?[.)](?=\s|\D|$)|[①-⑳]|\d️?⃣)\s*/; // 1.  1)  ①  1️⃣
const LIST_BULLET = /^(?:[-*+–—]\s+|[•·‣◦▪●○■□▶▷→]\s*)/;                    // -  *  +  •  ·  …
const GOOD_HEAD = /^[^\p{L}\p{N}]*잘한\s*점(?=$|[\s:：\-–—·(（])/u;
const GOOD_REST = /^[^\p{L}\p{N}]*잘한\s*점\s*(?:[(（][^)）]*[)）])?\s*[:：\-–—·]?\s*/u;
const SECTION_LABEL = /^[^\p{L}\p{N}]*(?:달라진\s*점|패턴|한\s*줄\s*총평|총평|요약|마무리|정리|도장\s*문구)(?=$|[\s:：\-–—·(（])/u;
const AREA_HEAD = /^[^\p{L}\p{N}]*[🎻🧘📚📰🎨🌈]/u;
function stripMd(s) {
  return String(s)
    .replace(/^(?:>\s*)+/, '').replace(/^#{1,6}\s*/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')       // [글자](주소) → 글자
    .replace(/(\*\*|__|~~|`)/g, '')                    // 굵게·취소선·코드
    .replace(/\*([^*\s][^*]*?)\*/g, '$1')              // *기울임*
    .replace(/\s+/g, ' ').trim();
}
function shortenLine(s, max = STRENGTH_MAX) {
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const MIN = 12;
  const head = s.slice(0, max);
  for (let i = head.length - 1; i >= MIN; i -= 1) if (/[.!?。！？]/.test(head[i]) && !/\d/.test(s[i + 1] || '')) return head.slice(0, i + 1).trim(); // 문장이 끝나는 곳
  const room = s.slice(0, max - 1); // 줄임표(…) 자리 한 글자
  for (const re of [/[,;:，、]/, /\s/]) {
    for (let i = room.length - 1; i >= MIN; i -= 1) if (re.test(room[i])) return `${room.slice(0, i).replace(/[\s,;:，、]+$/, '')}…`;
  }
  return `${room}…`;
}
function extractStrengths(text) {
  const out = [];
  let sec = null;
  const close = () => { if (sec) out.push(...(sec.items.length ? sec.items : sec.prose)); sec = null; };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) { if (sec && sec.prose.length) sec.proseDone = true; continue; }
    const d = t.replace(/^(?:>\s*)+/, '').replace(/^#{1,6}\s*/, '').replace(/^(?:\*\*|__)\s*/, ''); // 줄 앞의 >, #, 굵게 표시는 먼저 떼고 번호·글머리표를 봐요
    const bullet = LIST_BULLET.exec(d);
    const num = bullet ? null : LIST_NUM.exec(d);
    const marker = bullet || num;
    const bare = stripMd(marker ? d.slice(marker[0].length) : d);
    if (GOOD_HEAD.test(bare)) {
      close();
      sec = { items: [], prose: [], proseDone: false };
      const rest = bare.replace(GOOD_REST, '').trim();
      if (rest) sec.items.push(rest);
      continue;
    }
    if (!sec) continue;
    const boldOnly = !bullet && /^(?:\d{1,2}[.)]\s*)?(\*\*|__)(?:(?!\1).)+\1\s*[:：]?$/.test(t);
    const boundary = /^#{1,6}\s/.test(t) || boldOnly || (!bullet && SECTION_LABEL.test(bare)) || (!marker && (/[:：]$/.test(bare) || (AREA_HEAD.test(bare) && bare.length <= 20 && !/[.!?。요다]$/.test(bare))));
    if (boundary) { close(); continue; }
    if (marker) { if (bare) sec.items.push(bare); continue; }
    if (/^\s{2,}/.test(raw) && sec.items.length) continue; // 목록 줄 아래에 들여 써 이어 붙인 설명
    if (sec.items.length) { close(); continue; }           // 목록이 끝나고 나온 일반 글
    if (!sec.proseDone) sec.prose.push(bare); else close(); // 제목 바로 아래 첫 문단 (목록이 없을 때만 써요)
  }
  close();
  const seen = new Set();
  return out.map((x) => shortenLine(x)).filter((x) => x && !seen.has(x) && seen.add(x)).slice(0, STRENGTH_CAP);
}
/* ---- 받은 답변에서 "도장 문구:" 줄 찾기 ----
   답변 맨 끝의 "도장 문구:" 제목 아래 줄들(번호 · 글머리표 · 따옴표는 떼요)을 읽어서, 💮 도장 칭찬으로 써요(설정 값 stampLines).
   숫자 · 비교 · 할 일 · 재촉하는 말이 들어 있는 줄은 빼요(praiseOk). 이 부분은 받은 피드백 카드에서는 보이지 않아요(답변 글 자체는 그대로 저장돼요). */
const STAMP_HEAD = /^[^\p{L}\p{N}]*도장\s*문구(?=$|[\s:：\-–—·(（])/u;
const STAMP_HEAD_REST = /^[^\p{L}\p{N}]*도장\s*문구\s*(?:[(（][^)）]*[)）])?\s*[:：\-–—·]?\s*/u;
const STAMP_MAX = 10;
// { from, to, items }: "도장 문구" 제목 줄(from)부터 마지막 문구 줄(to)까지 (없으면 null). 제목이 여러 번 나오면 마지막 것을 읽어요
function findStampSection(text) {
  const rows = String(text || '').split(/\r?\n/);
  let from = -1;
  rows.forEach((raw, i) => {
    const t = raw.trim().replace(/^(?:>\s*)+/, '').replace(/^#{1,6}\s*/, '');
    const marker = LIST_BULLET.exec(t) || LIST_NUM.exec(t);
    if (STAMP_HEAD.test(stripMd(marker ? t.slice(marker[0].length) : t))) from = i;
  });
  if (from < 0) return null;
  const clean = (x) => stripMd(x).replace(/^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/g, '').trim();
  const items = [];
  const head = stripMd(rows[from].trim().replace(/^(?:>\s*)+/, '').replace(/^#{1,6}\s*/, ''));
  const rest = head.replace(STAMP_HEAD_REST, '').trim();
  if (rest) rest.split(/\s+\/\s+/).forEach((x) => { const c = clean(x); if (c) items.push(c); });
  let to = from;
  for (let i = from + 1; i < rows.length; i += 1) {
    const t = rows[i].trim();
    if (!t) { if (items.length) break; continue; }
    if (/^```/.test(t)) { if (items.length) break; to = i; continue; }
    if (/^#{1,6}\s/.test(t)) break;
    const d = t.replace(/^(?:>\s*)+/, '');
    const marker = LIST_BULLET.exec(d) || LIST_NUM.exec(d);
    const line = clean(marker ? d.slice(marker[0].length) : d);
    if (!line) continue;
    items.push(line); to = i;
  }
  return { from, to, items };
}
function extractStampLines(text) {
  const sec = findStampSection(text);
  if (!sec) return [];
  const seen = new Set();
  return sec.items.filter((x) => praiseOk(x) && !seen.has(x) && seen.add(x)).slice(0, STAMP_MAX);
}
// 받은 피드백 카드에서는 "도장 문구" 부분을 빼고 보여줘요
function stripStampSection(text) {
  const sec = findStampSection(text);
  if (!sec) return String(text || '');
  const rows = String(text).split(/\r?\n/);
  rows.splice(sec.from, sec.to - sec.from + 1);
  return rows.join('\n').replace(/```[a-zA-Z]*[ \t]*\n\s*```/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ② 의 체크 목록: 기본은 모두 체크. 이미 풀어 둔 줄은 다시 붙여 넣어도 풀린 채로 둬요.
function renderStrengths(box, lines) {
  const wrap = box && box.querySelector('#fbStrengths');
  if (!wrap) return;
  if (!lines.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
  const off = new Set([...wrap.querySelectorAll('[data-str]')].filter((i) => !i.checked).map((i) => i.value));
  wrap.innerHTML = `<div class="fb-str-h">💬 잘한 점으로 담을 줄 <span class="meta">(빼고 싶은 줄은 체크를 풀어 주세요)</span></div>${lines.map((l) => `<label class="fb-str"><input type="checkbox" data-str value="${esc(l)}"${off.has(l) ? '' : ' checked'}> <span>${esc(l)}</span></label>`).join('')}`;
  wrap.hidden = false;
}
const checkedStrengths = (box) => [...box.querySelectorAll('#fbStrengths [data-str]:checked')].map((i) => i.value);

/* ---- 📅 캘린더 › 🤖 클로드 피드백 (① 보내기 · ② 받은 답변 저장 · ③ 받은 피드백) ---- */
function claudeCurrent() {
  const [start, end] = claudeRange(ui.claudePeriod);
  const scope = ui.claudeScope;
  const question = ui.claudeQuestion[scope] || '';
  const groups = claudeGroups(start, end, scope === 'all' ? null : scope);
  const count = groups.reduce((n, g) => n + claudeCount(g), 0);
  let text = '';
  if (count) text = scope === 'all' ? claudeTextAll({ period: ui.claudePeriod, groups, question, start, end }) : claudeText({ scope, period: ui.claudePeriod, list: groups[0].list, terms: groups[0].terms, question, start, end });
  return { scope, period: ui.claudePeriod, start, end, groups, count, question, text, list: groups.flatMap((g) => g.list) };
}
// 🌈 전체일 때 미리보기 위의 한 줄: "🎻 📚 기록을 보내요" (기록이 없는 영역은 빼요)
const claudeCountLine = (cur) => (cur.scope === 'all' && cur.count ? `${cur.groups.map((g) => scopeMeta(g.scope).icon).join(' ')} 기록을 보내요` : '');

// ② 에서 저장할 범위·기간: 카드에서 보낸 것이면 그 기록, 방금 복사한 것이 있으면 그 범위·기간, 없으면 ① 에서 고른 것 (범위만 작은 칩으로 바꿀 수 있어요)
function fbSaveTarget() {
  const p = ui.claudePending;
  if (p && p.targetId) return { ...p };
  const scope = ui.fbSaveScope || (p && p.scope) || ui.claudeScope;
  if (p) return { ...p, scope, question: scope === p.scope ? p.question : '' };
  const [rangeStart, rangeEnd] = claudeRange(ui.claudePeriod);
  return { scope, period: ui.claudePeriod, rangeStart, rangeEnd, question: ui.claudeQuestion[scope] || '', targetId: '' };
}
function fbSaveNote(t) {
  if (t.targetId) {
    const r = records.find((x) => x.id === t.targetId);
    return r ? `📎 이 기록에서 보낸 답변이에요: ${dayLabel(r.date)} · ${calTitle(r)}` : '';
  }
  return `기간: ${periodText(t.period, t.rangeStart, t.rangeEnd)}`;
}
function fbSaveChipsHTML(t) {
  if (t.targetId) return `<span class="chip small active">${scopeMeta(t.scope).icon} ${esc(scopeMeta(t.scope).label)}</span>`; // 카드에서 보낸 것은 범위가 정해져 있어요
  return COPY_SCOPES.map((id) => `<button type="button" class="chip small ${t.scope === id ? 'active' : ''}" data-act="fbSaveScope" data-id="${id}" aria-pressed="${t.scope === id}">${scopeMeta(id).icon} ${esc(scopeMeta(id).label)}</button>`).join('');
}
function syncFbSave() {
  const t = fbSaveTarget();
  const chips = $('#fbSaveScopes'); if (chips) chips.innerHTML = fbSaveChipsHTML(t);
  const ctx = $('#fbCtx'); if (ctx) ctx.textContent = fbSaveNote(t);
}

function fbSaveHTML() {
  const t = fbSaveTarget();
  return `<details class="fb-fold" id="mainFb"${ui.fbOpen ? ' open' : ''}>
    <summary>💬 받은 피드백 붙여넣기</summary>
    <div class="fb-input" id="fbInput">
      <div class="cl-row"><span class="chip-label">범위</span><div class="chips" id="fbSaveScopes" style="margin:0">${fbSaveChipsHTML(t)}</div></div>
      <p class="meta fb-ctx" id="fbCtx">${esc(fbSaveNote(t))}</p>
      <textarea class="fb-text-in" data-fb="text" rows="6" aria-label="클로드의 답변" placeholder="클로드의 답변을 여기에 붙여 넣어요"></textarea>
      <div class="fb-strengths" id="fbStrengths" hidden></div>
      <div class="row" style="margin-top:10px"><button type="button" class="btn purple" data-act="fbSave">저장</button></div>
    </div>
  </details>`;
}

function claudeBoxHTML() {
  const cur = claudeCurrent();
  return `<details class="card claude-fold" id="claudeFold"${settings.claudeBoxOpen ? ' open' : ''}>
    <summary>🤖 클로드 피드백</summary>
    <div class="claude-box" id="claudeBox">
    <div class="cl-row"><span class="chip-label">기간</span><div class="chips" style="margin:0">${PERIODS.map((p) => `<button type="button" class="chip ${ui.claudePeriod === p.id ? 'active' : ''}" data-act="claudePeriod" data-id="${p.id}" aria-pressed="${ui.claudePeriod === p.id}">${p.label}</button>`).join('')}</div></div>
    <div class="cl-row"><span class="chip-label">범위</span><div class="chips" style="margin:0">${COPY_SCOPES.map((id) => `<button type="button" class="chip ${ui.claudeScope === id ? 'active' : ''}" data-act="claudeScope" data-id="${id}" aria-pressed="${ui.claudeScope === id}">${scopeMeta(id).icon} ${esc(scopeMeta(id).label)}</button>`).join('')}</div></div>
    <label class="rt-h" for="claudeQ" style="margin-top:12px">이번에 특히 물어볼 것 <span class="meta">(선택, 한 줄)</span></label>
    <input id="claudeQ" class="rt-note-in" type="text" maxlength="200" autocomplete="off" value="${esc(cur.question)}" placeholder="예: 3포지션에서 음정이 자꾸 높아지는 이유">
    <p class="meta cl-count" id="claudeCount"${claudeCountLine(cur) ? '' : ' hidden'}>${esc(claudeCountLine(cur))}</p>
    <textarea id="claudePreview" class="copy-text" spellcheck="false" aria-label="복사할 글 미리보기">${esc(cur.count ? cur.text : '이 기간엔 기록이 없어요')}</textarea>
    <div class="row" style="margin-top:8px">
      <button type="button" class="btn purple" id="claudeCopyBtn" data-act="claudeCopy" ${cur.count ? '' : 'disabled'}>📋 복사하기</button>
      <button type="button" class="btn ghost" data-act="claudeSettings">✎ 내 정보·요청 문구</button>
    </div>
    ${fbSaveHTML()}
    <section class="fb-list" id="fbList">${fbListInner()}</section>
    </div>
  </details>`;
}

// 펼치거나 접으면 이 기기에 기억해요 (🤖 카드는 다른 기기와 맞추지 않아요)
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d) return;
  if (d.id === 'mainFb') { ui.fbOpen = d.open; return; }
  if (d.id !== 'claudeFold' || d.open === settings.claudeBoxOpen) return;
  settings.claudeBoxOpen = d.open;
  saveSettings();
}, true);

// 기간·범위·물어볼 것이 바뀌면 미리보기만 새로 만들어요 (아래에 붙여 넣던 답변은 그대로)
function syncClaudeBox() {
  const box = $('#claudeBox');
  if (!box) return;
  const cur = claudeCurrent();
  box.querySelectorAll('[data-act=claudePeriod]').forEach((b) => { const on = b.dataset.id === ui.claudePeriod; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  box.querySelectorAll('[data-act=claudeScope]').forEach((b) => { const on = b.dataset.id === ui.claudeScope; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  const q = $('#claudeQ');
  if (q && document.activeElement !== q) q.value = cur.question;
  const line = claudeCountLine(cur);
  const c = $('#claudeCount'); if (c) { c.textContent = line; c.hidden = !line; }
  $('#claudePreview').value = cur.count ? cur.text : '이 기간엔 기록이 없어요';
  $('#claudeCopyBtn').disabled = !cur.count;
  syncFbSave();
}

// ① 복사하기: 글을 복사하고, 받은 답변을 저장하는 ② 가 이 범위·기간으로 저절로 펼쳐져요
async function claudeCopy() {
  const cur = claudeCurrent();
  if (!cur.count) return;
  const text = $('#claudePreview').value;
  const hasArt = cur.groups.some((g) => g.scope === 'drawing');
  const ok = await copyText(text, hasArt ? '복사했어요. 그림 이미지는 직접 첨부해 주세요.' : '복사했어요');
  ui.claudePending = { scope: cur.scope, period: cur.period, rangeStart: cur.start, rangeEnd: cur.end, question: cur.question, targetId: '' };
  ui.fbSaveScope = null;
  ui.fbOpen = true;
  const fold = $('#mainFb');
  if (fold) { fold.open = true; syncFbSave(); if (ok) { const ta = fold.querySelector('[data-fb=text]'); if (ta) ta.focus(); } }
}

// ② 저장: 카드에서 보낸 것이면 그 기록에 연결돼요 (기간 '카드'). 체크한 "잘한 점" 줄이 함께 저장돼요.
async function fbSave() {
  const box = $('#fbInput');
  if (!box) return;
  const t = fbSaveTarget();
  if (t.targetId && !records.some((x) => x.id === t.targetId)) { t.targetId = ''; t.period = 'day'; } // 그 사이 지운 기록이면 연결 없이
  const answerText = box.querySelector('[data-fb=text]').value;
  const rec = await saveFeedback({ scope: t.scope, period: t.period, rangeStart: t.rangeStart, rangeEnd: t.rangeEnd, targetId: t.targetId, question: t.question, text: answerText, strengths: checkedStrengths(box) });
  if (!rec) return;
  const stampNew = extractStampLines(answerText); // 답변 끝의 "도장 문구:" 줄들은 💮 칭찬으로 따로 저장해요 (새로 받으면 바꿔 끼워요)
  if (stampNew.length) await setConfig('stampLines', { lines: stampNew, savedAt: Date.now(), scope: t.scope });
  ui.claudeQuestion[t.scope] = ''; // 물어볼 것은 저장하면 비워져요
  ui.claudePending = null; ui.fbSaveScope = null; ui.fbOpen = false;
  ui.fbScope = 'all'; ui.fbCount = Math.max(5, ui.fbCount); // 방금 저장한 것이 맨 위에 보이게
  refreshFeedbackViews();
}

// 캘린더의 🤖 클로드 피드백 카드를 펼치고 그 자리로 가요
function openClaudeCard() {
  closeDlg();
  hideToast();
  ui.tab = 'cal'; ui.query = '';
  if (!settings.claudeBoxOpen) { settings.claudeBoxOpen = true; saveSettings(); }
  render();
}
// 카드의 💬 N: 캘린더 ③ 에서 그 기록에 연결된 피드백으로 가요
function goToFeedbackOf(id) {
  const list = feedbacksOf(id);
  if (!list.length) return;
  ui.fbScope = 'all';
  const order = ofType('claudeFeedback').sort(byCreatedDesc);
  const last = Math.max(...list.map((f) => order.findIndex((x) => x.id === f.id)));
  ui.fbCount = Math.max(5, Math.ceil((last + 1) / 5) * 5); // 맨 아래 연결된 피드백까지 보이게
  openClaudeCard();
  setTimeout(() => {
    const els = list.map((f) => document.querySelector(`#fbList [data-rid="${CSS.escape(f.id)}"]`)).filter(Boolean);
    if (!els.length) return;
    els[0].scrollIntoView({ block: 'center' });
    els.forEach((el) => { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2000); });
  }, 60);
}

/* ---- ✎ 내 정보·요청 문구 창 ---- */
let clDraft = {};
function openClaudeSettings(scope) {
  scope = scope || ui.claudeScope;
  const meta = scopeMeta(scope);
  const d = clDraft[scope] || { info: claudeInfo(scope), request: claudeRequest(scope) };
  clDraft[scope] = d;
  openDlg(`<h2>✎ 내 정보·요청 문구</h2>
    <p class="meta" style="margin-top:0">한 번 써 두면 복사할 때 글 맨 위에 자동으로 붙어요.</p>
    <div class="chips" id="clScopes">${CLAUDE_SCOPES.map((x) => `<button type="button" class="chip ${x.id === scope ? 'active' : ''}" data-act="clScope" data-id="${x.id}" aria-pressed="${x.id === scope}">${x.icon} ${esc(x.label)}</button>`).join('')}</div>
    <form id="clForm" data-scope="${scope}" novalidate>
      <div class="field"><label for="clInfo">내 정보 <span class="meta">(${esc(meta.label)})</span></label><textarea id="clInfo" name="info" rows="5">${esc(d.info)}</textarea>
        <button type="button" class="btn ghost small" data-act="clReset" data-field="info" style="margin-top:6px">기본값으로 되돌리기</button></div>
      <div class="field"><label for="clReq">요청 문구 <span class="meta">(${esc(meta.label)})</span></label><textarea id="clReq" name="request" rows="4">${esc(d.request)}</textarea>
        <button type="button" class="btn ghost small" data-act="clReset" data-field="request" style="margin-top:6px">기본값으로 되돌리기</button></div>
      <p class="hint">모든 요청 문구 끝에 자동으로 붙는 <b>공통 답변 형식</b> (app.js 맨 위 <b>CLAUDE_COMMON</b>에서 바꿔요):</p>
      <p class="hint pre claude-common">${esc(CLAUDE_COMMON)}</p>
      <p class="hint pre claude-common">${esc(CLAUDE_STAMP_ASK)}</p>
      <p class="hint">고치지 않은 문구는 새 기본값을 따라가고, 내가 고친 문구는 그대로 남아요.</p>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-act="clCancel">닫기</button><button type="submit" class="btn">저장</button></div>
    </form>`, 'roomy');
}
async function saveClaudeSettings() {
  const cur = { ...claudeStored() };
  const form = $('#clForm');
  if (form) clDraft[form.dataset.scope] = { info: form.elements.info.value, request: form.elements.request.value };
  Object.entries(clDraft).forEach(([sc, v]) => {
    const meta = scopeMeta(sc);
    const entry = {};
    if (v.info !== meta.info) entry.info = v.info; // 기본값과 같으면 저장하지 않아요 (나중에 기본값이 바뀌어도 따라가요)
    if (v.request !== meta.request) entry.request = v.request;
    if (Object.keys(entry).length) cur[sc] = entry; else delete cur[sc];
  });
  await setConfig('claudeSettings', cur);
  clDraft = {};
  closeDlg();
  syncClaudeBox();
  toast('내 정보·요청 문구를 저장했어요.', 2500);
}

/* ---------------------------------------------------------------------
   11. 입력 창 (추가/수정)
   --------------------------------------------------------------------- */
function openDlg(html, size) {
  revokeAudioUrls(dlg); // 창 안에서 듣던 녹음은 멈추고 정리해요
  dlg.className = size === 'roomy' ? 'roomy' : size ? 'wide' : '';
  dlg.innerHTML = `<div class="dlg-body">${html}</div>`;
  if (!dlg.open) dlg.showModal();
  hydrateAudio(dlg);
  renderStaged();
  syncPlayButtons();
}
function closeDlg() { if (dlg2.open) dlg2.close(); if (dlg.open) dlg.close(); }

let formImages = {}; // 입력 창에서 선택한 이미지들 (칸 이름 → 데이터 주소). 그림 기록은 '내 그림'과 '원본 이미지' 두 칸이에요
let formShots = []; // 입력 창에서 고른 그림 사진들
let formBase = '';  // 입력 창을 열었을 때의 내용 (Esc로 닫을 때 뭔가 적었는지 비교해요)

// 지금 열려 있는 입력 창(기록)의 내용을 글자 하나로 만들어 둬요
function formSnapshot() {
  const f = dlg.open ? dlg.querySelector('#recForm') : null;
  if (!f) return '';
  return `${JSON.stringify([...new FormData(f)].map(([k, v]) => [k, typeof v === 'string' ? v : '']))}|${Object.values(formImages).map((v) => (v || '').length).join(',')}|${formShots.length}|${staged.length}`;
}
const isFormDirty = () => { const now = formSnapshot(); return now !== '' && now !== formBase; };

// 🎻 교재 칸: 교재 칩(여러 개, ⚙︎ 교재 관리) + 켠 교재마다 "교재 이름 + 한 줄 칸" (끄면 칸이 사라져요. 쓰던 글은 이 창 안에서는 기억해 둬요)
//   곡 줄(교재마다 한 줄 + 그 밖에 연습한 곡) 아래에는 템포(숫자, 선택)와 "🎙 녹음 붙이기"가 있어요. 곡 이름을 적기 전에는 흐리게 보여요.
//   줄 이름표(line): 교재 줄은 'b:교재 이름', "그 밖에 연습한 곡"은 'o'
let bookDraft = {};
let tempoDraft = {}; // 줄 이름표 → 쓰던 템포 (이 창 안에서만)
function lineAuxHTML(line, piece) {
  return `<div class="line-aux${pieceKey(piece) ? '' : ' dim'}" data-line="${esc(line)}">
      <label class="tempo-lab"><span>템포</span><input type="number" class="tempo-in" name="lineTempo" data-tempo="${esc(line)}" min="1" step="1" inputmode="numeric" placeholder="60" value="${esc(tempoDraft[line] || '')}"></label>
      <button type="button" class="btn ghost small rec-attach" data-act="lineAttach" data-line="${esc(line)}">🎙 녹음 붙이기</button>
      <input type="file" class="sr-only" accept="${AUDIO_ACCEPT}" multiple data-line-input="${esc(line)}" tabindex="-1" aria-label="녹음 파일 고르기">
      <span class="line-recs" data-line-recs="${esc(line)}">${lineRecsHTML(line)}</span>
      <div class="hint line-note" data-line-note="${esc(line)}" role="status"></div>
    </div>`;
}
function bookRowsHTML(names, pieces) {
  return names.map((n, i) => `<div class="book-row" data-book="${esc(n)}" data-line-zone="b:${esc(n)}"><label class="book-name" for="bp_${i}">${esc(n)}</label>
    <input id="bp_${i}" name="bookPiece" type="text" class="book-piece" data-book-piece="${esc(n)}" list="dl_book_${i}" autocomplete="off" maxlength="120" value="${esc(pieces[n] || '')}" placeholder="곡 이름이나 번호 (선택)">
    <datalist id="dl_book_${i}">${bookPieceSuggestions(n).map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
    ${lineAuxHTML(`b:${n}`, pieces[n])}</div>`).join('');
}
function bookFieldHTML(f, value) {
  const rows = bookRows({ books: value });
  const order = [...textbookChoices(), ...rows.map((b) => b.name)];
  const names = [...new Set(order)].filter((n) => rows.some((b) => b.name === n)); // 칩 순서대로
  bookDraft = Object.fromEntries(rows.map((b) => [b.name, b.piece]));
  rows.forEach((b) => { if (b.tempo) tempoDraft[`b:${b.name}`] = String(b.tempo); });
  return `<div class="field" data-only="${esc(f.only || '')}" data-key="${esc(f.key)}"><label>${esc(f.label)}</label>
    ${choiceHTML('books', textbookChoices(), names, true, MANAGE_BOOKS_BTN)}
    <div class="book-rows" id="bookRows">${bookRowsHTML(names, bookDraft)}</div></div>`;
}
const selectedBookNames = () => { const i = dlg.querySelector('input[name=books]'); try { const a = JSON.parse(i ? i.value || '[]' : '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const readBookDraft = () => dlg.querySelectorAll('#bookRows [data-book-piece]').forEach((i) => { bookDraft[i.dataset.bookPiece] = i.value; tempoDraft[`b:${i.dataset.bookPiece}`] = (i.closest('.book-row').querySelector('[data-tempo]') || { value: '' }).value; });
// 교재 칩을 켜고 끌 때: 켠 교재의 칸만 칩 순서대로 다시 그려요
function syncBookRows() {
  const box = dlg.querySelector('#bookRows');
  if (!box) return;
  readBookDraft();
  box.innerHTML = bookRowsHTML(selectedBookNames(), bookDraft);
  renderAllLineRecs();
}

/* ---- 곡 줄의 🎙 녹음 붙이기 (입력 창 안) ---- */
// 지금 고치는 기록의 그 줄에 이미 붙어 있는 녹음 (새 기록이면 없어요)
function savedLineAudios(line) {
  const form = dlg.querySelector('#recForm');
  const old = form && form.dataset.id ? records.find((r) => r.id === form.dataset.id) : null;
  if (!old) return [];
  const conv = violinCopy(old);
  const l = lineRows(conv).find((x) => x.line === line);
  return l ? lineAudios(conv, l) : [];
}
// "🎙 1개 · ▶ · 빼기": 저장 전에 고른 녹음은 [▶ 빼기], 이미 붙은 녹음은 [▶ 삭제]
function lineRecsHTML(line) {
  const saved = savedLineAudios(line);
  const mine = staged.filter((s) => s.line === line);
  const n = saved.length + mine.length;
  if (!n) return '';
  const play = (attrs, label) => `<button type="button" class="rec-play" ${attrs} aria-label="${label} 듣기" aria-pressed="false">▶</button>`;
  const items = [
    ...saved.map((a) => `<span class="line-rec">${play(`data-act="playRec" data-aid="${esc(a.id)}"`, '붙인 녹음')} <button type="button" class="link-btn" data-act="delAudio" data-aid="${esc(a.id)}">삭제</button></span>`),
    ...mine.map((s) => `<span class="line-rec">${play(`data-act="playStaged" data-sid="${esc(s.sid)}"`, esc(s.name))} <button type="button" class="link-btn" data-act="unstage" data-sid="${esc(s.sid)}">빼기</button></span>`),
  ];
  return `🎙 ${n}개 · ${items.join(' · ')}`;
}
function renderLineRecs(line) {
  const box = [...dlg.querySelectorAll('[data-line-recs]')].find((e) => e.dataset.lineRecs === line);
  if (box) { box.innerHTML = lineRecsHTML(line); syncPlayButtons(); }
}
function renderAllLineRecs() { dlg.querySelectorAll('[data-line-recs]').forEach((e) => renderLineRecs(e.dataset.lineRecs)); }
// 줄의 곡 칸 (교재 줄은 교재 이름 칸, 그 밖에 줄은 "그 밖에 연습한 곡" 칸)
const linePieceInput = (line) => (line === 'o' ? dlg.querySelector('#f_piece') : [...dlg.querySelectorAll('#bookRows [data-book-piece]')].find((i) => `b:${i.dataset.bookPiece}` === line));
function syncLineDim() {
  dlg.querySelectorAll('.line-aux[data-line]').forEach((a) => { const i = linePieceInput(a.dataset.line); a.classList.toggle('dim', !(i && i.value.trim())); });
}
const sayLine = (line, text) => { const n = [...dlg.querySelectorAll('[data-line-note]')].find((e) => e.dataset.lineNote === line); if (n) n.textContent = text; };
// 줄의 🎙 버튼·끌어다 놓기: 곡 이름이 비어 있으면 곡 이름부터 적게 해요
function needPieceFirst(line) {
  const i = linePieceInput(line);
  if (i && i.value.trim()) return false;
  sayLine(line, '곡 이름부터 적어 주세요. 그러면 녹음을 붙일 수 있어요.');
  if (i) i.focus();
  return true;
}
async function stageLineFiles(line, files) {
  const good = files.filter(isAudioFile);
  const notAudio = files.length - good.length;
  if (!good.length) { sayLine(line, '녹음 파일(m4a, mp3, wav, aac 등)만 올릴 수 있어요.'); return; }
  let tooBig = 0;
  let over = 0;
  let room = AUDIO_MAX_PER_PIECE - staged.filter((s) => s.line === line).length;
  for (const f of good) {
    if (f.size > AUDIO_MAX_BYTES) { tooBig += 1; continue; }
    const dur = await probeDuration(f);
    if (dur > AUDIO_MAX_SECONDS + 0.5) { tooBig += 1; continue; }
    if (room <= 0) { over += 1; continue; }
    staged.push({ sid: newId(), file: f, name: f.name || '녹음', date: '', memo: '', line }); // 날짜는 저장할 때 그 기록의 날짜로, 곡 이름은 그 줄의 곡으로 붙어요
    room -= 1;
  }
  sayLine(line, [tooBig ? TOO_LONG_MSG : '', notAudio ? `녹음 파일이 아닌 ${notAudio}개는 뺐어요.` : '', over ? `한 번에 ${AUDIO_MAX_PER_PIECE}개까지 고를 수 있어서 ${over}개는 뺐어요.` : ''].filter(Boolean).join(' '));
  renderLineRecs(line);
}
// 저장 전에 고른 녹음 듣기 (한 번에 하나만)
const stagedPlayer = { el: null, sid: null, url: '' };
function stopStagedPlayer() {
  if (stagedPlayer.el) { try { stagedPlayer.el.pause(); } catch (e) { /* 괜찮아요 */ } }
  if (stagedPlayer.url) URL.revokeObjectURL(stagedPlayer.url);
  stagedPlayer.el = null; stagedPlayer.sid = null; stagedPlayer.url = '';
}
async function toggleStagedPlay(sid) {
  const s = staged.find((x) => x.sid === sid);
  if (!s) return;
  if (stagedPlayer.sid === sid && stagedPlayer.el && !stagedPlayer.el.paused) { stagedPlayer.el.pause(); syncPlayButtons(); return; }
  stopStagedPlayer();
  const el = new Audio();
  stagedPlayer.el = el; stagedPlayer.sid = sid; stagedPlayer.url = URL.createObjectURL(s.file);
  ['play', 'pause', 'ended'].forEach((ev) => el.addEventListener(ev, syncPlayButtons));
  el.addEventListener('play', () => playExclusive(el));
  el.src = stagedPlayer.url;
  try { await el.play(); } catch (e) { toast('재생하지 못했어요. 이 브라우저에서 열 수 없는 형식일 수 있어요.'); }
  syncPlayButtons();
}

function fieldHTML(f, value, type) {
  const id = `f_${f.key}`;
  if (f.type === 'bookLines') return bookFieldHTML(f, value);
  if (f.type === 'multi') { // 한 칸 제목 아래 입력 칸 여러 개 (영어 요약 3줄)
    const vals = value || {};
    return `<div class="field" data-only="${esc(f.only || '')}" data-key="${esc(f.key)}"><label>${esc(f.label)}</label>${f.keys.map((k, i) => `<input id="f_${k}" name="${k}" type="text" class="multi-in" value="${esc(vals[k] || '')}" placeholder="${esc((f.placeholders || [])[i] || '')}" autocomplete="off">`).join('')}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
  }
  const req = f.required ? ' <span class="req">*</span>' : '';
  const v = f.flat && typeof value === 'string' ? oneLine(value) : (value ?? ''); // flat: 한 줄짜리 칸 (예전에 줄바꿈이 들어 있으면 " / "로 이어서 보여줘요)
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  const rows = f.rows ? ` rows="${f.rows}"` : '';
  let input;
  if (f.type === 'textarea') {
    input = `<textarea id="${id}" name="${f.key}"${rows}${ph}>${esc(v)}</textarea>`;
  } else if (f.type === 'select') {
    const opts = (f.options || []).map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('');
    input = `<select id="${id}" name="${f.key}">${f.required ? '' : '<option value="">(선택 안 함)</option>'}${opts}</select>`;
  } else if (f.type === 'choice' || f.type === 'chips') { // 버튼 칸 (연습량·종류·교재 칩)
    input = choiceHTML(f.key, choicesOf(f), value, f.type === 'chips', f.manage === 'books' ? MANAGE_BOOKS_BTN : '');
  } else if (f.type === 'images') { // 여러 장 (그림 사진)
    input = `<input id="${id}" type="file" accept="image/*" multiple class="sr-only" data-shots>
      <label class="dropzone" id="dropZone" data-multi="1" for="${id}"><span>🖼 여기에 ${esc(withJosa(f.noun || '사진', '을/를'))} 끌어다 놓거나, 눌러서 고르세요</span>
        <small>컴퓨터에서는 Ctrl+V(붙여넣기)도 돼요 · 최대 ${f.max || ART_MAX_PHOTOS}장 · 휴대폰은 앨범에서 고를 수 있어요</small></label>
      <div class="hint" id="imgNote"></div>
      <div id="imgPreviewBox"></div>`;
  } else if (f.type === 'image') {
    input = `<input id="${id}" type="file" accept="image/*" class="sr-only" data-image-input="${esc(f.key)}">
      <label class="dropzone" data-key="${esc(f.key)}" for="${id}"><span>🖼 여기에 ${esc(f.noun || '그림')}을 끌어다 놓거나, 눌러서 고르세요</span>
        <small>${f.optional ? '선택이에요 · ' : ''}컴퓨터에서는 ${f.optional ? '끌어다 놓기' : 'Ctrl+V(붙여넣기)'}도 돼요 · 휴대폰은 카메라나 앨범에서 고를 수 있어요</small></label>
      <div class="hint" id="imgNote_${esc(f.key)}"></div>
      <div class="img-preview" id="imgPreview_${esc(f.key)}"></div>`;
  } else {
    const extra = f.type === 'number' ? ` min="${f.min ?? ''}" step="${f.step ?? 1}" inputmode="decimal"` : '';
    const sugg = f.suggest ? ` list="dl_${type}_${f.key}" autocomplete="off"` : '';
    input = `<input id="${id}" name="${f.key}" type="${f.type}" value="${esc(v)}"${extra}${sugg}${ph}>`;
    if (f.aux === 'other') input += lineAuxHTML('o', value); // "그 밖에 연습한 곡" 줄 아래의 템포 · 🎙 녹음 붙이기
  }
  const labelFor = f.type === 'choice' || f.type === 'chips' ? '' : ` for="${id}"`;
  return `<div class="field${f.small ? ' field-small' : ''}" data-only="${esc(f.only || '')}" data-key="${esc(f.key)}"${f.aux === 'other' ? ' data-line-zone="o"' : ''}><label${labelFor}>${esc(f.label)}${req}</label>${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
}

// 새벽 DAY_STARTS_AT시 전에 입력 창을 열었을 때만, 날짜 칸 아래에 어느 날 기록으로 남는지 작게 알려줘요. (날짜를 바꾸면 사라져요)
function addDawnNote(dateInput) {
  const t = todayStr();
  if (!dateInput || new Date().getHours() >= DAY_STARTS_AT || dateInput.value !== t) return;
  const note = document.createElement('div');
  note.className = 'dawn-note';
  note.dataset.date = t;
  note.textContent = `🌙 새벽 ${DAY_STARTS_AT}시 전이라 어제(${shortDay(t)}) 기록으로 남겨요`;
  dateInput.after(note);
}

// 종류(연습/레슨)에 맞지 않는 칸은 숨겨요.
function syncKindFields(form) {
  const schema = SCHEMAS[form.dataset.type];
  if (!schema.kindKey) return;
  const kind = form.elements[schema.kindKey].value;
  form.querySelectorAll('.field[data-only]').forEach((el) => { el.hidden = !!el.dataset.only && el.dataset.only !== kind; });
  schema.fields.filter((f) => f.placeholderByKind).forEach((f) => { // 종류마다 다른 회색 예시 문장
    const input = form.elements[f.key];
    if (input) input.placeholder = f.placeholderByKind[kind] || f.placeholder || '';
  });
}

// 여러 장(그림 사진): 작은 그림들과 '빼기' 버튼
function updateShotsPreview() {
  const box = $('#imgPreviewBox');
  if (!box) return;
  const n = formShots.length;
  box.innerHTML = n
    ? `<div class="shot-row">${formShots.map((src, i) => `<div class="shot"><img class="shot-img" src="${esc(src)}" alt="고른 사진 ${i + 1}">
        <div class="shot-btns">${n > 1 ? `<button type="button" class="btn ghost small" data-act="moveShot" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="앞으로">◀</button><button type="button" class="btn ghost small" data-act="moveShot" data-i="${i}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="뒤로">▶</button>` : ''}<button type="button" class="btn ghost small" data-act="removeShot" data-i="${i}">빼기</button></div></div>`).join('')}</div>`
    : '';
}
// 한 장짜리 그림 칸 하나의 미리보기
function updateImagePreview(key) {
  const box = $(`#imgPreview_${key}`);
  if (!box) return;
  const src = formImages[key];
  box.innerHTML = src
    ? `<img class="preview" src="${esc(src)}" alt="선택한 그림"><button type="button" class="btn ghost small" data-act="clearImage" data-key="${esc(key)}" style="margin-top:6px">이미지 빼기</button>`
    : '';
}

// 저장하고 나면: 캘린더의 '날짜 창'에서 온 거라면 그 창으로 돌아가고, 아니면 창을 닫아요
function afterSave() {
  const back = ui.backToDay;
  const backArt = ui.backToArt;
  render();
  if (back) openDay(back); else if (backArt && records.some((r) => r.id === backArt)) openArt(backArt, ui.artPhoto); else closeDlg();
}

function openForm(type, existing, presetDate, preset) {
  const schema = SCHEMAS[type];
  ui.backToDay = dlg.open && dlg.querySelector('.day-list') ? ui.dayOpen : null;
  ui.backToArt = dlg.open && dlg.querySelector('.art-detail') ? ui.artOpen : null; // 그림 상세 창에서 "수정"을 눌렀다면 저장·취소 뒤 그 창으로 돌아가요
  const rec = existing ? { ...(type === 'workout' ? workoutLiteCopy(existing) : type === 'violin' ? violinCopy(existing) : existing) } : { date: presetDate || todayStr(), ...(preset || {}) }; // 아직 정리하지 않은 예전 운동 기록은 "한 줄"로 옮겨 담은 모습으로 열려요
  if (type === 'art') { rec.artKind = existing ? artKindOf(existing) : (rec.artKind || '크로키'); rec.images = existing ? artPhotos(existing) : []; }
  // 종류 칸이 없던 예전 바이올린 기록은 '연습'으로 봐요
  if (schema.kindKey && !rec[schema.kindKey]) rec[schema.kindKey] = schema.fields.find((f) => f.key === schema.kindKey).options[0];
  formImages = {};
  schema.fields.filter((f) => f.type === 'image' && !f.hidden).forEach((f) => { formImages[f.key] = rec[f.key] || null; });
  formShots = type === 'art' ? [...rec.images] : [];
  staged = [];
  stopStagedPlayer();
  tempoDraft = type === 'violin' && tempoNum(rec.otherTempo) ? { o: String(tempoNum(rec.otherTempo)) } : {};
  const valueFor = (f) => (f.type === 'multi' ? Object.fromEntries(f.keys.map((k) => [k, rec[k]])) : rec[f.key]);
  const shown = (f) => !f.hidden && (!f.legacy || hasValue(rec[f.key])); // 예전 칸(legacy)은 값이 들어 있을 때만 보여요
  const base = schema.fields.filter(shown);
  const datalists = schema.fields.filter((f) => f.suggest)
    .map((f) => `<datalist id="dl_${type}_${f.key}">${(type === 'violin' && f.key === 'piece' ? pieceSuggestions() : suggestions(type, f.key)).map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`).join('');
  openDlg(`
    <h2>${esc(schema.label)} ${existing ? '수정' : '추가'}</h2>
    <form id="recForm" novalidate>
      ${base.map((f) => fieldHTML(f, valueFor(f), type)).join('')}
      ${datalists}
      <div class="error" id="formError" role="alert"></div>
      <div class="dlg-actions">
        <button type="button" class="btn ghost" data-act="closeDlg">취소</button>
        <button type="submit" class="btn">저장</button>
      </div>
    </form>`, 'roomy');
  const form = dlg.querySelector('#recForm');
  form.dataset.type = type;
  form.dataset.id = existing ? existing.id : '';
  syncKindFields(form);
  renderAllLineRecs(); syncLineDim();
  if (!existing) addDawnNote($('#f_date'));
  updateShotsPreview();
  Object.keys(formImages).forEach(updateImagePreview);
  const first = dlg.querySelector('input:not([type=file]):not([type=date]):not([type=hidden]), textarea');
  if (first && !existing) first.focus();
  formBase = formSnapshot();
}

// 받침이 있으면 앞, 없으면 뒤 (예: 사진 + 을/를 → 사진을 · 캡처 + 을/를 → 캡처를)
function withJosa(word, pair) {
  const [a, b] = pair.split('/');
  const c = word.charCodeAt(word.length - 1);
  return `${word}${c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? a : b}`;
}
const isImage = (f) => !!f && typeof f.type === 'string' && f.type.startsWith('image/');
// 사진 파일의 날짜 (미래 날짜는 오늘로)
function dateOfFile(f) {
  const t = toStr(new Date(f.lastModified || Date.now()));
  return t > todayStr() ? todayStr() : t;
}

// 입력 창에 그림 한 장 붙이기
async function attachImage(file, key = 'image') {
  const err = $('#formError');
  if (!isImage(file)) { if (err) err.textContent = '이미지 파일(사진)만 넣을 수 있어요.'; return false; }
  try {
    formImages[key] = await readImage(file);
    updateImagePreview(key);
    if (err) err.textContent = '';
    return true;
  } catch (e) {
    if (err) err.textContent = '이 파일은 이미지로 열 수 없어요. 다른 파일을 골라 주세요.';
    return false;
  }
}

// 입력 창에 그림 사진 여러 장 붙이기
async function attachShots(files) {
  const err = $('#formError');
  const note = $('#imgNote');
  const imgs = files.filter(isImage);
  if (!imgs.length) { if (err) err.textContent = '이미지 파일(사진)만 넣을 수 있어요.'; return false; }
  const form = $('#recForm');
  const fld = form ? SCHEMAS[form.dataset.type].fields.find((f) => f.type === 'images') : null; // 사진을 넣는 칸 (운동: 워치 캡처 · 그림: 사진)
  const max = (fld && fld.max) || ART_MAX_PHOTOS;
  const room = max - formShots.length;
  if (room <= 0) { if (note) note.textContent = `사진은 한 기록에 ${max}장까지 넣을 수 있어요. 필요 없는 것은 '빼기'를 눌러 주세요.`; return false; }
  let added = 0;
  for (const f of imgs.slice(0, room)) {
    try { formShots.push(await readImage(f)); added += 1; } catch (e) { if (err) err.textContent = '이미지로 열 수 없는 파일은 건너뛰었어요.'; }
  }
  updateShotsPreview();
  if (added && err) err.textContent = '';
  if (note) note.textContent = imgs.length > room ? `${max}장까지만 넣을 수 있어서 ${room}장만 넣었어요.` : '';
  return added > 0;
}

// 사진을 적당한 크기로 줄여서 저장해요 (저장 공간 절약)
function readImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지를 열 수 없어요'));
      img.onload = () => {
        const scale = Math.min(1, IMAGE_MAX_SIZE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// 템포 칸 읽기: 비어 있으면 0(없음), 올바른 숫자면 그 수, 1보다 작거나 숫자가 아니면 null(오류)
function tempoFromInput(input) {
  const raw = input ? String(input.value || '').trim() : '';
  if (raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

async function submitForm(form) {
  const type = form.dataset.type;
  const schema = SCHEMAS[type];
  const err = $('#formError');
  const kind = schema.kindKey ? form.elements[schema.kindKey].value : null;
  const old = records.find((r) => r.id === form.dataset.id);
  const data = {};
  for (const f of schema.fields) {
    if (f.only && f.only !== kind) continue; // 다른 종류의 칸은 저장하지 않아요
    if (f.legacy && !form.elements[f.key]) continue; // 안 보였던 예전 칸은 손대지 않아요
    if (f.hidden) continue; // 화면에 없는 칸
    if (f.type === 'bookLines') { // 교재 칩 + 교재마다 한 줄(+ 템포) → books: [{ name, piece, tempo }] (칩 순서, 템포는 적었을 때만)
      const lines = new Map([...form.querySelectorAll('#bookRows .book-row')].map((row) => [row.dataset.book, { piece: row.querySelector('[data-book-piece]').value.trim(), tempo: row.querySelector('[data-tempo]'), }]));
      const out = [];
      for (const name of readChoice(form, { key: 'books', type: 'chips' })) {
        const l = lines.get(name) || { piece: '', tempo: null };
        const t = tempoFromInput(l.tempo);
        if (t === null) { err.textContent = `'${name}'의 템포에는 1 이상의 숫자를 써 주세요.`; l.tempo.focus(); return; }
        out.push({ name, piece: l.piece, ...(t ? { tempo: t } : {}) });
      }
      data.books = out;
      continue;
    }
    if (f.type === 'multi') { f.keys.forEach((k) => { data[k] = (form.elements[k].value || '').trim(); }); continue; }
    if (f.type === 'image') { data[f.key] = formImages[f.key] || ''; continue; }
    if (f.type === 'images') { data[f.key] = [...formShots]; continue; }
    if (f.type === 'choice' || f.type === 'chips') { data[f.key] = readChoice(form, f); continue; } // 안 골랐으면 빈 값 (연습량은 숫자로 저장)
    const raw = (form.elements[f.key].value || '').trim();
    if (f.required && !raw) {
      err.textContent = `'${cleanLabel(f.label)}' 칸을 채워 주세요.`; form.elements[f.key].focus(); return;
    }
    if (f.type === 'number') {
      if (raw === '') { data[f.key] = ''; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || (f.min !== undefined && n < f.min)) { err.textContent = `'${cleanLabel(f.label)}' 칸에는 올바른 숫자를 써 주세요.`; form.elements[f.key].focus(); return; }
      data[f.key] = n;
    } else {
      data[f.key] = raw;
    }
  }
  if (type === 'art') {
    if (!old && !formShots.length) { err.textContent = '사진을 한 장 이상 넣어 주세요.'; return; }
    if (!data.artKind) data.artKind = '크로키';
  }
  if (type === 'violin' && kind === '연습') { // "그 밖에 연습한 곡" 줄의 템포
    const ti = form.querySelector('[data-tempo="o"]');
    const t = tempoFromInput(ti);
    if (t === null) { err.textContent = `'그 밖에 연습한 곡'의 템포에는 1 이상의 숫자를 써 주세요.`; ti.focus(); return; }
    data.otherTempo = t || '';
  }
  // 곡 줄마다 고른 녹음: 그 줄의 곡 이름 + 이 기록의 날짜로 붙어요 (곡 이름이 비어 있는 줄에는 붙일 수 없어요)
  const lineStaged = type === 'violin' && kind === '연습' ? staged.filter((s) => s.line) : [];
  const lineNow = type === 'violin' ? lineRows(data) : [];
  for (const sg of lineStaged) {
    const l = lineNow.find((x) => x.line === sg.line);
    if (!l || !l.piece) { err.textContent = '녹음을 붙이려면 그 줄의 곡 이름을 먼저 적어 주세요.'; (linePieceInput(sg.line) || form.elements.piece).focus(); return; }
  }
  const src = type === 'violin' && old ? violinCopy(old) : old; // 아직 새 모양으로 옮기지 않은 예전 기록은 옮긴 모습을 바탕으로 해요
  const carry = [...HIDDEN_KEYS, 'stamp', 'stampMsg', 'feedbackId', ...(schema.keep || [])]; // 이 창에서 고치지 않는 칸(화면에서 뺀 칸의 예전 값 포함)은 그대로 보관
  const rec = {
    id: old ? old.id : newId(),
    type,
    createdAt: old ? old.createdAt : Date.now(),
    updatedAt: Date.now(),
    ...Object.fromEntries(carry.filter((k) => src && src[k] !== undefined).map((k) => [k, src[k]])),
    ...data,
  }; // 예시 표시(sample)는 직접 고치면 사라져요. 내 기록이 되었다는 뜻이에요.
  if (type === 'workout' && !rec.kind) rec.kind = EX_KIND; // 운동은 종류를 나누지 않아요 (예전 기록의 kind 는 그대로 보관)
  if (!old) assignStamp(rec); // 새 기록만 도장을 받아요 (고칠 때는 받은 도장이 그대로예요)
  if (!(await saveRecord(rec))) return;
  if (lineStaged.length) { // 줄마다 곡 이름 + 이 기록의 날짜로 저장돼요 (Drive에도 곡별 폴더로 올라가요)
    for (const sg of lineStaged) await addRecording(lineNow.find((x) => x.line === sg.line).piece, { file: sg.file, date: rec.date, memo: '', name: sg.name, recId: rec.id });
    staged = staged.filter((x) => !x.line);
    stopStagedPlayer();
  }
  afterSave();
  if (!old) afterNewRecord(rec);
}

// 백업 파일의 모양은 그대로예요. 곡마다 첫 녹음이 있을 때만 audios 목록이 더해져요. (예전 파일에는 없어요)
async function backupPayload() {
  const payload = { app: 'my-journal', version: 1, exportedAt: new Date().toISOString(), records };
  const list = await audiosForBackup();
  if (list.length) payload.audios = list;
  return payload;
}

// 백업 파일에서 쓸 수 있는 기록만 골라요 (형식이 다르면 null)
function validRecords(payload, bump = false) {
  if (!payload || payload.app !== 'my-journal' || !Array.isArray(payload.records)) return null;
  // 더 이상 쓰지 않는 종류(경제 공부 메모·투자 기록)와 칸 값은 불러올 때 조용히 버려요.
  // 🧘 운동의 없어진 칸도 같아요: 지우고, 예전 "몸이 어땠나 한 줄"·"달리며 든 생각 한 줄"은 "한 줄"로 옮겨요. (bump: 바뀐 기록은 바꾼 시각도 새로 적어요)
  return payload.records.filter((r) => r && typeof r.id === 'string' && SCHEMAS[r.type] && typeof r.date === 'string' && !(settings.weekLegacyV1 && r.type === 'config' && r.key === 'weekView') && simplifyKeep(r)).map((r) => simplifyCopy(weekLegacyCopy(violinCopy(stripQuick(workoutLiteCopy(cleanedCopy(r), bump), bump), bump), bump), bump)); // 🗓 예전 값 정리 · 덜어내기 정리에 동의한 뒤에는 불러올 때도 같은 규칙이에요
}

/* ---------------------------------------------------------------------
   0. 업데이트 정리: 없어진 기능의 데이터(경제 공부 메모·투자 기록, 바이올린 예전 칩, 그림 예전 칩·도구 등)를 한 번만 정리해요.
      정리하기 직전에 전체 백업 파일을 내려받고, 확인을 눌러야만 진행해요. (정리 대상은 아래 두 목록에 적힌 것뿐이에요)
   --------------------------------------------------------------------- */
const CLEAN_DROP_TYPES = ['study', 'invest'];                // 통째로 지우는 기록 종류
const CLEAN_FIELDS = {                                        // 종류별로 지우는 칸
  violin: ['did', 'focus'],                                   // 예전 "오늘 한 것" 칩, "집중한 점" 칩
  art: ['kind', 'areas', 'tools', 'tried', 'hard'],           // 예전 종류·연습 영역 칩, 사용한 도구, 새로 시도한 점, 어려웠던 점
  econRoutine: ['tags'],                                      // 경제 루틴의 태그 (금리·인플레이션·환율)
};
const dirtyKeys = (r) => (CLEAN_FIELDS[r.type] || []).filter((k) => k in r);
const needsCleanup = (r) => CLEAN_DROP_TYPES.includes(r.type) || dirtyKeys(r).length > 0;
function cleanedCopy(r) {
  if (!dirtyKeys(r).length) return r;
  const c = { ...r };
  dirtyKeys(r).forEach((k) => delete c[k]);
  return c;
}

// 🧹 데이터 정리 확인 창: 백업 파일 안내 + "정리 전 백업 파일 불러오기" 버튼 한 줄 + [취소] [정리하기]. true 면 정리해요. (닫거나 Esc 를 눌러도 취소예요)
let cleanupAsk = null;
async function askCleanup(message, name) {
  while (dlg.open) await new Promise((r) => setTimeout(r, 300)); // 다른 창이 열려 있으면 닫힐 때까지 기다려요
  return new Promise((resolve) => {
    cleanupAsk = { resolve };
    openDlg(`<h2>🧹 데이터 정리</h2>
      <p class="pre cleanup-msg">${esc(message)}</p>
      <div class="row cleanup-restore"><button type="button" class="btn ghost small" data-act="cleanRestore">📂 정리 전 백업 파일 불러오기</button><input type="file" id="cleanRestoreFile" accept=".json,application/json" hidden></div>
      <p class="meta" style="margin:6px 0 0">백업 파일 이름: ${esc(name)} · 불러올 때도 없어진 칸은 같은 규칙으로 정리돼요. 값은 백업 파일 안에 그대로 있어요.</p>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-act="cleanNo">취소</button><button type="button" class="btn" data-act="cleanYes">정리하기</button></div>`);
  });
}
function answerCleanup(yes) {
  const a = cleanupAsk;
  if (!a) return;
  cleanupAsk = null;
  a.resolve(yes);
  closeDlg();
}

async function runUpdateCleanup() {
  if (settings.cleanupV3) return;
  const dirty = records.filter(needsCleanup);
  if (!dirty.length) { settings.cleanupV2 = true; settings.cleanupV3 = true; await saveSettings(); return; } // 정리할 것이 없으면 조용히 끝나요
  const name = `my-journal-backup-before-update-${todayStr().replace(/-/g, '')}.json`;
  await downloadBackup(name); // 정리하기 직전에 전체 백업
  if (!(await askCleanup(`업데이트 전에 백업을 저장했어요. 예전 투자·경제 메모, 경제 루틴 태그와 일부 칩 값을 정리합니다.\n(백업 파일은 다운로드 폴더에 있어요)`, name))) return; // 취소하면 아무것도 지우지 않고, 다음에 열 때 다시 물어봐요
  const drop = dirty.filter((r) => CLEAN_DROP_TYPES.includes(r.type)).map((r) => r.id);
  const emptied = (r) => { const c = cleanedCopy(r); return r.type === 'econRoutine' && !Object.values(c.checks || {}).some(Boolean) && !(c.letters || []).length && !c.note; }; // 태그만 남아 있던 빈 루틴 기록
  const emptyIds = dirty.filter((r) => !CLEAN_DROP_TYPES.includes(r.type) && emptied(r)).map((r) => r.id);
  const at = Date.now();
  const edit = dirty.filter((r) => !CLEAN_DROP_TYPES.includes(r.type) && !emptyIds.includes(r.id)).map((r, i) => ({ ...cleanedCopy(r), updatedAt: Math.max(at + i, (r.updatedAt || 0) + 1) })); // 바뀐 기록은 바꾼 시각도 새로 적어서 ☁ 다른 기기에도 반영돼요
  if (edit.length) await Store.putMany(edit);
  if (drop.length) await Store.remove(drop);
  for (const id of emptyIds) await deleteRecord(id); // 빈 루틴 기록은 삭제 표시를 남겨서 ☁ 다른 기기에서도 사라져요
  records = await loadRecords();
  settings.cleanupV2 = true;
  settings.cleanupV3 = true;
  await saveSettings();
  render();
  toast('정리했어요. 백업 파일은 다운로드 폴더에 있어요.', 5000);
}

/* ---------------------------------------------------------------------
   0-2. 🧘 운동 입력 단순화 정리 (한 번만): 요가·슬로조깅의 칩과 "✍ 더 적기" 칸이 없어졌어요.
        없어진 칸의 값은 지우고, 예전 "몸이 어땠나 한 줄"·"달리며 든 생각 한 줄"은 "한 줄"(memo)로 옮겨요. (둘 다 있으면 " · "로 이어 붙여요)
        정리하기 직전에 백업 파일을 내려받고 확인을 물어봐요. 바뀐 기록은 바꾼 시각을 새로 적어서 ☁ 다른 기기에도 반영돼요. 한 번 하고 나면 flag(workoutLiteV1)가 켜져요.
        예전 백업 파일을 불러올 때, 그리고 ☁ 에서 받아 올 때도 같은 규칙을 써요(workoutLiteCopy).
   --------------------------------------------------------------------- */
const WORKOUT_GONE = {                                         // 운동 기록에서 없어진 칸 (저장 이름 → 화면에 있던 이름)
  did: '주로 한 것(요가 칩)', weather: '날씨(슬로조깅 칩)',
  relief: '시원했던 곳(요가 칩)', course: '따라 한 영상·수업', refs: '영상·수업 링크',
  place: '장소', pace: '대화할 수 있는 속도였나(칩)',
  shots: '워치 캡처', claude: '클로드 피드백(붙여 둔 글)', condition: '컨디션(예전 칸)',
};
const WORKOUT_TO_LINE = { bodyNote: '몸이 어땠나 한 줄', runThought: '달리며 든 생각 한 줄' }; // 이 두 칸은 지우기 전에 "한 줄"(memo)로 옮겨요
const workoutDirtyKeys = (r) => (r && r.type === 'workout' ? [...Object.keys(WORKOUT_GONE), ...Object.keys(WORKOUT_TO_LINE)].filter((k) => k in r) : []);
function workoutLiteCopy(r, bump = false) {
  const keys = workoutDirtyKeys(r);
  if (!keys.length) return r;
  const c = { ...r };
  const base = hasValue(r.memo) ? String(r.memo).trim() : '';
  let line = base;
  Object.keys(WORKOUT_TO_LINE).forEach((k) => { // 옮길 글: 원래 한 줄 + 몸이 어땠나 + 달리며 든 생각 (이미 같은 글이 들어 있으면 또 붙이지 않아요)
    const v = hasValue(r[k]) ? String(r[k]).trim() : '';
    if (v && !line.includes(v)) line = line ? `${line} · ${v}` : v;
  });
  if (line !== base) c.memo = line;
  keys.forEach((k) => delete c[k]);
  if (bump) c.updatedAt = Math.max(Date.now(), (r.updatedAt || 0) + 1);
  return c;
}
// 지워지는 값이 얼마나 되는지 세요 (확인 창에 보여줘요)
function workoutLiteCounts(list) {
  const has = (r, k) => (k === 'shots' ? Array.isArray(r.shots) && r.shots.length > 0 : hasValue(r[k]));
  const out = {};
  Object.keys(WORKOUT_GONE).forEach((k) => { out[k] = list.filter((r) => has(r, k)).length; });
  out.shotCount = list.reduce((n, r) => n + (Array.isArray(r.shots) ? r.shots.length : 0), 0);
  out.linkCount = list.reduce((n, r) => n + String(r.refs || '').split(/\s+/).filter(Boolean).length, 0);
  out.moved = list.filter((r) => Object.keys(WORKOUT_TO_LINE).some((k) => hasValue(r[k]))).length;
  return out;
}
function workoutLiteMessage(c, name) {
  const lines = Object.entries(WORKOUT_GONE).filter(([k]) => c[k]).map(([k, label]) => `· ${label}: ${c[k]}개${k === 'shots' ? ` (사진 ${c.shotCount}장)` : k === 'refs' ? ` (링크 ${c.linkCount}개)` : ''}`);
  return `🧘 운동 기록 입력이 간단해졌어요. 요가·슬로조깅의 칩과 "더 적기" 칸에 적어 둔 값을 지웁니다.\n${lines.length ? `${lines.join('\n')}\n` : ''}${c.moved ? `\n"몸이 어땠나 한 줄"·"달리며 든 생각 한 줄" ${c.moved}개는 지우지 않고 "한 줄"로 옮겨요.\n` : ''}\n정리하기 전에 백업을 저장했어요. (백업 파일은 다운로드 폴더에 있어요)`;
}

async function migrateWorkoutLite() {
  if (settings.workoutLiteV1) return;
  const dirty = records.filter((r) => workoutDirtyKeys(r).length);
  const real = dirty.filter((r) => !r.sample);
  const counts = workoutLiteCounts(real);
  const valuable = Object.keys(WORKOUT_GONE).some((k) => counts[k]) || counts.moved; // 진짜 기록에 지워질 값이 들어 있을 때만 백업·확인을 해요 (예시 기록이나 빈 칸뿐이면 조용히 정리)
  if (valuable) {
    const name = `my-journal-backup-before-workout-lite-${todayStr().replace(/-/g, '')}.json`;
    await downloadBackup(name); // 정리하기 직전에 전체 백업
    if (!(await askCleanup(workoutLiteMessage(counts, name), name))) return; // 취소하면 아무것도 지우지 않고, 다음에 열 때 다시 물어봐요
  }
  if (dirty.length) {
    const at = Date.now();
    const next = dirty.map((r, i) => { const c = workoutLiteCopy(r); c.updatedAt = Math.max(at + i, (r.updatedAt || 0) + 1); return c; }); // 바꾼 시각을 새로 적어서 ☁ 다른 기기에도 반영돼요
    await Store.putMany(next);
    const byId = new Map(next.map((r) => [r.id, r]));
    records = records.map((r) => byId.get(r.id) || r);
  }
  settings.workoutLiteV1 = true;
  await saveSettings();
  if (dirty.length) { render(); if (valuable) toast('운동 기록을 정리했어요. 백업 파일은 다운로드 폴더에 있어요.', 5000); }
}

/* ---------------------------------------------------------------------
   0-3. 🗓 이번 주 · 🧘 운동 예전 값 정리 (한 번만, 확인한 뒤에)
        운동에 종류가 없어졌고(모두 "운동") 🗓 이번 주가 표 하나가 되어서 쓰지 않는 예전 값을 정리해요.
        ① 운동 기록 · 📥 로 붙여 넣은 그 주 운동의 종류(kind: 요가 · 근력 …)는 지우지 않고 모두 "운동"으로 통일
        ② 예전 [목록][표] 보기 설정(weekView) 삭제  ③ 예전 체크 해제 표시("요일:종류" · 요일 숫자) 삭제  ④ 그 주 몸무게(weekPlan.weight) 삭제
        정리하기 직전에 백업 파일을 내려받고 확인을 물어봐요. 바뀐 기록은 바꾼 시각을 새로 적고, 지운 것은 삭제 표시를 남겨서 ☁ 다른 기기에도 반영돼요.
        한 번 하고 나면 flag(weekLegacyV1)가 켜지고, 그 뒤로는 백업 불러오기 · ☁ 받아 오기에서도 같은 규칙이에요(weekLegacyCopy).
   --------------------------------------------------------------------- */
const isLegacySkip = (t) => typeof t === 'number' || (typeof t === 'string' && !/^[0-6]:\d+$/.test(t)); // 숫자(요일 전체) · "요일:종류" 는 예전 표시, "요일:블록번호"는 지금 표시예요
const exKindDirty = (b) => !!b && typeof b === 'object' && typeof b.kind === 'string' && b.kind !== EX_KIND;
const exDayDirty = (d) => !!d && typeof d === 'object' && (Array.isArray(d.blocks) ? d.blocks.some(exKindDirty) : exKindDirty(d) && d.kind !== '');
const fixExDay = (d) => (d && typeof d === 'object' ? (Array.isArray(d.blocks) ? { ...d, blocks: d.blocks.map((b) => (exKindDirty(b) ? { ...b, kind: EX_KIND } : b)) } : (exKindDirty(d) && d.kind !== '' ? { ...d, kind: EX_KIND } : d)) : d);
// 한 기록의 예전 값을 정리한 복사본 (바꿀 게 없으면 그대로). bump: 바뀐 기록은 바꾼 시각도 새로 적어요
function weekLegacyClean(r, bump = false) {
  if (!r) return r;
  let c = null;
  const edit = () => { if (!c) c = { ...r }; return c; };
  if (r.type === 'workout') {
    if (exKindDirty(r)) edit().kind = EX_KIND;
  } else if (r.type === 'weekPlan') {
    if ('weight' in r) delete edit().weight;
    if (Array.isArray(r.skip) && r.skip.some(isLegacySkip)) { edit().skip = r.skip.filter((t) => !isLegacySkip(t)); if (!c.skip.length) delete c.skip; }
    if (r.ex && typeof r.ex === 'object' && Object.values(r.ex).some(exDayDirty)) edit().ex = Object.fromEntries(Object.entries(r.ex).map(([k, v]) => [k, fixExDay(v)]));
  }
  if (c && bump) c.updatedAt = Math.max(Date.now(), (r.updatedAt || 0) + 1);
  return c || r;
}
// 정리에 동의한 뒤에만 불러올 때·받아 올 때 같은 규칙을 써요
const weekLegacyCopy = (r, bump = false) => (settings.weekLegacyV1 ? weekLegacyClean(r, bump) : r);
const planEmpty = (r) => !(Number(r.weight) > 0) && !(Array.isArray(r.skip) && r.skip.length) && !(r.ex && Object.keys(r.ex).length) && !(r.tutor && Object.keys(r.tutor).length) && !(typeof r.memo === 'string' && r.memo.trim());

function weekLegacyScan() {
  const real = records.filter((r) => !r.sample);
  const plans = records.filter((r) => r.type === 'weekPlan');
  return {
    kinds: real.filter((r) => r.type === 'workout' && exKindDirty(r)).length,
    routine: records.filter((r) => r.type === 'weekPlan' && r.ex && Object.values(r.ex).some(exDayDirty)).length,
    view: records.some((r) => r.type === 'config' && r.key === 'weekView'),
    skips: plans.reduce((n, r) => n + (Array.isArray(r.skip) ? r.skip.filter(isLegacySkip).length : 0), 0),
    weights: plans.filter((r) => Number(r.weight) > 0).length,
    any: records.some((r) => (r.type === 'workout' && exKindDirty(r)) || (r.type === 'config' && r.key === 'weekView') || (r.type === 'weekPlan' && (('weight' in r) || (Array.isArray(r.skip) && r.skip.some(isLegacySkip)) || (r.ex && Object.values(r.ex).some(exDayDirty))))),
  };
}
function weekLegacyMessage(c, name) {
  const lines = [];
  if (c.kinds || c.routine) lines.push(`· 운동 종류(요가·근력 등): 운동 기록 ${c.kinds}개${c.routine ? ` · 붙여 넣은 운동 ${c.routine}곳` : ''}을 모두 "운동"으로 통일해요 (지우지 않고 바꿔요)`);
  if (c.view) lines.push('· 예전 [목록][표] 보기 설정(weekView)을 지워요');
  if (c.skips) lines.push(`· 예전 체크 해제 표시 ${c.skips}개를 지워요 (체크를 풀어 두었던 날은 운동 기록이 남아 있으면 다시 체크된 것으로 보일 수 있어요)`);
  if (c.weights) lines.push(`· 이제 화면에 없는 몸무게 ${c.weights}주치를 지워요`);
  return `🗓 이번 주가 표 하나가 되고 운동에 종류가 없어져서, 쓰지 않는 예전 값을 정리해요. 정리하기 전에 백업을 저장했어요.\n${lines.join('\n')}\n\n정리할까요? (백업 파일은 다운로드 폴더에 있어요: ${name})`;
}
async function migrateWeekLegacy() {
  if (settings.weekLegacyV1) return;
  const c = weekLegacyScan();
  if (!c.any) { settings.weekLegacyV1 = true; await saveSettings(); return; } // 정리할 것이 없으면 조용히 끝나요
  const name = `my-journal-backup-before-week-cleanup-${todayStr().replace(/-/g, '')}.json`;
  const valuable = c.kinds || c.routine || c.view || c.skips || c.weights;
  if (valuable) {
    await downloadBackup(name); // 정리하기 직전에 전체 백업
    if (!(await askCleanup(weekLegacyMessage(c, name), name))) return; // 취소하면 아무것도 바꾸지 않고, 다음에 열 때 다시 물어봐요
  }
  // 예전에 표에서 만든 기록(plan: true)은 어느 블록의 체크였는지(plan = 블록 번호+1)를 종류가 바뀌기 전에 적어 둬요
  const slot = new Map();
  records.filter((r) => r.type === 'workout' && r.plan === true && !r.sample).forEach((r) => {
    const sun = weekStartOf(r.date); const dow = parseDate(r.date).getDay();
    const blocks = exBlocksOf(sun, dow);
    const hit = dayAssign(r.date, blocks).findIndex((h) => h.some((x) => x.id === r.id));
    if (hit >= 0) slot.set(r.id, hit + 1);
  });
  const at = Date.now();
  const del = []; const put = [];
  records.forEach((r) => {
    let n = weekLegacyClean(r);
    if (r.type === 'workout' && slot.has(r.id)) n = { ...n, plan: slot.get(r.id) };
    if (r.type === 'config' && r.key === 'weekView') { del.push(r.id); return; }
    if (n === r) return;
    if (n.type === 'weekPlan' && planEmpty(n)) { del.push(r.id); return; } // 몸무게만 남아 있던 주 기록은 통째로
    put.push({ ...n, updatedAt: Math.max(at + put.length, (r.updatedAt || 0) + 1) });
  });
  if (put.length) await Store.putMany(put);
  records = await loadRecords();
  for (const id of del) await deleteRecord(id); // 삭제 표시를 남겨서 ☁ 다른 기기에서도 사라져요
  settings.weekLegacyV1 = true;
  await saveSettings();
  render();
  if (valuable) toast('예전 값을 정리했어요. 백업 파일은 다운로드 폴더에 있어요.', 5000);
}

/* ---------------------------------------------------------------------
   0-3. 덜어내기 정리 (한 번만, 확인한 뒤에): 예시 기록 기능이 없어지고 클로드 요청 문구에서 "할 일" 요청을 뺐어요.
        ① 예시 기록(sample: true)이 남아 있으면 삭제  ② 저장해 둔 클로드 요청 문구(claudeSettings) 중 🎻 바이올린 · 🎨 그림 request 에
        "다음 연습" · "제안" · "원본" 같은 할 일 요청이 들어 있으면 그 request 만 새 기본값으로 되돌리기 (내 정보는 그대로)
        정리하기 직전에 백업 파일을 내려받고 확인을 물어봐요. 바꿀 게 없으면 창 없이 flag(simplifyV2)만 켜요.
        한 번 하고 나면 백업 불러오기 · ☁ 받아 오기에서도 같은 규칙이에요(simplifyKeep · simplifyCopy).
   --------------------------------------------------------------------- */
const SIMPLIFY_REQ_SCOPES = ['violin', 'drawing'];
const SIMPLIFY_REQ_BAD = /다음\s*연습|제안|원본/;
const simplifyBadScopes = (v) => (v && typeof v === 'object' ? SIMPLIFY_REQ_SCOPES.filter((sc) => v[sc] && typeof v[sc].request === 'string' && SIMPLIFY_REQ_BAD.test(v[sc].request)) : []);
const simplifyKeep = (r) => !(settings.simplifyV2 && r && r.sample); // 정리에 동의한 뒤에는 예시 기록을 불러오지 않아요
function simplifyCopy(r, bump = false) {
  if (!settings.simplifyV2 || !r || r.type !== 'config' || r.key !== 'claudeSettings') return r;
  const bad = simplifyBadScopes(r.value);
  if (!bad.length) return r;
  const value = { ...r.value };
  bad.forEach((sc) => { const { request, ...rest } = value[sc]; if (Object.keys(rest).length) value[sc] = rest; else delete value[sc]; });
  const c = { ...r, value };
  if (bump) c.updatedAt = Math.max(Date.now(), (r.updatedAt || 0) + 1);
  return c;
}
async function migrateSimplify() {
  if (settings.simplifyV2) return;
  const samples = records.filter((r) => r.sample);
  const bad = simplifyBadScopes(getConfig('claudeSettings', null));
  if (!samples.length && !bad.length) { settings.simplifyV2 = true; await saveSettings(); return; } // 바꿀 게 없으면 조용히 끝나요
  const name = `my-journal-backup-before-simplify-${todayStr().replace(/-/g, '')}.json`;
  await downloadBackup(name); // 정리하기 직전에 전체 백업
  const lines = [];
  if (samples.length) lines.push(`· 처음에 들어 있던 예시 기록 ${samples.length}개를 지워요 (내가 쓴 기록은 그대로예요)`);
  bad.forEach((sc) => lines.push(`· ${scopeMeta(sc).icon} ${scopeMeta(sc).label} 클로드 요청 문구에 "다음 연습·제안·원본 비교" 같은 할 일 요청이 들어 있어서 새 기본 문구로 되돌려요 (내 정보는 그대로예요)`));
  const msg = `기록장을 덜어냈어요. 예시 기록 기능이 없어지고, 클로드 요청 문구에서 할 일을 묻는 말을 뺐어요. 정리하기 전에 백업을 저장했어요.\n${lines.join('\n')}\n\n정리할까요? (백업 파일은 다운로드 폴더에 있어요: ${name})`;
  if (!(await askCleanup(msg, name))) return; // 취소하면 아무것도 바꾸지 않고, 다음에 열 때 다시 물어봐요
  for (const r of samples) await deleteRecord(r.id); // 예시 기록은 동기화하지 않아서 흔적 없이 지워져요
  if (bad.length) {
    const value = { ...getConfig('claudeSettings', {}) };
    bad.forEach((sc) => { const { request, ...rest } = value[sc]; if (Object.keys(rest).length) value[sc] = rest; else delete value[sc]; }); // request 만 빼고 info 는 그대로
    await setConfig('claudeSettings', Object.keys(value).length ? value : null);
  }
  settings.simplifyV2 = true;
  await saveSettings();
  render();
  toast('정리했어요. 백업 파일은 다운로드 폴더에 있어요.', 5000);
}

// 🎻 빠른 기록이 없어져서(🧘 운동은 앞서 없어졌어요) 모든 기록의 "간단 기록" 표시(quick)를 한 번만 지워요. 값이 아니라 표시라서 확인 없이 조용히 지워요.
//   바뀐 기록은 바꾼 시각도 새로 적어서 ☁ 다른 기기에도 반영돼요. 한 번 하고 나면 flag(quickFlagV1)가 켜져요.
//   예전 백업 파일을 불러올 때와 ☁ 에서 받아 올 때도 같은 규칙이에요(stripQuick).
function stripQuick(r, bump = false) {
  if (!r || !('quick' in r)) return r;
  const c = { ...r };
  delete c.quick;
  if (bump) c.updatedAt = Math.max(Date.now(), (r.updatedAt || 0) + 1);
  return c;
}
async function migrateQuickFlags() {
  if (settings.quickFlagV1) return;
  const todo = records.filter((r) => 'quick' in r);
  if (todo.length) {
    const at = Date.now();
    const next = todo.map((r, i) => { const c = stripQuick(r); c.updatedAt = Math.max(at + i, (r.updatedAt || 0) + 1); return c; });
    try { await Store.putMany(next); } catch (e) { return; } // 저장하지 못하면 다음에 다시 해요
    const byId = new Map(next.map((r) => [r.id, r]));
    records = records.map((r) => byId.get(r.id) || r);
  }
  settings.quickFlagV1 = true;
  await saveSettings();
}

/* ---------------------------------------------------------------------
   0-3. 🎻 교재별 한 줄 옮기기 (한 번만): 예전 기록의 "교재 + 곡 이름 + 교재 몇 번·몇 쪽"을 교재별 한 줄(books: [{ name, piece }])로 옮겨요.
        · 교재와 곡 이름이 같이 있으면: 첫 교재의 한 줄에 곡 이름, 나머지 교재는 빈칸, "그 밖에 연습한 곡"은 비워요.
        · 교재 없이 곡 이름만 있으면: "그 밖에 연습한 곡"에 그대로 둬요.
        · "교재 몇 번·몇 쪽"은 첫 교재의 한 줄이 비었으면 거기로, 차 있으면 " · "로 이어 붙여요. (교재가 하나도 없으면 "그 밖에 연습한 곡" 뒤에 이어 붙여요)
        옮기기 직전에 백업 파일을 내려받고 확인을 물어봐요. 바뀐 기록은 바꾼 시각을 새로 적어서 ☁ 다른 기기에도 반영돼요. 한 번 하고 나면 flag(booksV1)가 켜져요.
        예전 백업 파일을 불러올 때, 그리고 ☁ 에서 받아 올 때도 같은 규칙을 써요(booksCopy).
   --------------------------------------------------------------------- */
const booksNeedConvert = (r) => !!r && r.type === 'violin' && ((Array.isArray(r.books) && r.books.some((b) => typeof b === 'string')) || hasValue(r.bookPart));
function booksCopy(r, bump = false) {
  if (!booksNeedConvert(r)) return r;
  const c = { ...r };
  const rows = bookRows(r);
  const oldShape = Array.isArray(r.books) && r.books.some((b) => typeof b === 'string');
  let other = pieceKey(r.piece);
  if (oldShape && rows.length) { // 교재 + 곡 이름: 첫 교재의 한 줄로
    if (other && !rows[0].piece) { rows[0].piece = other; other = ''; }
  }
  if (hasValue(r.bookPart)) { // 교재 몇 번·몇 쪽
    const part = String(r.bookPart).trim();
    if (rows.length) rows[0].piece = rows[0].piece ? `${rows[0].piece} · ${part}` : part;
    else other = other ? `${other} · ${part}` : part;
  }
  if (Array.isArray(r.books)) c.books = rows;
  if ('piece' in r || other) c.piece = other;
  delete c.bookPart;
  if (bump) c.updatedAt = Math.max(Date.now(), (r.updatedAt || 0) + 1);
  return c;
}
function booksCounts(list) {
  const withBooks = list.filter((r) => Array.isArray(r.books) && r.books.some((b) => typeof b === 'string'));
  return {
    records: list.length,
    moved: withBooks.filter((r) => pieceKey(r.piece)).length,       // 곡 이름을 첫 교재의 한 줄로 옮기는 기록
    part: list.filter((r) => hasValue(r.bookPart)).length,          // "교재 몇 번·몇 쪽" 값이 있는 기록
  };
}
function booksMessage(c, name) {
  return `🎻 바이올린 기록이 "교재별 한 줄"로 바뀌었어요. 예전 모양으로 적힌 연습 기록 ${c.records}개를 새 모양으로 옮깁니다.\n${c.moved ? `· 곡 이름 ${c.moved}개는 첫 교재의 한 줄로 옮겨요\n` : ''}${c.part ? `· "교재 몇 번·몇 쪽" ${c.part}개는 첫 교재의 한 줄에 이어 붙여요\n` : ''}값은 지우지 않아요.\n\n옮기기 전에 백업을 저장했어요. (백업 파일은 다운로드 폴더에 있어요)`;
}
async function migrateBooks() {
  if (settings.booksV1) return;
  const dirty = records.filter(booksNeedConvert);
  const real = dirty.filter((r) => !r.sample);
  if (real.length) { // 진짜 기록이 있을 때만 백업·확인을 해요 (예시 기록뿐이면 조용히 옮겨요)
    const name = `my-journal-backup-before-books-${todayStr().replace(/-/g, '')}.json`;
    await downloadBackup(name); // 옮기기 직전에 전체 백업
    if (!(await askCleanup(booksMessage(booksCounts(real), name), name))) return; // 취소하면 아무것도 바꾸지 않고, 다음에 열 때 다시 물어봐요
  }
  if (dirty.length) {
    const at = Date.now();
    const next = dirty.map((r, i) => { const c = booksCopy(r); c.updatedAt = Math.max(at + i, (r.updatedAt || 0) + 1); return c; }); // 바꾼 시각을 새로 적어서 ☁ 다른 기기에도 반영돼요
    await Store.putMany(next);
    const byId = new Map(next.map((r) => [r.id, r]));
    records = records.map((r) => byId.get(r.id) || r);
  }
  settings.booksV1 = true;
  await saveSettings();
  if (dirty.length) { render(); if (real.length) toast('바이올린 기록을 교재별 한 줄로 옮겼어요. 백업 파일은 다운로드 폴더에 있어요.', 5000); }
}

/* ---------------------------------------------------------------------
   0-4. 🎻 템포를 곡 줄로 옮기기 (한 번만): 예전에는 기록 하나에 템포가 하나(tempo)였고 그 기록에 적은 모든 곡에 적용됐어요.
        이제 템포는 곡 줄마다(books 의 각 항목 tempo · 그 밖에 연습한 곡은 otherTempo) 적어요.
        · 기록 단위 템포가 있으면 그 기록의 **첫 곡 줄**(곡 이름이 있는 첫 줄)의 템포로 옮기고, 나머지 줄은 비워요. 옮긴 뒤 기록 단위 템포(tempo)는 없애요(값은 옮긴 거예요).
        · 곡 줄이 하나도 없는 기록은 옮길 곳이 없어서 그대로 둬요 (값은 기록에 남아요).
        아직 옮기지 않은 기록은 지금까지처럼 "그 기록의 모든 곡에 적용"으로 읽어요 (tempoOfPiece).
        옮기기 직전에 백업 파일을 내려받고 확인을 물어봐요. 바뀐 기록은 바꾼 시각을 새로 적어서 ☁ 다른 기기에도 반영돼요. 한 번 하고 나면 flag(tempoV1)가 켜져요.
        예전 백업 파일을 불러올 때, 그리고 ☁ 에서 받아 올 때도 같은 규칙을 써요(violinCopy).
   --------------------------------------------------------------------- */
const tempoTargetLine = (r) => lineRows(r).find((l) => l.piece); // 곡 이름이 있는 첫 줄 (교재 줄 순서대로, 그다음 그 밖에 연습한 곡)
const tempoNeedConvert = (r) => { // 교재별 한 줄 옮기기가 끝난 기록만 (그 전에는 곡 줄이 아직 제자리에 있지 않아요)
  if (!r || r.type !== 'violin' || r.kind === '레슨' || !(tempoNum(r.tempo) > 0) || booksNeedConvert(r)) return false;
  const l = tempoTargetLine(r);
  return !!l && !l.tempo;
};
function tempoCopy(r, bump = false) {
  if (!tempoNeedConvert(r)) return r;
  const t = tempoNum(r.tempo);
  const l = tempoTargetLine(r);
  const c = { ...r };
  if (l.line === 'o') c.otherTempo = t;
  else c.books = bookRows(r).map((b) => (`b:${b.name}` === l.line ? { ...b, tempo: t } : b));
  delete c.tempo;
  if (bump) c.updatedAt = Math.max(Date.now(), (r.updatedAt || 0) + 1);
  return c;
}
// 바이올린 기록의 예전 모양을 새 모양으로 (교재별 한 줄 → 곡 줄별 템포)
const violinCopy = (r, bump = false) => tempoCopy(booksCopy(r, bump), bump);
function tempoMessage(n, name) {
  return `🎻 템포가 곡 줄마다 적는 것으로 바뀌었어요. 기록 하나에 하나였던 템포 ${n}개를 그 기록의 첫 곡 줄로 옮깁니다. (나머지 곡 줄은 비어 있어요)\n값은 지우지 않고 옮겨요.\n\n옮기기 전에 백업을 저장했어요. (백업 파일은 다운로드 폴더에 있어요)`;
}
async function migrateTempo() {
  if (settings.tempoV1 || !settings.booksV1) return; // 교재별 한 줄 옮기기를 먼저 마쳐야 해요 (취소했으면 다음에 열 때 다시)
  const dirty = records.filter(tempoNeedConvert);
  const real = dirty.filter((r) => !r.sample);
  if (real.length) { // 진짜 기록이 있을 때만 백업·확인을 해요 (예시 기록뿐이면 조용히 옮겨요)
    const name = `my-journal-backup-before-tempo-${todayStr().replace(/-/g, '')}.json`;
    await downloadBackup(name); // 옮기기 직전에 전체 백업
    if (!(await askCleanup(tempoMessage(real.length, name), name))) return; // 취소하면 아무것도 바꾸지 않고, 다음에 열 때 다시 물어봐요
  }
  if (dirty.length) {
    const at = Date.now();
    const next = dirty.map((r, i) => { const c = tempoCopy(r); c.updatedAt = Math.max(at + i, (r.updatedAt || 0) + 1); return c; }); // 바꾼 시각을 새로 적어서 ☁ 다른 기기에도 반영돼요
    await Store.putMany(next);
    const byId = new Map(next.map((r) => [r.id, r]));
    records = records.map((r) => byId.get(r.id) || r);
  }
  settings.tempoV1 = true;
  await saveSettings();
  if (dirty.length) { render(); if (real.length) toast('템포를 곡 줄로 옮겼어요. 백업 파일은 다운로드 폴더에 있어요.', 5000); }
}

/* ---------------------------------------------------------------------
   마지막 백업 날짜 기억하기
   --------------------------------------------------------------------- */
const daysSince = (dateStr) => Math.round((parseDate(todayStr()) - parseDate(dateStr)) / 86400000);

async function saveSettings() {
  try { await Store.putMany([{ id: '__meta_settings', type: 'meta', ...settings }]); } catch (e) { /* 저장 못 해도 기록은 안전해요 */ }
}

function lastBackupText() {
  if (!settings.lastBackupAt) return '아직 없어요';
  const d = daysSince(settings.lastBackupAt);
  return `${settings.lastBackupAt} (${d <= 0 ? '오늘' : `${d}일 전`})`;
}

/* ---------------------------------------------------------------------
   12. 백업·설정 창
   --------------------------------------------------------------------- */
// ⚙ 백업·설정의 "메뉴 보이기": 탭마다 ☑ 보이기 / ☐ 접어 두기 + ↑ ↓ (캘린더는 맨 앞에 고정)
function menuListHTML() {
  const m = menuState();
  return `<ul class="menu-list">
    <li class="menu-row fixed"><span class="menu-name">${esc(CAL_TAB.label)}</span><span class="meta">항상 맨 앞에 보여요</span></li>
    ${m.order.map((id, i) => {
      const t = menuTab(id);
      const on = !m.folded.has(id);
      return `<li class="menu-row" data-menu="${id}">
        <label class="menu-name"><input type="checkbox" data-act="menuShow" data-id="${id}" ${on ? 'checked' : ''}> ${esc(t.label)} <span class="meta">${on ? '보이기' : '접어 둠'}</span></label>
        <span class="menu-moves"><button type="button" class="btn ghost small" data-act="menuMove" data-id="${id}" data-d="-1" aria-label="${esc(t.label)} 위로" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn ghost small" data-act="menuMove" data-id="${id}" data-d="1" aria-label="${esc(t.label)} 아래로" ${i === m.order.length - 1 ? 'disabled' : ''}>↓</button></span>
      </li>`;
    }).join('')}
  </ul>`;
}

function openSettings() {
  const modeText = { indexeddb: '브라우저 저장소(IndexedDB)', localstorage: '브라우저 저장소(localStorage)', memory: '임시 저장(창을 닫으면 사라져요!)' }[Store.mode];
  openDlg(`
    <h2>⚙ 백업·설정</h2>
    <p class="meta">저장 방식: ${esc(modeText)}</p>
    <div class="settings-list">
      ${window.Sync ? Sync.cardHTML() : ''}
      <div class="card" style="margin:0">
        <h3>백업 파일 만들기</h3>
        <p class="meta">모든 기록(그림 포함)을 파일 하나로 저장해요. 브라우저 기록을 지우기 전이나 컴퓨터를 바꿀 때 꼭 해 두세요.</p>
        <p class="meta"><b>마지막 백업: ${esc(lastBackupText())}</b></p>
        <button type="button" class="btn" data-act="export">백업 파일 내려받기</button>
      </div>
      <div class="card" style="margin:0">
        <h3>백업 파일 불러오기</h3>
        <p class="meta">백업 파일의 기록을 지금 기록에 더해요. (같은 기록은 덮어써요)</p>
        <input type="file" id="importFile" accept=".json,application/json">
      </div>
      <div class="card" style="margin:0">
        <h3>🎉 도장과 축하 한 줄</h3>
        <p class="meta">새 기록을 저장하면 화면 아래에 💮 도장 카드(그때그때 다른 칭찬 한 줄 · 방금 저장한 내용)가 잠깐 나타나요. 점수나 평가가 아니라, 남겼다는 사실을 칭찬해요. 클로드가 써 준 "도장 문구"와 저장해 둔 피드백의 잘한 점도 가끔 나와요. 기본 문구는 <b>app.js 맨 위의 STAMPS</b>에서 고칠 수 있어요.</p>
        <label class="meta"><input type="checkbox" data-act="celebrate" ${settings.celebrateOff ? '' : 'checked'}> 새 기록을 저장할 때 도장·축하 한 줄 보이기</label>
      </div>
      <div class="card" style="margin:0">
        <h3>🎙 녹음</h3>
        ${AudioStore.ok() ? `<p class="meta">백업 파일에는 곡마다 첫 녹음만 들어가요. ${window.Sync && Sync.isEnabled() ? '☁ 동기화를 켜 두어서 <b>녹음도 Drive에 올라가요.</b> (백업 파일과는 별개예요)' : '나머지는 이 브라우저에만 저장돼서, 사이트 데이터를 지우면 사라져요. (☁ 동기화를 켜면 녹음도 Drive에 올라가요)'}</p>
        <label class="meta"><input type="checkbox" data-act="audioSkip" ${settings.audioSkip ? 'checked' : ''}> 녹음은 백업에서 빼기 <span class="hint">(켜면 첫 녹음도 백업 파일에 넣지 않아요)</span></label>
        <p class="meta audio-size" style="margin:8px 0 0">이 기기에 저장된 녹음 ${esc(fmtMB(audios.filter((a) => a.local).reduce((n, a) => n + (a.size || 0), 0)))}</p>` : '<p class="meta">이 브라우저에서는 녹음을 저장할 수 없어요. 크롬에서 열어 주세요.</p>'}
      </div>
      <div class="card" style="margin:0">
        <h3>🍂 계절 장식</h3>
        <p class="meta">달마다 위쪽 제목 옆과 화면 오른쪽 아래에 작은 그림이 바뀌어요. 그림은 <b>app.js 맨 위의 SEASON_DECOR</b>에서 고칠 수 있어요.</p>
        <label class="meta"><input type="checkbox" data-act="season" ${settings.seasonOff ? '' : 'checked'}> 계절 장식 보기</label>
      </div>
      <div class="card" style="margin:0">
        <h3>📖 이번 달 돌아보기</h3>
        <p class="meta">돌아보기 맨 위에 나오는 묶음을 끄고 켤 수 있어요. 끄면 그 묶음만 안 보이고 기록은 그대로예요.</p>
        <div id="recapToggles">${RECAP_SECTIONS.filter((x) => x.label).map((x) => `<label class="meta recap-toggle"><input type="checkbox" data-act="recapShow" data-id="${esc(x.id)}" ${recapOff().includes(x.id) ? '' : 'checked'}> ${esc(x.label)} 보이기</label>`).join('')}</div>
      </div>
      <div class="card" style="margin:0">
        <h3>메뉴 보이기</h3>
        <p class="meta">📅 캘린더는 항상 맨 앞에 보여요. 나머지는 <b>☐ 접어 두기</b>로 바꾸면 메뉴 끝의 ‹ 버튼 안으로 들어가요. ↑ ↓ 로 순서를 바꿔요. 접어 둔 탭의 기록도 캘린더·돌아보기·🤖 범위에는 그대로 나와요.</p>
        <div id="menuList">${menuListHTML()}</div>
      </div>
      <div class="card" style="margin:0">
        <h3>모든 기록 지우기</h3>
        <p class="meta">되돌릴 수 없어요. 먼저 백업을 해 두는 걸 권해요.</p>
        <button type="button" class="btn danger" data-act="clearAll">모든 기록 지우기</button>
      </div>
    </div>
    <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`);
}

const exportBackup = () => downloadBackup(`나의기록장-백업-${todayStr()}.json`);

async function downloadBackup(filename) {
  const payload = await backupPayload();
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  settings.lastBackupAt = todayStr();
  await saveSettings();
  if (dlg.open && dlg.querySelector('[data-act=export]')) openSettings(); // 설정 창의 날짜 새로 고침
}

async function importBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    const good = validRecords(payload, true);
    if (!good) throw new Error('형식 오류');
    if (!good.length) throw new Error('가져올 기록이 없어요');
    const audioCount = Array.isArray(payload.audios) ? payload.audios.length : 0;
    if (!confirm(`기록 ${good.length}개${audioCount ? `와 녹음 ${audioCount}개` : ''}를 불러올까요?`)) return;
    const goneIds = new Set(tombstones.map((t) => t.id)); // 지웠던 기록을 백업에서 되살리는 경우는 "새로 고친 것"으로 봐요 (☁ 동기화에서 삭제가 다시 덮어쓰지 않게)
    good.forEach((r) => { if (goneIds.has(r.id)) r.updatedAt = Date.now(); });
    await Store.putMany(good);
    records = await loadRecords();
    const addedAudio = await importAudios(payload); // 이 브라우저에 있던 녹음은 그대로 두고, 없던 것만 더해요
    closeDlg();
    render();
    alert(`${good.length}개를 불러왔어요.${addedAudio ? `\n녹음 ${addedAudio}개도 불러왔어요.` : ''}`);
  } catch (e) {
    alert('백업 파일을 읽지 못했어요. 이 사이트에서 만든 백업 파일이 맞는지 확인해 주세요.');
  }
}

/* ---------------------------------------------------------------------
   13. 클릭·입력 처리
   --------------------------------------------------------------------- */
document.addEventListener('click', async (e) => {
  // 바깥(어두운 부분)을 누르면 창 닫기 (입력 중인 창은 실수로 닫히지 않게 제외)
  if (e.target === dlg2) { dlg2.close(); return; }
  if (e.target === dlg) { if (!dlg.querySelector('#recForm')) closeDlg(); return; }

  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT' && el.type === 'checkbox') return;
  const { act, id, type } = el.dataset;

  switch (act) {
    case 'tab':
      if (ui.tab !== id && !(await confirmLeaveNote())) break; // 저장하지 않은 한 줄이 있으면 물어봐요
      if (ui.tab !== id) { ui.vnView = 'records'; ui.econView = 'routine'; ui.termAdding = false; ui.termEdit = null; ui.termQuery = ''; ui.weekStart = null; } // 다른 메뉴에서 들어오면 늘 첫 칩(기록)부터 (🗓 이번 주는 이번 주부터)
      ui.tab = id; ui.query = '';
      render(); window.scrollTo(0, 0); break;
    case 'setView': ui[el.dataset.key] = id; if (el.dataset.key === 'econView') { ui.termAdding = false; ui.termEdit = null; ui.termQuery = ''; } render(); break;
    case 'termsOpen': ui.econView = 'terms'; ui.termAdding = false; ui.termEdit = null; ui.termQuery = ''; render(); window.scrollTo(0, 0); break;
    case 'termAdd': ui.termAdding = true; ui.termEdit = null; refreshTerms(); { const f = $('#tm_term'); if (f) f.focus(); } break;
    case 'termEdit': ui.termEdit = id; ui.termAdding = false; refreshTerms(); { const f = $('#tm_term'); if (f) f.focus(); } break;
    case 'termCancel': ui.termEdit = null; ui.termAdding = false; refreshTerms(); break;
    case 'termDelete': await deleteTerm(id); break;
    case 'wkShift': ui.weekStart = addDays(ui.weekStart || weekStartOf(todayStr()), 7 * Number(el.dataset.d)); render(); break; // 🗓 ◀ ▶ 주 이동
    case 'wkToday': if (ui.weekStart) { ui.weekStart = null; render(); } break; // 🗓 [이번 주] (이미 이번 주면 아무 일도 없어요)
    case 'wkPaste': openDlg(`<h2>📋 기본 시간표 붙여 넣기</h2>${pasteBoxHTML()}`, true); syncPasteBox(); break;
    case 'wkCheck': if (!el.disabled) await setWeekCheck(el.dataset.date, Number(el.dataset.i || 0), el.getAttribute('aria-pressed') !== 'true'); break; // 🗓 표에서 운동 블록을 누르면 했어요 체크 켜기·끄기
    case 'wkAi': openWeekAi(); break;
    case 'wkAiApply': await applyWeekAi(); break;
    case 'wkReset': await resetWeekToBase(); break;
    case 'wkPasteApply': await applyPaste(); break;
    case 'menuFold': await saveMenu({ open: !menuState().open }); break; // ‹ ›: 접어 둔 탭 펼치기·접기
    case 'menuMove': { // ↑ ↓
      const m = menuState();
      const i = m.order.indexOf(id); const j = i + Number(el.dataset.d);
      if (i >= 0 && j >= 0 && j < m.order.length) {
        const order = [...m.order];
        [order[i], order[j]] = [order[j], order[i]];
        await saveMenu({ order });
        const box = $('#menuList'); if (box) box.innerHTML = menuListHTML();
      }
      break;
    }
    case 'artOpen': openArt(id); break;
    case 'artNav': artNav(Number(el.dataset.d)); break;
    case 'add': openForm(type); break;
    case 'edit': openForm(type, records.find((r) => r.id === id)); break;
    case 'del': {
      const r = records.find((x) => x.id === id);
      const name = r ? (r.type === 'rest' ? '쉰 날' : (r.topic || (r.type === 'violin' ? pieceNamesOf(r)[0] : r.piece) || r.asset || r.kind || '이 기록')) : '이 기록';
      if (confirm(`'${name}' 기록을 지울까요?\n지운 기록은 되돌릴 수 없어요.`)) {
        await deleteRecord(id); render(); refreshDay();
        if (ui.artOpen === id && dlg.querySelector('.art-detail')) closeDlg(); // 열어 둔 그림 상세 창이면 닫아요
      }
      break;
    }
    case 'closeDlg':
      if (ui.backToDay && dlg.querySelector('#recForm')) openDay(ui.backToDay);
      else if (ui.backToArt && dlg.querySelector('#recForm') && records.some((r) => r.id === ui.backToArt)) openArt(ui.backToArt, ui.artPhoto);
      else closeDlg();
      break;
    case 'calDay': openDay(el.dataset.date); break;
    case 'addOn': openForm(type, undefined, el.dataset.date); break;
    case 'calShift': ui.calMonth = shiftMonth(ui.calMonth, Number(el.dataset.d)); render(); break;
    case 'calToday': { // 이번 달로 가기만 해요 (이미 이번 달이면 아무 일도 없어요)
      const ym = todayStr().slice(0, 7);
      if (ui.calMonth !== ym) { ui.calMonth = ym; render(); }
      break;
    }
    case 'boardToday': { const ym = todayStr().slice(0, 7); if (ui.boardMonth !== ym) openBoard(ym); break; }
    case 'calCat':
      if (ui.calHidden.has(id)) ui.calHidden.delete(id); else ui.calHidden.add(id);
      render();
      break;
    case 'clearImage': formImages[el.dataset.key] = null; updateImagePreview(el.dataset.key); break;
    case 'moveShot': { // 사진 순서 바꾸기
      const i = Number(el.dataset.i); const j = i + Number(el.dataset.d);
      if (j >= 0 && j < formShots.length) { [formShots[i], formShots[j]] = [formShots[j], formShots[i]]; updateShotsPreview(); }
      break;
    }
    case 'removeShot': formShots.splice(Number(el.dataset.i), 1); updateShotsPreview(); { const n = $('#imgNote'); if (n) n.textContent = ''; } break;
    case 'pick': { // 칩 버튼: 하나짜리는 다시 누르면 풀리고, 여러 개짜리는 눌러서 켜고 끄기
      const box = el.closest('.choice');
      const input = box.querySelector('input[type=hidden]');
      if (box.dataset.multi === '1') {
        if (input.name === 'books' && el.classList.contains('on')) { // 교재 칩을 끄면 그 줄(곡 · 템포 · 녹음)도 사라져요
          const line = `b:${el.dataset.val}`;
          const n = savedLineAudios(line).length;
          if (n && !confirm(`붙인 녹음 ${n}개는 곡 노트에 그대로 남아요.\n이 교재 줄을 끌까요?`)) break;
          if (staged.some((s) => s.line === line)) { staged = staged.filter((s) => s.line !== line); stopStagedPlayer(); } // 저장 전에 고른 녹음은 붙지 않아요
        }
        el.classList.toggle('on');
        el.setAttribute('aria-pressed', String(el.classList.contains('on')));
        input.value = JSON.stringify([...box.querySelectorAll('.choice-btn.on')].map((b) => b.dataset.val));
        if (input.name === 'books') syncBookRows();
      } else {
        const on = input.value !== el.dataset.val;
        input.value = on ? el.dataset.val : '';
        box.querySelectorAll('.choice-btn').forEach((b) => { b.classList.toggle('on', on && b === el); b.setAttribute('aria-pressed', String(on && b === el)); });
        if (input.name === 'artKind' && input.form) syncKindFields(input.form); // 종류가 모작일 때만 "원본 사진" 칸이 보여요
      }
      break;
    }
    case 'rest': await toggleRest(el.dataset.date); break;
    case 'recap': openRecap(); break;
    case 'routineChip': await toggleRoutineChip(el.dataset.date, el.dataset.chip); break;
    case 'pastNotes': openPastNotes(); break;
    case 'routineStamp': { const say = $('#wkStampSay'); if (say) { say.textContent = dayWithDow(el.dataset.date); say.hidden = false; } break; } // 경제 "이번 주" 도장을 누르면 그 날짜만 작게
    case 'playRec': await toggleCardPlay(el.dataset.aid); break;
    case 'claudePeriod': ui.claudePeriod = id; syncClaudeBox(); break;
    case 'claudeScope': ui.claudeScope = id; if (!ui.claudePending) ui.fbSaveScope = null; syncClaudeBox(); break; // 방금 복사한 것이 없으면 ② 의 범위도 따라와요
    case 'claudeCopy': await claudeCopy(); break;
    case 'claudeSettings': clDraft = {}; openClaudeSettings(); break;
    case 'clScope': { const f = $('#clForm'); if (f) clDraft[f.dataset.scope] = { info: f.elements.info.value, request: f.elements.request.value }; openClaudeSettings(id); break; }
    case 'clReset': { const f = $('#clForm'); const m = scopeMeta(f.dataset.scope); f.elements[el.dataset.field].value = m[el.dataset.field]; break; }
    case 'clCancel': clDraft = {}; closeDlg(); break;
    case 'fbSave': await fbSave(); break;
    case 'fbSaveScope': ui.fbSaveScope = id; syncFbSave(); break;
    case 'fbGo': goToFeedbackOf(id); break;
    case 'fbScope': ui.fbScope = id; ui.fbCount = 5; refreshFbList(); break;
    case 'fbListMore': ui.fbCount += 5; refreshFbList(); break;
    case 'fbMore': if (ui.fbOpenText.has(id)) ui.fbOpenText.delete(id); else ui.fbOpenText.add(id); refreshFbList(); break;
    case 'fbEdit': openFeedbackEdit(id); break;
    case 'fbDelete': if (confirm('이 피드백을 지울까요?\n지운 피드백은 되돌릴 수 없어요.')) { await deleteRecord(id); afterFeedbackChange(); } break;
    case 'manageBooks': openBooksManager(); break;
    case 'closeDlg2': dlg2.close(); break;
    case 'bookMove': await moveBook(Number(el.dataset.i), Number(el.dataset.d)); break;
    case 'bookHide': await hideBook(Number(el.dataset.i), true); break;
    case 'bookShow': await hideBook(Number(el.dataset.i), false); break;
    case 'delAudio': await deleteRecording(el.dataset.aid); break;
    case 'saveAudio': await saveAudioFile(el.dataset.aid); break;
    case 'fetchAudio': await fetchAudioFile(el.dataset.aid); break;
    case 'unstage': { // 저장 전에 고른 녹음 빼기 (곡 줄에서 뺀 것은 붙지 않아요)
      const sg = staged.find((x) => x.sid === el.dataset.sid);
      if (stagedPlayer.sid === el.dataset.sid) stopStagedPlayer();
      staged = staged.filter((x) => x.sid !== el.dataset.sid);
      if (sg && sg.line) renderLineRecs(sg.line); else renderStaged();
      break;
    }
    case 'lineAttach': { // 🎙 녹음 붙이기: 곡 이름이 있어야 해요
      if (needPieceFirst(el.dataset.line)) break;
      const inp = [...dlg.querySelectorAll('[data-line-input]')].find((i) => i.dataset.lineInput === el.dataset.line);
      if (inp) inp.click();
      break;
    }
    case 'playStaged': await toggleStagedPlay(el.dataset.sid); break;
    case 'uploadStaged': {
      const box = dlg.querySelector('#pieceAudio');
      if (!box || !staged.some((x) => !x.line)) break;
      const n = await commitStaged(box.dataset.piece, '');
      refreshAudioUI();
      if (n) toast(`녹음 ${n}개를 올렸어요.`, 2500);
      break;
    }
    case 'pieceDone': await togglePieceDone(el.dataset.piece); break;
    case 'board': openBoard(ui.calMonth || todayStr().slice(0, 7)); break;
    case 'boardShift': openBoard(shiftMonth(ui.boardMonth, Number(el.dataset.d))); break;
    case 'boardGo': goToStamp(id); break;
    case 'boardSay': showStampSay(id); break;
    case 'goto': goToRecord(id); break;
    case 'piece': openPiece(el.dataset.piece); break;
    case 'cleanYes': answerCleanup(true); break;
    case 'cleanNo': answerCleanup(false); break;
    case 'cleanRestore': { const f = $('#cleanRestoreFile'); if (f) f.click(); break; }
    case 'export': exportBackup(); break;
    case 'clearAll':
      if (confirm(`정말 모든 기록을 지울까요? 되돌릴 수 없어요.${audios.length ? '\n곡에 붙여 둔 녹음도 함께 지워져요.' : ''}${window.Sync && Sync.isEnabled() ? '\n\n☁ 동기화가 켜져 있어서 Drive와 다른 기기에서도 지워져요.\n(이 기기에서만 지우려면 먼저 ☁ 에서 로그아웃해 주세요.)' : ''}`)) {
        const tombs = records.filter(isSyncedRecord).map(makeTomb); // 지운 흔적을 남겨서 다른 기기도 따라 지워요
        if (tombs.length) await Store.putMany(tombs);
        await Store.remove(records.filter((r) => !isSyncedRecord(r)).map((r) => r.id));
        tombstones = [...tombstones.filter((t) => !tombs.some((x) => x.id === t.id)), ...tombs];
        records = [];
        if (audios.length || audioTombs.length) { // 녹음도 지워요. 지운 흔적은 남겨서 ☁ 다른 기기와 Drive도 따라 지워요 (Drive 파일은 휴지통으로 가요)
          const at = Date.now();
          const atombs = audios.map((a, i) => ({ id: a.id, piece: a.piece, deletedAt: at + i, updatedAt: Math.max(at + i, (a.updatedAt || 0) + 1), rf: a.rf || '' }));
          try { await AudioStore.clear(); for (const t of atombs) await AudioStore.put(t); } catch (err) { /* 괜찮아요 */ }
          audioTombs = [...audioTombs.filter((t) => !atombs.some((x) => x.id === t.id)), ...atombs];
          audios = []; audioB64.clear();
          if (window.Sync) window.Sync.notify();
        }
        closeDlg(); render();
      }
      break;
    default: break;
  }
});

/* ---------------------------------------------------------------------
   한글 입력 중(글자를 조합하는 중) Enter 는 저장하지 않아요.
   한 줄짜리 입력란은 폼 안에 있어서 Enter 를 누르면 브라우저가 폼을 바로 보내요. 그런데 한글을 치다가 누르는 Enter 는
   "마지막 글자를 확정"하려는 것이라, 그때 저장되면 마지막 글자가 빠지거나 두 번 저장될 수 있어요. (휴대폰 키보드에서 특히 그래요)
   keydown(조합 중 Enter 를 눌렀을 때)과 submit(폼이 보내질 때) 두 곳에서 막아요. 조합이 끝난 뒤 다시 누른 Enter 부터 저장돼요.
   --------------------------------------------------------------------- */
let imeOn = false;   // 지금 글자를 조합하는 중인지
let imeAt = 0;       // 조합이 마지막으로 움직인 시각 (compositionstart·update·input). 끝났다는 신호(compositionend)가 안 와도 오래되면 조합이 끝난 것으로 봐요
let imeEndAt = 0;    // 마지막으로 조합이 끝난 시각
let imeEnterAt = 0;  // 조합 중(또는 막 끝난 직후)에 Enter 가 눌린 시각
const IME_GRACE = 150; // 조합이 끝난 직후 이 시간(ms) 안에 오는 Enter 는 "글자 확정"으로 봐요
const IME_STALE = 3000; // 조합이 이만큼(ms) 아무 움직임이 없으면 "조합 중" 표시가 남아 있어도 풀어요 (입력 창이 조합 도중에 닫히는 경우 등)
const IME_SUBMIT_GAP = 60; // 그런 Enter 로 곧바로 이어진 폼 보내기는 막아요 (일부러 다시 누른 Enter 는 이보다 늦어서 괜찮아요)
const imeTouch = () => { imeAt = Date.now(); };
document.addEventListener('compositionstart', () => { imeOn = true; imeTouch(); }, true);
document.addEventListener('compositionupdate', imeTouch, true);
document.addEventListener('input', (e) => { if (e.isComposing) imeTouch(); }, true);
document.addEventListener('compositionend', () => { imeOn = false; imeEndAt = Date.now(); }, true);
document.addEventListener('focusout', () => { imeOn = false; }, true); // 다른 곳으로 옮기면 조합은 끝나요
const imeBusy = (e) => !!(e && (e.isComposing || e.keyCode === 229)) || (imeOn && Date.now() - imeAt < IME_STALE) || Date.now() - imeEndAt < IME_GRACE;
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !imeBusy(e)) return;
  imeEnterAt = Date.now();
  if (e.target && e.target.tagName === 'INPUT') e.preventDefault(); // 한 줄짜리 입력란: 브라우저가 폼을 바로 보내지 못하게 해요
}, true);

// 저장을 두 번 누르거나(Enter 두 번) 저장하는 중에 또 보내지 않게, 폼마다 잠깐 잠가요
const busyForms = new WeakSet();
async function once(form, fn) {
  if (busyForms.has(form)) return;
  busyForms.add(form);
  try { await fn(); } finally { setTimeout(() => busyForms.delete(form), 400); }
}

document.addEventListener('submit', (e) => {
  if (Date.now() - imeEnterAt < IME_SUBMIT_GAP) { e.preventDefault(); e.stopImmediatePropagation(); return; } // 글자를 확정하는 Enter 로 보내진 폼은 저장하지 않아요
  const f = e.target;
  if (f.id === 'recForm') { e.preventDefault(); once(f, () => submitForm(f)); }
  else if (f.id === 'clForm') { e.preventDefault(); once(f, () => saveClaudeSettings()); }
  else if (f.id === 'fbEditForm') { e.preventDefault(); once(f, () => saveFeedbackEdit(f)); }
  else if (f.id === 'bookAddForm') { e.preventDefault(); once(f, () => addBook(f.elements[0].value)); }
  else if (f.id === 'rtNoteForm') { e.preventDefault(); once(f, () => saveRoutineNote(f.dataset.date)); }
  else if (f.id === 'termForm') { e.preventDefault(); once(f, () => saveTerm(f)); }
  else if (f.id === 'pieceMemoForm') { e.preventDefault(); once(f, () => savePieceMemo(f.dataset.piece, f.elements.memo.value.trim())); }
}, true);

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.routine && t.type === 'checkbox') { await setRoutineCheck(t.dataset.date, t.dataset.routine, t.checked); }
  else if (t.id === 'f_kind' && t.form && t.form.id === 'recForm') { syncKindFields(t.form); }
  else if (t.id === 'f_date') { // 날짜를 바꾸면 "새벽 4시 전이라 어제 기록" 안내는 사라져요
    const n = t.parentElement.querySelector('.dawn-note');
    if (n) n.hidden = t.value !== n.dataset.date;
  }
  else if (t.dataset.cal) {
    const [cy, cm] = ui.calMonth.split('-').map(Number);
    const ny = t.dataset.cal === 'year' ? Number(t.value) : cy;
    const nm = t.dataset.cal === 'month' ? Number(t.value) : cm;
    ui.calMonth = `${ny}-${pad(nm)}`;
    render();
  }
  else if (t.id === 'importFile' && t.files[0]) { await importBackup(t.files[0]); }
  else if (t.id === 'cleanRestoreFile' && t.files[0]) { const f = t.files[0]; t.value = ''; await importBackup(f); } // 정리 확인 창의 "정리 전 백업 파일 불러오기"
  else if (t.dataset.imageInput && t.files[0]) { await attachImage(t.files[0], t.dataset.imageInput); t.value = ''; }
  else if ('shots' in t.dataset && t.files.length) { const files = [...t.files]; t.value = ''; await attachShots(files); }
  else if (t.dataset.act === 'celebrate') { settings.celebrateOff = !t.checked; await saveSettings(); }
  else if (t.dataset.lineInput && t.files.length) { const files = [...t.files]; t.value = ''; await stageLineFiles(t.dataset.lineInput, files); } // 🎙 곡 줄의 녹음 고르기
  else if (t.matches('[data-audio-input]') && t.files.length) { const files = [...t.files]; t.value = ''; await stageAudioFiles(files); }
  else if (t.dataset.audioMemo) { await saveAudioMemo(t.dataset.audioMemo, t.value.trim()); }
  else if (t.dataset.act === 'audioSkip') { settings.audioSkip = t.checked; await saveSettings(); }
  else if (t.dataset.act === 'season') { settings.seasonOff = !t.checked; await saveSettings(); applySeason(); }
  else if (t.dataset.act === 'recapShow') { // 돌아보기 묶음 보이기·끄기 (설정 값으로 저장)
    const off = new Set(recapOff());
    if (t.checked) off.delete(t.dataset.id); else off.add(t.dataset.id);
    await setConfig('recapOff', [...off]);
  }
  else if (t.dataset.act === 'menuShow') { // ☑ 보이기 / ☐ 접어 두기
    const folded = new Set(menuState().folded);
    if (t.checked) folded.delete(t.dataset.id); else folded.add(t.dataset.id);
    await saveMenu({ folded: [...folded] });
    const box = $('#menuList'); if (box) box.innerHTML = menuListHTML();
  }
});

// 받은 답변을 붙여 넣는 순간 "잘한 점" 줄을 찾아 체크 목록으로 보여 줘요 (붙여 넣은 글이 칸에 들어간 뒤에 읽어요)
document.addEventListener('paste', (e) => {
  const ta = e.target && e.target.closest && e.target.closest('#fbInput [data-fb=text]');
  if (ta) setTimeout(() => renderStrengths(ta.closest('#fbInput'), extractStrengths(ta.value)), 0);
});

document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('#fbInput [data-fb=text]') && !e.target.value.trim()) { renderStrengths(e.target.closest('#fbInput'), []); return; } // 답변을 다 지우면 체크 목록도 사라져요
  if (e.target.id === 'claudeQ') { ui.claudeQuestion[ui.claudeScope] = e.target.value; syncClaudeBox(); return; } // 복사할 글 미리보기
  if (e.target.dataset && 'routineNote' in e.target.dataset) { ui.noteDraft = { date: e.target.dataset.date, text: e.target.value }; ui.noteSavedUntil = 0; syncNoteBtn(e.target.dataset.date); return; } // 오늘 한 줄: 고치면 다시 [저장]
  if (e.target.dataset && e.target.dataset.stage) { // 올리려는 녹음의 날짜·메모
    const s = staged.find((x) => x.sid === e.target.dataset.sid);
    if (s) s[e.target.dataset.stage] = e.target.value;
    return;
  }
  if (e.target.matches && e.target.matches('#recForm [data-book-piece], #recForm #f_piece')) { syncLineDim(); return; } // 곡 이름을 적으면 그 줄의 템포·녹음 줄이 또렷해져요
  if (e.target.id === 'wkPasteText') { syncPasteBox(); return; } // 붙여 넣은 시간표 미리보기
  if (e.target.id === 'wkAiText') { syncWeekAi(); return; } // 🗓 클로드 시간표: 붙여 넣은 글을 읽어 표로 미리 보여 줘요
  if (e.target.id === 'termSearch') { ui.termQuery = e.target.value; const list = $('#termList'); if (list) list.innerHTML = termListHTML(); return; } // 찾는 말에 따라 목록만 새로 그려요 (입력 칸은 그대로)
  if (e.target.id === 'search') { ui.query = e.target.value; $('#listBox').innerHTML = econBodyHTML(); }
});

$('#settingsBtn').addEventListener('click', openSettings);

// 창이 닫히면(취소·Esc 포함) 안에 있던 입력 내용도 비워요
dlg.addEventListener('close', () => { if (cleanupAsk) { const a = cleanupAsk; cleanupAsk = null; a.resolve(false); } revokeAudioUrls(dlg); stopStagedPlayer(); dlg.innerHTML = ''; formImages = {}; formShots = []; staged = []; formBase = ''; ui.dayOpen = null; ui.backToDay = null; ui.backToArt = null; ui.artOpen = null; });

/* ---------------------------------------------------------------------
   데스크톱 단축키: 입력 창에서 Cmd+Enter(Ctrl+Enter)로 저장, Esc로 닫기
   (뭔가 적어 둔 창을 Esc로 닫을 때는 한 번 물어봐요)
   --------------------------------------------------------------------- */
function requestClose() {
  if (!dlg.open) return;
  if (isFormDirty() && !confirm('적어 둔 내용이 있어요.\n저장하지 않고 닫을까요?')) return;
  if (ui.backToDay && dlg.querySelector('#recForm')) openDay(ui.backToDay);
  else if (ui.backToArt && dlg.querySelector('#recForm') && records.some((r) => r.id === ui.backToArt)) openArt(ui.backToArt, ui.artPhoto);
  else closeDlg();
}

document.addEventListener('keydown', (e) => {
  if (dlg2.open) { if (e.key === 'Escape') { e.preventDefault(); dlg2.close(); } return; } // 작은 창(교재 관리)이 열려 있으면 그것만 닫아요
  if (!dlg.open) return;
  if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && dlg.querySelector('.art-detail') && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); artNav(e.key === 'ArrowLeft' ? -1 : 1); return; }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !imeBusy(e)) {
    const form = dlg.querySelector('#recForm');
    if (form) { e.preventDefault(); form.requestSubmit(); }
  }
});
dlg.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); }); // 위에서 못 잡은 경우를 위한 예비

/* ---------------------------------------------------------------------
   14. 시작
   --------------------------------------------------------------------- */
async function loadRecords() {
  const all = await Store.all();
  const st = all.find((r) => r.id === '__meta_settings');
  if (st) settings = { lastBackupAt: st.lastBackupAt || null, celebrateOff: !!st.celebrateOff, audioSkip: !!st.audioSkip, seasonOff: !!st.seasonOff, cleanupV2: !!st.cleanupV2, cleanupV3: !!st.cleanupV3, artKindV1: !!st.artKindV1, workoutLiteV1: !!st.workoutLiteV1, quickFlagV1: !!st.quickFlagV1, booksV1: !!st.booksV1, tempoV1: !!st.tempoV1, weekLegacyV1: !!st.weekLegacyV1, simplifyV2: !!st.simplifyV2, claudeBoxOpen: !!st.claudeBoxOpen };
  const rows = all.filter((r) => r.type !== 'meta');
  tombstones = rows.filter(isTomb); // 삭제 표시는 화면용 기록에 넣지 않아요
  const live = rows.filter((r) => !isTomb(r)).map(normalizeRecord);
  // 바꾼 시각(updatedAt)이 없던 예전 기록은 만든 시각으로 한 번 채워 둬요 (☁ 동기화가 기준으로 써요)
  const missing = live.filter((r) => !r.updatedAt);
  if (missing.length) {
    missing.forEach((r) => { r.updatedAt = r.createdAt || Date.parse(`${r.date}T12:00:00`) || Date.now(); });
    try { await Store._putMany(missing); } catch (e) { /* 저장하지 못해도 이번 사용에는 문제없어요 */ }
  }
  return live;
}

// 🎨 그림 "단계"를 "종류"로 한 번만 바꿔 적어 둬요 (그대로 모작·조금 바꿔 그리기 → 모작, 창작 → 창작, 없으면 모작).
//   예전 값(단계·원작자 등)은 그대로 남겨요. 바뀐 기록은 바꾼 시각도 새로 적어서 ☁ 다른 기기에도 반영돼요. 한 번 하고 나면 flag(artKindV1)가 켜져요.
async function migrateArtKinds() {
  if (settings.artKindV1) return;
  const at = Date.now();
  const todo = records.filter((r) => r.type === 'art' && !ART_KINDS.includes(r.artKind));
  if (todo.length) {
    const next = todo.map((r, i) => ({ ...r, artKind: artKindOf(r), updatedAt: Math.max(at + i, (r.updatedAt || 0) + 1) }));
    try { await Store.putMany(next); } catch (e) { return; } // 저장하지 못하면 다음에 다시 해요
    const byId = new Map(next.map((r) => [r.id, r]));
    records = records.map((r) => byId.get(r.id) || r);
  }
  settings.artKindV1 = true;
  await saveSettings();
}

async function start() {
  await Store.init();
  records = await loadRecords();
  await AudioStore.init();
  const audioRows = await AudioStore.all();
  loadAudioRows(audioRows); // 녹음 파일은 재생할 때만 꺼내 와요 (여기서는 정보만 메모리에 둬요)
  backfillAudioTimes(audioRows);
  try { await Store._remove(['__meta_autosave']); } catch (e) { /* 예전 자동 저장 연결 정보는 이제 쓰지 않아요 (없어도 괜찮아요) */ }
  if (Store.mode === 'memory') {
    const n = $('#notice');
    n.hidden = false;
    n.textContent = '⚠ 이 브라우저에서는 기록을 저장할 수 없어요. 창을 닫으면 사라지니, 다른 브라우저(크롬 등)로 열어 주세요.';
  }
  await migrateArtKinds();
  await migrateQuickFlags();
  render();
  window.__journalReady = true;
  document.dispatchEvent(new Event('journal:ready')); // ☁ 동기화(sync.js)가 이때부터 시작해요
  setTimeout(() => { // 화면이 먼저 보인 뒤에 물어봐요
    runUpdateCleanup().catch(() => { /* 정리하지 못하면 다음에 열 때 다시 해요 */ })
      .then(() => migrateWorkoutLite()).catch(() => { /* 정리하지 못하면 다음에 열 때 다시 해요 */ })
      .then(() => migrateWeekLegacy()).catch(() => { /* 정리하지 못하면 다음에 열 때 다시 해요 */ })
      .then(() => migrateBooks()).catch(() => { /* 옮기지 못하면 다음에 열 때 다시 해요 */ })
      .then(() => migrateTempo()).catch(() => { /* 옮기지 못하면 다음에 열 때 다시 해요 */ })
      .then(() => migrateSimplify()).catch(() => { /* 정리하지 못하면 다음에 열 때 다시 해요 */ })
      .finally(() => {
        window.__cleanupDone = true;
        document.dispatchEvent(new Event('journal:cleanup-done')); // 정리 확인이 끝난 뒤에 첫 동기화를 해요
      });
  }, 500);
}

// 휴대폰: 입력 칸을 누르면 화면 키보드가 올라와도 그 칸이 가려지지 않게 가운데로 보여줘요. (컴퓨터 화면에서는 아무 일도 하지 않아요)
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (!t || !t.matches || !t.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select')) return;
  if (!window.matchMedia('(max-width: 900px)').matches) return;
  setTimeout(() => { try { if (document.activeElement === t) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { /* 괜찮아요 */ } }, 300);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (ui.tab === 'cal' || ui.tab === 'econ' || ui.tab === 'week') && !dlg.open && view.dataset.today && view.dataset.today !== todayStr()) render();
});

start().catch((err) => {
  view.innerHTML = `<div class="notice" style="max-width:none">시작하는 중 문제가 생겼어요: ${esc(err.message)}<br>크롬 같은 다른 브라우저로 열어 보세요.</div>`;
});
