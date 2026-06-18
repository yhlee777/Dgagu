import { useState, useEffect } from 'react';
import {
  Table2, Armchair, BedDouble, DoorClosed, Archive, BookOpen, UtensilsCrossed,
  Lamp, Footprints, Wind, Shirt, Star, ShoppingBag, Calendar, X,
  Plus, Minus, Pencil, Trash2, ImagePlus, Settings2, ClipboardList, Package,
  Phone, User, MapPin, ArrowLeft, LayoutGrid, Wallet,
  Users, Trophy, BadgePercent, Ruler, Layers,
  ChevronLeft, ChevronRight, Lock, Search, Check,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import { resizeImage, readFileAsDataURL } from './lib/resizeImage';
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
  { label: '사진 1 (대표)', hint: '목록·카드에 보이는 대표 이미지예요' },
  { label: '사진 2', hint: '추가 사진' },
  { label: '사진 3', hint: '추가 사진' },
  { label: '사진 4', hint: '추가 사진' },
];

const ROOM_CHECK_ITEMS = [
  { id: 'bedframe', label: '침대(프레임)' },
  { id: 'desk', label: '책상' },
  { id: 'wardrobe', label: '옷장' },
];

const EARLYBIRD_DAYS_DEFAULT = 28;     // 조기예약 기준일 (입주일 4주 전)
const EARLYBIRD_DISCOUNT_DEFAULT = 6;  // 조기예약 할인 %
const PEAK_MONTHS = [1, 7];            // 성수기 — 2월(1), 8월(7) — 0-indexed
const PEAK_LEAD_DAYS = 42;             // 성수기 마감 기준 (6주)
const REGION_GAUGE_MIN_COUNT = 3;      // 이 인원 이상 모여야 지역 게이지 노출

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function isoDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target - today) / 86400000);
}
function isEarlyBird(dateStr, earlyBirdDays = EARLYBIRD_DAYS_DEFAULT) {
  const d = daysUntil(dateStr);
  return d != null && d >= earlyBirdDays;
}
function isPeakSeason(dateStr) {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  return PEAK_MONTHS.includes(d.getMonth());
}
function isPeakDeadlineSoon(dateStr) {
  if (!dateStr) return false;
  const days = daysUntil(dateStr);
  return isPeakSeason(dateStr) && days != null && days >= 0 && days < PEAK_LEAD_DAYS;
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
function priceFor(product, earlyBird, regionDiscount = 0, earlyBirdDiscount = 0) {
  const earlyDisc = earlyBird ? earlyBirdDiscount : 0;
  const totalDisc = Math.min(earlyDisc + regionDiscount, 90);
  return Math.round(product.basePrice * (1 - totalDisc / 100));
}
function totalDiscountPct(earlyBird, regionDiscount = 0, earlyBirdDiscount = 0) {
  const earlyDisc = earlyBird ? earlyBirdDiscount : 0;
  return Math.min(earlyDisc + regionDiscount, 90);
}
function won(n) {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}
// 카카오톡으로 복사해서 보낼 예약 확인 메시지 — 고객용
function buildReservationMessage(r) {
  const lines = [];
  lines.push(`[D가구] ${r.name}님, 예약 감사해요 🙏`);
  lines.push('');
  lines.push(`입주일: ${r.moveInDate || '미정'}`);
  lines.push('주문 내역:');
  (r.items || []).forEach((it) => {
    const qtyLabel = it.qty > 1 ? ` ×${it.qty}` : '';
    lines.push(`· ${it.product?.name || ''}${qtyLabel}`);
  });
  lines.push('');
  lines.push(`총 금액: ${won(r.total)}`);
  lines.push('');
  lines.push('입주 전날, 설치기사님이 전화로 정확한 방문 시간을 다시 확인드릴게요.');
  lines.push('입주일에 깔끔하게 완성된 방으로 맞이하실 수 있도록 준비할게요!');
  return lines.join('\n');
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
// QR/링크로 들어온 ?agent=A001 같은 부동산 추천코드를 잡아서 보관해요.
// 한 번 잡으면 같은 브라우저에서는 계속 유지돼서, 둘러보다 나중에 예약해도 추천이 따라가요.
function captureReferralAgent() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('agent');
    if (fromUrl) {
      localStorage.setItem('dgagu_referral_agent', fromUrl);
      // 주소창에서 ?agent=... 를 지워서 깔끔하게
      params.delete('agent');
      const rest = params.toString();
      const newUrl = window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
      return fromUrl;
    }
    return localStorage.getItem('dgagu_referral_agent') || '';
  } catch {
    return '';
  }
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

function ArrivalPromise({ moveInDate, earlyBirdDays, earlyBirdDiscount }) {
  const days = daysUntil(moveInDate);
  const early = isEarlyBird(moveInDate, earlyBirdDays);
  const peakSoon = isPeakDeadlineSoon(moveInDate);

  return (
    <div style={{ borderTop: '4px solid var(--gold)' }}>
      <div className="border border-t-0" style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--ink)' }}>
          <span className="idn-display font-bold text-sm" style={{ color: '#fff' }}>입주일 도착 보장</span>
          {moveInDate && (
            <span className="idn-mono text-[11px]" style={{ color: '#fff', opacity: 0.65 }}>{dDayLabel(days)}</span>
          )}
        </div>
        <div className="px-3 py-3">
          {!moveInDate ? (
            <div className="text-[12px] text-center py-1" style={{ color: 'var(--ink)', opacity: 0.5 }}>
              입주 예정일을 선택하면 도착 약속을 보여드려요
            </div>
          ) : (
            <>
              <div className="text-sm font-bold mb-1" style={{ color: 'var(--ink)' }}>
                {moveInDate.slice(5).replace('-', '/')} 오전, 설치까지 끝난 방으로
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink)', opacity: 0.65 }}>
                따로 사서 조립할 필요 없이, 입주일 오전에 묶음배송·설치까지 완료된 상태로 받아요.
              </p>
              <div className="mt-2.5 flex items-center justify-between px-2.5 py-2 border" style={{ borderColor: early ? 'var(--gold)' : 'var(--line)', background: early ? 'color-mix(in srgb, var(--gold) 12%, var(--surface))' : 'var(--bg)' }}>
                <span className="text-[12px] font-bold" style={{ color: 'var(--ink)' }}>
                  {early ? '조기예약 할인 적용중' : `${earlyBirdDays}일 전 예약하면 조기예약 할인`}
                </span>
                <span className="idn-mono text-base font-bold" style={{ color: early ? 'var(--stamp)' : 'var(--ink)', opacity: early ? 1 : 0.35 }}>
                  −{earlyBirdDiscount}%
                </span>
              </div>
              {peakSoon && (
                <div className="mt-2 px-2.5 py-2 border-2 text-[12px] font-bold flex items-center gap-1.5" style={{ borderColor: 'var(--stamp)', color: 'var(--stamp)' }}>
                  ⚠ 성수기 입주 주간이에요 — 마감까지 {PEAK_LEAD_DAYS}일도 안 남아서 서두르는 게 좋아요
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* region group-buy gauge — 같은 입주 주간에 모인 인원만큼 추가 할인        */
/* ---------------------------------------------------------------------- */

function RegionGauge({ moveInDate, weekKeyVal, count, thresholds, label }) {
  if (!moveInDate || count < REGION_GAUGE_MIN_COUNT) return null;
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
      </div>
    </div>
  );
}

function PackageCard({ products, roomHas, earlyBird, earlyBirdDiscount, regionDiscount, installIncluded, packageImage, onAddAll, onViewDetail }) {
  const name = packageNameFromRoomState(roomHas);
  const catIds = Object.keys(packageCategoriesFromRoomState(roomHas));
  const defaultItems = catIds.map((id) => defaultProductForCategory(products, id)).filter(Boolean);

  // catId -> 선택된 productId (초기값은 기본 추천 상품)
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(defaultItems.map((p) => [p.category, p.id]))
  );
  const [openCat, setOpenCat] = useState(null); // 지금 "변경" 펼쳐진 카테고리

  // roomHas가 바뀌면(방 진단 다시 하면) 선택도 기본값으로 리셋
  useEffect(() => {
    setSelected(Object.fromEntries(defaultItems.map((p) => [p.category, p.id])));
    setOpenCat(null);
  }, [catIds.join(',')]);

  if (defaultItems.length === 0) return null;

  const items = catIds
    .map((catId) => products.find((p) => p.id === selected[catId]) || defaultProductForCategory(products, catId))
    .filter(Boolean);
  const goodsTotal = items.reduce((s, p) => s + priceFor(p, earlyBird, regionDiscount, earlyBirdDiscount), 0);
  const installTotal = installIncluded ? items.reduce((s, p) => s + (p.needsInstall ? (p.installFee || 0) : 0), 0) : 0;
  const total = goodsTotal + installTotal;

  return (
    <div className="border-2" style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}>
      {packageImage && (
        <img src={packageImage} alt={`${name} 완성 사진`} className="w-full h-44 object-cover border-b-2" style={{ borderColor: 'var(--ink)' }} />
      )}
      <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--ink)' }}>
        <span className="idn-display font-bold text-sm" style={{ color: '#fff' }}>추천: {name}</span>
        <span className="text-[10px]" style={{ color: '#fff', opacity: 0.6 }}>마음에 안 들면 바꿔보세요</span>
      </div>
      <div className="px-3 py-2.5">
        <div className="space-y-1.5 mb-2">
          {items.map((p) => {
            const Icon = CAT_BY_ID[p.category].icon;
            const alternatives = products.filter((alt) => alt.category === p.category);
            const isOpen = openCat === p.category;
            return (
              <div key={p.category}>
                <div className="flex items-center justify-between text-xs gap-2">
                  <button
                    onClick={() => onViewDetail(p.id)}
                    className="flex items-center gap-1.5 min-w-0 text-left"
                    style={{ color: 'var(--ink)', opacity: 0.75 }}
                  >
                    <Icon size={13} className="flex-shrink-0" />
                    <span className="truncate underline" style={{ textDecorationColor: 'var(--line)' }}>{p.name}</span>
                  </button>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="idn-mono font-bold" style={{ color: 'var(--ink)' }}>
                      {won(priceFor(p, earlyBird, regionDiscount, earlyBirdDiscount))}
                    </span>
                    {alternatives.length > 1 && (
                      <button
                        onClick={() => setOpenCat(isOpen ? null : p.category)}
                        className="text-[10px] font-bold px-1.5 py-0.5 border"
                        style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.6 }}
                      >
                        {isOpen ? '닫기' : '변경'}
                      </button>
                    )}
                  </span>
                </div>
                {p.needsInstall && (
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink)', opacity: 0.4 }}>
                    {installIncluded ? '조립설치 필요 — 설치비는 합계에 포함돼요' : '조립설치 미포함 — 직접 조립 필요'}
                  </div>
                )}
                {isOpen && (
                  <div className="mt-1 mb-1.5 ml-4 space-y-1 border-l pl-2" style={{ borderColor: 'var(--line)' }}>
                    {alternatives.map((alt) => {
                      const active = alt.id === p.id;
                      const altPrice = priceFor(alt, earlyBird, regionDiscount, earlyBirdDiscount);
                      return (
                        <div key={alt.id} className="w-full flex items-center justify-between text-[11px] py-1" style={{ color: 'var(--ink)', opacity: active ? 1 : 0.6 }}>
                          <button onClick={() => onViewDetail(alt.id)} className="flex items-center gap-1 underline text-left" style={{ textDecorationColor: 'var(--line)' }}>
                            {active && <Check size={11} />} {alt.name}
                          </button>
                          <button
                            onClick={() => { setSelected((s) => ({ ...s, [p.category]: alt.id })); setOpenCat(null); }}
                            className="idn-mono font-bold flex-shrink-0 ml-2"
                          >
                            {won(altPrice)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between pt-2 border-t font-bold text-sm mb-2" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
          <span>합계 {installIncluded && <span className="text-[10px] font-normal" style={{ opacity: 0.5 }}>(배송·조립·설치 포함)</span>}</span>
          <span className="idn-display">{won(total)}</span>
        </div>
        <button
          onClick={() => onAddAll(items)}
          className="w-full py-2.5 font-bold text-sm"
          style={{ background: 'var(--ink)', color: '#fff' }}
        >
          이 구성 한번에 담기
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* move-in date calendar — heatmap by discount tier                       */
/* ---------------------------------------------------------------------- */

function MoveInCalendar({ value, onChange, earlyBirdDays, earlyBirdDiscount }) {
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
    cells.push({
      day: dayNum, dateStr, isPast, isToday: diff === 0, isSelected: dateStr === value,
      early: isPast ? false : isEarlyBird(dateStr, earlyBirdDays),
      peakSoon: isPast ? false : isPeakDeadlineSoon(dateStr),
    });
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
                border: cell.isToday ? '2px solid var(--gold)' : cell.peakSoon ? `1px solid var(--stamp)` : '1px solid var(--line)',
                background: cell.isSelected ? 'var(--ink)' : cell.isPast ? 'var(--bg)' : cell.early ? 'color-mix(in srgb, var(--gold) 18%, var(--surface))' : 'var(--surface)',
                color: cell.isSelected ? '#fff' : 'var(--ink)',
                opacity: cell.isPast ? 0.35 : 1,
              }}
            >
              <span className="idn-mono text-xs font-bold leading-none">{cell.day}</span>
              {!cell.isPast && cell.early && (
                <span className="idn-mono text-[8px] leading-none" style={{ opacity: cell.isSelected ? 0.85 : 0.6 }}>
                  −{earlyBirdDiscount}%
                </span>
              )}
            </button>
          ) : <div key={i} />)}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: 'var(--ink)', opacity: 0.5 }}>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 inline-block border" style={{ background: 'color-mix(in srgb, var(--gold) 18%, var(--surface))', borderColor: 'var(--line)' }} />
            조기예약 −{earlyBirdDiscount}%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 inline-block border" style={{ borderColor: 'var(--stamp)' }} />
            성수기 마감임박
          </span>
        </div>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------------- */

function ProductCard({ product, earlyBird, earlyBirdDiscount = 0, regionDiscount = 0, installIncluded = true, qtyInCart, onClick }) {
  const Icon = CAT_BY_ID[product.category].icon;
  const price = priceFor(product, earlyBird, regionDiscount, earlyBirdDiscount);
  const discPct = totalDiscountPct(earlyBird, regionDiscount, earlyBirdDiscount);
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
          {product.needsInstall && (
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--ink)', opacity: 0.4 }}>
              {installIncluded ? '조립설치 필요 — 설치비 별도 포함' : '조립설치 미포함'}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function CategorySection({ category, products, earlyBird, earlyBirdDiscount = 0, regionDiscount = 0, installIncluded = true, cart, onCardClick }) {
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
              earlyBird={earlyBird}
              earlyBirdDiscount={earlyBirdDiscount}
              regionDiscount={regionDiscount}
              installIncluded={installIncluded}
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

function ProductPage({ product, allProducts, earlyBird, earlyBirdDiscount = 0, regionDiscount = 0, installIncluded = true, qtyInCart, cart, reservations, onUpdateCart, onBack, onSelectProduct }) {
  const [qty, setQty] = useState(Math.max(qtyInCart || 1, 1));
  const [activeImg, setActiveImg] = useState(0);
  useEffect(() => { window.scrollTo(0, 0); }, [product.id]);

  const Icon = CAT_BY_ID[product.category].icon;
  const price = priceFor(product, earlyBird, regionDiscount, earlyBirdDiscount);
  const installFee = installIncluded && product.needsInstall ? (product.installFee || 0) : 0;
  const discPct = totalDiscountPct(earlyBird, regionDiscount, earlyBirdDiscount);
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
      </div>

      {product.detailImages?.length > 0 && (
        <div className="mt-1 space-y-0">
          {product.detailImages.map((img, i) => (
            <img key={i} src={img} alt={`${product.name} 상세 ${i + 1}`} className="w-full block" />
          ))}
        </div>
      )}

      <div className="px-4">
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
              <span className="idn-display text-2xl font-bold" style={{ color: 'var(--ink)' }}>{won(price + installFee)}</span>
              {hasDiscount && <span className="idn-seal w-9 h-9 text-[10px] ml-auto">−{discPct}%</span>}
            </div>
            {product.needsInstall && (
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.6 }}>
                <span>가구가 {won(price)} + 조립설치 {installIncluded ? won(installFee) : '미포함'}</span>
              </div>
            )}
            <div className="text-[11px] text-center py-1.5 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.5 }}>
              {earlyBird == null ? '입주일을 정하면 가격이 확정돼요' : earlyBird ? '조기예약 할인이 적용된 가격이에요' : '입주 4주 이내 예약가예요'}
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
                earlyBird={earlyBird}
                earlyBirdDiscount={earlyBirdDiscount}
                regionDiscount={regionDiscount}
                installIncluded={installIncluded}
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

function CartBar({ cartEntries, subtotal, total, savings, installFeeTotal = 0, hasDate, onReserve }) {
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
              {installFeeTotal > 0 && <span> · 조립설치비 {won(installFeeTotal)} 포함</span>}
            </div>
            <div className="flex items-baseline gap-1.5">
              {hasDate && savings > 0 && (
                <span className="idn-mono text-xs line-through" style={{ color: 'var(--ink)', opacity: 0.35 }}>{won(subtotal + installFeeTotal)}</span>
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

// 클립보드 복사 버튼 — 카카오톡으로 보낼 메시지 등을 복사할 때 공용으로 사용
function CopyMessageButton({ text, label, compact = false }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 막힌 환경 — 조용히 무시
    }
  }
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center justify-center gap-1.5 font-bold border-2 ${compact ? 'mt-2 w-full py-1.5 text-[11px]' : 'mt-4 w-full py-2.5 text-xs'}`}
      style={{ borderColor: copied ? 'var(--gold)' : 'var(--ink)', color: copied ? 'var(--gold)' : 'var(--ink)' }}
    >
      {copied ? <Check size={compact ? 12 : 14} /> : <ClipboardList size={compact ? 12 : 14} />}
      {copied ? '복사됐어요' : label}
    </button>
  );
}

function ReservationModal({ open, onClose, cartEntries, subtotal, total, savings, installFeeTotal = 0, installIncluded = true, moveInDate, earlyBird, earlyBirdDays, earlyBirdDiscount = 0, regionDiscount = 0, regionLabel, initialAddress = '', roomHas, referralAgent, onSubmit }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(initialAddress);
  const [done, setDone] = useState(false);

  useEffect(() => { setAddress(initialAddress); }, [initialAddress]);

  if (!open) return null;

  const phoneDigits = phone.replace(/[^0-9]/g, '');
  const phoneValid = phoneDigits.length >= 9 && phoneDigits.length <= 11;
  const canSubmit = name.trim() && phone.trim() && phoneValid && address.trim();

  // 조기예약 할인 vs 입주모임 할인 절약 금액 분리 (priceFor가 가산식이라 정확히 분리됨)
  const earlySavings = cartEntries.reduce((s, e) => {
    const priceNoEarly = priceFor(e.product, false, regionDiscount, earlyBirdDiscount);
    const priceWithEarly = priceFor(e.product, earlyBird, regionDiscount, earlyBirdDiscount);
    return s + (priceNoEarly - priceWithEarly) * e.qty;
  }, 0);
  const regionSavings = Math.max(0, savings - earlySavings);

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ name, phone, address, moveInDate, earlyBird, roomHas, referralAgent, installIncluded, installFeeTotal, items: cartEntries, subtotal, total, savings, ts: Date.now() });
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
                    <span className="idn-mono font-bold flex-shrink-0 ml-2" style={{ color: 'var(--ink)' }}>{won(it.unitPrice * it.qty)}</span>
                  </div>
                ))}
                {installFeeTotal > 0 && (
                  <div className="flex justify-between text-xs px-2.5 py-2 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.7 }}>
                    <span>배송·조립·설치비</span>
                    <span className="idn-mono font-bold">{won(installFeeTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold px-2.5 py-2 border-t-2" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
                  <span>합계</span>
                  <span className="idn-display">{won(total)}</span>
                </div>
                {!installIncluded && (
                  <div className="px-2.5 py-1.5 text-[10px] border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.5 }}>
                    조립설치 미포함 — 가구만 받고 직접 조립해요
                  </div>
                )}
              </div>
              <details className="border mb-3 text-[11px]" style={{ borderColor: 'var(--line)' }}>
                <summary className="px-2.5 py-2 font-bold cursor-pointer" style={{ color: 'var(--ink)' }}>
                  왜 이 가격인가요?
                </summary>
                <div className="px-2.5 pb-2.5 pt-1 space-y-1.5 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.7 }}>
                  <p>이 가격엔 공장 직발주가 + 묶음배송·설치비가 포함돼 있어요. 가구를 따로 사서 직접 조립하거나, 산 뒤에 설치만 따로 맡기면 보통 한 건당 4~8만원이 추가로 들어요.</p>
                  <p>최저가라고 우기는 대신, 가격이 어떻게 만들어지는지를 보여드리는 거예요.</p>
                </div>
              </details>
              {savings > 0 && (
                <div className="border mb-3 text-[11px]" style={{ borderColor: 'var(--line)' }}>
                  <div className="px-2.5 py-1.5 font-bold border-b" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.55 }}>
                    할인 내역
                  </div>
                  {earlySavings > 0 && (
                    <div className="flex justify-between px-2.5 py-1.5">
                      <span style={{ color: 'var(--ink)', opacity: 0.7 }}>
                        조기예약 할인 (입주 {earlyBirdDays}일 전, −{earlyBirdDiscount}%)
                      </span>
                      <span className="idn-mono font-bold" style={{ color: 'var(--stamp)' }}>−{won(earlySavings)}</span>
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
                    className="w-full border px-3 py-2 text-sm idn-mono" style={{ borderColor: phoneDigits && !phoneValid ? 'var(--stamp)' : 'var(--line)' }} />
                  {phoneDigits && !phoneValid && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--stamp)' }}>전화번호를 다시 확인해주세요</div>
                  )}
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
            <CopyMessageButton
              text={buildReservationMessage({ name, moveInDate, items: cartEntries, total })}
              label="고객님께 보낼 카톡 문구 복사하기"
            />
            <button onClick={handleClose} className="mt-3 px-6 py-2.5 font-bold text-sm border-2" style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}>
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

function packageCategoriesFromRoomState(roomHas) {
  const allHave = roomHas.bedframe && roomHas.desk && roomHas.wardrobe;
  if (allHave) return { mattress: true }; // 새 잠자리 세트 — 풀옵션 방, 토퍼/매트리스만
  const cats = {};
  if (!roomHas.bedframe) { cats.bedframe = true; cats.mattress = true; }
  if (!roomHas.desk) { cats.desk = true; cats.chair = true; }
  if (!roomHas.wardrobe) { cats.wardrobe = true; cats.hanger = true; }
  return cats;
}
function packageNameFromRoomState(roomHas) {
  const allHave = roomHas.bedframe && roomHas.desk && roomHas.wardrobe;
  const noneHave = !roomHas.bedframe && !roomHas.desk && !roomHas.wardrobe;
  if (allHave) return '새 잠자리 세트';
  if (noneHave) return '빈 방 풀세팅';
  return '자취 시작 세트';
}
// 패키지 종류를 가리키는 고정 키 — 관리자에서 등록한 대표사진을 찾을 때 씀
function packageKeyFromRoomState(roomHas) {
  const allHave = roomHas.bedframe && roomHas.desk && roomHas.wardrobe;
  const noneHave = !roomHas.bedframe && !roomHas.desk && !roomHas.wardrobe;
  if (allHave) return 'sleep';
  if (noneHave) return 'full';
  return 'starter';
}
// 카테고리별 "기본형" 대표 상품 — 고민 없이 우리가 고른 추천 구성
function defaultProductForCategory(products, catId) {
  const items = products.filter((p) => p.category === catId);
  if (items.length === 0) return null;
  return items.find((p) => p.name.includes('기본') && !p.name.includes('우드')) || items[0];
}

function ShopView({ products, earlyBirdDays, earlyBirdDiscount, regionThresholds, regionLabel, reservations, referralAgent, packageImages, onAddReservation }) {
  const [step, setStep] = useState('room'); // 'room' | 'date' | 'address' | 'shop'
  const [roomHas, setRoomHas] = useState({ bedframe: null, desk: null, wardrobe: null });
  const [moveInDate, setMoveInDate] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [checked, setChecked] = useState({});
  const [cart, setCart] = useState({}); // productId -> qty
  const [installIncluded, setInstallIncluded] = useState(true); // 조립설치 서비스 포함 여부
  const [detailId, setDetailId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const days = daysUntil(moveInDate);
  const earlyBird = moveInDate ? isEarlyBird(moveInDate, earlyBirdDays) : null;
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
  function handleRoomNext() {
    setChecked(packageCategoriesFromRoomState(roomHas));
    setStep('date');
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
    const unitPrice = priceFor(product, earlyBird, regionDiscount, earlyBirdDiscount);
    const unitInstallFee = installIncluded && product.needsInstall ? (product.installFee || 0) : 0;
    return {
      product, qty, unitPrice, unitInstallFee,
      lineBase: product.basePrice * qty,
      lineTotal: (unitPrice + unitInstallFee) * qty,
    };
  });
  const subtotal = cartEntries.reduce((s, e) => s + e.lineBase, 0);
  const installFeeTotal = cartEntries.reduce((s, e) => s + e.unitInstallFee * e.qty, 0);
  const total = cartEntries.reduce((s, e) => s + e.lineTotal, 0);
  const savings = subtotal - (total - installFeeTotal);

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
        earlyBird={earlyBird}
        earlyBirdDiscount={earlyBirdDiscount}
        regionDiscount={regionDiscount}
        installIncluded={installIncluded}
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
      <div className="px-4 pt-3 flex items-center justify-center gap-1">
        {[
          { id: 'room', label: '방 상태' },
          { id: 'date', label: '입주일' },
          { id: 'address', label: '배송지' },
          { id: 'shop', label: '가구선택' },
        ].map((s, i) => {
          const order = { room: 0, date: 1, address: 2, shop: 3 };
          const active = order[step] === i;
          const done = order[step] > i;
          return (
            <div key={s.id} className="flex items-center gap-1">
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
              {i < 3 && <span style={{ color: 'var(--ink)', opacity: 0.2 }}>—</span>}
            </div>
          );
        })}
      </div>

      {step === 'room' && (
        <div className="px-4 pt-3 space-y-3">
          <div className="border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
            <h3 className="idn-display font-bold text-base mb-1" style={{ color: 'var(--ink)' }}>내 방에 뭐가 있나요?</h3>
            <p className="text-xs mb-1" style={{ color: 'var(--ink)', opacity: 0.6 }}>이미 있는 건 빼고, 필요한 것만 보여드릴게요</p>
            {ROOM_CHECK_ITEMS.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2.5 border-t" style={{ borderColor: 'var(--line)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{item.label}</span>
                <div className="flex gap-1.5">
                  {[{ v: true, label: '있어요' }, { v: false, label: '없어요' }].map((opt) => (
                    <button
                      key={String(opt.v)}
                      onClick={() => setRoomHas((h) => ({ ...h, [item.id]: opt.v }))}
                      className="px-3 py-1.5 text-xs font-bold border"
                      style={{
                        borderColor: 'var(--ink)',
                        background: roomHas[item.id] === opt.v ? 'var(--ink)' : 'transparent',
                        color: roomHas[item.id] === opt.v ? '#fff' : 'var(--ink)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={handleRoomNext}
            disabled={Object.values(roomHas).some((v) => v === null)}
            className="w-full py-3 font-bold text-sm disabled:opacity-30"
            style={{ background: 'var(--ink)', color: '#fff' }}
          >
            다음 — 입주일 선택
          </button>
        </div>
      )}

      {step === 'date' && (
        <div className="px-4 pt-3 space-y-3">
          <MoveInCalendar value={moveInDate} onChange={setMoveInDate} earlyBirdDays={earlyBirdDays} earlyBirdDiscount={earlyBirdDiscount} />
          <ArrivalPromise moveInDate={moveInDate} earlyBirdDays={earlyBirdDays} earlyBirdDiscount={earlyBirdDiscount} />
          <div className="flex gap-2">
            <button
              onClick={() => setStep('room')}
              className="flex-shrink-0 px-4 py-3 font-bold text-sm border-2"
              style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}
            >
              이전
            </button>
            <button
              onClick={() => setStep('address')}
              disabled={!moveInDate}
              className="flex-1 py-3 font-bold text-sm disabled:opacity-30"
              style={{ background: 'var(--ink)', color: '#fff' }}
            >
              다음 — 배송지 입력
            </button>
          </div>
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

      <div className="px-4 mt-3 space-y-3">
        <div className="flex items-center justify-between border-2 px-3 py-2.5" style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}>
          <div>
            <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>배송·조립·설치 서비스</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink)', opacity: 0.5 }}>
              {installIncluded ? '입주일에 설치까지 끝난 상태로 받아요' : '가구만 받고 직접 조립해요'}
            </div>
          </div>
          <button
            onClick={() => setInstallIncluded((v) => !v)}
            className="w-12 h-7 rounded-full flex-shrink-0 relative border transition-colors"
            style={{ background: installIncluded ? 'var(--ink)' : 'var(--bg)', borderColor: 'var(--ink)' }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
              style={{ background: installIncluded ? '#fff' : 'var(--ink)', transform: installIncluded ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>
        <PackageCard
          products={products}
          roomHas={roomHas}
          earlyBird={earlyBird}
          earlyBirdDiscount={earlyBirdDiscount}
          regionDiscount={regionDiscount}
          installIncluded={installIncluded}
          packageImage={packageImages?.[packageKeyFromRoomState(roomHas)]}
          onAddAll={(items) => items.forEach((p) => updateCart(p.id, 1))}
          onViewDetail={(pid) => setDetailId(pid)}
        />
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
            earlyBird={earlyBird}
            earlyBirdDiscount={earlyBirdDiscount}
            regionDiscount={regionDiscount}
            installIncluded={installIncluded}
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

      <CartBar cartEntries={cartEntries} subtotal={subtotal} total={total} savings={savings} installFeeTotal={installFeeTotal} hasDate={!!moveInDate} onReserve={handleReserve} />
      <ReservationModal
        open={modalOpen}
        onClose={handleModalClose}
        cartEntries={cartEntries}
        subtotal={subtotal}
        total={total}
        savings={savings}
        installFeeTotal={installFeeTotal}
        installIncluded={installIncluded}
        moveInDate={moveInDate}
        earlyBird={earlyBird}
        earlyBirdDays={earlyBirdDays}
        earlyBirdDiscount={earlyBirdDiscount}
        regionDiscount={regionDiscount}
        regionLabel={regionLabel}
        initialAddress={fullAddress}
        roomHas={roomHas}
        referralAgent={referralAgent}
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

function ProductForm({ initial, earlyBirdDays, earlyBirdDiscount, onSave, onCancel }) {
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
    detailImages: initial?.detailImages?.length ? [...initial.detailImages] : [],
    needsInstall: initial?.needsInstall ?? true,
    installFee: initial?.installFee ?? 15000,
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
  // 설명 이미지(치수도면/특징컷 등) — 여러 장, 한 번에 여러 파일 선택 가능
  async function handleDetailImageFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      // 치수도면·설명컷은 글자가 작아서 재압축하면 흐려져요 — 원본 그대로 저장
      const loaded = await Promise.all(files.map((f) => readFileAsDataURL(f)));
      setForm((f) => ({ ...f, detailImages: [...f.detailImages, ...loaded] }));
    } catch (err) {
      console.error('detail image load failed', err);
    }
    e.target.value = ''; // 같은 파일 다시 선택 가능하도록 초기화
  }
  function removeDetailImage(i) {
    setForm((f) => ({ ...f, detailImages: f.detailImages.filter((_, idx) => idx !== i) }));
  }
  function moveDetailImage(i, dir) {
    setForm((f) => {
      const imgs = [...f.detailImages];
      const j = i + dir;
      if (j < 0 || j >= imgs.length) return f;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      return { ...f, detailImages: imgs };
    });
  }
  function setHighlight(i, value) {
    setForm((f) => {
      const h = [...f.highlights];
      h[i] = value;
      return { ...f, highlights: h };
    });
  }

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
      detailImages: form.detailImages,
      needsInstall: !!form.needsInstall,
      installFee: Number(form.installFee) || 0,
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
          <label className={labelCls} style={{ color: 'var(--ink)' }}>상품 사진 4종</label>
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

        <div className="col-span-2">
          <label className={labelCls} style={{ color: 'var(--ink)' }}>설명 이미지 (치수도면·특징컷 등, 여러 장)</label>
          <p className="text-[11px] mb-2" style={{ color: 'var(--ink)', opacity: 0.5 }}>
            도매상이 준 상세페이지 이미지를 여러 장 한꺼번에 올리면, 상세페이지 설명 아래에 순서대로 쭉 보여줘요. 화질 보존을 위해 원본 그대로 저장해서, 파일이 너무 크면(10MB 이상) 페이지가 무거워질 수 있어요.
          </p>
          <input type="file" accept="image/*" multiple onChange={handleDetailImageFiles} className="w-full text-[11px] mb-2" style={{ color: 'var(--ink)' }} />
          {form.detailImages.length > 0 && (
            <div className="space-y-1.5">
              {form.detailImages.map((img, i) => (
                <div key={i} className="flex items-center gap-2 border p-1.5" style={{ borderColor: 'var(--line)' }}>
                  <img src={img} alt="" className="w-12 h-12 object-cover border flex-shrink-0" style={{ borderColor: 'var(--line)' }} />
                  <span className="flex-1 text-[11px]" style={{ color: 'var(--ink)', opacity: 0.5 }}>{i + 1}번째</span>
                  <button type="button" onClick={() => moveDetailImage(i, -1)} disabled={i === 0} className="p-1.5 border flex-shrink-0 disabled:opacity-20" style={{ borderColor: 'var(--line)' }}>
                    <ChevronLeft size={13} style={{ color: 'var(--ink)' }} />
                  </button>
                  <button type="button" onClick={() => moveDetailImage(i, 1)} disabled={i === form.detailImages.length - 1} className="p-1.5 border flex-shrink-0 disabled:opacity-20" style={{ borderColor: 'var(--line)' }}>
                    <ChevronRight size={13} style={{ color: 'var(--ink)' }} />
                  </button>
                  <button type="button" onClick={() => removeDetailImage(i)} className="p-1.5 border flex-shrink-0" style={{ borderColor: 'var(--line)' }}>
                    <Trash2 size={13} style={{ color: 'var(--stamp)' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
          <label className={labelCls} style={{ color: 'var(--ink)' }}>조립설치</label>
          <div className="flex items-center gap-2 mt-0.5">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink)' }}>
              <input type="checkbox" checked={form.needsInstall} onChange={(e) => set('needsInstall', e.target.checked)} />
              조립 필요
            </label>
            {form.needsInstall && (
              <input
                type="number" value={form.installFee} onChange={(e) => set('installFee', e.target.value)}
                placeholder="설치비"
                className={`${inputCls} idn-mono flex-1`} style={{ borderColor: 'var(--line)' }}
              />
            )}
          </div>
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

      <div className="mt-3 border" style={{ borderColor: 'var(--line)' }}>
        <div className="text-[11px] font-bold px-2.5 pt-2" style={{ color: 'var(--ink)', opacity: 0.6 }}>
          가격 미리보기 (할인가 / 마진율) — 조기예약(입주 {earlyBirdDays}일 전) −{earlyBirdDiscount}%, 기본 할인율은 관리자 → 기본설정에서 조정
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-2.5">
          {[{ label: '일반가', disc: 0 }, { label: `조기예약가 (−${earlyBirdDiscount}%)`, disc: earlyBirdDiscount }].map((t) => {
            const price = Math.round(form.basePrice * (1 - t.disc / 100));
            const margin = price > 0 ? Math.round(((price - form.cost) / price) * 100) : 0;
            return (
              <div key={t.label} className="text-center">
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--ink)', opacity: 0.5 }}>{t.label}</div>
                <div className="idn-mono text-sm font-bold" style={{ color: 'var(--ink)' }}>{price.toLocaleString('ko-KR')}</div>
                <div className="idn-mono text-[10px]" style={{ color: margin >= 0 ? 'var(--ink)' : 'var(--stamp)', opacity: margin >= 0 ? 0.5 : 1 }}>
                  마진 {margin}%
                </div>
              </div>
            );
          })}
        </div>
        {form.needsInstall && (
          <div className="text-[10px] px-2.5 pb-2" style={{ color: 'var(--ink)', opacity: 0.5 }}>
            ※ 위 가격은 가구만 기준이고, 조립설치 켜짐 옵션이면 +{Number(form.installFee || 0).toLocaleString('ko-KR')}원이 고객가에 더 붙어요(설치기사에게 전달되는 항목이라 마진 계산엔 포함 안 함)
          </div>
        )}
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

function AdminProducts({ products, setProducts, earlyBirdDays, earlyBirdDiscount }) {
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
          earlyBirdDays={earlyBirdDays}
          earlyBirdDiscount={earlyBirdDiscount}
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
                  const lowest = Math.round(p.basePrice * (1 - earlyBirdDiscount / 100));
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

function AdminSettings({ earlyBirdDays, setEarlyBirdDays, earlyBirdDiscount, setEarlyBirdDiscount, regionThresholds, setRegionThresholds, regionLabel, setRegionLabel, packageImages, setPackageImages }) {
  function updateThreshold(i, field, value) {
    setRegionThresholds((ts) => ts.map((t, idx) => (idx === i ? { ...t, [field]: Number(value) || 0 } : t)));
  }
  async function handlePackagePhoto(key, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await resizeImage(file);
      setPackageImages((p) => ({ ...p, [key]: data }));
    } catch (err) {
      console.error('package image resize failed', err);
    }
  }
  const PACKAGE_TYPES = [
    { key: 'starter', label: '자취 시작 세트' },
    { key: 'sleep', label: '새 잠자리 세트' },
    { key: 'full', label: '빈 방 풀세팅' },
  ];
  return (
    <div className="space-y-3">
      <div className="border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <h3 className="idn-display font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>패키지 대표 사진</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--ink)', opacity: 0.55 }}>
          가구를 다 꾸민 방 사진이에요. 손님이 가구선택 화면에서 추천 패키지 카드 맨 위에 보게 돼요.
        </p>
        <div className="space-y-2.5">
          {PACKAGE_TYPES.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2.5">
              {packageImages?.[key] ? (
                <img src={packageImages[key]} alt={label} className="w-16 h-16 object-cover border flex-shrink-0" style={{ borderColor: 'var(--line)' }} />
              ) : (
                <div className="idn-hatch w-16 h-16 flex items-center justify-center border flex-shrink-0" style={{ borderColor: 'var(--line)' }}>
                  <ImagePlus size={18} style={{ color: 'var(--ink)', opacity: 0.3 }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold mb-1" style={{ color: 'var(--ink)' }}>{label}</div>
                <input type="file" accept="image/*" onChange={(e) => handlePackagePhoto(key, e)} className="w-full text-[11px]" style={{ color: 'var(--ink)' }} />
              </div>
              {packageImages?.[key] && (
                <button onClick={() => setPackageImages((p) => ({ ...p, [key]: '' }))} className="p-2 border flex-shrink-0" style={{ borderColor: 'var(--line)' }}>
                  <Trash2 size={14} style={{ color: 'var(--stamp)' }} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <h3 className="idn-display font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>조기예약 할인 설정</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--ink)', opacity: 0.55 }}>
          입주일까지 일정 기간 이상 남았을 때만 적용되는 단일 할인이에요. 입주일 캘린더에서 "도착 보장"과 함께 작게 표시돼요.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="border px-2 py-2 text-center" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink)' }}>조기예약 기준 (입주일 며칠 전부터)</div>
            <div className="flex items-center justify-center gap-1">
              <input
                type="number" min="1" max="180"
                value={earlyBirdDays}
                onChange={(e) => setEarlyBirdDays(Number(e.target.value) || 0)}
                className="w-16 text-center idn-mono text-base font-bold bg-transparent"
                style={{ color: 'var(--ink)' }}
              />
              <span className="text-xs" style={{ color: 'var(--ink)', opacity: 0.5 }}>일 전</span>
            </div>
          </div>
          <div className="border px-2 py-2 text-center" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink)' }}>조기예약 할인율</div>
            <div className="flex items-center justify-center gap-1">
              <span className="idn-mono text-base font-bold" style={{ color: 'var(--ink)' }}>−</span>
              <input
                type="number" min="0" max="90"
                value={earlyBirdDiscount}
                onChange={(e) => setEarlyBirdDiscount(Number(e.target.value) || 0)}
                className="w-16 text-center idn-mono text-base font-bold bg-transparent"
                style={{ color: 'var(--ink)' }}
              />
              <span className="idn-mono text-base font-bold" style={{ color: 'var(--ink)' }}>%</span>
            </div>
          </div>
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

  const agentCount = {};
  reservations.forEach((r) => {
    const key = r.referralAgent || '직접 방문';
    agentCount[key] = (agentCount[key] || 0) + 1;
  });
  const agentRanking = Object.entries(agentCount).sort((a, b) => b[1] - a[1]);

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

      {agentRanking.length > 0 && agentRanking.some(([key]) => key !== '직접 방문') && (
        <div className="border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-1.5 idn-display font-bold text-sm mb-2" style={{ color: 'var(--ink)' }}>
            <Users size={15} style={{ color: 'var(--ink)' }} /> 유입 경로 (부동산 제휴)
          </div>
          <div className="space-y-1">
            {agentRanking.map(([key, count]) => (
              <div key={key} className="flex items-center justify-between text-xs" style={{ color: 'var(--ink)' }}>
                <span className="font-bold">{key}</span>
                <span className="idn-mono" style={{ opacity: 0.6 }}>{count}건</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="idn-display font-bold text-sm mb-2" style={{ color: 'var(--ink)' }}>예약 목록</div>
        <div className="space-y-2">
          {[...reservations].reverse().map((r) => {
            const tierLabel = r.moveInDate ? (r.earlyBird ? '조기예약' : '일반') : '날짜 미정';
            return (
              <div key={r.ts} className="border p-3" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{r.name}</div>
                  <div className="idn-mono text-[11px] border px-2 py-0.5" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.7 }}>
                    {r.moveInDate || '-'} · {tierLabel}
                  </div>
                </div>
                <div className="idn-mono text-[11px] mb-1.5" style={{ color: 'var(--ink)', opacity: 0.5 }}>{r.phone}</div>
                {r.referralAgent && (
                  <div className="text-[11px] mb-1.5 inline-block px-1.5 py-0.5 border" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                    추천: {r.referralAgent}
                  </div>
                )}
                {r.installIncluded === false && (
                  <div className="text-[11px] mb-1.5 inline-block px-1.5 py-0.5 border" style={{ borderColor: 'var(--stamp)', color: 'var(--stamp)' }}>
                    ⚠ 조립설치 미포함 — 배송만
                  </div>
                )}
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
                <CopyMessageButton text={buildReservationMessage(r)} label="카톡 문구 복사" compact />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* admin: 발주 집계 — 입주주간별 상품 필요수량                              */
/* ---------------------------------------------------------------------- */

function aggregateOrdersByWeek(reservations) {
  const byWeek = {};
  reservations.forEach((r) => {
    if (!r.moveInDate) return;
    const wk = weekKey(r.moveInDate);
    if (!byWeek[wk]) byWeek[wk] = { items: {}, reservationCount: 0 };
    byWeek[wk].reservationCount += 1;
    (r.items || []).forEach((it) => {
      const pid = it.product?.id;
      if (!pid) return;
      if (!byWeek[wk].items[pid]) byWeek[wk].items[pid] = { product: it.product, qty: 0 };
      byWeek[wk].items[pid].qty += it.qty;
    });
  });
  return byWeek;
}

function AdminOrders({ reservations }) {
  const byWeek = aggregateOrdersByWeek(reservations);
  const weekKeys = Object.keys(byWeek).sort();
  const todayWk = weekKey(isoDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));

  if (weekKeys.length === 0) {
    return (
      <div className="border p-4 text-center text-sm" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.4, background: 'var(--surface)' }}>
        아직 예약이 없어요 — 예약이 들어오면 입주주간별로 발주 수량이 여기 모여요
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--ink)', opacity: 0.55 }}>
        같은 입주 주간(월~일)에 들어온 예약을 상품별로 합산했어요. 예약 확정 즉시 발주하는 걸 기본으로 하고,
        리드타임을 고려해 입주일 전까지 받을 수 있게 일정을 맞추세요.
      </p>
      {weekKeys.map((wk) => {
        const { items, reservationCount } = byWeek[wk];
        const start = new Date(`${wk}T00:00:00`);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
        const isPast = wk < todayWk;
        const sortedItems = Object.values(items).sort((a, b) => CAT_BY_ID[a.product.category]?.label.localeCompare(CAT_BY_ID[b.product.category]?.label) || 0);
        return (
          <div key={wk} className="border" style={{ borderColor: 'var(--ink)', background: 'var(--surface)', opacity: isPast ? 0.5 : 1 }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--ink)' }}>
              <span className="idn-display font-bold text-sm" style={{ color: '#fff' }}>
                {fmt(start)} ~ {fmt(end)} 입주 주간 {isPast && '(지난 주간)'}
              </span>
              <span className="idn-mono text-[11px]" style={{ color: '#fff', opacity: 0.65 }}>예약 {reservationCount}건</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {sortedItems.map(({ product, qty }) => {
                const Icon = CAT_BY_ID[product.category]?.icon;
                return (
                  <div key={product.id} className="flex items-center justify-between px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
                    <span className="flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                      {Icon && <Icon size={14} />} {product.name}
                    </span>
                    <span className="idn-mono font-bold" style={{ color: 'var(--ink)' }}>{qty}개</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
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

function AdminView({ products, setProducts, reservations, earlyBirdDays, setEarlyBirdDays, earlyBirdDiscount, setEarlyBirdDiscount, regionThresholds, setRegionThresholds, regionLabel, setRegionLabel, packageImages, setPackageImages }) {
  const [tab, setTab] = useState('products');
  const tabs = [
    { id: 'products', label: '상품관리', icon: LayoutGrid },
    { id: 'orders', label: '발주', icon: Package },
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

      {tab === 'products' && <AdminProducts products={products} setProducts={setProducts} earlyBirdDays={earlyBirdDays} earlyBirdDiscount={earlyBirdDiscount} />}
      {tab === 'orders' && <AdminOrders reservations={reservations} />}
      {tab === 'reservations' && <AdminReservations reservations={reservations} />}
      {tab === 'settings' && <AdminSettings earlyBirdDays={earlyBirdDays} setEarlyBirdDays={setEarlyBirdDays} earlyBirdDiscount={earlyBirdDiscount} setEarlyBirdDiscount={setEarlyBirdDiscount} regionThresholds={regionThresholds} setRegionThresholds={setRegionThresholds} regionLabel={regionLabel} setRegionLabel={setRegionLabel} packageImages={packageImages} setPackageImages={setPackageImages} />}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState(() => (window.location.pathname.startsWith('/admin') ? 'admin' : 'shop'));
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [reservations, setReservations] = useState([]);
  const [earlyBirdDays, setEarlyBirdDays] = useState(EARLYBIRD_DAYS_DEFAULT);
  const [earlyBirdDiscount, setEarlyBirdDiscount] = useState(EARLYBIRD_DISCOUNT_DEFAULT);
  const [regionThresholds, setRegionThresholds] = useState([
    { count: 5, discount: 3 },
    { count: 10, discount: 7 },
    { count: 20, discount: 12 },
  ]);
  const [regionLabel, setRegionLabel] = useState('우리 동네');
  const [packageImages, setPackageImages] = useState({ starter: '', sleep: '', full: '' });
  const [referralAgent] = useState(() => captureReferralAgent());
  const [loaded, setLoaded] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  // URL 경로(/admin)와 view 상태를 동기화 — 화면엔 ADMIN 탭을 따로 노출하지 않고, 직접 주소로 들어와야만 접근 가능
  useEffect(() => {
    const wantsAdminPath = view === 'admin';
    const isAdminPath = window.location.pathname.startsWith('/admin');
    if (wantsAdminPath && !isAdminPath) {
      window.history.pushState({}, '', '/admin');
    } else if (!wantsAdminPath && isAdminPath) {
      window.history.pushState({}, '', '/');
    }
  }, [view]);

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
        .from('settings').select('earlyBirdDays, earlyBirdDiscount, regionThresholds, regionLabel, packageImages').eq('id', 1).single();
      if (setErr) console.error('settings load failed', setErr);
      else if (settings && !cancelled) {
        if (settings.earlyBirdDays != null) setEarlyBirdDays(settings.earlyBirdDays);
        if (settings.earlyBirdDiscount != null) setEarlyBirdDiscount(settings.earlyBirdDiscount);
        if (settings.regionThresholds) setRegionThresholds(settings.regionThresholds);
        if (settings.regionLabel) setRegionLabel(settings.regionLabel);
        if (settings.packageImages) setPackageImages((p) => ({ ...p, ...settings.packageImages }));
      }

      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    supabase.from('settings').update({ earlyBirdDays, earlyBirdDiscount, regionThresholds, regionLabel, packageImages }).eq('id', 1)
      .then(({ error }) => error && console.error('settings save failed', error));
  }, [earlyBirdDays, earlyBirdDiscount, regionThresholds, regionLabel, packageImages, loaded]);

  async function addReservation(r) {
    setReservations((rs) => [...rs, r]);
    const { error } = await supabase.from('reservations').insert({
      name: r.name, phone: r.phone, address: r.address,
      moveInDate: r.moveInDate, earlyBird: r.earlyBird, roomHas: r.roomHas, referralAgent: r.referralAgent || null,
      installIncluded: r.installIncluded ?? true, installFeeTotal: r.installFeeTotal || 0,
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
            {view === 'admin' && (
              <button onClick={() => setView('shop')} className="pb-0.5 flex items-center gap-1" style={{ opacity: 0.7 }}>
                <ArrowLeft size={12} /> 손님화면으로
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto">
        {view === 'shop'
          ? <ShopView products={products} earlyBirdDays={earlyBirdDays} earlyBirdDiscount={earlyBirdDiscount} regionThresholds={regionThresholds} regionLabel={regionLabel} reservations={reservations} referralAgent={referralAgent} packageImages={packageImages} onAddReservation={addReservation} />
          : adminUnlocked
            ? <AdminView products={products} setProducts={setProducts} reservations={reservations} earlyBirdDays={earlyBirdDays} setEarlyBirdDays={setEarlyBirdDays} earlyBirdDiscount={earlyBirdDiscount} setEarlyBirdDiscount={setEarlyBirdDiscount} regionThresholds={regionThresholds} setRegionThresholds={setRegionThresholds} regionLabel={regionLabel} setRegionLabel={setRegionLabel} packageImages={packageImages} setPackageImages={setPackageImages} />
            : <AdminGate onUnlock={() => setAdminUnlocked(true)} />
        }
      </div>

      <div className="text-center idn-mono text-[10px] py-3 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)', opacity: 0.4 }}>
        Supabase에 데이터가 저장돼요 — 모두가 같은 상품을 보고, 예약은 관리자에게 모여요
      </div>
    </div>
  );
}