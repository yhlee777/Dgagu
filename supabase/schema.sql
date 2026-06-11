-- D가구 — Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에서 그대로 실행하세요.

-- 1) 상품 테이블
create table if not exists public.products (
  id text primary key,
  category text not null,
  name text not null,
  "basePrice" integer not null,
  cost integer,
  rating numeric default 4.5,
  reviews integer default 1000,
  "desc" text default '',
  detail text default '',
  dims text default '',
  material text default '',
  images jsonb default '["","","",""]'::jsonb,
  "reviewNote" text default '',
  highlights jsonb default '[]'::jsonb,
  discounts jsonb default '[0,10,20,30]'::jsonb
);

-- 2) 예약 테이블
create table if not exists public.reservations (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  address text not null,
  "moveInDate" text,
  "tierIdx" integer,
  items jsonb not null,
  subtotal integer not null,
  total integer not null,
  savings integer not null,
  ts bigint not null,
  created_at timestamptz default now()
);

-- 3) 설정 테이블 (기본 할인율 등 — 한 행만 사용)
create table if not exists public.settings (
  id integer primary key default 1,
  "globalDiscounts" jsonb default '[0,10,20,30]'::jsonb,
  constraint settings_single_row check (id = 1)
);
insert into public.settings (id, "globalDiscounts")
  values (1, '[0,10,20,30]'::jsonb)
  on conflict (id) do nothing;

-- 4) RLS 활성화 + 정책
-- ⚠️ 아래 정책은 "일단 동작하게" 하기 위해 누구나 읽기/쓰기가 가능하도록 열어둔 상태예요.
--    실제 운영 단계에서는 Supabase Auth로 관리자 로그인을 붙이고,
--    products/settings의 insert/update/delete는 인증된 admin만 가능하도록 좁혀야 해요.
--    (지금의 PIN 화면은 화면 진입만 막을 뿐, DB API 자체는 막지 못해요.)

alter table public.products enable row level security;
alter table public.reservations enable row level security;
alter table public.settings enable row level security;

create policy "products are viewable by everyone"
  on public.products for select using (true);
create policy "products are editable by everyone (TEMP)"
  on public.products for all using (true) with check (true);

create policy "reservations are viewable by everyone (TEMP)"
  on public.reservations for select using (true);
create policy "anyone can create a reservation"
  on public.reservations for insert with check (true);

create policy "settings are viewable by everyone"
  on public.settings for select using (true);
create policy "settings are editable by everyone (TEMP)"
  on public.settings for update using (true) with check (true);

-- 5) 초기 상품 20개 채우기
--    SEED_PRODUCTS는 src/data/seedProducts.js 에 있어요.
--    아래 명령으로 INSERT문을 자동 생성할 수 있어요:
--      node scripts/generate-seed-sql.mjs > supabase/seed.sql
--    그 다음 supabase/seed.sql 내용을 SQL Editor에 붙여넣어 실행하세요.
