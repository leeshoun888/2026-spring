# Maeil VOC Agent

매일유업 제품 VOC를 네이버 검색 API와 YouTube Data API로 수집하고, LLM으로 제품 관련성·1인칭 리뷰 여부·감성·리스크·실무 액션을 분석하는 Next.js 웹앱입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 이미 3000번 포트가 사용 중이면 `npm run dev -- -p 3002`처럼 다른 포트를 지정할 수 있습니다.

## API 설정

앱의 `API 설정` 영역에 아래 키를 입력하거나 `.env.local`에 넣을 수 있습니다.

```bash
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
YOUTUBE_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
CRON_SECRET=
```

입력한 키는 `.data/settings.json`에 저장되며, `.data`는 gitignore 처리되어 있습니다.

## 주요 기능

- 네이버 블로그, 카페글, 뉴스 검색 API 수집
- YouTube 영상 검색 및 댓글 수집
- LLM 기반 제품 관련성, 1인칭 리뷰 여부, VOC 유효성 판정
- 감성, 카테고리, 키워드, 고위험 VOC, 기회 요소 분석
- 임원용 보고서 화면과 실무자용 VOC 근거 목록
- PDF, Word, Excel, JSON, CSV 다운로드
- `/api/cron` 기반 주기 실행용 엔드포인트

## Export API

- `/api/export/pdf`
- `/api/export/docx`
- `/api/export/xlsx`
- `/api/export/json`

## 데이터 저장

- 분석 데이터: `data/voc-state.json`
- API 키/비공개 설정: `.data/settings.json`

네이버 검색 API는 원문 전문 크롤링이 아니라 공식 검색 결과의 제목, 요약, 링크를 기반으로 동작합니다. YouTube 댓글은 YouTube Data API 범위 안에서 수집합니다.
