/** 뱅! 베이스 세트 카드, 역할, 인물. 문양/숫자는 기본판 구성입니다. */

export const SUITS = {
  hearts: { ko: "하트", symbol: "♥", red: true },
  diamonds: { ko: "다이아", symbol: "♦", red: true },
  clubs: { ko: "클럽", symbol: "♣", red: false },
  spades: { ko: "스페이드", symbol: "♠", red: false },
};

export const RANK_VALUE = {
  A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13,
};

const RANKS_2_A = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANKS_2_9 = ["2", "3", "4", "5", "6", "7", "8", "9"];
const RANKS_6_J = ["6", "7", "8", "9", "10", "J"];
const RANKS_10_A = ["10", "J", "Q", "K", "A"];
const RANKS_2_8 = ["2", "3", "4", "5", "6", "7", "8"];
const RANKS_9_J = ["9", "10", "J"];

function cards(type, pairs) {
  return pairs.map(([suit, rank]) => ({ type, suit, rank }));
}
function seq(type, suit, ranks) {
  return ranks.map((rank) => ({ type, suit, rank }));
}

/** 플레이 카드 80장. id는 덱을 만들 때 붙입니다. */
export function baseDeckTemplates() {
  return [
    ...seq("bang", "clubs", RANKS_2_9),
    ...seq("bang", "hearts", ["Q", "K", "A"]),
    ...seq("bang", "diamonds", RANKS_2_A),
    ...cards("bang", [["spades", "A"]]),

    ...seq("missed", "spades", RANKS_2_8),
    ...seq("missed", "clubs", RANKS_10_A),

    ...seq("beer", "hearts", RANKS_6_J),

    ...seq("catbalou", "diamonds", RANKS_9_J),
    ...cards("catbalou", [["hearts", "K"]]),

    ...cards("duel", [["diamonds", "Q"], ["clubs", "8"], ["spades", "J"]]),
    ...cards("gatling", [["hearts", "10"]]),
    ...cards("store", [["clubs", "9"], ["spades", "Q"]]),
    ...cards("indians", [["diamonds", "K"], ["diamonds", "A"]]),

    ...cards("panic", [["diamonds", "8"], ["hearts", "J"], ["hearts", "Q"], ["hearts", "A"]]),
    ...cards("saloon", [["hearts", "5"]]),
    ...cards("stagecoach", [["spades", "9"], ["spades", "9"]]),
    ...cards("wells", [["hearts", "3"]]),

    ...cards("barrel", [["spades", "Q"], ["spades", "K"]]),
    ...cards("dynamite", [["hearts", "2"]]),
    ...cards("jail", [["hearts", "4"], ["spades", "10"], ["spades", "J"]]),
    ...cards("mustang", [["hearts", "8"], ["hearts", "9"]]),
    ...cards("scope", [["spades", "A"]]),
    ...cards("remington", [["clubs", "K"]]),
    ...cards("carbine", [["clubs", "A"]]),
    ...cards("schofield", [["clubs", "J"], ["clubs", "Q"], ["spades", "K"]]),
    ...cards("volcanic", [["clubs", "10"], ["spades", "10"]]),
    ...cards("winchester", [["spades", "8"]]),
  ];
}

export const CARD_INFO = {
  bang: { ko: "뱅!", image: "assets/cards/play/bang.jpg", brown: true, target: true },
  missed: { ko: "빗나감!", image: "assets/cards/play/missed.jpg", brown: true },
  beer: { ko: "맥주", image: "assets/cards/play/beer.jpg", brown: true },
  catbalou: { ko: "캣 벌로우", image: "assets/cards/play/catbalou.jpg", brown: true, target: true },
  panic: { ko: "강탈!", image: "assets/cards/play/panic.jpg", brown: true, target: true },
  duel: { ko: "결투", image: "assets/cards/play/duel.jpg", brown: true, target: true },
  store: { ko: "잡화점", image: "assets/cards/play/store.jpg", brown: true },
  indians: { ko: "인디언!", image: "assets/cards/play/indians.jpg", brown: true },
  gatling: { ko: "기관총", image: "assets/cards/play/gatling.jpg", brown: true },
  saloon: { ko: "주점", image: "assets/cards/play/saloon.jpg", brown: true },
  stagecoach: { ko: "역마차", image: "assets/cards/play/stagecoach.jpg", brown: true },
  wells: { ko: "웰스 파고", image: "assets/cards/play/wells.jpg", brown: true },
  jail: { ko: "감옥", image: "assets/cards/play/jail.jpg", target: true },
  dynamite: { ko: "다이너마이트", image: "assets/cards/play/dynamite.jpg" },
  barrel: { ko: "술통", image: "assets/cards/play/barrel.jpg" },
  scope: { ko: "조준경", image: "assets/cards/play/scope.jpg" },
  mustang: { ko: "야생마", image: "assets/cards/play/mustang.jpg" },
  schofield: { ko: "스코필드", image: "assets/cards/play/schofield.jpg", weapon: true, range: 2 },
  remington: { ko: "레밍턴", image: "assets/cards/play/remington.jpg", weapon: true, range: 3 },
  carbine: { ko: "카빈", image: "assets/cards/play/carbine.jpg", weapon: true, range: 4 },
  winchester: { ko: "윈체스터", image: "assets/cards/play/winchester.jpg", weapon: true, range: 5 },
  volcanic: { ko: "볼캐닉", image: "assets/cards/play/volcanic.jpg", weapon: true, range: 1 },
};

export const WEAPON_TYPES = ["volcanic", "schofield", "remington", "carbine", "winchester"];
export const SELF_BLUE = ["mustang", "scope", "barrel", "dynamite"];

export const ROLES = {
  sheriff: { ko: "보안관", image: "assets/cards/role/sheriff.jpg", goal: "무법자와 배신자를 모두 쓰러뜨리세요." },
  deputy: { ko: "부관", image: "assets/cards/role/deputy.jpg", goal: "보안관을 지키세요. 보안관이 이기면 함께 이깁니다." },
  outlaw: { ko: "무법자", image: "assets/cards/role/outlaw.jpg", goal: "보안관을 쓰러뜨리세요." },
  renegade: { ko: "배신자", image: "assets/cards/role/renegade.jpg", goal: "최후의 1인이 되세요. 보안관을 직접 끝내야 합니다." },
};

export const CHARACTERS = [
  { id: "bart", name: "바트 캐시디", en: "Bart Cassidy", hp: 4, image: "assets/cards/char/bart-cassidy.jpg", ability: "생명력을 잃을 때마다 카드를 1장 뽑습니다. 그 피해로 탈락하면 뽑지 않습니다." },
  { id: "blackjack", name: "블랙 잭", en: "Black Jack", hp: 4, image: "assets/cards/char/black-jack.jpg", ability: "두 번째로 뽑은 카드를 공개합니다. 하트나 다이아면 한 장 더 뽑습니다." },
  { id: "calamity", name: "캘러미티 자넷", en: "Calamity Janet", hp: 4, image: "assets/cards/char/calamity-janet.jpg", ability: "뱅!을 빗나감!으로, 빗나감!을 뱅!으로 쓸 수 있습니다." },
  { id: "elgringo", name: "엘 그링고", en: "El Gringo", hp: 3, image: "assets/cards/char/el-gringo.jpg", ability: "다른 사람의 카드로 생명력을 잃으면, 그 사람의 손패를 1장 가져옵니다." },
  { id: "jesse", name: "제시 존스", en: "Jesse Jones", hp: 4, image: "assets/cards/char/jesse-jones.jpg", ability: "턴의 첫 카드는 다른 플레이어의 손패에서 가져올 수 있습니다." },
  { id: "jourdonnais", name: "주르도네", en: "Jourdonnais", hp: 4, image: "assets/cards/char/jourdonnais.jpg", ability: "뱅!을 맞으면 술통처럼 드로우! 합니다. 하트면 빗나갑니다. 술통과 겹칩니다." },
  { id: "kit", name: "키트 칼슨", en: "Kit Carlson", hp: 4, image: "assets/cards/char/kit-carlson.jpg", ability: "턴 시작에 세 장을 보고, 두 장을 가진 뒤 한 장을 덱 위에 올립니다." },
  { id: "lucky", name: "럭키 듀크", en: "Lucky Duke", hp: 4, image: "assets/cards/char/lucky-duke.jpg", ability: "드로우! 할 때 두 장을 뒤집고 그중 하나를 고릅니다." },
  { id: "paul", name: "폴 리그레트", en: "Paul Regret", hp: 3, image: "assets/cards/char/paul-regret.jpg", ability: "다른 플레이어가 보는 당신의 거리가 1 멉니다." },
  { id: "pedro", name: "페드로 라미레즈", en: "Pedro Ramirez", hp: 4, image: "assets/cards/char/pedro-ramirez.jpg", ability: "턴의 첫 카드는 버린 카드 더미 맨 위에서 가져올 수 있습니다." },
  { id: "rose", name: "로즈 둘란", en: "Rose Doolan", hp: 4, image: "assets/cards/char/rose-doolan.jpg", ability: "당신이 보는 다른 플레이어의 거리가 1 가깝습니다." },
  { id: "sid", name: "시드 케첨", en: "Sid Ketchum", hp: 4, image: "assets/cards/char/sid-ketchum.jpg", ability: "카드 두 장을 버려 생명력 1을 회복할 수 있습니다." },
  { id: "slab", name: "슬랩 더 킬러", en: "Slab the Killer", hp: 4, image: "assets/cards/char/slab-the-killer.jpg", ability: "그의 뱅!을 막으려면 빗나감!이 두 장 필요합니다." },
  { id: "suzy", name: "수지 라파예트", en: "Suzy Lafayette", hp: 4, image: "assets/cards/char/suzy-lafayette.jpg", ability: "손패가 비는 즉시 카드를 1장 뽑습니다." },
  { id: "vulture", name: "벌쳐 샘", en: "Vulture Sam", hp: 4, image: "assets/cards/char/vulture-sam.jpg", ability: "누군가 탈락하면 그 플레이어의 카드와 장비 전부를 가져옵니다." },
  { id: "willy", name: "윌리 더 키드", en: "Willy the Kid", hp: 4, image: "assets/cards/char/willy-the-kid.jpg", ability: "턴에 뱅!을 몇 장이든 사용할 수 있습니다." },
];

export function characterById(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}

export function cardLabel(card) {
  if (!card) return "";
  const suit = SUITS[card.suit];
  const name = CARD_INFO[card.type]?.ko || card.type;
  return `${suit.symbol}${card.rank} ${name}`;
}

export function rolesForCount(n) {
  if (n === 4) return ["sheriff", "renegade", "outlaw", "outlaw"];
  if (n === 5) return ["sheriff", "deputy", "renegade", "outlaw", "outlaw"];
  if (n === 6) return ["sheriff", "deputy", "renegade", "outlaw", "outlaw", "outlaw"];
  if (n === 7) return ["sheriff", "deputy", "deputy", "renegade", "outlaw", "outlaw", "outlaw"];
  return null;
}
