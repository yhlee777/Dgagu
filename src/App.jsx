import { useState, useEffect } from 'react';
import {
  Table2, Armchair, BedDouble, DoorClosed, Archive, BookOpen, UtensilsCrossed,
  Lamp, Footprints, Wind, Shirt, Star, ShoppingBag, Calendar, X,
  Plus, Minus, Pencil, Trash2, ImagePlus, Settings2, ClipboardList,
  Phone, User, MapPin, ArrowLeft, LayoutGrid, Wallet,
  Users, Trophy, BadgePercent, Ruler, Layers,
  ChevronLeft, ChevronRight, Lock, Search,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import { resizeImage } from './lib/resizeImage';
import { SEED_PRODUCTS, makeProduct } from './data/seedProducts';

/* ---------------------------------------------------------------------- */
/* constants & helpers                                                     */
/* ---------------------------------------------------------------------- */

const CATEGORIES = [
  { id: 'desk',      label: '책상',     icon: Table2 },
  { id: 'mattress',  label: '매트리스', icon: Layers },
  { id: 'bedframe',  label: '침대프레임', icon: BedDouble },
  { id: 'chair',     label: '의자',     icon: Armchair },
  { id: 'hanger',    label: '행거',     icon: Shirt },
  { id: 'wardrobe',  label: '옷장',     icon: DoorClosed },
];
const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const IMAGE_SLOTS = [
  { label: '단독 제품컷', hint: '제품만 깔끔하게 — 대표 이미지로 쓰여요' },
  { label: '공간 연출컷', hint: '방 안에 배치된 모습을 보여주세요' },
  { label: '측면 각도',   hint: '옆면이나 비스듬한 각도에서' },
  { label: '후면·디테일', hint: '뒷면이나 마감·소재 클로즈업' },
];

const TIERS = [
  { label: '즉시배송', sub: 'D+0~3' },
  { label: '1주 이내', sub: 'D+4~10' },
  { label: '2~3주',    sub: 'D+11~20' },
  { label: '한 달 이상', sub: 'D+21~' },
];
const TIER_MAX = [3, 10, 20, Infinity];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function isoDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function tierIndexFromDays(days) {
  if (days == null) return null;
  if (days < 0) return 0;
  for (let i = 0; i < TIER_MAX.length; i++) if (days <= TIER_MAX[i]) return i;
  return 3;
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target - today) / 86400000);
}
// 'YYYY-MM-DD' -> 그 주 월요일의 'YYYY-MM-DD' (입주 주간 묶음 키)
function weekKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0=일 ... 6=토
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}
function regionCountForWeek(reservations, wk) {
  if (!wk) return 0;
  return reservations.filter((r) => r.moveInDate && weekKey(r.moveInDate) === wk).length;
}
function regionDiscountForCount(thresholds, count) {
  let disc = 0;
  for (const t of thresholds || []) if (count >= t.count) disc = Math.max(disc, t.discount);
  return disc;
}
function priceFor(product, tierIdx, regionDiscount = 0) {
  const timeDisc = tierIdx == null ? 0 : product.discounts[tierIdx] || 0;
  const totalDisc = Math.min(timeDisc + regionDiscount, 90);
  return Math.round(product.basePrice * (1 - totalDisc / 100));
}
function totalDiscountPct(product, tierIdx, regionDiscount = 0) {
  const timeDisc = tierIdx == null ? 0 : product.discounts[tierIdx] || 0;
  return Math.min(timeDisc + regionDiscount, 90);
}
function won(n) {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}
// 카카오/다음 우편번호 검색 팝업 — 별도 API 키 없이 사용 가능
function openAddressSearch(onComplete) {
  function open() {
    new window.daum.Postcode({ oncomplete: onComplete }).open();
  }
  if (window.daum?.Postcode) {
    open();
    return;
  }
  const script = document.createElement('script');
  script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = open;
  document.head.appendChild(script);
}
function dDayLabel(days) {
  if (days == null) return '';
  if (days < 0) return '지난 날짜';
  if (days === 0) return 'D-DAY';
  return `D-${days}`;
}
function reviewLabel(n) {
  return n >= 9999 ? '9,999+' : n.toLocaleString('ko-KR');
}
function purchaseCount(reservations, productId) {
  return reservations.reduce((sum, r) => {
    const item = r.items.find((it) => it.product.id === productId);
    return sum + (item ? item.qty : 0);
  }, 0);
}
/* ---------------------------------------------------------------------- */
/* small shared bits                                                       */
/* ---------------------------------------------------------------------- */

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="border p-3 flex-shrink-0" style={{ borderColor: 'var(--line)', background: 'var(--surface)', minWidth: '120px' }}>
      <div className="flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: 'var(--ink)', opacity: 0.55 }}>
        <Icon size={13} /> {label}
      </div>
      <div className="idn-mono text-lg font-bold mt-1 whitespace-nowrap" style={{ color: 'var(--ink)' }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5 whitespace-nowrap" style={{ color: 'var(--ink)', opacity: 0.45 }}>{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* tier rate table — the signature piece                                   */
/* ---------------------------------------------------------------------- */

function TierGauge({ days, tierIdx, globalDiscounts }) {
  return (
    <div style={{ borderTop: '4px solid var(--gold)' }}>
      <div className="border border-t-0" style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--ink)' }}>
          <span className="idn-display font-bold text-sm" style={{ color: '#fff' }}>입주일 할인 등급표</span>
          <span className="idn-mono text-[11px]" style={{ color: '#fff', opacity: 0.65 }}>
            {days == null ? '날짜 미선택' : `${dDayLabel(days)} 적용중`}
          </span>
        </div>
        <div className="grid grid-cols-4">
          {TIERS.map((t, i) => {
            const active = tierIdx === i;
            return (
              <div
                key={t.label}
                className={`relative text-center py-3 px-1 ${i > 0 ? 'border-l' : ''}`}
                style={{ borderColor: 'var(--line)', background: active ? 'var(--bg)' : 'var(--surface)' }}
              >
                <div className="text-[10px] sm:text-[11px] font-bold" style={{ color: 'var(--ink)' }}>{t.label}</div>
                <div className="idn-mono text-[9px] sm:text-[10px] mt-0.5" style={{ color: 'var(--ink)', opacity: 0.5 }}>{t.sub}</div>
                <div
                  className="idn-display text-2xl sm:text-3xl font-bold mt-1.5"
                  style={{ color: active ? 'var(--stamp)' : 'var(--ink)', opacity: active ? 1 : 0.3 }}
                >
                  −{globalDiscounts[i]}%
                </div>
                {active && (
                  <div className="idn-seal idn-seal-gold absolute -top-2.5 -right-1.5 z-10 w-8 h-8 sm:w-9 sm:h-9 text-[8px] sm:text-[9px]">
                    선택
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-center py-1.5 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.4 }}>
          ※ 입주 예정일에 따라 할인이 자동으로 적용돼요
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* region group-buy gauge — 같은 입주 주간에 모인 인원만큼 추가 할인        */
/* ---------------------------------------------------------------------- */

function RegionGauge({ moveInDate, weekKeyVal, count, thresholds, label }) {
  const sorted = [...(thresholds || [])].sort((a, b) => a.count - b.count);
  const achieved = regionDiscountForCount(sorted, count);
  const next = sorted.find((t) => count < t.count);
  const maxCount = sorted.length ? sorted[sorted.length - 1].count : 1;
  const pct = next ? Math.min(100, (count / next.count) * 100) : 100;

  let weekLabel = '';
  if (weekKeyVal) {
    const start = new Date(`${weekKeyVal}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    weekLabel = `${fmt(start)}~${fmt(end)}`;
  }

  return (
    <div className="border" style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-1.5">
          <Users size={14} style={{ color: 'var(--ink)' }} />
          <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{label || '우리 동네'} 입주 모임</span>
        </div>
        <span className="idn-mono text-xs font-bold" style={{ color: achieved > 0 ? 'var(--stamp)' : 'var(--ink)', opacity: achieved > 0 ? 1 : 0.4 }}>
          {achieved > 0 ? `−${achieved}% 적용중` : '추가할인 없음'}
        </span>
      </div>
      <div className="px-3 py-2.5">
        {!moveInDate ? (
          <div className="text-[11px] text-center py-1" style={{ color: 'var(--ink)', opacity: 0.45 }}>
            입주일을 정하면 같은 주간에 모인 이웃 수를 확인할 수 있어요
          </div>
        ) : (
          <>
            <div className="h-2 w-full overflow-hidden" style={{ background: 'var(--bg)' }}>
              <div className="h-2" style={{ width: `${pct}%`, background: 'var(--gold)' }} />
            </div>
            <div className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--ink)', opacity: 0.6 }}>
              {weekLabel} 입주 주간 · 지금까지 <b style={{ color: 'var(--ink)', opacity: 1 }}>{count}명</b> 모였어요
              {next
                ? <> · {next.count - count}명 더 모이면 −{next.discount}% 추가</>
                : <> · 이번 주간 최대 할인 달성!</>}
            </div>
            {sorted.length > 0 && (
              <div className="flex justify-between idn-mono text-[9px] mt-1" style={{ color: 'var(--ink)', opacity: 0.35 }}>
                {sorted.map((t) => (
                  <span key={t.count}>{t.count}명 −{t.discount}%</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* move-in date calendar — heatmap by discount tier                       */
/* ---------------------------------------------------------------------- */

const TIER_TINT = [0, 10, 18, 30];

function MoveInCalendar({ value, onChange, globalDiscounts }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [view, setView] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));

  const minView = { y: today.getFullYear(), m: today.getMonth() };
  const maxDate = new Date(today.getFullYear(), today.getMonth() + 3, 1);
  const maxView = { y: maxDate.getFullYear(), m: maxDate.getMonth() };
  const canPrev = view.y > minView.y || (view.y === minView.y && view.m > minView.m);
  const canNext = view.y < maxView.y || (view.y === maxView.y && view.m < maxView.m);

  function shiftMonth(delta) {
    setView((v) => {
      let m = v.m + delta, y = v.y;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { y, m };
    });
  }

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) { cells.push(null); continue; }
    const dateObj = new Date(view.y, view.m, dayNum);
    const dateStr = isoDate(view.y, view.m, dayNum);
    const diff = Math.round((dateObj - today) / 86400000);
    const isPast = diff < 0;
    cells.push({ day: dayNum, dateStr, isPast, isToday: diff === 0, isSelected: dateStr === value, tierIdx: isPast ? null : tierIndexFromDays(diff) });
  }
  while (cells.length > 28 && cells.slice(-7).every((c) => c === null)) cells.splice(-7);

  return (
    <div className="border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>
          <Calendar size={15} /> 입주 예정일
        </span>
        {value ? (
          <span className="idn-mono text-xs font-bold px-2 py-1 border" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
            {value.slice(5).replace('-', '/')} 선택됨
          </span>
        ) : (
          <span className="text-xs" style={{ color: 'var(--ink)', opacity: 0.4 }}>날짜를 탭하세요</span>
        )}
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => shiftMonth(-1)} disabled={!canPrev} className="w-8 h-8 flex items-center justify-center disabled:opacity-20">
            <ChevronLeft size={18} style={{ color: 'var(--ink)' }} />
          </button>
          <span className="idn-display font-bold text-sm" style={{ color: 'var(--ink)' }}>{view.y}년 {view.m + 1}월</span>
          <button onClick={() => shiftMonth(1)} disabled={!canNext} className="w-8 h-8 flex items-center justify-center disabled:opacity-20">
            <ChevronRight size={18} style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="idn-mono text-[10px] text-center" style={{ color: 'var(--ink)', opacity: 0.4 }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => cell ? (
            <button
              key={i}
              disabled={cell.isPast}
              onClick={() => onChange(cell.dateStr)}
              className="aspect-square flex flex-col items-center justify-center gap-0.5"
              style={{
                border: cell.isToday ? '2px solid var(--gold)' : '1px solid var(--line)',
                background: cell.isSelected ? 'var(--ink)' : cell.isPast ? 'var(--bg)' : `color-mix(in srgb, var(--stamp) ${TIER_TINT[cell.tierIdx]}%, var(--surface))`,
                color: cell.isSelected ? '#fff' : 'var(--ink)',
                opacity: cell.isPast ? 0.35 : 1,
              }}
            >
              <span className="idn-mono text-xs font-bold leading-none">{cell.day}</span>
              {!cell.isPast && (
                <span className="idn-mono text-[8px] leading-none" style={{ opacity: cell.isSelected ? 0.85 : 0.55 }}>
                  −{globalDiscounts[cell.tierIdx]}%
                </span>
              )}
            </button>
          ) : <div key={i} />)}
        </div>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------------- */

function ProductCard({ product, tierIdx, regionDiscount = 0, qtyInCart, onClick }) {
  const Icon = CAT_BY_ID[product.category].icon;
  const price = priceFor(product, tierIdx, regionDiscount);
  const discPct = totalDiscountPct(product, tierIdx, regionDiscount);
  const hasDiscount = discPct > 0;
  return (
    <button
      onClick={onClick}
      className="relative flex-shrink-0 w-36 sm:w-44 text-left border overflow-hidden"
      style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
    >
      {product.images?.[0] ? (
        <img src={product.images[0]} alt={product.name} className="w-full h-28 object-cover border-b" style={{ borderColor: 'var(--line)' }} />
      ) : (
        <div className="idn-hatch w-full h-28 flex items-center justify-center border-b" style={{ borderColor: 'var(--line)' }}>
          <Icon size={26} style={{ color: 'var(--ink)', opacity: 0.3 }} />
        </div>
      )}
      {qtyInCart > 0 && (
        <div
          className="absolute top-1.5 right-1.5 min-w-[22px] h-[22px] px-1 flex items-center justify-center text-[11px] font-bold idn-mono"
          style={{ background: 'var(--ink)', color: '#fff' }}
        >
          {qtyInCart}
        </div>
      )}
      <div className="p-2.5">
        <div className="text-sm font-bold leading-snug line-clamp-2 min-h-[2.5em]" style={{ color: 'var(--ink)' }}>
          {product.name}
        </div>
        <div className="flex items-center gap-1 text-[11px] mt-1 idn-mono" style={{ color: 'var(--ink)', opacity: 0.5 }}>
          <Star size={11} fill="currentColor" />
          <span>{product.rating.toFixed(1)}</span>
          <span>· {reviewLabel(product.reviews)}</span>
        </div>
        <div className="mt-1.5">
          {hasDiscount ? (
            <div className="flex items-end justify-between gap-1.5">
              <div className="min-w-0">
                <div className="idn-mono text-[10px] line-through truncate" style={{ color: 'var(--ink)', opacity: 0.35 }}>{won(product.basePrice)}</div>
                <div className="idn-display text-lg font-bold leading-none" style={{ color: 'var(--ink)' }}>{won(price)}</div>
              </div>
              <span className="idn-seal w-10 h-10 text-[10px]">−{discPct}%</span>
            </div>
          ) : (
            <div className="idn-display text-lg font-bold" style={{ color: 'var(--ink)' }}>{won(price)}</div>
          )}
        </div>
      </div>
    </button>
  );
}

function CategorySection({ category, products, tierIdx, regionDiscount = 0, cart, onCardClick }) {
  const Icon = category.icon;
  const items = products.filter((p) => p.category === category.id);
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between px-0.5 mb-2">
        <div className="flex items-center gap-1.5">
          <Icon size={15} style={{ color: 'var(--ink)' }} />
          <span className="idn-display font-bold text-sm" style={{ color: 'var(--ink)' }}>{category.label}</span>
        </div>
        <span className="idn-mono text-[10px]" style={{ color: 'var(--ink)', opacity: 0.4 }}>{items.length}종</span>
      </div>
      {items.length === 0 ? (
        <div className="border p-4 text-center text-sm" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.4, background: 'var(--surface)' }}>
          상품 준비중 — 관리자에서 등록해주세요
        </div>
      ) : (
        <div className="idn-noscroll flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              tierIdx={tierIdx}
              regionDiscount={regionDiscount}
              qtyInCart={cart[p.id] || 0}
              onClick={() => onCardClick(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* small section helper                                                    */
/* ---------------------------------------------------------------------- */

function Section({ title, children }) {
  return (
    <div className="mt-5">
      <div className="idn-display font-bold text-sm pb-1.5 mb-2.5 border-b-2" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* product detail page — full page, not a modal                           */
/* ---------------------------------------------------------------------- */

function ProductPage({ product, allProducts, tierIdx, regionDiscount = 0, qtyInCart, cart, reservations, onUpdateCart, onBack, onSelectProduct }) {
  const [qty, setQty] = useState(Math.max(qtyInCart || 1, 1));
  const [activeImg, setActiveImg] = useState(0);
  useEffect(() => { window.scrollTo(0, 0); }, [product.id]);

  const Icon = CAT_BY_ID[product.category].icon;
  const price = priceFor(product, tierIdx, regionDiscount);
  const discPct = totalDiscountPct(product, tierIdx, regionDiscount);
  const hasDiscount = discPct > 0;
  const longDesc = product.detail || product.desc;
  const related = allProducts.filter((p) => p.category === product.category && p.id !== product.id);
  const bought = purchaseCount(reservations, product.id);

  function commit(newQty) {
    onUpdateCart(product.id, newQty);
    onBack();
  }

  return (
    <div className="pb-28">
      {/* gallery */}
      <div className="relative">
        {product.images?.[activeImg] ? (
          <img src={product.images[activeImg]} alt={product.name} className="w-full h-64 object-cover border-b" style={{ borderColor: 'var(--line)' }} />
        ) : (
          <div className="idn-hatch w-full h-64 flex flex-col items-center justify-center gap-1 border-b text-center px-10" style={{ borderColor: 'var(--line)' }}>
            <Icon size={32} style={{ color: 'var(--ink)', opacity: 0.3 }} />
            <span className="text-xs font-bold mt-1.5" style={{ color: 'var(--ink)', opacity: 0.5 }}>{IMAGE_SLOTS[activeImg].label} 준비중</span>
            <span className="text-[10px]" style={{ color: 'var(--ink)', opacity: 0.35 }}>{IMAGE_SLOTS[activeImg].hint}</span>
          </div>
        )}
        <button
          onClick={onBack}
          className="absolute top-3 left-3 w-9 h-9 flex items-center justify-center border"
          style={{ background: 'var(--surface)', borderColor: 'var(--ink)' }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--ink)' }} />
        </button>
        <span
          className="absolute top-3 right-3 idn-mono text-[11px] font-bold px-2 py-1 border"
          style={{ background: 'var(--surface)', borderColor: 'var(--ink)', color: 'var(--ink)' }}
        >
          {CAT_BY_ID[product.category].label}
        </span>
      </div>

      {/* thumbnails — 단독 / 공간연출 / 각도 / 디테일 */}
      <div className="flex gap-1.5 px-4 pt-2 pb-1">
        {IMAGE_SLOTS.map((slot, i) => {
          const active = activeImg === i;
          const has = !!product.images?.[i];
          return (
            <button key={i} onClick={() => setActiveImg(i)} className="flex-1 min-w-0 text-left">
              <div className="w-full aspect-square overflow-hidden" style={{ border: active ? '2px solid var(--ink)' : '1px solid var(--line)' }}>
                {has ? (
                  <img src={product.images[i]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="idn-hatch w-full h-full flex items-center justify-center">
                    <ImagePlus size={14} style={{ color: 'var(--ink)', opacity: 0.25 }} />
                  </div>
                )}
              </div>
              <div className="idn-mono text-[9px] text-center mt-1 leading-tight truncate" style={{ color: 'var(--ink)', opacity: active ? 0.85 : 0.4, fontWeight: active ? 700 : 400 }}>
                {slot.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* title */}
      <div className="px-4 pt-3">
        <h1 className="idn-display text-xl font-bold leading-snug" style={{ color: 'var(--ink)' }}>{product.name}</h1>
        <div className="flex items-center gap-1 text-xs mt-1.5 idn-mono" style={{ color: 'var(--ink)', opacity: 0.55 }}>
          <Star size={12} fill="currentColor" />
          <span>{product.rating.toFixed(1)}</span>
          <span>· 리뷰 {reviewLabel(product.reviews)}개</span>
          {bought > 0 && <span>· 누적구매 {bought}개</span>}
        </div>
      </div>

      {/* highlights */}
      {product.highlights?.length > 0 && (
        <div className="px-4 mt-3 grid grid-cols-3 gap-1.5">
          {product.highlights.map((h) => (
            <div key={h} className="border px-1.5 py-2.5 text-center text-[11px] font-bold leading-tight" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
              {h}
            </div>
          ))}
        </div>
      )}

      <div className="px-4">
        {longDesc && (
          <Section title="제품 소개">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)', opacity: 0.8 }}>{longDesc}</p>
          </Section>
        )}

        <Section title="상세 정보">
          <div className="border" style={{ borderColor: 'var(--line)' }}>
            <div className="flex text-xs border-b" style={{ borderColor: 'var(--line)' }}>
              <div className="w-20 flex-shrink-0 px-2.5 py-2 font-bold flex items-center gap-1.5" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
                <Icon size={12} /> 카테고리
              </div>
              <div className="px-2.5 py-2 flex items-center" style={{ color: 'var(--ink)' }}>{CAT_BY_ID[product.category].label}</div>
            </div>
            {product.dims && (
              <div className="flex text-xs border-b" style={{ borderColor: 'var(--line)' }}>
                <div className="w-20 flex-shrink-0 px-2.5 py-2 font-bold flex items-center gap-1.5" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
                  <Ruler size={12} /> 사이즈
                </div>
                <div className="idn-mono px-2.5 py-2 flex items-center" style={{ color: 'var(--ink)' }}>{product.dims}</div>
              </div>
            )}
            {product.material && (
              <div className="flex text-xs border-b" style={{ borderColor: 'var(--line)' }}>
                <div className="w-20 flex-shrink-0 px-2.5 py-2 font-bold flex items-center gap-1.5" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
                  <Layers size={12} /> 소재
                </div>
                <div className="px-2.5 py-2 flex items-center" style={{ color: 'var(--ink)' }}>{product.material}</div>
              </div>
            )}
            <div className="flex text-xs">
              <div className="w-20 flex-shrink-0 px-2.5 py-2 font-bold flex items-center gap-1.5" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
                <Star size={12} /> 평점
              </div>
              <div className="idn-mono px-2.5 py-2 flex items-center gap-1" style={{ color: 'var(--ink)' }}>
                <Star size={11} fill="currentColor" /> {product.rating.toFixed(1)} · 리뷰 {reviewLabel(product.reviews)}개
              </div>
            </div>
          </div>
        </Section>

        <Section title="현재 가격">
          <div className="border" style={{ borderColor: 'var(--ink)' }}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              {hasDiscount && <span className="idn-mono text-xs line-through" style={{ color: 'var(--ink)', opacity: 0.4 }}>{won(product.basePrice)}</span>}
              <span className="idn-display text-2xl font-bold" style={{ color: 'var(--ink)' }}>{won(price)}</span>
              {hasDiscount && <span className="idn-seal w-9 h-9 text-[10px] ml-auto">−{discPct}%</span>}
            </div>
            <div className="text-[11px] text-center py-1.5 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.5 }}>
              {tierIdx == null ? '입주일을 정하면 할인가가 적용돼요' : '입주일을 늦추면 할인율이 더 커져요'}
            </div>
          </div>
        </Section>
      </div>

      {related.length > 0 && (
        <div className="mt-6">
          <div className="idn-display font-bold text-sm px-4 pb-1.5 mb-2.5 border-b-2" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
            함께 보면 좋은 상품
          </div>
          <div className="idn-noscroll flex gap-2.5 overflow-x-auto pb-1 px-4">
            {related.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                tierIdx={tierIdx}
                regionDiscount={regionDiscount}
                qtyInCart={cart[p.id] || 0}
                onClick={() => onSelectProduct(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        <div className="mx-auto max-w-md border-t-2" style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-2 px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center border flex-shrink-0" style={{ borderColor: 'var(--ink)' }}>
              <button onClick={() => setQty((q) => Math.max(0, q - 1))} className="w-10 h-10 flex items-center justify-center border-r" style={{ borderColor: 'var(--ink)' }}>
                <Minus size={15} style={{ color: 'var(--ink)' }} />
              </button>
              <span className="idn-mono w-9 text-center font-bold text-base" style={{ color: 'var(--ink)' }}>{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="w-10 h-10 flex items-center justify-center border-l" style={{ borderColor: 'var(--ink)' }}>
                <Plus size={15} style={{ color: 'var(--ink)' }} />
              </button>
            </div>
            {qtyInCart > 0 && (
              <button onClick={() => commit(0)} className="px-3 py-3 font-bold text-sm border flex-shrink-0" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
                빼기
              </button>
            )}
            <button
              onClick={() => commit(qty)}
              disabled={qty === 0}
              className="flex-1 py-3 font-bold text-sm disabled:opacity-30"
              style={{ background: 'var(--ink)', color: '#fff' }}
            >
              {qty === 0 ? '수량을 선택하세요' : qtyInCart > 0 ? `수량 변경 — ${won(price * qty)}` : `담기 — ${won(price * qty)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* cart bar + reservation modal                                            */
/* ---------------------------------------------------------------------- */

function CartBar({ cartEntries, subtotal, total, savings, hasDate, onReserve }) {
  if (cartEntries.length === 0) return null;
  const itemCount = cartEntries.reduce((s, e) => s + e.qty, 0);
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20">
      <div className="mx-auto max-w-md border-t-2" style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between gap-3 px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div>
            <div className="idn-mono text-[11px]" style={{ color: 'var(--ink)', opacity: 0.5 }}>
              {itemCount}개 담음
              {hasDate && savings > 0 && <span> · −{won(savings)} 절약</span>}
            </div>
            <div className="flex items-baseline gap-1.5">
              {hasDate && savings > 0 && (
                <span className="idn-mono text-xs line-through" style={{ color: 'var(--ink)', opacity: 0.35 }}>{won(subtotal)}</span>
              )}
              <span className="idn-display text-xl font-bold" style={{ color: 'var(--ink)' }}>{won(total)}</span>
            </div>
          </div>
          <button
            onClick={onReserve}
            className="flex items-center gap-1.5 px-4 py-3 font-bold text-sm flex-shrink-0"
            style={{ background: 'var(--ink)', color: '#fff' }}
          >
            <ShoppingBag size={16} /> 예약하기
          </button>
        </div>
      </div>
    </div>
  );
}

function ReservationModal({ open, onClose, cartEntries, subtotal, total, savings, moveInDate, tierIdx, regionDiscount = 0, regionLabel, initialAddress = '', onSubmit }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(initialAddress);
  const [done, setDone] = useState(false);

  useEffect(() => { setAddress(initialAddress); }, [initialAddress]);

  if (!open) return null;

  const canSubmit = name.trim() && phone.trim() && address.trim();

  // 기간할인 vs 입주모임 할인 절약 금액 분리 (priceFor가 가산식이라 정확히 분리됨)
  const timeSavings = cartEntries.reduce((s, e) => {
    const timeOnlyPrice = priceFor(e.product, tierIdx, 0);
    return s + (e.product.basePrice - timeOnlyPrice) * e.qty;
  }, 0);
  const regionSavings = Math.max(0, savings - timeSavings);

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ name, phone, address, moveInDate, tierIdx, items: cartEntries, subtotal, total, savings, ts: Date.now() });
    setDone(true);
  }
  function handleClose() {
    setName(''); setPhone(''); setAddress(initialAddress); setDone(false); onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm rounded-t-md sm:rounded-md max-h-[85vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        {!done ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
              <h3 className="idn-display font-bold text-base" style={{ color: 'var(--ink)' }}>예약 신청</h3>
              <button onClick={handleClose}><X size={20} style={{ color: 'var(--ink)', opacity: 0.5 }} /></button>
            </div>

            <div className="p-4">
              <div className="border mb-3" style={{ borderColor: 'var(--line)' }}>
                {cartEntries.map((it, idx) => (
                  <div key={it.product.id} className={`flex justify-between text-xs px-2.5 py-2 ${idx > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--line)' }}>
                    <span style={{ color: 'var(--ink)', opacity: 0.7 }}>
                      {CAT_BY_ID[it.product.category].label} · {it.product.name}
                      {it.qty > 1 && <span className="idn-mono"> ×{it.qty}</span>}
                    </span>
                    <span className="idn-mono font-bold flex-shrink-0 ml-2" style={{ color: 'var(--ink)' }}>{won(it.lineTotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold px-2.5 py-2 border-t-2" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
                  <span>합계</span>
                  <span className="idn-display">{won(total)}</span>
                </div>
              </div>
              {savings > 0 && (
                <div className="border mb-3 text-[11px]" style={{ borderColor: 'var(--line)' }}>
                  <div className="px-2.5 py-1.5 font-bold border-b" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.55 }}>
                    할인 내역
                  </div>
                  {timeSavings > 0 && (
                    <div className="flex justify-between px-2.5 py-1.5">
                      <span style={{ color: 'var(--ink)', opacity: 0.7 }}>
                        기간 할인 ({TIERS[tierIdx]?.label} · {TIERS[tierIdx]?.sub})
                      </span>
                      <span className="idn-mono font-bold" style={{ color: 'var(--stamp)' }}>−{won(timeSavings)}</span>
                    </div>
                  )}
                  {regionSavings > 0 && (
                    <div className="flex justify-between px-2.5 py-1.5 border-t" style={{ borderColor: 'var(--line)' }}>
                      <span style={{ color: 'var(--ink)', opacity: 0.7 }}>
                        {regionLabel || '우리 동네'} 입주모임 할인 (−{regionDiscount}%)
                      </span>
                      <span className="idn-mono font-bold" style={{ color: 'var(--stamp)' }}>−{won(regionSavings)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-2.5 py-1.5 border-t font-bold" style={{ borderColor: 'var(--line)', color: 'var(--stamp)' }}>
                    <span>총 절약</span>
                    <span className="idn-mono">−{won(savings)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <div>
                  <label className="text-xs font-bold flex items-center gap-1 mb-1" style={{ color: 'var(--ink)' }}>
                    <User size={13} /> 이름
                  </label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동"
                    className="w-full border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
                </div>
                <div>
                  <label className="text-xs font-bold flex items-center gap-1 mb-1" style={{ color: 'var(--ink)' }}>
                    <Phone size={13} /> 연락처
                  </label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000"
                    className="w-full border px-3 py-2 text-sm idn-mono" style={{ borderColor: 'var(--line)' }} />
                </div>
                <div>
                  <label className="text-xs font-bold flex items-center gap-1 mb-1" style={{ color: 'var(--ink)' }}>
                    <MapPin size={13} /> 배송 주소
                  </label>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 서울시 ○○구 ○○로 12, ○○빌라 101동 502호"
                    rows={2} className="w-full border px-3 py-2 text-sm resize-none" style={{ borderColor: 'var(--line)' }} />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full mt-4 py-3 font-bold text-sm disabled:opacity-30"
                style={{ background: 'var(--ink)', color: '#fff' }}
              >
                {moveInDate ? `${moveInDate} 입주에 맞춰 예약하기` : '예약 신청하기'}
              </button>
              <p className="text-[11px] text-center mt-2 leading-relaxed" style={{ color: 'var(--ink)', opacity: 0.5 }}>
                지금은 결제 없이 예약만 접수돼요. 예약 확인 연락을 드린 뒤 진행돼요.
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-8 px-4">
            <div className="idn-seal w-28 h-28 text-base mx-auto mb-4" style={{ borderWidth: '3px' }}>예약완료</div>
            <p className="text-sm" style={{ color: 'var(--ink)', opacity: 0.7 }}>
              입주일에 맞춰 최저가로 준비해서<br />보내드릴게요.
            </p>
            <button onClick={handleClose} className="mt-5 px-6 py-2.5 font-bold text-sm border-2" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
              확인
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* shop view                                                               */
/* ---------------------------------------------------------------------- */

function ShopView({ products, globalDiscounts, regionThresholds, regionLabel, reservations, onAddReservation }) {
  const [step, setStep] = useState('date'); // 'date' | 'address' | 'shop'
  const [moveInDate, setMoveInDate] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [checked, setChecked] = useState({});
  const [cart, setCart] = useState({}); // productId -> qty
  const [detailId, setDetailId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const days = daysUntil(moveInDate);
  const tierIdx = tierIndexFromDays(days);
  const wk = weekKey(moveInDate);
  const regionCount = regionCountForWeek(reservations, wk);
  const regionDiscount = regionDiscountForCount(regionThresholds, regionCount);
  const fullAddress = address ? `${address}${addressDetail.trim() ? ' ' + addressDetail.trim() : ''}` : '';

  function handleSearchAddress() {
    openAddressSearch((data) => {
      setAddress(data.roadAddress || data.jibunAddress || data.address);
      setAddressDetail('');
    });
  }

  function toggleCategory(catId) {
    setChecked((c) => ({ ...c, [catId]: !c[catId] }));
  }
  function updateCart(productId, qty) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  }

  const cartEntries = Object.entries(cart).map(([id, qty]) => {
    const product = products.find((p) => p.id === id);
    const unitPrice = priceFor(product, tierIdx, regionDiscount);
    return { product, qty, unitPrice, lineBase: product.basePrice * qty, lineTotal: unitPrice * qty };
  });
  const subtotal = cartEntries.reduce((s, e) => s + e.lineBase, 0);
  const total = cartEntries.reduce((s, e) => s + e.lineTotal, 0);
  const savings = subtotal - total;

  function handleReserve() {
    setModalOpen(true);
  }
  function handleSubmitReservation(payload) {
    onAddReservation(payload);
  }
  function handleModalClose() {
    setModalOpen(false);
    setCart({});
  }

  const detailProduct = detailId ? products.find((p) => p.id === detailId) : null;

  if (detailProduct) {
    return (
      <ProductPage
        key={detailProduct.id}
        product={detailProduct}
        allProducts={products}
        tierIdx={tierIdx}
        regionDiscount={regionDiscount}
        qtyInCart={cart[detailProduct.id] || 0}
        cart={cart}
        reservations={reservations}
        onUpdateCart={updateCart}
        onBack={() => setDetailId(null)}
        onSelectProduct={(pid) => setDetailId(pid)}
      />
    );
  }

  return (
    <div className="pb-32">
      <div className="px-4 pt-3 flex items-center justify-center gap-1.5">
        {[
          { id: 'date', label: '입주일' },
          { id: 'address', label: '배송지' },
          { id: 'shop', label: '가구선택' },
        ].map((s, i) => {
          const order = { date: 0, address: 1, shop: 2 };
          const active = order[step] === i;
          const done = order[step] > i;
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <span
                  className="w-4 h-4 flex items-center justify-center text-[10px] font-bold idn-mono"
                  style={{
                    background: active || done ? 'var(--ink)' : 'transparent',
                    color: active || done ? '#fff' : 'var(--ink)',
                    border: active || done ? 'none' : '1px solid var(--line)',
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-[11px] font-bold" style={{ color: 'var(--ink)', opacity: active ? 1 : 0.4 }}>{s.label}</span>
              </div>
              {i < 2 && <span style={{ color: 'var(--ink)', opacity: 0.2 }}>—</span>}
            </div>
          );
        })}
      </div>

      {step === 'date' && (
        <div className="px-4 pt-3 space-y-3">
          <MoveInCalendar value={moveInDate} onChange={setMoveInDate} globalDiscounts={globalDiscounts} />
          <TierGauge days={days} tierIdx={tierIdx} globalDiscounts={globalDiscounts} />
          <button
            onClick={() => setStep('address')}
            disabled={!moveInDate}
            className="w-full py-3 font-bold text-sm disabled:opacity-30"
            style={{ background: 'var(--ink)', color: '#fff' }}
          >
            다음 — 배송지 입력
          </button>
        </div>
      )}

      {step === 'address' && (
        <div className="px-4 pt-3 space-y-3">
          <div className="border p-3" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
            <label className="text-xs font-bold flex items-center gap-1 mb-1.5" style={{ color: 'var(--ink)' }}>
              <MapPin size={13} /> 배송 받을 주소
            </label>
            {address ? (
              <div className="border px-3 py-2 mb-2 flex items-center justify-between gap-2" style={{ borderColor: 'var(--line)' }}>
                <span className="text-sm" style={{ color: 'var(--ink)' }}>{address}</span>
                <button onClick={handleSearchAddress} className="flex-shrink-0 text-[11px] font-bold underline" style={{ color: 'var(--ink)', opacity: 0.6 }}>
                  변경
                </button>
              </div>
            ) : (
              <button
                onClick={handleSearchAddress}
                className="w-full flex items-center justify-center gap-1.5 border-2 py-3 font-bold text-sm"
                style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}
              >
                <Search size={15} /> 주소 검색
              </button>
            )}
            {address && (
              <input
                value={addressDetail}
                onChange={(e) => setAddressDetail(e.target.value)}
                placeholder="동/호수 등 상세주소 (예: 101동 502호)"
                className="w-full border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--line)' }}
              />
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('date')}
              className="flex-shrink-0 px-4 py-3 font-bold text-sm border-2"
              style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}
            >
              이전
            </button>
            <button
              onClick={() => setStep('shop')}
              disabled={!address}
              className="flex-1 py-3 font-bold text-sm disabled:opacity-30"
              style={{ background: 'var(--ink)', color: '#fff' }}
            >
              다음 — 가구 선택
            </button>
          </div>
        </div>
      )}

      {step === 'shop' && (
        <>
      <div className="px-4 pt-3 flex items-center gap-2 text-[11px]" style={{ color: 'var(--ink)' }}>
        <button onClick={() => setStep('date')} className="flex items-center gap-1 border px-2 py-1" style={{ borderColor: 'var(--line)', opacity: 0.7 }}>
          <Calendar size={12} /> {moveInDate} 변경
        </button>
        <button onClick={() => setStep('address')} className="flex items-center gap-1 border px-2 py-1 truncate max-w-[55%]" style={{ borderColor: 'var(--line)', opacity: 0.7 }}>
          <MapPin size={12} className="flex-shrink-0" /> <span className="truncate">{fullAddress}</span>
        </button>
      </div>

      <div className="px-4 mt-3">
        <RegionGauge moveInDate={moveInDate} weekKeyVal={wk} count={regionCount} thresholds={regionThresholds} label={regionLabel} />
      </div>

      <div className="px-4 mt-5">
        <div className="flex items-center gap-1.5 mb-2">
          <LayoutGrid size={16} style={{ color: 'var(--ink)' }} />
          <span className="idn-display font-bold text-sm" style={{ color: 'var(--ink)' }}>필요한 가구를 골라주세요</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {CATEGORIES.map((c) => {
            const active = !!checked[c.id];
            const CatIcon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => toggleCategory(c.id)}
                className="flex flex-col items-center justify-center gap-1.5 py-3 border"
                style={{
                  background: active ? 'var(--ink)' : 'var(--surface)',
                  borderColor: active ? 'var(--ink)' : 'var(--line)',
                }}
              >
                <CatIcon size={20} style={{ color: active ? '#fff' : 'var(--ink)' }} />
                <span className="text-[11px] font-bold" style={{ color: active ? '#fff' : 'var(--ink)' }}>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4">
        {CATEGORIES.filter((c) => checked[c.id]).map((c) => (
          <CategorySection
            key={c.id}
            category={c}
            products={products}
            tierIdx={tierIdx}
            regionDiscount={regionDiscount}
            cart={cart}
            onCardClick={(pid) => setDetailId(pid)}
          />
        ))}
        {CATEGORIES.every((c) => !checked[c.id]) && (
          <div className="mt-6 text-center text-sm py-8 border" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.4, background: 'var(--surface)' }}>
            위에서 가구 종류를 체크하면<br />상품 추천이 여기에 떠요
          </div>
        )}
      </div>

      <CartBar cartEntries={cartEntries} subtotal={subtotal} total={total} savings={savings} hasDate={tierIdx != null} onReserve={handleReserve} />
      <ReservationModal
        open={modalOpen}
        onClose={handleModalClose}
        cartEntries={cartEntries}
        subtotal={subtotal}
        total={total}
        savings={savings}
        moveInDate={moveInDate}
        tierIdx={tierIdx}
        regionDiscount={regionDiscount}
        regionLabel={regionLabel}
        initialAddress={fullAddress}
        onSubmit={handleSubmitReservation}
      />
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* admin: product form                                                     */
/* ---------------------------------------------------------------------- */

function ProductForm({ initial, globalDiscounts, onSave, onCancel }) {
  const isNew = initial == null;
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    category: initial?.category || CATEGORIES[0].id,
    basePrice: initial?.basePrice ?? 30000,
    cost: initial?.cost ?? 15000,
    rating: initial?.rating ?? 4.5,
    reviews: initial?.reviews ?? 500,
    desc: initial?.desc || '',
    detail: initial?.detail || '',
    reviewNote: initial?.reviewNote || '',
    highlights: initial?.highlights?.length ? [...initial.highlights, '', '', ''].slice(0, 3) : ['', '', ''],
    dims: initial?.dims || '',
    material: initial?.material || '',
    images: initial?.images?.length ? [...initial.images, '', '', '', ''].slice(0, 4) : ['', '', '', ''],
    useCustomDiscounts: initial ? true : false,
    discounts: initial?.discounts || [...globalDiscounts],
  }));

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function setImage(i, value) {
    setForm((f) => {
      const imgs = [...f.images];
      imgs[i] = value;
      return { ...f, images: imgs };
    });
  }
  async function handleImageFile(i, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImage(i, await resizeImage(file));
    } catch (err) {
      console.error('image resize failed', err);
    }
  }
  function setDiscount(i, value) {
    setForm((f) => {
      const d = [...f.discounts];
      d[i] = Number(value);
      return { ...f, discounts: d, useCustomDiscounts: true };
    });
  }
  function setHighlight(i, value) {
    setForm((f) => {
      const h = [...f.highlights];
      h[i] = value;
      return { ...f, highlights: h };
    });
  }

  const effectiveDiscounts = form.useCustomDiscounts ? form.discounts : globalDiscounts;

  function handleSave() {
    if (!form.name.trim()) return;
    onSave({
      id: initial?.id,
      name: form.name.trim(),
      category: form.category,
      basePrice: Number(form.basePrice) || 0,
      cost: Number(form.cost) || 0,
      rating: Number(form.rating) || 0,
      reviews: Number(form.reviews) || 0,
      desc: form.desc.trim(),
      detail: form.detail.trim(),
      reviewNote: form.reviewNote.trim(),
      highlights: form.highlights.map((h) => h.trim()).filter(Boolean),
      dims: form.dims.trim(),
      material: form.material.trim(),
      images: form.images,
      discounts: effectiveDiscounts,
    });
  }

  const inputCls = 'w-full border px-3 py-2 text-sm';
  const labelCls = 'text-xs font-bold block mb-1';

  return (
    <div className="border-2 p-4 mb-4" style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}>
      <h3 className="idn-display font-bold text-sm mb-3" style={{ color: 'var(--ink)' }}>
        {isNew ? '새 상품 등록' : '상품 수정'}
      </h3>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="col-span-2">
          <label className={labelCls} style={{ color: 'var(--ink)' }}>상품명</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="예: 메쉬 사무용 의자"
            className={inputCls} style={{ borderColor: 'var(--line)' }} />
        </div>

        <div className="col-span-2">
          <label className={labelCls} style={{ color: 'var(--ink)' }}>상품 사진 4종 (단독 / 공간연출 / 측면 / 후면)</label>
          <div className="space-y-2">
            {IMAGE_SLOTS.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                {form.images[i] ? (
                  <img src={form.images[i]} alt="" className="w-12 h-12 object-cover border flex-shrink-0" style={{ borderColor: 'var(--line)' }} />
                ) : (
                  <div className="idn-hatch w-12 h-12 flex items-center justify-center border flex-shrink-0" style={{ borderColor: 'var(--line)' }}>
                    <ImagePlus size={15} style={{ color: 'var(--ink)', opacity: 0.3 }} />
                  </div>
                )}
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="text-[11px] font-bold" style={{ color: 'var(--ink)' }}>{slot.label}</div>
                  <input type="file" accept="image/*" onChange={(e) => handleImageFile(i, e)} className="w-full text-[11px]" style={{ color: 'var(--ink)' }} />
                  <input
                    type="text"
                    value={form.images[i] && !form.images[i].startsWith('data:') ? form.images[i] : ''}
                    onChange={(e) => setImage(i, e.target.value)}
                    placeholder={form.images[i]?.startsWith('data:') ? '파일 업로드됨 — URL 입력 시 교체돼요' : `또는 URL 붙여넣기 (${slot.hint})`}
                    className="w-full border px-2 py-1 text-xs" style={{ borderColor: 'var(--line)' }}
                  />
                </div>
                {form.images[i] && (
                  <button type="button" onClick={() => setImage(i, '')} className="p-2 border flex-shrink-0 self-start" style={{ borderColor: 'var(--line)' }}>
                    <Trash2 size={14} style={{ color: 'var(--stamp)' }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls} style={{ color: 'var(--ink)' }}>카테고리</label>
          <select value={form.category} onChange={(e) => set('category', e.target.value)}
            className={`${inputCls} bg-white`} style={{ borderColor: 'var(--line)' }}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: 'var(--ink)' }}>정가 (즉시배송 기준)</label>
          <input type="number" value={form.basePrice} onChange={(e) => set('basePrice', e.target.value)}
            className={`${inputCls} idn-mono`} style={{ borderColor: 'var(--line)' }} />
        </div>

        <div>
          <label className={labelCls} style={{ color: 'var(--ink)' }}>도매가/원가</label>
          <input type="number" value={form.cost} onChange={(e) => set('cost', e.target.value)}
            className={`${inputCls} idn-mono`} style={{ borderColor: 'var(--line)' }} />
        </div>
        <div>
          <label className={labelCls} style={{ color: 'var(--ink)' }}>평점</label>
          <input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={(e) => set('rating', e.target.value)}
            className={`${inputCls} idn-mono`} style={{ borderColor: 'var(--line)' }} />
        </div>

        <div>
          <label className={labelCls} style={{ color: 'var(--ink)' }}>리뷰수</label>
          <input type="number" value={form.reviews} onChange={(e) => set('reviews', e.target.value)}
            className={`${inputCls} idn-mono`} style={{ borderColor: 'var(--line)' }} />
        </div>
        <div>
          <label className={labelCls} style={{ color: 'var(--ink)' }}>사이즈 (mm)</label>
          <input value={form.dims} onChange={(e) => set('dims', e.target.value)} placeholder="W600×D400×H750mm"
            className={`${inputCls} idn-mono`} style={{ borderColor: 'var(--line)' }} />
        </div>

        <div className="col-span-2">
          <label className={labelCls} style={{ color: 'var(--ink)' }}>소재</label>
          <input value={form.material} onChange={(e) => set('material', e.target.value)} placeholder="예: PB, 스틸 프레임"
            className={inputCls} style={{ borderColor: 'var(--line)' }} />
        </div>

        <div className="col-span-2">
          <label className={labelCls} style={{ color: 'var(--ink)' }}>한 줄 요약 (목록 카드에 표시)</label>
          <textarea
            value={form.desc} onChange={(e) => set('desc', e.target.value)}
            rows={2} placeholder="예: 좁은 방에도 잘 맞는 기본형 책상이에요"
            className={`${inputCls} resize-none`} style={{ borderColor: 'var(--line)' }}
          />
        </div>

        <div className="col-span-2">
          <label className={labelCls} style={{ color: 'var(--ink)' }}>상세 설명 (상세페이지에 표시)</label>
          <textarea
            value={form.detail} onChange={(e) => set('detail', e.target.value)}
            rows={3} placeholder="이 가구를 고른 이유, 추천 대상, 사용 팁 등을 적어주세요"
            className={`${inputCls} resize-none`} style={{ borderColor: 'var(--line)' }}
          />
        </div>

        <div className="col-span-2">
          <label className={labelCls} style={{ color: 'var(--ink)' }}>핵심 포인트 3가지 (상세페이지 상단 태그)</label>
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                value={form.highlights[i]}
                onChange={(e) => setHighlight(i, e.target.value)}
                placeholder={`포인트 ${i + 1}`}
                className="border px-2 py-2 text-xs text-center" style={{ borderColor: 'var(--line)' }}
              />
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className={labelCls} style={{ color: 'var(--ink)' }}>내부 메모 (비공개 — 고객에게 노출 안 됨)</label>
          <textarea
            value={form.reviewNote} onChange={(e) => set('reviewNote', e.target.value)}
            rows={2} placeholder="시장 평가·주의사항 등 매입/큐레이션 참고용 메모"
            className={`${inputCls} resize-none`} style={{ borderColor: 'var(--line)' }}
          />
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold" style={{ color: 'var(--ink)' }}>입주일별 할인율</label>
          <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--ink)', opacity: 0.6 }}>
            <input type="checkbox" checked={!form.useCustomDiscounts} onChange={(e) => set('useCustomDiscounts', !e.target.checked)} />
            기본값 사용 ({globalDiscounts.map((d) => `${d}%`).join(' / ')})
          </label>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {TIERS.map((t, i) => (
            <div key={t.label} className="border px-2 py-1.5 text-center" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[10px]" style={{ color: 'var(--ink)', opacity: 0.5 }}>{t.label}</div>
              {i === 0 ? (
                <div className="idn-mono text-sm font-bold" style={{ color: 'var(--ink)' }}>0%</div>
              ) : (
                <input
                  type="number" min="0" max="90"
                  value={effectiveDiscounts[i]}
                  onChange={(e) => setDiscount(i, e.target.value)}
                  className="w-full text-center idn-mono text-sm font-bold bg-transparent"
                  style={{ color: 'var(--ink)' }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 border" style={{ borderColor: 'var(--line)' }}>
        <div className="text-[11px] font-bold px-2.5 pt-2" style={{ color: 'var(--ink)', opacity: 0.6 }}>가격 미리보기 (할인가 / 마진율)</div>
        <div className="grid grid-cols-4 gap-1.5 p-2.5">
          {TIERS.map((t, i) => {
            const price = Math.round(form.basePrice * (1 - effectiveDiscounts[i] / 100));
            const margin = price > 0 ? Math.round(((price - form.cost) / price) * 100) : 0;
            return (
              <div key={t.label} className="text-center">
                <div className="idn-mono text-xs font-bold" style={{ color: 'var(--ink)' }}>{price.toLocaleString('ko-KR')}</div>
                <div className="idn-mono text-[10px]" style={{ color: margin >= 0 ? 'var(--ink)' : 'var(--stamp)', opacity: margin >= 0 ? 0.5 : 1 }}>
                  마진 {margin}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={handleSave} disabled={!form.name.trim()}
          className="flex-1 py-2.5 font-bold text-sm disabled:opacity-30"
          style={{ background: 'var(--ink)', color: '#fff' }}>
          저장
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 font-bold text-sm border-2" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
          취소
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* admin: product list / settings / reservations                          */
/* ---------------------------------------------------------------------- */

function AdminProducts({ products, setProducts, globalDiscounts }) {
  const [editing, setEditing] = useState(null); // null | 'new' | product

  async function handleSave(data) {
    if (data.id) {
      setProducts((ps) => ps.map((p) => (p.id === data.id ? { ...p, ...data } : p)));
      const { error } = await supabase.from('products').update(data).eq('id', data.id);
      if (error) console.error('product save failed', error);
    } else {
      const created = makeProduct({ ...data, id: `p${Date.now()}` });
      setProducts((ps) => [...ps, created]);
      const { error } = await supabase.from('products').insert(created);
      if (error) console.error('product save failed', error);
    }
    setEditing(null);
  }
  async function handleDelete(id) {
    setProducts((ps) => ps.filter((p) => p.id !== id));
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) console.error('product delete failed', error);
  }

  return (
    <div>
      {editing ? (
        <ProductForm
          initial={editing === 'new' ? null : editing}
          globalDiscounts={globalDiscounts}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button onClick={() => setEditing('new')}
          className="w-full mb-4 flex items-center justify-center gap-1.5 border-2 border-dashed py-3 font-bold text-sm"
          style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
          <Plus size={16} /> 새 상품 등록
        </button>
      )}

      <div className="space-y-3">
        {CATEGORIES.map((c) => {
          const items = products.filter((p) => p.category === c.id);
          if (items.length === 0) return null;
          const Icon = c.icon;
          return (
            <div key={c.id}>
              <div className="flex items-center gap-1.5 px-1 py-1">
                <Icon size={14} style={{ color: 'var(--ink)' }} />
                <span className="idn-display text-xs font-bold" style={{ color: 'var(--ink)' }}>{c.label}</span>
              </div>
              <div className="border" style={{ borderColor: 'var(--line)' }}>
                {items.map((p, idx) => {
                  const lowest = Math.round(p.basePrice * (1 - p.discounts[3] / 100));
                  const margin = lowest > 0 ? Math.round(((lowest - p.cost) / lowest) * 100) : 0;
                  return (
                    <div key={p.id} className={`flex items-center justify-between gap-2 p-2.5 ${idx > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {p.images?.[0] ? (
                          <img src={p.images[0]} alt="" className="w-9 h-9 object-cover border flex-shrink-0" style={{ borderColor: 'var(--line)' }} />
                        ) : (
                          <div className="w-9 h-9 flex items-center justify-center border flex-shrink-0" style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}>
                            <Icon size={16} style={{ color: 'var(--ink)', opacity: 0.4 }} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                          <div className="idn-mono text-[11px]" style={{ color: 'var(--ink)', opacity: 0.5 }}>
                            {p.basePrice.toLocaleString('ko-KR')} → {lowest.toLocaleString('ko-KR')}
                            <span style={{ color: margin >= 0 ? 'var(--ink)' : 'var(--stamp)' }}> (마진 {margin}%)</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => setEditing(p)} className="p-2 border" style={{ borderColor: 'var(--line)' }}>
                          <Pencil size={14} style={{ color: 'var(--ink)' }} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-2 border" style={{ borderColor: 'var(--line)' }}>
                          <Trash2 size={14} style={{ color: 'var(--stamp)' }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminSettings({ globalDiscounts, setGlobalDiscounts, regionThresholds, setRegionThresholds, regionLabel, setRegionLabel }) {
  function updateThreshold(i, field, value) {
    setRegionThresholds((ts) => ts.map((t, idx) => (idx === i ? { ...t, [field]: Number(value) || 0 } : t)));
  }
  return (
    <div className="space-y-3">
      <div className="border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <h3 className="idn-display font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>기본 할인율 설정</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--ink)', opacity: 0.55 }}>
          새 상품을 등록할 때 기본으로 적용돼요. 이미 등록된 상품에는 영향을 주지 않아요.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {TIERS.map((t, i) => (
            <div key={t.label} className="border px-2 py-2 text-center" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[11px] font-bold" style={{ color: 'var(--ink)' }}>{t.label}</div>
              <div className="text-[10px] idn-mono mb-1" style={{ color: 'var(--ink)', opacity: 0.5 }}>{t.sub}</div>
              {i === 0 ? (
                <div className="idn-mono text-base font-bold" style={{ color: 'var(--ink)' }}>0%</div>
              ) : (
                <input
                  type="number" min="0" max="90"
                  value={globalDiscounts[i]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setGlobalDiscounts((g) => g.map((x, idx) => (idx === i ? v : x)));
                  }}
                  className="w-full text-center idn-mono text-base font-bold bg-transparent"
                  style={{ color: 'var(--ink)' }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <h3 className="idn-display font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>지역 모임 할인 설정</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--ink)', opacity: 0.55 }}>
          같은 입주 주간(월~일)에 예약이 일정 인원 모이면, 그 주간 전체 예약자에게 추가 할인이 적용돼요.
          시간 할인과 더해져요(최대 90%).
        </p>
        <label className="block text-xs font-bold mb-1" style={{ color: 'var(--ink)' }}>지역 이름</label>
        <input
          value={regionLabel}
          onChange={(e) => setRegionLabel(e.target.value)}
          placeholder="예: 강남대 후문"
          className="w-full border px-3 py-2 text-sm mb-3" style={{ borderColor: 'var(--line)' }}
        />
        <label className="block text-xs font-bold mb-1" style={{ color: 'var(--ink)' }}>구간 (인원 → 추가 할인%)</label>
        <div className="space-y-1.5">
          {regionThresholds.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number" min="1"
                value={t.count}
                onChange={(e) => updateThreshold(i, 'count', e.target.value)}
                className="flex-1 border px-2 py-1.5 text-sm idn-mono text-center" style={{ borderColor: 'var(--line)' }}
              />
              <span className="text-xs" style={{ color: 'var(--ink)', opacity: 0.5 }}>명 →</span>
              <input
                type="number" min="0" max="90"
                value={t.discount}
                onChange={(e) => updateThreshold(i, 'discount', e.target.value)}
                className="flex-1 border px-2 py-1.5 text-sm idn-mono text-center" style={{ borderColor: 'var(--line)' }}
              />
              <span className="text-xs" style={{ color: 'var(--ink)', opacity: 0.5 }}>% 추가</span>
              <button
                onClick={() => setRegionThresholds((ts) => ts.filter((_, idx) => idx !== i))}
                className="px-2 py-1.5 text-xs font-bold border" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.5 }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setRegionThresholds((ts) => [...ts, { count: (ts[ts.length - 1]?.count || 0) + 5, discount: (ts[ts.length - 1]?.discount || 0) + 5 }])}
          className="w-full mt-2 py-2 text-xs font-bold border" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}
        >
          + 구간 추가
        </button>
      </div>
    </div>
  );
}

function AdminReservations({ reservations }) {
  if (reservations.length === 0) {
    return (
      <div className="text-center text-sm py-12 border" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.4, background: 'var(--surface)' }}>
        아직 들어온 예약이 없어요.<br />쇼핑 화면에서 예약을 넣어보면 여기 쌓여요.
      </div>
    );
  }

  const totalRevenue = reservations.reduce((s, r) => s + r.total, 0);
  const totalSavings = reservations.reduce((s, r) => s + r.savings, 0);

  const catCount = {};
  reservations.forEach((r) => r.items.forEach((it) => {
    catCount[it.product.category] = (catCount[it.product.category] || 0) + it.qty;
  }));
  const ranking = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
  const maxCount = ranking[0]?.[1] || 1;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        <Stat icon={Users} label="예약" value={`${reservations.length}건`} />
        <Stat icon={Wallet} label="예상 매출" value={won(totalRevenue)} />
        <Stat icon={BadgePercent} label="총 절약 제공" value={won(totalSavings)} />
      </div>

      <div className="border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-1.5 idn-display font-bold text-sm mb-2" style={{ color: 'var(--ink)' }}>
          <Trophy size={15} style={{ color: 'var(--ink)' }} /> 인기 카테고리
        </div>
        <div className="space-y-1.5">
          {ranking.map(([catId, count]) => (
            <div key={catId} className="flex items-center gap-2 text-xs">
              <span className="w-12 flex-shrink-0 font-bold" style={{ color: 'var(--ink)' }}>{CAT_BY_ID[catId].label}</span>
              <div className="flex-1 h-2" style={{ background: 'var(--bg)' }}>
                <div className="h-2" style={{ width: `${(count / maxCount) * 100}%`, background: 'var(--ink)' }} />
              </div>
              <span className="idn-mono w-6 text-right" style={{ color: 'var(--ink)', opacity: 0.6 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="idn-display font-bold text-sm mb-2" style={{ color: 'var(--ink)' }}>예약 목록</div>
        <div className="space-y-2">
          {[...reservations].reverse().map((r) => {
            const tierLabel = r.tierIdx != null ? TIERS[r.tierIdx].label : '날짜 미정';
            return (
              <div key={r.ts} className="border p-3" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{r.name}</div>
                  <div className="idn-mono text-[11px] border px-2 py-0.5" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.7 }}>
                    {r.moveInDate || '-'} · {tierLabel}
                  </div>
                </div>
                <div className="idn-mono text-[11px] mb-1.5" style={{ color: 'var(--ink)', opacity: 0.5 }}>{r.phone}</div>
                {r.address && (
                  <div className="flex items-start gap-1 text-[11px] mb-1.5" style={{ color: 'var(--ink)', opacity: 0.6 }}>
                    <MapPin size={11} className="flex-shrink-0 mt-0.5" />
                    <span>{r.address}</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {r.items.map((it) => (
                    <div key={it.product.id} className="flex justify-between text-xs">
                      <span style={{ color: 'var(--ink)', opacity: 0.65 }}>
                        {CAT_BY_ID[it.product.category].label} · {it.product.name}
                        {it.qty > 1 && <span className="idn-mono"> ×{it.qty}</span>}
                      </span>
                      <span className="idn-mono" style={{ color: 'var(--ink)' }}>{won(it.lineTotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm font-bold mt-1.5 pt-1.5 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
                  <span>합계</span>
                  <span className="idn-mono">
                    {won(r.total)}
                    {r.savings > 0 && <span className="text-[11px] font-normal" style={{ color: 'var(--stamp)' }}> (−{won(r.savings)})</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 관리자 PIN — 운영 시작 전에 이 숫자만 바꿔주세요.
const ADMIN_PIN = '0610';

function AdminGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  function submit() {
    if (pin === ADMIN_PIN) onUnlock();
    else { setError(true); setPin(''); }
  }

  return (
    <div className="px-4 pt-16 pb-32 flex flex-col items-center text-center">
      <Lock size={28} style={{ color: 'var(--ink)' }} />
      <div className="idn-display text-lg font-bold mt-3" style={{ color: 'var(--ink)' }}>관리자 인증</div>
      <p className="text-xs mt-1" style={{ color: 'var(--ink)', opacity: 0.5 }}>PIN을 입력해주세요</p>
      <input
        type="password" inputMode="numeric" autoFocus
        value={pin}
        onChange={(e) => { setPin(e.target.value); setError(false); }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="border text-center text-xl idn-mono mt-5 w-32 py-2"
        style={{ borderColor: error ? 'var(--stamp)' : 'var(--ink)', color: 'var(--ink)' }}
      />
      {error && <div className="idn-mono text-[11px] mt-2" style={{ color: 'var(--stamp)' }}>PIN이 올바르지 않아요</div>}
      <button onClick={submit} className="mt-5 px-8 py-2.5 font-bold text-sm" style={{ background: 'var(--ink)', color: '#fff' }}>
        확인
      </button>
    </div>
  );
}

function AdminView({ products, setProducts, reservations, globalDiscounts, setGlobalDiscounts, regionThresholds, setRegionThresholds, regionLabel, setRegionLabel }) {
  const [tab, setTab] = useState('products');
  const tabs = [
    { id: 'products', label: '상품관리', icon: LayoutGrid },
    { id: 'reservations', label: '예약현황', icon: ClipboardList },
    { id: 'settings', label: '기본설정', icon: Settings2 },
  ];
  return (
    <div className="px-4 py-4">
      <div className="flex border-b-2 mb-4" style={{ borderColor: 'var(--ink)' }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-bold border-b-2 -mb-0.5"
              style={{ borderColor: active ? 'var(--ink)' : 'transparent', color: 'var(--ink)', opacity: active ? 1 : 0.4 }}>
              <Icon size={13} /> {t.label}
              {t.id === 'reservations' && reservations.length > 0 && (
                <span className="idn-seal w-5 h-5 text-[9px]">{reservations.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'products' && <AdminProducts products={products} setProducts={setProducts} globalDiscounts={globalDiscounts} />}
      {tab === 'reservations' && <AdminReservations reservations={reservations} />}
      {tab === 'settings' && <AdminSettings globalDiscounts={globalDiscounts} setGlobalDiscounts={setGlobalDiscounts} regionThresholds={regionThresholds} setRegionThresholds={setRegionThresholds} regionLabel={regionLabel} setRegionLabel={setRegionLabel} />}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('shop');
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [reservations, setReservations] = useState([]);
  const [globalDiscounts, setGlobalDiscounts] = useState([0, 10, 20, 30]);
  const [regionThresholds, setRegionThresholds] = useState([
    { count: 5, discount: 3 },
    { count: 10, discount: 7 },
    { count: 20, discount: 12 },
  ]);
  const [regionLabel, setRegionLabel] = useState('우리 동네');
  const [loaded, setLoaded] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: prods, error: prodErr } = await supabase.from('products').select('*').order('id');
      if (prodErr) console.error('product load failed', prodErr);
      else if (prods?.length && !cancelled) setProducts(prods);

      const { data: res, error: resErr } = await supabase.from('reservations').select('*').order('created_at');
      if (resErr) console.error('reservation load failed', resErr);
      else if (res && !cancelled) setReservations(res);

      const { data: settings, error: setErr } = await supabase
        .from('settings').select('globalDiscounts, regionThresholds, regionLabel').eq('id', 1).single();
      if (setErr) console.error('settings load failed', setErr);
      else if (settings && !cancelled) {
        setGlobalDiscounts(settings.globalDiscounts);
        if (settings.regionThresholds) setRegionThresholds(settings.regionThresholds);
        if (settings.regionLabel) setRegionLabel(settings.regionLabel);
      }

      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    supabase.from('settings').update({ globalDiscounts, regionThresholds, regionLabel }).eq('id', 1)
      .then(({ error }) => error && console.error('settings save failed', error));
  }, [globalDiscounts, regionThresholds, regionLabel, loaded]);

  async function addReservation(r) {
    setReservations((rs) => [...rs, r]);
    const { error } = await supabase.from('reservations').insert({
      name: r.name, phone: r.phone, address: r.address,
      moveInDate: r.moveInDate, tierIdx: r.tierIdx,
      items: r.items, subtotal: r.subtotal, total: r.total, savings: r.savings, ts: r.ts,
    });
    if (error) console.error('reservation save failed', error);
  }

  return (
    <div
      className="idn-root min-h-full"
      style={{
        '--bg': '#EBEEF3', '--surface': '#FFFFFF', '--ink': '#1E2A44',
        '--line': '#D6DCE5', '--stamp': '#D6401F', '--gold': '#AD8A35', '--admin': '#1E2A44',
        background: 'var(--bg)', color: 'var(--ink)',
      }}
    >
      <div className="sticky top-0 z-10" style={{ background: view === 'shop' ? 'var(--ink)' : 'var(--admin)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between text-white">
          <div>
            <div className="flex items-center gap-1.5">
              <div className="idn-seal flex items-center justify-center flex-shrink-0" style={{ width: '24px', height: '24px', background: 'var(--stamp)', borderColor: 'var(--stamp)', color: '#fff', fontSize: '13px' }}>
                D
              </div>
              <div className="idn-display text-xl font-black leading-none">가구</div>
            </div>
            <div className="idn-mono text-[10px] opacity-60 mt-1">합리적인 가구 쇼핑</div>
          </div>
          <div className="flex items-center gap-4 idn-mono text-xs font-bold">
            <button onClick={() => setView('shop')} className="pb-0.5" style={{ borderBottom: view === 'shop' ? '2px solid #fff' : '2px solid transparent', opacity: view === 'shop' ? 1 : 0.45 }}>
              SHOP
            </button>
            <button onClick={() => setView('admin')} className="pb-0.5" style={{ borderBottom: view === 'admin' ? '2px solid #fff' : '2px solid transparent', opacity: view === 'admin' ? 1 : 0.45 }}>
              ADMIN
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto">
        {view === 'shop'
          ? <ShopView products={products} globalDiscounts={globalDiscounts} regionThresholds={regionThresholds} regionLabel={regionLabel} reservations={reservations} onAddReservation={addReservation} />
          : adminUnlocked
            ? <AdminView products={products} setProducts={setProducts} reservations={reservations} globalDiscounts={globalDiscounts} setGlobalDiscounts={setGlobalDiscounts} regionThresholds={regionThresholds} setRegionThresholds={setRegionThresholds} regionLabel={regionLabel} setRegionLabel={setRegionLabel} />
            : <AdminGate onUnlock={() => setAdminUnlocked(true)} />
        }
      </div>

      <div className="text-center idn-mono text-[10px] py-3 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.4 }}>
        Supabase에 데이터가 저장돼요 — 모두가 같은 상품을 보고, 예약은 관리자에게 모여요
      </div>
    </div>
  );
}