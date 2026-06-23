// 시즌1 시드 상품 17개 — "자취 시작 세트" 주력 라인업 / Supabase seed SQL 생성에 사용
let pidCounter = 0;
export function makeProduct(o) {
  return {
    id: `p${++pidCounter}`,
    rating: 4.5, reviews: 1000,
    desc: '', detail: '', dims: '', material: '', images: ['', '', '', ''], detailImages: [], reviewNote: '', highlights: [],
    package: 'starter', // 'starter' | 'sleep' | 'full' — 방 상태별 패키지 추천에 사용
    needsInstall: true, installFee: 15000, // 조립이 필요 없는 카테고리(매트리스/의자)는 호출부에서 false로 덮어써요
    shippingFee: 0, // 품목별 배송비(도매상 착불 등) — 손님에겐 설치비와 합쳐 "배송·설치비"로 보여줘요
    tone: 'grey', // 'grey' | 'wood' | 'scandi' — 어울리는 톤. 매트리스처럼 어디나 맞으면 'all'
    ...o,
  };
}

export const SEED_PRODUCTS = [
  makeProduct({ category: 'desk', name: '책장형 원목 책상 1200 (오크)', basePrice: 170000, cost: 135000, installFee: 15000, shippingFee: 20000, tone: 'wood',
    desc: '책장이 일체형으로 붙은 원목 책상, 수납과 공부를 한 번에',
    detail: '책상 옆에 책장이 붙어있어 책과 소품을 바로 정리할 수 있어요. 밝은 오크 우드 상판에 화이트 서랍이 포인트라, 따뜻하면서 깔끔한 분위기를 만들어줘요. 책상과 책장을 따로 살 필요 없이 하나로 끝나요.',
    dims: 'W1200×D500×H750mm (책장 포함)', material: '오크 무늬목 + PB E1등급',
    reviewNote: '책장이 붙어있어 자취방 수납이 한 번에 해결된다는 평이 많아요. 우드 톤이 따뜻하고 고급스럽다는 후기도 많고요.',
    highlights: ['책장 일체형 — 수납+공부 한 번에', '밝은 오크 우드 + 화이트 서랍', '따뜻하고 깔끔한 무드'],
    rating: 4.6, reviews: 800 }),

  makeProduct({ category: 'desk', name: '책장형 책상 1200 (화이트)', basePrice: 170000, cost: 135000, installFee: 15000, shippingFee: 20000, tone: 'grey',
    desc: '책장이 일체형으로 붙은 화이트 책상, 깔끔한 공부방에 딱',
    detail: '책상 옆에 책장이 붙어있어 책과 소품을 바로 정리할 수 있어요. 깔끔한 화이트로 좁은 방도 넓고 환해 보여요. 책상과 책장을 따로 살 필요 없이 하나로 끝나요.',
    dims: 'W1200×D500×H750mm (책장 포함)', material: '화이트 PB E1등급',
    reviewNote: '책장이 붙어있어 자취방 수납이 한 번에 해결된다는 평이 많아요. 화이트라 방이 넓어 보인다는 후기도 많고요.',
    highlights: ['책장 일체형 — 수납+공부 한 번에', '깔끔한 화이트 — 방이 넓어 보임', '좁은 원룸에 적합'],
    rating: 4.6, reviews: 800 }),

  makeProduct({ category: 'mattress', name: '기본 매트리스', basePrice: 65000, cost: 57900, needsInstall: false, shippingFee: 16500, tone: 'all',
    desc: '독립 스프링이라 옆사람 뒤척임이 덜 느껴져요',
    detail: '스프링이 따로따로 움직여서 옆 사람이 뒤척여도 덜 흔들려요. 자취 첫 매트리스로 무난한 두께예요.',
    dims: 'W1100×L2000×H210mm (슈퍼싱글)', material: '독립 포켓스프링 + 패딩 커버',
    reviewNote: '독립 스프링이라 옆사람 뒤척임이 덜 느껴져요',
    highlights: ['독립 스프링 방진동', '자취 첫 매트리스로 무난', '적당한 두께감'],
    rating: 4.6, reviews: 3082 }),

  makeProduct({ category: 'bedframe', name: '무헤드 4단 서랍 침대 SS (매트리스 미포함)', basePrice: 250000, cost: 203000, installFee: 15000, shippingFee: 40000, tone: 'all',
    desc: '4단 서랍 수납까지 있어 옷장 공간이 줄어요',
    detail: '헤드보드 없는 미니멀한 디자인에 4단 서랍이 달려 있어서 계절 옷이나 이불을 따로 보관할 수 있어요. 좁은 방에서 옷장 부담을 줄여줘요.',
    dims: 'W1134×D2225×H1100mm (슈퍼싱글, 서랍 4단)', material: 'PB + 스틸 서랍 레일',
    reviewNote: '서랍이 4단이라 수납력이 좋다는 평이 많고, 헤드 없는 디자인이라 방이 더 넓어 보인다는 후기도 많아요.',
    highlights: ['하단 서랍 4단 내장', '무헤드 미니멀 디자인', '옷장 공간 부담 감소'],
    rating: 4.5, reviews: 1000 }),

  makeProduct({ category: 'chair', name: '메쉬 컴퓨터 사무용 사무실 공부 학생의자', basePrice: 55000, cost: 49500, installFee: 8000, shippingFee: 0,
    desc: '통풍 잘 되는 메쉬 등판의 사무용 학생 의자',
    detail: '메쉬 등판이라 오래 앉아도 통풍이 잘 되고, 사무실·공부방 어디에나 무난하게 어울려요. 책상 밑에 깔끔하게 들어가는 사이즈예요.',
    dims: 'W550×D550×H950~1020mm', material: '메쉬 + 스틸 프레임',
    reviewNote: '메쉬 등받이라 여름에도 덜 덥다는 평이 많고, 가격 대비 튼튼하다는 후기도 많아요.',
    highlights: ['통풍 잘 되는 메쉬 등판', '사무용·학습용 겸용', '가성비 좋은 기본형'],
    rating: 4.5, reviews: 2476 }),

  makeProduct({ category: 'hanger', name: '이동식 2단 스틸 행거 800', basePrice: 130000, cost: 98000, installFee: 15000, shippingFee: 15000,
    desc: '바퀴 달린 2단 스틸 행거, 이동이 자유로워요',
    detail: '바퀴가 달려 있어 청소할 때나 배치를 바꿀 때 쉽게 옮길 수 있어요. 2단 구조라 위아래로 옷을 나눠 걸 수 있어요.',
    dims: 'W600×D400×H750mm', material: '스틸 (32mm 파이프)',
    reviewNote: '풀옵션 옷장이 부족할 때 바로 추가하는 행거',
    highlights: ['바퀴 달린 이동식', '2단 구조로 수납력 좋음', '옷장 부족할 때 바로 추가'],
    rating: 4.5, reviews: 1000 }),

  makeProduct({ category: 'wardrobe', name: '서랍 행거 옷장 800', basePrice: 220000, cost: 160000, installFee: 15000, shippingFee: 40000, tone: 'all',
    desc: '도어형 옷장, 선반과 행거 공간이 함께 있어요',
    detail: '서랍 수납과 옷걸이 공간이 함께 있어서 접는 옷과 거는 옷을 한 번에 정리할 수 있어요. 빈 방 입주자에게 특히 필요해요.',
    dims: 'W800×D500×H1800mm', material: 'PB, 친환경 E1등급',
    reviewNote: '도어형 옷장, 선반과 행거 공간이 함께 있어요',
    highlights: ['서랍+행거 공간 함께', '접는 옷·거는 옷 동시 보관', '빈 방 풀세팅에 적합'],
    rating: 4.5, reviews: 1000 }),
];