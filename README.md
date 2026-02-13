# DESKER Sales Report (Next.js 16)

`plan.md` 요구사항을 기준으로, 아래 스택으로 1차 구현한 프로젝트입니다.

- Next.js 16 (App Router + TypeScript)
- shadcn/ui 스타일 컴포넌트
- Framer Motion
- Vercel 배포 대상
- DB 미연동 (세션 메모리 기반)

## 구현 범위 (Phase 1-3 + API 스텁)

- 앱 진입 시 `docs/` 기본 CSV 3종 자동 로드
- CSV 3종 업로드
- 필수 컬럼 검증(zod)
- 대리점명 정규화 및 Club 1000 규칙 반영
- 병합/전처리/결측 보정
- 핵심 지표 계산
  - 총매출, 구매횟수, 신제품 비중, 성장잠재 고객
  - 지역 매출 비중 / 공략 필요 지역
  - 제품 동시구매 비율
  - 월별 신제품 추이
- AI 인사이트 API 스텁
- PDF Export API 스텁 (501)

## 로컬 실행

1. Node.js 20+ 설치
2. 의존성 설치

```bash
npm install
```

3. 개발 서버 실행

```bash
npm run dev
```

4. 브라우저 열기

```text
http://localhost:3000
```

## API 엔드포인트

- `POST /api/upload`
  - multipart/form-data
  - fields: `orders`, `customers`, `products`
  - returns: `sessionId`, `agencies`, `counts`

- `POST /api/analyze`
  - body: `{ sessionId, agency, benchmark: "overall" | "club1000" }`
  - returns: `analysis`

- `POST /api/load-default`
  - `docs/` 폴더의 기본 CSV 3종을 자동 로드
  - returns: `sessionId`, `agencies`, `counts`, `defaultFiles`

- `POST /api/insight`
  - body: `{ agency, benchmark, userPrompt? }`
  - returns: AI 코멘트(스텁)

- `POST /api/export-pdf`
  - 현재 501 (Phase 4 연결 예정)

## 디렉토리

```text
src/
  app/
    api/
      upload/
      analyze/
      insight/
      export-pdf/
  components/
    dashboard/
    ui/
  features/
    preprocessing/
    metrics/
  lib/
    csv/
    session-store.ts
  types/
```

## 다음 단계

1. `/api/insight`를 실제 LLM API와 연결
2. `/api/export-pdf`를 `@react-pdf/renderer` 또는 `playwright`로 구현
3. Repository 인터페이스 기반 DB 연동(Vercel Postgres/Supabase)
