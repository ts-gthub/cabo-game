const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['hearts','diamonds','clubs','spades'];

const SUIT_SYMBOL = { hearts:'♥', diamonds:'♦', clubs:'♣', spades:'♠' };

export function suitSymbol(suit) { return SUIT_SYMBOL[suit] || suit; }
export function isRed(suit) { return suit === 'hearts' || suit === 'diamonds'; }

export function scoreValue(rank, suit) {
  if (rank === 'A') return 1;
  if (['2','3','4','5','6','7','8','9','10'].includes(rank)) return parseInt(rank, 10);
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return isRed(suit) ? 0 : 13;
  return 0;
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank}_${suit}`,
        rank,
        suit,
        scoreValue: scoreValue(rank, suit),
        matchRank: rank,
        isRevealed: false,
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function hasPower(rank) {
  return ['7','8','9','10','J','Q','K'].includes(rank);
}

export function powerType(rank) {
  if (rank === '7' || rank === '8') return 'lookOwn';
  if (rank === '9' || rank === '10') return 'lookOpponent';
  if (rank === 'J' || rank === 'Q') return 'swap';
  if (rank === 'K') return 'king';
  return null;
}

export function powerLabel(rank) {
  if (rank === '7' || rank === '8') return 'Look at one of your own cards';
  if (rank === '9' || rank === '10') return "Look at one opponent's card";
  if (rank === 'J' || rank === 'Q') return "Swap one of your cards with an opponent's";
  if (rank === 'K') return "Look at an opponent's card, then optionally swap";
  return '';
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generateId() {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}
