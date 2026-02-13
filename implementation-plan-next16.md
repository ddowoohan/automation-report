# DESKER 영업 리포트 시스템 구현 계획 (Next.js 16)

## 1) 목표와 범위
- 기준 문서: `plan.md`의 분석 요구사항/지표 정의/리포트 UX를 그대로 반영
- 기술 스택:
  - App: Next.js 16 (App Router, TypeScript)
  - UI: shadcn/ui + Tailwind CSS
  - Motion: Framer Motion
  - 배포: Vercel
- DB: 1차 범위 제외 (추후 연동)

## 2) 1차 릴리스 원칙 (DB Later)
- 업로드한 CSV 3개를 세션 단위로 메모리 처리
- 영구 저장 없이 분석 결과 즉시 생성/조회
- 서버 재시작 또는 새 배포 시 데이터 초기화 허용
- 추후 DB 연동을 고려해 데이터 접근 계층(Repository Interface)만 먼저 분리

## 3) 기능 요구사항 매핑

### 3-1. 입력
- CSV 3종 업로드:
  - `매출_수주 데이터.csv`
  - `고객 마스터 데이터.csv`
  - `제품 판매 데이터.csv`
- 업로드 후 스키마 검증(필수 컬럼 누락 시 에러 표시)

### 3-2. 전처리/병합
- 대리점명 정규화:
  - `DM대전둔산2 -> DM대구칠성` (통합)
  - `DM송파오금 -> DM공간플러스` (명칭 통일)
- 핵심 병합 규칙:
  - 매출_수주 + 고객 마스터: `['사업자 등록번호', '실적대리점']` 기준 Left Join
  - 매출_수주 + 제품 판매: `['수주번호']` 기준 Left Join
- 유효 데이터 필터:
  - 분석 기준은 `수주금액 > 0`
- 결측 보정:
  - 고객 마스터 `최초주문금액`이 0/Null이면, 매출_수주의 고객별 최조 주문 금액으로 대체
- Club 1000 태깅:
  - 정규화된 대리점명 기준 `Club_1000` boolean 부여

### 3-3. 지표 계산
- 누적 매출액:
  - `매출_수주`의 `수주금액`을 대리점별 합계
- 구매 횟수_사업자별:
  - `매출_수주`에서 `수주금액 > 0` 건의 주문 회사명 기준으로 count
- 지역 분석:
  - `[시, 구, 동]` 그룹 집계 + 대리점 내 비중 계산
- 성장 고객:
  - 성장배수 = `누적주문금액 / 최초주문금액`
  - High Potential 조건:
    - 성장배수 >= 2.0
    - 누적주문금액 상위 30%
- 제품 크로스셀:
  - 동일 주문번호 내 `카테고리(중분류)` 2개 이상이면 Cross-sell
  - 단독 vs 동시구매 비율
- 신제품 분석:
  - 신제품 매출 비중(%)
  - 월별 신제품 판매 추이(라인 차트)

### 3-4. 대시보드
- 사이드바:
  - 대리점 선택(통합된 명칭만 노출)
  - 비교 기준 선택(`전체 평균` vs `Club 1000 평균`)
- 메인 영역:
  - KPI 카드 4개(총매출, 성장률, 신제품 비중 등)
  - 지역 히트맵 + 공략 필요 지역 TOP 5
    - 히트맵 시각화 필요
    - 공략화 필요한 지역 표로 알려주기
      - 기준 : 수주금액 top5 지역
    - 데이터 해석 텍스트 박스 넣기
    - 데이터 해석에 대한 영업 인사이트 텍스트 박스 넣기  
  - 성장성 산점도(타겟 하이라이트)
    - 데이터 해석 텍스트 박스 넣기
    - 데이터 해석에 대한 영업 인사이트 텍스트 박스 넣기  
  - 제품 구조 차트(썬버스트/대체 가능)
    - 데이터 해석 텍스트 박스 넣기
    - 데이터 해석에 대한 영업 인사이트 텍스트 박스 넣기  
  - AI 인사이트 채팅 패널
- PDF 다운로드:
  - 현재 화면 기준 리포트 PDF 생성

## 4) 기술 설계

### 4-1. 프로젝트 구조(안)
```txt
src/
  app/
    (dashboard)/page.tsx
    api/
      upload/route.ts
      analyze/route.ts
      insight/route.ts
      export-pdf/route.ts
  components/
    dashboard/
    charts/
    ui/            # shadcn/ui
  features/
    upload/
    preprocessing/
    metrics/
    insight/
    export/
  lib/
    csv/
    validation/
    agency-normalizer/
    club1000/
    repositories/  # DB later를 위한 인터페이스
  types/
```

### 4-2. 주요 라이브러리
- CSV 파싱: `papaparse` 또는 `csv-parse`
- 스키마 검증: `zod`
- 차트: `recharts` (shadcn chart 패턴)
- 지도: `react-kakao-maps-sdk` 또는 `leaflet` (주소/좌표 전략 확정 필요)
- PDF:
  - 옵션 A: `@react-pdf/renderer`
  - 옵션 B: HTML 렌더 후 `playwright` 기반 PDF 생성

### 4-3. 상태/세션 전략 (DB 없이)
- 업로드 파일 -> 서버 메모리 또는 임시 스토리지(`/tmp`) 저장
- 분석 결과 캐시 키: `sessionId + hash(files)`
- 캐시 TTL 설정(예: 2시간)
- 이후 DB 도입 시 `Repository` 구현체만 교체

## 5) 화면/UX 계획 (shadcn + Framer Motion)
- shadcn/ui:
  - `Card`, `Tabs`, `Select`, `Table`, `Dialog`, `Sheet`, `Badge`, `Skeleton`
- Framer Motion:
  - 초기 로딩 시 KPI 카드 stagger 등장
  - 차트 섹션 전환 애니메이션
  - AI 인사이트 패널 열림/닫힘 전환
- 반응형:
  - 모바일: KPI 1열, 차트 세로 스택
  - 데스크톱: 2~3열 그리드

## 6) 구현 단계 (2주 기준)

### Phase 1. 기반 세팅 (Day 1-2)
- Next.js 16 + TypeScript + shadcn/ui + Tailwind + Framer Motion 설치
- 기본 레이아웃/디자인 토큰 설정
- 파일 업로드 UI, CSV 검증 파이프라인 골격 작성

### Phase 2. 데이터 파이프라인 (Day 3-5)
- 정규화/병합/필터/결측 보정 구현
- Club 1000 태깅
- 지표 계산 유닛 함수 작성
- 샘플 CSV 기준 스냅샷 테스트

### Phase 3. 대시보드 시각화 (Day 6-8)
- 사이드바 필터 + KPI 카드
- 지역/성장/제품/신제품 차트 구현
- 비교 기준 토글(전체 평균 vs Club 1000)

### Phase 4. AI 인사이트 + PDF (Day 9-10)
- 인사이트 채팅 UI + API 라우트 연결
- 사용자 수정 요청 반영 플로우
- PDF 내보내기(샘플 레이아웃 근접 구현)

### Phase 5. 배포/안정화 (Day 11-12)
- Vercel 배포 설정
- 업로드 용량/타임아웃/에러 핸들링 점검
- 성능 최적화 및 QA 체크리스트 완료

## 7) 테스트 전략
- 단위 테스트:
  - 병합 키 검증, 중복 부풀림 방지, 성장배수/타겟 판정
- 통합 테스트:
  - CSV 업로드 -> 분석 -> 대시보드 렌더 -> PDF 생성
- 회귀 테스트:
  - 대리점명 정규화/통합 규칙
  - Club 1000 태깅 정확도

## 8) Vercel 배포 계획
- 환경변수:
  - `AI_API_KEY` (인사이트 생성용)
  - `SESSION_SECRET`
- 빌드/런타임:
  - Server Actions 또는 Route Handlers 중심
  - PDF 생성 방식에 따라 Node 런타임 지정
- 모니터링:
  - Vercel Analytics + 에러 로그 알림

## 9) DB 연동 대비 설계 (2차)
- 1차에서 인터페이스만 확정:
  - `AgencyRepository`
  - `OrderRepository`
  - `ProductRepository`
  - `ReportRepository`
- 2차에서 후보:
  - Vercel Postgres + Prisma
  - 또는 Supabase
- 전환 방식:
  - 현재 메모리 구현체 -> DB 구현체 교체
  - API 계약 유지로 UI 변경 최소화

## 10) 즉시 실행할 작업 (TODO)
1. 프로젝트 부트스트랩(Next.js 16 + shadcn/ui + Framer Motion)
2. CSV 스키마 정의(zod)와 샘플 파일 검증
3. 전처리/병합/지표 계산 모듈 구현
4. 대시보드 레이아웃 및 핵심 차트 1차 완성
5. PDF 내보내기 PoC 선택(react-pdf vs playwright)
6. Vercel 프리뷰 배포 및 기능 점검
