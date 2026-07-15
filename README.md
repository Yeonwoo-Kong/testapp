# React + Supabase 인증 앱

별도 백엔드 서버 없이 Supabase Auth와 직접 통신하는 React/TypeScript 앱입니다.

## 설정

1. Supabase 프로젝트를 생성합니다.
2. `supabase/migrations`의 SQL 파일을 Supabase Dashboard의 SQL Editor에서 파일명 순서대로 실행합니다. 기존 게시판에 조회수 기능만 추가하는 경우 `202607130002_add_post_views.sql`을 적용합니다.
3. `.env.example`을 `.env.local`로 복사하고 Project Settings > API의 URL과 anon key를 입력합니다.
4. 의존성을 설치하고 실행합니다.

```bash
npm install
npm run dev
```

가입 확인 메일을 사용한다면 Authentication > URL Configuration에서 개발 주소(`http://localhost:5173`)와 실제 배포 주소를 Redirect URLs에 등록하세요.

> `service_role` 키는 브라우저 환경 변수에 절대 넣지 마세요. 이 앱에는 공개용 `anon` 키만 사용합니다.

## Gemini AI 연결

Gemini API 키는 클라이언트 `.env`에 넣지 않고 Supabase Edge Function Secret으로 등록합니다.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_ID
npx supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
npx supabase functions deploy ask-ai
```

배포 후 로그인한 사용자가 홈에서 질문하면 `gemini-3.1-flash-lite` 모델의 답변이 표시됩니다. 첨부 파일은 최대 10MB이며 Gemini가 지원하는 텍스트, 이미지, 오디오, 동영상, PDF 형식을 사용할 수 있습니다.
