// 사용법: node scripts/generate-seed-sql.mjs > supabase/seed.sql
// 그 다음 supabase/seed.sql 내용을 Supabase SQL Editor에 붙여넣어 실행하세요.
import { SEED_PRODUCTS } from '../src/data/seedProducts.js';

function sqlString(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlJson(v) {
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}

const cols = [
  'id', 'category', 'name', '"basePrice"', 'cost', 'rating', 'reviews',
  '"desc"', 'detail', 'dims', 'material', 'images', '"reviewNote"', 'highlights', 'discounts',
];

const rows = SEED_PRODUCTS.map((p) => {
  const values = [
    sqlString(p.id), sqlString(p.category), sqlString(p.name),
    p.basePrice, p.cost ?? 'null', p.rating, p.reviews,
    sqlString(p.desc || ''), sqlString(p.detail || ''), sqlString(p.dims || ''), sqlString(p.material || ''),
    sqlJson(p.images || ['', '', '', '']), sqlString(p.reviewNote || ''),
    sqlJson(p.highlights || []), sqlJson(p.discounts || [0, 10, 20, 30]),
  ];
  return `  (${values.join(', ')})`;
});

console.log(`-- 자동 생성됨: node scripts/generate-seed-sql.mjs`);
console.log(`insert into public.products (${cols.join(', ')}) values`);
console.log(rows.join(',\n') + '\n on conflict (id) do nothing;');
