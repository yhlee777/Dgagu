# D가구

날짜 기반 할인 가구 쇼핑 — 입주일을 늦게 잡을수록 할인율이 커지는 자취 가구 예약 사이트.

## 0. 로컬에서 실행하기

```bash
npm install
cp .env.example .env.local   # 아래 1번에서 받은 값으로 채우기
npm run dev
```

## 1. Supabase 설정 (DB)

1. https://supabase.com 에서 새 프로젝트 생성
2. 왼쪽 메뉴 **SQL Editor** → `supabase/schema.sql` 내용을 붙여넣고 실행
   - `products`, `reservations`, `settings` 테이블이 생성돼요
   - ⚠️ 스키마 파일 안에 보안 관련 주의사항(RLS 정책)이 적혀있어요 — 꼭 읽어주세요
3. 초기 상품 20개 채우기:
   ```bash
   node scripts/generate-seed-sql.mjs > supabase/seed.sql
   ```
   생성된 `supabase/seed.sql` 내용을 SQL Editor에 붙여넣고 실행
4. 왼쪽 메뉴 **Project Settings → API**에서 다음 두 값을 복사:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
5. `.env.local`에 붙여넣기 (`.env.example` 참고)

## 2. Vercel 배포

1. 이 프로젝트를 GitHub 저장소에 올리기
2. https://vercel.com → **Add New → Project** → 방금 올린 저장소 선택
   - Vite 프로젝트는 자동으로 인식돼요 (별도 설정 불필요)
3. **Environment Variables**에 `.env.local`과 동일하게 등록:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

이후 `main` 브랜치에 푸시할 때마다 자동 재배포돼요.

## 3. 관리자 페이지

- 우측 상단 **ADMIN** 클릭 → PIN 입력 (기본값 `0610`)
- PIN은 `src/App.jsx`의 `ADMIN_PIN` 상수에서 변경 가능
- ⚠️ 이 PIN은 **화면 진입만** 막아요. Supabase의 `products`/`settings` 테이블은 현재 RLS가
  "누구나 읽기/쓰기 가능"으로 열려있어서, anon key를 아는 사람은 API로 직접 데이터를 바꿀 수 있어요.
  실제 운영 단계에서는 **Supabase Auth로 관리자 로그인**을 추가하고, 쓰기 권한을 인증된
  사용자로만 제한하는 게 좋아요. (`supabase/schema.sql`의 정책 부분 참고)

## 폴더 구조

```
src/
  App.jsx              메인 컴포넌트 (쇼핑 화면 + 관리자 화면)
  index.css            전역 스타일 (Tailwind + 디자인 시스템)
  data/seedProducts.js 초기 상품 20개
  lib/supabaseClient.js
  lib/resizeImage.js   업로드 이미지 리사이즈
supabase/
  schema.sql           DB 테이블 + 보안 정책
  seed.sql             초기 상품 INSERT문 (생성됨)
scripts/
  generate-seed-sql.mjs
```

## 다음 단계 후보

- 상품 사진 실사 채워넣기 (관리자 → 상품 편집)
- Supabase Auth로 관리자 로그인 추가 (RLS 강화)
- 상품 이미지를 Supabase Storage로 옮기기 (현재는 base64로 DB에 저장)
