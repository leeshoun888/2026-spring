# AI 광고 기획 에이전트 웹앱 제작 프롬프트

## 🎯 프로젝트 개요

Claude Opus 4.7 API 기반의 **기업 납품용 AI 광고 기획 에이전트 웹앱**을 제작해줘. 사원들이 자연어로 광고 요구사항을 입력하면 AI가 아이디어를 브레인스토밍하고, 최종적으로 **Seedance 2.0 영상 생성 모델용 JSON 프롬프트**를 출력하는 도구야. 출력된 JSON은 사용자가 복사해서 힉스필드(Higgsfield)에서 Seedance 2.0으로 15초짜리 광고 영상을 생성할 때 사용해.

## 📐 핵심 용어 정의

- **프로젝트(Project)**: 한 사원 계정의 전체 작업 공간 (그 사람의 모든 광고 작업의 합)
- **캠페인(Campaign)**: 프로젝트 안의 개별 광고 건 (폴더처럼 축적/관리되는 단위)
- 즉, 한 사원이 로그인하면 → 자기 프로젝트에 들어감 → 그 안에 여러 캠페인이 있음 → 각 캠페인 = 하나의 15초 광고 기획 건

---

## 🛠 기술 스택 (필수)

- **프론트엔드**: Next.js 14+ (App Router) + TypeScript
- **스타일링**: Tailwind CSS + Framer Motion (Apple 스타일 애니메이션)
- **폰트**: SF Pro Display (Apple 공식 느낌) 또는 Inter 폴백. 한국어는 Pretendard
- **백엔드/DB**: Supabase (PostgreSQL + Auth + Row Level Security)
- **인증**: Supabase Auth - Google OAuth 로그인
- **AI API**: Anthropic Claude API (`claude-opus-4-7` 모델 사용)
- **API Key 관리**: 관리자가 Supabase DB의 `admin_settings` 테이블에 암호화 저장. 서버사이드(Next.js API Routes)에서만 꺼내 사용하여 클라이언트에 절대 노출하지 않음.
- **배포 대상**: Vercel
- **상태관리**: Zustand (가볍고 Apple스러운 반응성)

---

## 🗄 Supabase 데이터 스키마

```sql
-- 사용자 프로필 (Supabase Auth와 연결)
create table profiles (
  id uuid references auth.users primary key,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- 관리자 설정 (API Key 등)
create table admin_settings (
  id int primary key default 1,
  anthropic_api_key_encrypted text,
  updated_at timestamptz default now()
);

-- 캠페인 (개별 광고 기획 건)
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null default '제목 없는 캠페인',
  brand text,
  category text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 캠페인 내 채팅 메시지 (전체 대화 히스토리 보존)
create table messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns on delete cascade not null,
  role text check (role in ('user', 'assistant')) not null,
  content text not null,
  metadata jsonb, -- 아이디어 카드, JSON 결과물 등 부가 데이터
  created_at timestamptz default now()
);

-- 아이디어 카드 (5개씩 생성되는 광고 아이디어)
create table ideas (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns on delete cascade not null,
  batch_number int not null, -- 1차 생성=1, 추가 생성=2...
  card_index int not null,   -- 배치 내 1~5, 수정본은 6~
  title text not null,
  description text not null,
  parent_idea_id uuid references ideas, -- 수정본의 경우 원본 참조
  is_selected boolean default false,
  created_at timestamptz default now()
);

-- JSON 버전 히스토리 (v1, v2, v3...)
create table json_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns on delete cascade not null,
  version_number int not null,
  json_content jsonb not null,
  change_note text, -- "v1 초안", "BGM을 재즈로 변경 요청 반영" 등
  include_character_prompts boolean default false,
  created_at timestamptz default now()
);

-- Row Level Security: 자기 데이터만 접근
alter table campaigns enable row level security;
create policy "own campaigns" on campaigns for all using (auth.uid() = user_id);
-- messages, ideas, json_versions도 campaigns를 통해 user_id 체크하는 정책 추가
```

---

## 🎨 UI/UX 디자인 원칙 (매우 중요)

### 레퍼런스
**apple.com/mac 프로덕트 페이지** 스타일을 완벽하게 반영할 것.
- 큰 여백과 숨 쉬는 레이아웃
- 거대한 세리프/산세리프 타이틀 (Apple의 SF Pro Display처럼)
- 미묘한 스크롤 인터랙션과 fade-in
- 곡률(border-radius) 풍부하게: 카드 `rounded-2xl~3xl`, 버튼 `rounded-full` 또는 `rounded-xl`
- 색상: 화이트/블랙 베이스, 중성 그레이(#f5f5f7, #1d1d1f), 포인트는 Apple 블루 (#0071e3)
- 다크모드: #000000 배경에 #1d1d1f 카드, 텍스트 #f5f5f7
- 투명도/블러: 헤더에 `backdrop-blur-xl` + 반투명 배경
- 버튼 호버: 부드러운 스케일(1.02) + 색 전환
- 모든 트랜지션: `transition-all duration-500 ease-out`
- 그림자: Apple은 그림자를 거의 안 씀. 대신 미묘한 border 또는 배경 대비로 구분
- 다크모드 토글: 상단 우측, Apple의 sun/moon 아이콘 스위치

### 레이아웃 (데스크탑)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [헤더: 로고 + 다크모드토글 + 계정메뉴]                               │
├───────────┬──────────────────────────────────────┬──────────────────┤
│           │                                      │                  │
│ 사이드바   │   메인 채팅 영역                       │  버전 히스토리    │
│ (260px)   │   (가변폭)                            │  패널 (320px)    │
│           │                                      │                  │
│ + 새      │ - 사용자/AI 메시지                    │ 📄 v3 (현재)     │
│   캠페인   │ - 아이디어 카드 5장 그리드              │ 📄 v2           │
│           │ - JSON 결과물 카드 (복사/다운로드 버튼)  │ 📄 v1 (초안)    │
│ 📁 캠페인A │ - "아이디어 5개 추가 생성" 버튼          │                  │
│ 📁 캠페인B │ - "캐릭터 프롬프트 패키지" 토글         │ [비교 보기]      │
│ 📁 캠페인C │ - 하단 입력창 (자동 크기 조절)          │                  │
│           │                                      │                  │
│ ⚙️ 설정    │                                      │                  │
└───────────┴──────────────────────────────────────┴──────────────────┘
```

모바일: 사이드바와 버전 패널은 드로어(drawer) 형태로 접힘.

### 랜딩/로그인 페이지
사이트에 처음 들어오면 Apple스러운 **히어로 섹션** 하나:
- 큰 타이틀: "AI로 광고를 만들다." (한국어, 큰 글씨, 중앙 정렬)
- 서브타이틀: "아이디어부터 JSON 프롬프트까지, 15초 만에."
- "Google로 시작하기" CTA 버튼 (크고 둥근 pill-shape, Apple 블루)
- 스크롤 시 기능 소개 섹션 페이드 인
- 로그인 후 자동으로 대시보드로 리다이렉트

---

## 🧠 AI 에이전트 동작 명세

### 단일 에이전트 원칙
하나의 캠페인 안에서 모든 대화와 작업(요구사항 수집 → 아이디어 5개 생성 → 선택 → JSON 생성 → 수정)은 **하나의 Claude Opus 4.7 호출 흐름**에서 전체 컨텍스트를 기억하며 이뤄짐. 멀티 에이전트 워크플로우 사용 금지.

### 컨텍스트 전략: 전체 히스토리 전송 + Prompt Caching
- 매 요청마다 `messages` 배열에 해당 캠페인의 전체 대화 히스토리를 담아서 전송
- 시스템 프롬프트(에이전트 페르소나 + Seedance 2.0 JSON 스펙)는 `cache_control: {type: "ephemeral"}`로 캐싱
- 예시:
```typescript
const response = await anthropic.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 4096,
  system: [
    {
      type: "text",
      text: SYSTEM_PROMPT, // 아래 섹션 참조
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: campaignMessages // 전체 히스토리
});
```

### 에이전트 시스템 프롬프트

⚠️ **매우 중요**: 아래 시스템 프롬프트의 맨 앞에 "📘 참고 문서: Seedance 2.0 JSON 프롬프팅 완벽 가이드" 섹션(아래 별도 블록으로 제공)의 **전문을 그대로 주입**해야 한다. 이 가이드를 읽고 내재화한 상태에서 JSON을 생성해야 품질이 보장된다.

```
[먼저 여기에 Seedance 2.0 JSON 프롬프팅 가이드 전문이 삽입됨 — 아래 "📘 Seedance 2.0 가이드 전문" 섹션 참조]

---

너는 위 Seedance 2.0 JSON 프롬프팅 가이드를 완벽히 숙지한 전문 광고 크리에이티브 
디렉터 AI다. 기업 사원을 도와 15초짜리 광고 영상을 Seedance 2.0 모델로 생성하기 
위한 JSON 프롬프트를 만들어낸다. 가이드의 모범 사례 — 다중 샷 시퀀스, 캐릭터 라이브러리, 
연속성(continuity) 관리, 오디오 트랙 동기화, 물리 인식, 구체적 렌즈/조리개/앵글 명시, 
회피 리스트(avoid) 활용 등 — 를 항상 반영하여 프로덕션 수준의 JSON을 출력한다.

======================================================================
⚠️ 절대 규칙: 응답 형식
======================================================================
모든 응답은 반드시 **순수 JSON 객체 하나**로만 출력한다. 앞뒤에 설명, 인사말, 
마크다운 코드 펜스(```json 등), 이모지, 주석이 절대 포함되면 안 된다. 
응답의 첫 글자는 반드시 `{` 이고 마지막 글자는 반드시 `}` 이다.

응답 JSON은 항상 두 개의 주요 파트로 구성된다:
- `explanation`: UI의 채팅 말풍선에 표시될 한국어 설명문 (자연스러운 문장)
- 그 외 타입별 데이터 필드 (ideas / json_content / revised_idea 등)

UI는 `explanation` 필드를 채팅 말풍선으로 파싱하고, 나머지 구조화 데이터는 
별도 카드/패널에 렌더링한다. 따라서 explanation에는 JSON 내용을 중복 설명하지 
말고, **왜 그렇게 만들었는지/무엇을 고려했는지/사용자가 알아야 할 포인트**를 
담는다. 너무 길지 않게 (3~6문장 권장).
======================================================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
워크플로우별 응답 스키마
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【1】 사용자가 자연어로 광고 요구사항을 처음 입력했을 때
    → 간결한 광고 아이디어 5가지를 생성한다. 각 아이디어의 description은 
      2~3문장으로 콘셉트/비주얼/톤/핵심 메시지를 요약한다.

{
  "type": "ideas",
  "explanation": "요청하신 [브랜드/제품]의 [타깃]을 겨냥해 아이디어 5개를 준비했습니다. 각각 다른 톤과 접근 방식으로 구성했으니 마음에 드는 방향을 선택해주세요. 수정이 필요하면 각 카드의 '수정사항 입력' 버튼을 활용하시면 됩니다.",
  "campaign_name_suggestion": "자동 생성된 캠페인 이름 (첫 응답에서만 포함)",
  "ideas": [
    {"title": "...", "description": "..."},
    {"title": "...", "description": "..."},
    {"title": "...", "description": "..."},
    {"title": "...", "description": "..."},
    {"title": "...", "description": "..."}
  ]
}

【2】 사용자가 1개 아이디어를 선택해 "이 아이디어로 진행"을 눌렀을 때
    → 해당 아이디어를 Seedance 2.0 다중 샷 시퀀스 스키마로 확장해 15초 광고 
      기획을 만든다. 가이드의 패턴(shots 배열, character_library, continuity, 
      audio_track)을 모두 활용한다.

{
  "type": "json_output",
  "explanation": "선택하신 아이디어를 15초 광고로 구성했습니다. 오프닝(4초)에서 [훅]으로 시선을 끌고, 중간(6초)에 [제품 노출], 엔딩(5초)에 [CTA]를 배치했습니다. 카메라 그래머는 [이유]로 선택했고, 오디오는 [장르]로 [감정]을 강화했습니다. 추가 수정이 필요하면 하단 채팅창에 요청해주세요.",
  "change_note": "v1 초안",
  "json_content": { ... Seedance 2.0 전체 JSON 스키마 (아래 섹션 참조) ... }
}

【3】 사용자가 채팅으로 수정 요청을 했을 때 (예: "BGM을 재즈로 바꿔줘")
    → 이전 JSON을 기반으로 수정한 새 버전 출력. change_note는 무엇을 바꿨는지 
      한 줄로.

{
  "type": "json_output",
  "explanation": "요청하신 대로 BGM을 재즈 피아노 솔로로 변경했습니다. 이에 맞춰 샷 2의 카메라 움직임도 조금 느리게 조정해 음악의 여유로운 분위기와 싱크를 맞췄습니다. 나머지 구성은 v1을 그대로 유지했습니다.",
  "change_note": "BGM을 재즈 피아노로 변경 + 샷 2 카메라 속도 완화",
  "json_content": { ... 수정된 전체 JSON ... }
}

【4】 아이디어 카드의 "수정사항 입력"으로 특정 아이디어 수정 요청을 했을 때
    → 해당 아이디어 하나의 수정본만 출력.

{
  "type": "idea_revision",
  "explanation": "'[원본 제목]'을 [사용자 요청]에 맞춰 수정했습니다. 기존 5개 아이디어 옆에 수정본 카드로 추가됩니다.",
  "parent_title": "원본 제목",
  "revised_idea": {"title": "...", "description": "..."}
}

【5】 "아이디어 5개 추가 생성" 버튼을 눌렀을 때
    → 기존 아이디어와 중복되지 않는 새 배치 5개 출력.

{
  "type": "ideas",
  "explanation": "기존 아이디어와 겹치지 않는 새로운 5가지 방향을 추가로 준비했습니다. 이번에는 [다른 톤/다른 접근] 위주로 구성했습니다.",
  "ideas": [ ... 5개 ... ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**캐릭터 프롬프트 토글 처리**:
- user message 끝에 `[include_character_prompts: true]`가 붙어 있으면 
  json_content에 `character_prompts` 필드를 반드시 포함 (각 character_library의 
  캐릭터별로 이미지 생성용 구조화 스펙 작성)
- `[include_character_prompts: false]`면 `character_prompts` 필드를 완전히 
  생략한다 (빈 객체도 넣지 말고 아예 키 자체를 제외)

**출력 강제 규칙 재확인**:
- 순수 JSON만 출력. 마크다운 펜스 절대 금지.
- explanation 필드는 항상 한국어 존댓말.
- 응답 시작 문자는 `{`, 끝 문자는 `}`.
- JSON은 반드시 유효(valid)해야 하며 파싱 가능해야 한다.
```

### Seedance 2.0 JSON 스키마 (다중 샷 시퀀스 + 오디오 필수)

에이전트는 아이디어 선택 시 **아래 구조를 정확히 따른 JSON**을 생성해야 함:

```json
{
  "model": "Seedance 2.0",
  "campaign_meta": {
    "brand": "브랜드명",
    "product_or_service": "제품/서비스",
    "core_message": "핵심 메시지 한 줄",
    "target_audience": "타깃 설명",
    "tone": "감성 톤",
    "duration_seconds": 15
  },
  "shots": [
    {
      "shot_id": 1,
      "duration": 4,
      "description": "샷 설명",
      "action": "구체적 동사 + 템포",
      "environment": {
        "location": "구체적 장소",
        "time_of_day": "구체적 시간",
        "weather": "선택사항",
        "lighting": "방향 + 색 + 강도",
        "background_elements": ["요소1", "요소2", "요소3"]
      },
      "camera": {
        "lens": "초점거리",
        "aperture": "f-stop",
        "shot_type": "wide/medium/close-up/etc",
        "angle": "eye-level/low/high/dutch",
        "movement": "static/pan/tilt/dolly/tracking/crane",
        "direction": "left/right/forward/backward"
      },
      "character_ref": "character_01",
      "style": "비주얼 스타일",
      "mood": "감정 톤"
    }
    // ... 2~4개 샷으로 15초 구성
  ],
  "character_library": {
    "character_01": {
      "appearance": "외모 상세",
      "maintain_consistency": true
    }
    // 등장인물별로
  },
  "continuity": {
    "lighting": "연속성 조명",
    "color_grade": "컬러 그레이딩",
    "audio_continuity": true
  },
  "audio_track": [
    {"time": 0.0, "type": "music", "style": "장르/악기"},
    {"time": 0.0, "type": "ambient", "content": "환경음"},
    {"time": 2.0, "type": "sfx", "content": "효과음"},
    {"time": 13.0, "type": "vo", "content": "내레이션 텍스트 (있을 경우)"}
    // 오디오 트랙은 반드시 포함
  ],
  "output": {
    "duration_seconds": 15,
    "resolution": "1080p"
  },
  "avoid": ["피해야 할 요소1", "요소2"],
  "character_prompts": {
    // "캐릭터 프롬프트 패키지 출력" 토글이 ON일 때만 포함
    "character_01": {
      "base_description": "캐릭터 기본 설명",
      "physical_features": {
        "age_range": "...",
        "gender": "...",
        "ethnicity": "...",
        "height_build": "...",
        "face_shape": "...",
        "hair": "색상, 길이, 스타일",
        "eyes": "색상, 모양",
        "skin": "톤, 질감",
        "distinguishing_features": ["특징1", "특징2"]
      },
      "wardrobe": {
        "top": "...",
        "bottom": "...",
        "shoes": "...",
        "accessories": ["...", "..."]
      },
      "expression_and_posture": "...",
      "lighting_reference": "이미지 생성 시 권장 조명",
      "style_reference": "photorealistic / illustration / etc",
      "negative_prompts": ["피해야 할 요소"]
    }
    // 캐릭터별로 각각 생성
  }
}
```

**중요**: `character_prompts` 필드는 UI에서 "캐릭터 프롬프트 패키지로 출력" 토글이 **ON**일 때만 JSON에 포함. OFF면 해당 필드 완전히 생략. AI에게 토글 상태를 시스템 프롬프트 또는 user message 마지막에 `[include_character_prompts: true/false]` 형태로 알려줌.

aspect_ratio는 JSON에 포함하지 않음 (힉스필드에서 설정).

---

## 🎬 UI 기능 상세 명세

### 1. 로그인/인증
- Google OAuth만 지원 (Supabase Auth)
- 로그인 후 대시보드(캠페인 리스트)로 자동 이동
- 로그아웃 버튼은 계정 메뉴(우상단 아바타 클릭) 안에

### 2. 사이드바 (좌측 260px)
- 상단: "+ 새 캠페인" 버튼 (Apple 블루, pill-shape)
- 클릭하면 즉시 새 캠페인 생성 + 메인 영역이 빈 채팅 상태로 전환 + 첫 메시지 대기
- 캠페인 리스트: 최신순, 각 항목은 캠페인명 + 마지막 수정 시간
- 캠페인 항목 우클릭(또는 호버 시 나타나는 ··· 아이콘) → 이름 변경 / 복제 / 삭제 메뉴
- 캠페인 이름은 첫 사용자 메시지에서 AI가 자동 추출하여 설정 (예: "스타벅스 신제품 음료 광고")
- 하단: 설정 아이콘 (향후 관리자 패널용)

### 3. 메인 채팅 영역
- 상단: 현재 캠페인 이름 (클릭 시 인라인 편집 가능)
- 중앙 스크롤 영역:
  - 사용자 메시지: 우측 정렬, 연한 배경 버블
  - **AI 설명문 (explanation 필드)**: 좌측 정렬, 투명 배경의 **채팅 말풍선**으로 렌더링. 
    - 모든 AI 응답에서 `explanation` 필드를 뽑아서 여기에 표시
    - AI 응답이 올 때 항상 이 설명문 말풍선이 먼저 나타나고, 그 아래에 타입별 구조화 UI(아이디어 카드 / JSON 카드 등)가 렌더링됨
    - 스트리밍 중에는 explanation부터 타이핑 효과로 먼저 표시
  - AI 아이디어 응답 (`type: "ideas"`): explanation 말풍선 + **5장(또는 그 이상)의 카드 그리드** 렌더링
    - 카드 레이아웃: 데스크탑 3열 또는 2열 그리드, 모바일 1열
    - 각 카드: 제목(굵은 서체) + 설명 + 하단 두 버튼
      - "이 아이디어로 진행" (Apple 블루, primary)
      - "수정사항 입력" (outline, 클릭 시 작은 입력창 인라인 펼침)
    - 수정사항 입력 후 제출하면 → AI가 수정본 1개 카드를 생성하여 기존 5장 옆에 6번째로 추가 (parent_idea_id로 연결, 시각적으로 "수정본" 뱃지 표시)
    - 그리드 하단: "아이디어 5개 추가 생성" 버튼 (full width, outline)
  - AI JSON 응답 (`type: "json_output"`): explanation 말풍선 + 접을 수 있는 **코드 카드**
    - **설명문과 JSON 카드는 시각적으로 명확히 분리**: 설명문은 일반 텍스트 말풍선으로 부드럽게, JSON 카드는 모노스페이스 폰트의 코드 블록 카드로 확실히 구분되는 디자인
    - 코드 카드 상단: 버전 번호 (v1, v2...) + change_note
    - 코드 카드 중앙: 하이라이트된 JSON 코드 (Prism.js 또는 Shiki) — **순수 JSON만**, 설명 텍스트 섞이지 않음
    - 코드 카드 우상단 액션: "복사" 📋 / "다운로드 (.json)" 💾
      - 복사 시 `json_content` 필드의 내용만 복사 (explanation은 제외)
      - 다운로드 시에도 `json_content`만 .json 파일로 저장
    - 코드 블록 기본 접힘, 펼치기 버튼
- 하단 입력창:
  - 자동 높이 조절 textarea (최대 8줄)
  - 우측에 "전송" 버튼 (Apple 스타일 원형 ↑ 아이콘)
  - 입력창 위에 토글: **"캐릭터 프롬프트 패키지로 출력"** (ON/OFF 스위치, Apple 스타일)
  - JSON이 이미 생성된 상태라면 placeholder 텍스트를 "수정 요청사항을 입력하세요"로 변경
  - 응답 중에는 스트리밍 표시 + 전송 비활성화

### 4. 버전 히스토리 패널 (우측 320px)
- 현재 캠페인의 모든 JSON 버전 타임라인 (최신이 위)
- 각 항목: v번호 + change_note + 생성 시간
- 항목 클릭 시 메인 영역에 해당 버전 JSON 카드를 스크롤해서 보여줌
- 상단에 "비교 보기" 버튼 (선택 2개 체크박스 → 모달에서 좌우 diff 표시, react-diff-viewer 사용)
- 패널 상단에 접기/펼치기 토글 (모바일에서는 드로어로)

### 5. 다크모드
- 상단 헤더 우측 토글 (sun/moon 아이콘)
- 사용자 설정은 localStorage + Supabase profiles에 저장
- 전환 시 부드러운 색상 트랜지션 (500ms)

### 6. 관리자 API Key 설정
- 최초 설치 후 `/admin` 경로 페이지에서 API Key 입력
- 환경변수 `ADMIN_EMAILS`로 허용된 이메일만 접근 가능
- 입력된 Key는 `crypto` 모듈로 암호화 후 Supabase `admin_settings.anthropic_api_key_encrypted`에 저장
- 클라이언트에는 절대 노출 안 됨

---

## 🔌 API 라우트 설계 (Next.js)

```
/api/chat
  POST: { campaignId, userMessage, includeCharacterPrompts }
  → 서버사이드에서 Supabase로부터 해당 캠페인의 메시지 히스토리 로드
  → 암호화된 API Key 복호화
  → Claude Opus 4.7 호출 (Prompt Caching 적용)
  → 응답 파싱 후 타입별로 적절한 테이블(messages, ideas, json_versions)에 저장
  → 스트리밍 응답으로 클라이언트에 전달

/api/campaigns
  GET: 현재 유저의 캠페인 리스트
  POST: 새 캠페인 생성
  PATCH: 이름 변경
  DELETE: 삭제
  POST /duplicate: 복제

/api/campaigns/[id]/messages
  GET: 특정 캠페인의 전체 메시지 + 아이디어 + JSON 버전 로드

/api/admin/settings
  GET/POST: API Key 관리 (관리자 전용)
```

---

## ⚡ 구현 순서 (단계별)

1. **프로젝트 셋업**: Next.js 14 + TypeScript + Tailwind + Framer Motion 초기화, Pretendard 폰트 적용
2. **Supabase 연결**: 스키마 생성, RLS 정책 설정, Google OAuth 설정
3. **인증 플로우**: 랜딩 페이지 + 로그인 + 보호된 라우트
4. **전체 레이아웃**: 사이드바 + 메인 + 버전 패널 3분할 레이아웃, Apple 스타일 적용
5. **다크모드**: 테마 토글 + Tailwind dark: 적용
6. **캠페인 CRUD**: 사이드바에서 생성/선택/이름변경/복제/삭제
7. **채팅 기본**: 메시지 입력 + 저장 + 렌더링
8. **Claude API 연동**: 서버사이드 라우트 + Prompt Caching + 히스토리 기반 호출
9. **아이디어 카드 렌더링**: 5장 그리드 + 선택/수정/추가 생성 버튼
10. **JSON 응답 처리**: 코드 카드 + 복사/다운로드 + DB 저장
11. **버전 히스토리 패널**: 타임라인 + 비교 모달
12. **캐릭터 프롬프트 토글**: UI 스위치 + API 페이로드에 플래그 전달
13. **관리자 페이지**: API Key 암호화 저장 + 복호화 사용
14. **마무리**: 에러 핸들링, 로딩 상태, 빈 상태 UI, 반응형, Apple 애니메이션 디테일

---

## ✅ 완성 기준 체크리스트

- [ ] Google 로그인이 작동하고, 자기 계정의 캠페인만 보임
- [ ] 새 캠페인 생성 → 첫 메시지 입력 → AI가 아이디어 5장 카드 렌더링
- [ ] 카드 "이 아이디어로 진행" → AI가 완전한 Seedance 2.0 JSON 생성, v1로 저장
- [ ] 카드 "수정사항 입력" → 6번째 수정본 카드 추가
- [ ] "아이디어 5개 추가 생성" → 새 배치 5장 추가
- [ ] 채팅에서 수정 요청 → v2 JSON 생성, 버전 패널에 추가
- [ ] 버전 패널에서 과거 버전 클릭 → 해당 JSON으로 스크롤 이동
- [ ] 비교 보기 → 2개 버전 diff 표시
- [ ] 캐릭터 프롬프트 토글 ON → JSON에 `character_prompts` 필드 포함 (캐릭터별 상세 스펙)
- [ ] 캐릭터 프롬프트 토글 OFF → `character_prompts` 필드 완전 제외
- [ ] JSON 복사/다운로드 정상 작동
- [ ] 캠페인 이름 변경/복제/삭제 정상 작동
- [ ] 다크모드 완벽 지원
- [ ] Apple/mac 페이지 수준의 타이포그래피, 여백, 곡률, 애니메이션 품질
- [ ] 새로고침/로그아웃 후 재로그인해도 모든 데이터 유지
- [ ] API Key가 클라이언트 번들에 절대 포함되지 않음 (네트워크 탭에서도 확인)
- [ ] Prompt Caching이 시스템 프롬프트에 적용되어 있음 (cache_control)

---

## 🎨 디테일 지침 (Apple 감성 핵심)

- 모든 버튼은 `active:scale-[0.97] transition-transform`
- 카드 호버: `hover:shadow-sm hover:-translate-y-0.5`
- 페이지 전환: Framer Motion의 `AnimatePresence` + `fade + slide`
- 타이포그래피 위계를 강하게: h1은 48~72px, body는 16~17px, 자간은 Apple처럼 `tracking-tight`
- 색상은 절제: 대부분 무채색, 포인트 색은 Apple 블루 또는 캠페인 상태에 따른 미묘한 그린/오렌지 뱃지
- 로딩 상태는 스켈레톤 + Apple의 미묘한 그라디언트 shimmer
- 빈 상태(캠페인 없을 때): 큰 타이틀 "첫 캠페인을 시작하세요." + 은은한 서브 카피 + CTA 버튼
- 폼 요소는 border가 아닌 배경색 차이로 경계 표현 (`bg-neutral-100 dark:bg-neutral-900`)
- 최상단 헤더: 반투명 + `backdrop-blur-xl` + 스크롤 시 미묘한 border-bottom 나타남

---

이 전체 스펙대로 구현해줘. 각 단계를 완료할 때마다 설명하며 진행하고, Apple 공식 홈페이지(apple.com/mac) 수준의 디자인 디테일을 반드시 맞춰줘.

---

## 🔧 응답 파싱 및 렌더링 구현 가이드

Claude API 응답을 받으면 다음과 같이 처리한다:

```typescript
// 서버 라우트 (/api/chat) 내부
const raw = completion.content[0].text;
// AI가 순수 JSON만 반환하므로 바로 파싱
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  // 안전장치: 혹시 코드 펜스가 섞이면 제거 후 재파싱
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
  parsed = JSON.parse(cleaned);
}

// parsed.type 에 따라 DB 저장 및 클라이언트 전송
switch (parsed.type) {
  case 'ideas':
    // messages 테이블에 assistant 메시지 저장 (content = explanation)
    // ideas 테이블에 5개 아이디어 각각 저장
    // campaign_name_suggestion 있으면 campaigns.name 업데이트 (첫 응답만)
    break;
  case 'json_output':
    // messages 테이블에 explanation 저장
    // json_versions 테이블에 새 버전 저장 (version_number 자동 증가)
    break;
  case 'idea_revision':
    // ideas 테이블에 parent_idea_id 연결된 수정본 1개 추가 (card_index = 6, 7...)
    break;
}

// 클라이언트로는 parsed 객체 전체 전송
```

클라이언트 채팅 컴포넌트:

```tsx
function AssistantMessage({ response }: { response: ParsedResponse }) {
  return (
    <div className="flex flex-col gap-4">
      {/* 1) explanation은 항상 말풍선으로 먼저 표시 */}
      {response.explanation && (
        <ChatBubble role="assistant">{response.explanation}</ChatBubble>
      )}
      
      {/* 2) 타입별 구조화 UI는 explanation 아래에 별도 영역 */}
      {response.type === 'ideas' && <IdeaCardGrid ideas={response.ideas} />}
      {response.type === 'json_output' && (
        <JsonCodeCard 
          version={versionNumber}
          changeNote={response.change_note}
          jsonContent={response.json_content}  // 이것만 복사/다운로드 대상
        />
      )}
      {response.type === 'idea_revision' && <RevisedIdeaCard {...response} />}
    </div>
  );
}
```

**복사/다운로드 로직은 반드시 `json_content` 필드만 대상으로**:
```typescript
const handleCopy = () => {
  navigator.clipboard.writeText(JSON.stringify(jsonContent, null, 2));
};
const handleDownload = () => {
  const blob = new Blob([JSON.stringify(jsonContent, null, 2)], { type: 'application/json' });
  // ... 다운로드 트리거. 파일명: `${campaignName}_v${version}.json`
};
```

이로써 사용자는 JSON 카드에서 "복사" 버튼을 눌러 힉스필드에 붙여넣을 때 **오직 순수 Seedance 2.0 JSON만** 가져가고, 한국어 설명문은 채팅 히스토리에만 남는다.

---

## 📘 Seedance 2.0 가이드 전문 (시스템 프롬프트에 주입할 것)

아래 전문을 Claude API 호출 시 system 필드의 맨 앞에 **그대로 삽입**한다. 이 내용 전체가 `cache_control: { type: "ephemeral" }`로 캐싱되어, 프로젝트 내 모든 호출에서 재사용되며 토큰 비용을 약 1/10로 낮춘다.

```typescript
const SEEDANCE_GUIDE = `
# The Complete Guide to JSON Prompting for Seedance 2.0

## Why Structured Prompts Beat Paragraph Prompts Every Time

Think about how a film crew receives a shot list. It isn't a rambling note from the director — it's a structured breakdown: scene number, lens, blocking, lighting setup, audio cue. JSON prompting works the same way. Instead of bundling your entire vision into a single flowing sentence, you hand the model a clean, labeled blueprint built from braces, keys, commas, and nested objects.

JSON — short for JavaScript Object Notation — is effectively the mother tongue of modern generative video systems. These models parse structured data far more reliably than they parse mood-heavy prose, which means a well-formed JSON block translates directly into what appears on screen.

### The Problem With Paragraph Prompts

Consider a common paragraph-style instruction:

> A skateboarder glides through a neon-lit Tokyo alley at midnight. The atmosphere feels rainy and moody, with reflections bouncing off the pavement. The camera follows from behind with a smooth tracking motion, giving it a dreamy cyberpunk vibe.

Looks fine on paper. But when handed to a video model, several things can go sideways:

- **Pace drift** — Is the skateboarder cruising leisurely or pushing hard? The model guesses, and the motion often looks rubbery or teleported.
- **Lighting ambiguity** — "Neon-lit" can turn into a blown-out rainbow mess or a flat purple wash.
- **Atmosphere overreach** — "Rainy and moody" might deliver a hurricane or, alternatively, barely a mist.
- **Camera interpretation** — "Tracking motion" is vague. Dolly? Gimbal? Drone? The output shakes or glides unpredictably.
- **Scene drift** — The alley might morph mid-shot, neon signs flickering in and out of existence.

Fixing these issues means regenerating, burning credits, and rewriting half the prompt. Every time.

### The JSON Alternative

Here's the same idea, restructured:

\`\`\`json
{
  "subject": "skateboarder",
  "appearance": "black hoodie, cargo pants, worn sneakers",
  "action": "gliding forward at a steady cruising pace",
  "environment": {
    "location": "narrow Tokyo alley",
    "time_of_day": "midnight",
    "weather": "light drizzle, wet asphalt",
    "lighting": "neon pink and cyan signage reflecting on puddles",
    "background_elements": ["steam vents", "hanging lanterns", "flickering kanji signs"]
  },
  "camera": {
    "position": "low angle, behind subject",
    "lens": "24mm",
    "movement": "smooth gimbal tracking shot",
    "speed": "matching subject velocity"
  },
  "mood": "dreamy, cyberpunk",
  "style": "cinematic realism",
  "avoid": ["motion blur artifacts", "teleporting limbs", "distorted neon text"]
}
\`\`\`

The best part? You're not writing full sentences. You're writing labels and short values — and the output is sharper for it.

## What JSON Prompting Actually Gets You

Structured prompts trade vagueness for precision. Here's what changes when you make the switch.

1. **Director-Level Control** — Every parameter is its own field. Want to dial in a specific look? Slot a camera object with lens, aperture, focal_length, shot_type, and movement. A 35mm lens at f/2.8 with a slow dolly-in produces something fundamentally different from a 14mm wide at f/11 — and JSON lets you specify exactly that.
2. **Layered Scene Orchestration** — Real video contains stacked motion: a character moves, the camera moves, the background shifts, lighting evolves, and sound layers in — all at once. JSON handles this with nested objects instead of runaway sentences.
3. **Template-Driven Consistency** — For brand campaigns, series content, or recurring characters, JSON becomes a reusable scaffold. Lock in your character definition, lighting palette, and camera grammar once — then swap out only the action or location field for each new shot.
4. **Synchronized Audio Direction** — Modern video models generate sound alongside visuals. JSON makes timing precise via an audio_track array with time, type, content keys.
5. **Fewer Hallucinations** — Ambiguity is where models go rogue. Structured fields leave less room for invention — so you get stable faces, consistent wardrobe, locked-in lighting, and physics that don't break mid-clip.

## Meet Seedance 2.0: Why It Pairs Exceptionally Well With JSON

Seedance 2.0 is ByteDance's latest multimodal video model, and it's arguably the strongest match for JSON prompting available right now.

- **Multimodal input at scale.** Seedance 2.0 accepts text, images, videos, and audio as inputs — up to 12 assets in a single generation (9 images, 3 video clips up to 15 seconds each, 3 audio clips up to 15 seconds each, plus text prompts).
- **Native audio generation.** Generate video and audio simultaneously. Your audio_track field isn't aspirational — it's enforced.
- **Multi-shot consistency.** The model maintains stable character appearance across frames and shots, solving character drift, style inconsistency, and detail loss.
- **Camera and motion replication.** Upload a reference video with camera movements or choreography you like, and the model replicates them with your own content.
- **Flexible output.** 4 to 15 seconds in length, aspect ratios 16:9 / 9:16 / 4:3 / 3:4 / 21:9 / 1:1, up to 1080p.

## Building a Seedance 2.0 JSON Prompt — Step by Step

### Step 1: Sketch Your Shot Before You Type

Before opening a JSON editor, answer these questions:

- **Subject** — Who or what anchors the frame?
- **Action** — What are they doing, and at what tempo?
- **Environment** — Where? When? Weather? Time of day?
- **Camera** — Lens, movement, angle, framing
- **Lighting** — Direction, color temperature, intensity, contrast
- **Style** — Photoreal, anime, 3D render, claymation, documentary?
- **Audio** — Dialogue, ambient, music, SFX
- **Exclusions** — What should never appear?

These become your top-level keys.

### Step 2: Build the Structure

Here's a reusable Seedance 2.0 scaffold:

\`\`\`json
{
  "model": "Seedance 2.0",
  "scene": {
    "subject": {
      "description": "[who or what]",
      "appearance": "[wardrobe, hair, distinguishing features]",
      "age_range": "[optional]"
    },
    "action": "[specific verb phrase with tempo]",
    "environment": {
      "location": "[specific place]",
      "time_of_day": "[precise time]",
      "weather": "[optional]",
      "lighting": "[direction + color + intensity]",
      "background_elements": ["element 1", "element 2", "element 3"]
    },
    "camera": {
      "lens": "[focal length]",
      "aperture": "[f-stop]",
      "shot_type": "[wide / medium / close-up / etc.]",
      "angle": "[eye-level / low / high / Dutch]",
      "movement": "[static / pan / tilt / dolly / tracking / crane]",
      "direction": "[left / right / forward / backward]"
    },
    "style": "[visual style]",
    "mood": "[emotional tone]"
  },
  "audio_track": [
    {"time": 0.0, "type": "ambient", "content": "[ambient sound]"},
    {"time": 0.0, "type": "music", "style": "[genre / instrument]"},
    {"time": 2.0, "type": "sfx", "content": "[specific sound effect]"}
  ],
  "output": {
    "duration_seconds": 8,
    "resolution": "1080p",
    "aspect_ratio": "16:9"
  },
  "avoid": ["element 1", "element 2"]
}
\`\`\`

Copy this as your base. Swap values. Ship videos.

### Step 3: Worked Example — Same Scaffold, Different Scene

Say you want to pivot the earlier Tokyo skateboarder into something completely different — a traditional tea ceremony in Kyoto, shot in a documentary style.

\`\`\`json
{
  "model": "Seedance 2.0",
  "scene": {
    "subject": {
      "description": "an elderly tea master",
      "appearance": "indigo kimono, silver hair tied back, calm expression"
    },
    "action": "slowly whisking matcha in a ceramic bowl with deliberate, practiced motion",
    "environment": {
      "location": "tatami-floored tea room in Kyoto",
      "time_of_day": "late afternoon",
      "lighting": "warm diffused light filtering through shoji screens",
      "background_elements": ["hanging scroll", "single ikebana arrangement", "cast-iron kettle steaming"]
    },
    "camera": {
      "lens": "50mm",
      "aperture": "f/2.0",
      "shot_type": "medium close-up",
      "angle": "eye-level",
      "movement": "static tripod shot",
      "focus": "shallow depth of field on the whisk"
    },
    "style": "documentary realism",
    "mood": "meditative, reverent"
  },
  "audio_track": [
    {"time": 0.0, "type": "ambient", "content": "quiet room tone"},
    {"time": 0.0, "type": "sfx", "content": "bamboo whisk against ceramic"},
    {"time": 2.5, "type": "sfx", "content": "distant temple bell"},
    {"time": 5.0, "type": "sfx", "content": "kettle softly steaming"}
  ],
  "output": {
    "duration_seconds": 10,
    "resolution": "1080p",
    "aspect_ratio": "16:9"
  },
  "avoid": ["modern objects", "fast cuts", "harsh shadows"]
}
\`\`\`

Same skeleton. Entirely different film.

### Step 4: Iterate Surgically

This is where JSON pays off. Don't like the lighting? Change the lighting field only. Want to test a wider lens? Adjust camera.lens. Everything else stays locked. Compare that to rewriting a paragraph and watching five other things drift unpredictably.

## Advanced Seedance 2.0 Patterns

### Multi-Shot Sequences

Seedance 2.0 handles multi-shot payloads in a single generation. Structure them as an array:

\`\`\`json
{
  "model": "Seedance 2.0",
  "shots": [
    {
      "shot_id": 1,
      "duration": 4,
      "description": "Wide establishing shot of a coastal cliff at dawn",
      "camera": {"lens": "14mm", "movement": "slow aerial push-in"},
      "character_ref": "character_01"
    },
    {
      "shot_id": 2,
      "duration": 5,
      "description": "Medium shot of the same character looking out to sea, wind in her hair",
      "camera": {"lens": "85mm", "movement": "slight handheld drift"},
      "character_ref": "character_01"
    },
    {
      "shot_id": 3,
      "duration": 6,
      "description": "Close-up on her hands gripping a letter, fingers trembling",
      "camera": {"lens": "100mm macro", "movement": "static"},
      "character_ref": "character_01"
    }
  ],
  "character_library": {
    "character_01": {
      "appearance": "woman in her late 20s, auburn hair, cream wool sweater, weathered silver ring",
      "maintain_consistency": true
    }
  },
  "continuity": {
    "lighting": "cool dawn, soft overcast",
    "color_grade": "muted teal and warm skin tones",
    "audio_continuity": true
  }
}
\`\`\`

The character_library block is what keeps her face, hair, and sweater identical across all three shots — exploiting Seedance 2.0's consistency engine directly.

### Reference-Driven Generation

When you're supplying images, video, or audio as references, tell the model what each one is for:

\`\`\`json
{
  "model": "Seedance 2.0",
  "references": {
    "character_image": {"role": "subject appearance", "apply_to": "all shots"},
    "motion_video": {"role": "camera movement reference", "apply_to": "shot 2 only"},
    "audio_sample": {"role": "voice timbre for dialogue", "apply_to": "full sequence"}
  },
  "prompt": "A martial artist rehearsing a slow kata in a bamboo forest at dawn."
}
\`\`\`

### Physics-Aware Actions

Seedance 2.0 is strong on physics. Lean into that with explicit physics fields:

\`\`\`json
{
  "action": "glass shattering on stone floor",
  "physics": {
    "gravity": "realistic",
    "fragmentation": "radial scatter pattern",
    "debris_count": "medium",
    "sound_sync": true
  },
  "slow_motion": {
    "enabled": true,
    "factor": 0.25,
    "target_moment": "impact"
  }
}
\`\`\`

## Practical Tips for Cleaner Output

- **Prioritize what matters.** Don't stuff every possible field. If lighting isn't critical, leave it loose and let the model interpret. Over-specification can box the model into awkward compromises.
- **One idea per key.** Writing "lighting": "warm sunset with cold blue shadows and dramatic fog" mashes three concepts into one field. Split them: key_light, fill_light, atmosphere.
- **Save your templates.** Once you dial in a look — say, a noir detective style — keep that JSON as a reusable preset.
- **Use avoid actively.** Seedance 2.0 responds well to exclusion lists. If you keep getting extra limbs, distorted text, or weird lens flare, name them in avoid.
- **Match your duration to your action.** A complex multi-beat action in 4 seconds will feel rushed. A simple static scene stretched to 15 seconds will feel empty.
- **Test small, then scale.** Generate a 4-second version first to validate the look. Once the core scene works, extend to full length.

## Wrapping Up

JSON prompting isn't a gimmick — it's what separates hobbyist output from production-grade video. Paragraph prompts leave too much to chance; structured prompts hand the model a shot list. Seedance 2.0 is built for this workflow.
`;

// Claude API 호출 시 이렇게 사용:
const response = await anthropic.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 4096,
  system: [
    {
      type: "text",
      text: SEEDANCE_GUIDE + "\n\n---\n\n" + AGENT_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: campaignMessages
});
```

**구현 주의사항**:
- `SEEDANCE_GUIDE` 상수는 백엔드 파일 하나에 분리 저장 (예: `lib/prompts/seedance-guide.ts`)
- `AGENT_SYSTEM_PROMPT`는 위의 "에이전트 시스템 프롬프트" 섹션 내용을 그대로 문자열로 저장
- 두 개를 합쳐서 하나의 큰 시스템 텍스트로 만들고 `cache_control`을 최상단에 걸면 전체가 캐싱됨
- 이로써 AI는 매 호출마다 Seedance 2.0의 모든 패턴(다중 샷, 캐릭터 라이브러리, 연속성, 오디오 동기화, 물리, 회피 리스트)을 완벽히 숙지한 상태에서 응답함

