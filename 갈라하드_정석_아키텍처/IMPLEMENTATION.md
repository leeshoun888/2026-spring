# 갈라하드 정석 아키텍처 구현본

## 실행

```bash
npm start
```

기본 주소: `http://localhost:4020`

## 구현 범위

- TU01~TU06 상태머신 구현
- 단계 간 자동 데이터 전달
- 선택/재생성/승인 액션 구현
- 배치 이력 `active` / `inactive/archived` 보관
- `data/state.json` / `data/settings.json` 영속 저장
- UI에서 LLM/이미지/영상 API Key 입력 및 저장

## Provider 모드

### 1) mock (기본)
- API 키 없이 전체 파이프라인 즉시 동작
- 이미지: SVG 플레이스홀더 생성
- 영상: 샘플 MP4 URL 사용

### 2) openai
- LLM: `POST /v1/responses`
- 이미지: `POST /v1/images/generations`
- 영상은 openai 모드 직접 연결 대신 `custom` 모드 사용

### 3) custom
- LLM/Image/Video 모두 사용자 엔드포인트 연결 가능
- 요청 방식: `POST JSON`
- 인증 헤더명(`Authorization`, `x-api-key` 등) UI에서 설정 가능

## Custom Endpoint 응답 형식

### 텍스트(프롬프트 생성)
아래 필드 중 하나를 문자열로 반환하면 됩니다.

```json
{ "text": "1. ...\n2. ...\n3. ..." }
```

또는

```json
{ "output": "1. ...\n2. ...\n3. ..." }
```

### 이미지/영상 생성
아래 필드 중 하나를 URL 문자열로 반환하면 됩니다.

```json
{ "url": "https://..." }
```

또는

```json
{ "imageUrl": "https://..." }
```

또는

```json
{ "videoUrl": "https://..." }
```

또는

```json
{ "output": ["https://..."] }
```

## 주요 API

- `GET /api/state`
- `POST /api/settings`
- `POST /api/pipeline/start`
- `POST /api/pipeline/reset`
- `POST /api/tu01/regenerate`
- `POST /api/tu02/regenerate`
- `POST /api/tu02/select`
- `POST /api/tu03/regenerate`
- `POST /api/tu03/approve`
- `POST /api/tu04/regenerate`
- `POST /api/tu05/regenerate`
- `POST /api/tu05/select`
- `POST /api/tu06/regenerate`
- `POST /api/tu06/approve`
