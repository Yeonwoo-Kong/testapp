# 오늘 한 걸음 · 운동·식습관 플래너

[Vercel 웹앱 열기](https://<프로젝트-도메인>/move-well.html)

내 운동 환경과 생활 습관에 맞춘 주간 운동 계획과 작은 식습관 목표를 확인하는 웹앱입니다. 로그인한 사용자는 Supabase에 기록을 저장해 다른 기기에서도 이어 쓸 수 있습니다. 각 계정은 본인 기록만 읽고 수정할 수 있습니다.

## 배포 및 공유

저장소의 `main` 브랜치에 반영하면 연결된 Vercel 프로젝트가 빌드·배포합니다. Vercel 프로젝트의 **Settings → Domains**에서 프로덕션 도메인을 확인한 뒤, 아래 주소를 공유하세요.

`https://<프로젝트-도메인>/move-well.html`

## Supabase 설정 (최초 1회)

1. Supabase 프로젝트 대시보드의 **SQL Editor**를 엽니다.
2. [계정별 저장 테이블 마이그레이션](./supabase/migrations/202610080001_create_move_well_states.sql)의 SQL을 실행합니다.
3. Vercel 프로젝트 환경 변수에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`가 설정됐는지 확인하고 다시 배포합니다. `service_role` 키는 브라우저나 공개 저장소에 넣지 마세요.
4. 공유 사용자는 웹앱의 루트 주소에서 회원가입 또는 로그인한 다음 플래너를 엽니다. 회원가입 확인 이메일의 링크가 잘못 이동하면 Supabase **Authentication → URL Configuration**에 Vercel 도메인을 Site URL 및 Redirect URL로 등록하세요.

## 로컬 실행

의존성을 설치한 뒤 `npm run dev`를 실행하세요. 플래너는 `/move-well.html`에서 열립니다. 로그인 전에는 체크 기록이 현재 브라우저에 저장되고, 로그인하면 개인 Supabase 계정으로 저장됩니다.

## 주요 기능

- 운동 장소, 운동 수준, 하루 운동 시간, 주당 운동 일수에 따른 계획 자동 계산
- 준비운동, 유산소, 근력 운동, 마무리 스트레칭의 시간·세트 구성
- 선택한 식습관에 맞춘 실천 팁과 오늘 체크리스트
- 휴대폰 화면 대응 및 계정별 Supabase 동기화

운동 계획은 일반적인 성인용 실천 예시이며 의료 처방이 아닙니다. 통증이나 어지럼이 생기면 운동을 중단하고, 질환·부상 등이 있다면 의료진과 적합성을 확인하세요.
