import { db } from './firebase';
import {
  doc, getDoc, setDoc, updateDoc, runTransaction,
} from 'firebase/firestore';
import {
  createDeck, shuffleDeck, generateRoomCode, generateId, hasPower, powerType,
} from './deck';

// ─── Helpers ────────────────────────────────────────────────────────────────

function roomRef(code) { return doc(db, 'rooms', code); }

function advanceTurn(room, overrideRemaining) {
  const order = room.turnOrder;
  const current = room.currentTurnPlayerId;
  const idx = order.indexOf(current);

  if (room.caboCalled) {
    const remaining = overrideRemaining ?? (room.finalTurnsRemaining || []);
    return remaining[0] ?? null;
  }
  return order[(idx + 1) % order.length];
}

function dealCards(shuffled, playerIds) {
  const players = {};
  let deckIdx = 0;
  for (const pid of playerIds) {
    players[pid] = shuffled.slice(deckIdx, deckIdx + 4);
    deckIdx += 4;
  }
  const deck = shuffled.slice(deckIdx);
  const topCard = deck.shift();
  return { players, deck, firstDiscard: topCard };
}

function calcScores(room) {
  const totals = {};
  for (const [pid, pdata] of Object.entries(room.players)) {
    totals[pid] = (pdata.cards || []).reduce((s, c) => s + c.scoreValue, 0);
  }
  const min = Math.min(...Object.values(totals));
  const scores = {};
  for (const [pid, total] of Object.entries(totals)) {
    if (room.caboCalled && pid === room.caboCallerId) {
      scores[pid] = total <= min ? total : 20 + total;
    } else {
      scores[pid] = total;
    }
  }
  return { totals, scores };
}

function endRoundInTx(tx, ref, room, extraUpdates) {
  const { scores } = calcScores({ ...room, ...extraUpdates });
  const playersUpdate = {};
  for (const [pid, pdata] of Object.entries(room.players)) {
    const revealedCards = (pdata.cards || []).map(c => ({ ...c, isRevealed: true }));
    playersUpdate[`players.${pid}.cards`] = revealedCards;
    playersUpdate[`players.${pid}.roundScore`] = scores[pid];
    playersUpdate[`players.${pid}.totalScore`] = (pdata.totalScore || 0) + (scores[pid] ?? 0);
  }
  const isLastRound = room.currentRound >= room.totalRounds;
  tx.update(ref, {
    ...extraUpdates,
    ...playersUpdate,
    status: isLastRound ? 'gameEnd' : 'roundEnd',
    matchWindowActive: false,
    drawnCard: null,
    pendingPower: null,
    pendingGive: null,
  });
}

// Shared post-action turn advance logic (non-cabo and cabo)
function applyTurnAdvance(tx, ref, room, updates) {
  if (room.caboCalled) {
    const remaining = [...(room.finalTurnsRemaining || [])];
    remaining.shift();
    updates.finalTurnsRemaining = remaining;
    updates.currentTurnPlayerId = remaining[0] ?? null;
    if (remaining.length === 0) {
      return endRoundInTx(tx, ref, room, updates);
    }
  } else {
    updates.currentTurnPlayerId = advanceTurn(room);
  }
  tx.update(ref, updates);
}

// ─── Room creation & joining ─────────────────────────────────────────────────

export async function createRoom(hostName, playerLimit, totalRounds) {
  let code;
  for (let attempt = 0; attempt < 10; attempt++) {
    code = generateRoomCode();
    const snap = await getDoc(roomRef(code));
    if (!snap.exists()) break;
  }
  const hostId = generateId();
  const room = {
    roomCode: code,
    hostId,
    playerLimit,
    totalRounds,
    currentRound: 0,
    status: 'lobby',
    currentTurnPlayerId: null,
    turnOrder: [hostId],
    caboCalled: false,
    caboCallerId: null,
    finalTurnsRemaining: [],
    deck: [],
    discardPile: [],
    currentCenterCard: null,
    matchWindowActive: false,
    matchWindowExpiry: 0,
    matchWindowClaimedBy: null,
    drawnCard: null,
    pendingPower: null,
    pendingGive: null,
    previewStartTime: null,
    matchNotification: null,
    players: {
      [hostId]: { id: hostId, name: hostName, isHost: true, seatNumber: 1, cards: [], totalScore: 0, roundScore: 0 },
    },
    createdAt: Date.now(),
  };
  await setDoc(roomRef(code), room);
  return { code, playerId: hostId };
}

export async function joinRoom(code, playerName, playerId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const room = snap.data();
    if (room.status !== 'lobby') throw new Error('Game already started');

    // Allow rejoining with same ID
    if (room.players[playerId]) return;

    const count = Object.keys(room.players).length;
    if (count >= room.playerLimit) throw new Error('Room is full');

    tx.update(ref, {
      [`players.${playerId}`]: {
        id: playerId, name: playerName, isHost: false,
        seatNumber: count + 1, cards: [], totalScore: 0, roundScore: 0,
      },
      turnOrder: [...room.turnOrder, playerId],
    });
  });
  return { playerId };
}

// ─── Game / Round start ──────────────────────────────────────────────────────

export async function startGame(code, hostId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.hostId !== hostId) throw new Error('Not host');
    if (room.status !== 'lobby') return;

    const deck = shuffleDeck(createDeck());
    const { players: hands, deck: remaining, firstDiscard } = dealCards(deck, room.turnOrder);
    const playersUpdate = {};
    for (const [pid, cards] of Object.entries(hands)) {
      playersUpdate[`players.${pid}.cards`] = cards;
      playersUpdate[`players.${pid}.roundScore`] = 0;
    }
    tx.update(ref, {
      ...playersUpdate,
      deck: remaining,
      discardPile: [firstDiscard],
      currentCenterCard: firstDiscard,
      currentRound: 1,
      status: 'preview',
      previewStartTime: Date.now(),
      caboCalled: false, caboCallerId: null, finalTurnsRemaining: [],
      drawnCard: null, pendingPower: null, pendingGive: null,
      matchWindowActive: false, matchNotification: null,
    });
  });
}

export async function startNextRound(code, hostId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.hostId !== hostId) throw new Error('Not host');
    if (room.status !== 'roundEnd') return;

    const deck = shuffleDeck(createDeck());
    const { players: hands, deck: remaining, firstDiscard } = dealCards(deck, room.turnOrder);
    const playersUpdate = {};
    for (const [pid, cards] of Object.entries(hands)) {
      playersUpdate[`players.${pid}.cards`] = cards;
      playersUpdate[`players.${pid}.roundScore`] = 0;
    }
    tx.update(ref, {
      ...playersUpdate,
      deck: remaining,
      discardPile: [firstDiscard],
      currentCenterCard: firstDiscard,
      currentRound: room.currentRound + 1,
      status: 'preview',
      previewStartTime: Date.now(),
      caboCalled: false, caboCallerId: null, finalTurnsRemaining: [],
      drawnCard: null, pendingPower: null, pendingGive: null,
      matchWindowActive: false, matchNotification: null,
    });
  });
}

export async function endPreview(code) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.status !== 'preview') return;
    tx.update(ref, { status: 'playing', currentTurnPlayerId: room.turnOrder[0] });
  });
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function reshuffleIfNeeded(deck, discardPile) {
  if (deck.length > 0) return { deck, discardPile };
  const topCard = discardPile[discardPile.length - 1];
  const newDeck = shuffleDeck(
    discardPile.slice(0, -1).map(c => ({ ...c, isRevealed: false }))
  );
  return { deck: newDeck, discardPile: [topCard] };
}

export async function drawFromDeck(code, playerId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.currentTurnPlayerId !== playerId) throw new Error('Not your turn');
    if (room.drawnCard) throw new Error('Already holding a card');

    let { deck, discardPile } = reshuffleIfNeeded([...room.deck], [...room.discardPile]);
    if (deck.length === 0) throw new Error('Deck is empty');

    const card = deck.shift();
    tx.update(ref, { deck, discardPile, drawnCard: { card, source: 'deck', playerId } });
  });
}

export async function takeFromDiscard(code, playerId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.currentTurnPlayerId !== playerId) throw new Error('Not your turn');
    if (room.drawnCard) throw new Error('Already holding a card');
    if (!room.discardPile?.length) throw new Error('Discard pile empty');

    const discardPile = [...room.discardPile];
    const card = discardPile.pop();
    const newCenterCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

    tx.update(ref, {
      discardPile,
      currentCenterCard: newCenterCard,
      drawnCard: { card, source: 'discard', playerId },
      matchWindowActive: false,
    });
  });
}

// ─── Keep / Discard held card ─────────────────────────────────────────────────

function buildDiscardUpdates(room, playerId, discardedCard, playerCards) {
  const discardPile = [...room.discardPile, { ...discardedCard, isRevealed: true }];
  const centerCard = { ...discardedCard, isRevealed: true };
  const ptype = hasPower(discardedCard.rank) ? powerType(discardedCard.rank) : null;
  const pendingPower = ptype ? {
    type: ptype, activatingPlayerId: playerId,
    phase: 'selecting', sourceCard: discardedCard, ownCardIndex: undefined,
  } : null;

  return { discardPile, centerCard, ptype, pendingPower, playerCards };
}

export async function keepDrawnCard(code, playerId, replaceIndex) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.currentTurnPlayerId !== playerId) throw new Error('Not your turn');
    if (!room.drawnCard || room.drawnCard.playerId !== playerId) throw new Error('No drawn card');

    const playerCards = [...room.players[playerId].cards];
    const discardedCard = playerCards[replaceIndex];
    playerCards[replaceIndex] = { ...room.drawnCard.card, isRevealed: false };

    const { discardPile, centerCard, ptype, pendingPower } = buildDiscardUpdates(room, playerId, discardedCard, playerCards);

    const updates = {
      [`players.${playerId}.cards`]: playerCards,
      discardPile,
      currentCenterCard: centerCard,
      drawnCard: null,
      matchWindowActive: !ptype,
      matchWindowExpiry: !ptype ? Date.now() + 2000 : 0,
      matchWindowClaimedBy: null,
      pendingPower,
    };

    if (ptype) { tx.update(ref, updates); return; }
    applyTurnAdvance(tx, ref, room, updates);
  });
}

export async function discardDrawnCard(code, playerId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.currentTurnPlayerId !== playerId) throw new Error('Not your turn');
    if (!room.drawnCard || room.drawnCard.playerId !== playerId) throw new Error('No drawn card');

    const card = room.drawnCard.card;
    const { discardPile, centerCard, ptype, pendingPower } = buildDiscardUpdates(room, playerId, card, null);

    const updates = {
      discardPile,
      currentCenterCard: centerCard,
      drawnCard: null,
      matchWindowActive: !ptype,
      matchWindowExpiry: !ptype ? Date.now() + 2000 : 0,
      matchWindowClaimedBy: null,
      pendingPower,
    };

    if (ptype) { tx.update(ref, updates); return; }
    applyTurnAdvance(tx, ref, room, updates);
  });
}

// ─── Matching ────────────────────────────────────────────────────────────────

export async function attemptMatch(code, claimantId, targetPlayerId, cardIndex) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();

    if (!room.matchWindowActive) throw new Error('No match window open');
    if (room.matchWindowClaimedBy) throw new Error('Already claimed');
    if (Date.now() > room.matchWindowExpiry) throw new Error('Window expired');

    const centerCard = room.currentCenterCard;
    if (!centerCard) throw new Error('No center card');
    const targetCards = room.players[targetPlayerId]?.cards;
    if (!targetCards?.[cardIndex]) throw new Error('Invalid card');

    const targetCard = targetCards[cardIndex];
    const isCorrect = targetCard.matchRank === centerCard.matchRank;
    const isOwn = claimantId === targetPlayerId;

    const updates = { matchWindowActive: false, matchWindowClaimedBy: claimantId };

    if (isOwn && isCorrect) {
      const newCards = [...room.players[claimantId].cards];
      const [removed] = newCards.splice(cardIndex, 1);
      const discardPile = [...room.discardPile, { ...removed, isRevealed: true }];
      const ptype = hasPower(removed.rank) ? powerType(removed.rank) : null;
      updates[`players.${claimantId}.cards`] = newCards;
      updates.discardPile = discardPile;
      updates.currentCenterCard = { ...removed, isRevealed: true };
      if (ptype) {
        updates.pendingPower = { type: ptype, activatingPlayerId: claimantId, phase: 'selecting', sourceCard: removed, fromMatch: true };
      } else {
        updates.matchWindowActive = true;
        updates.matchWindowExpiry = Date.now() + 2000;
        updates.matchWindowClaimedBy = null;
      }
    } else if (isOwn && !isCorrect) {
      let { deck, discardPile } = reshuffleIfNeeded([...room.deck], [...room.discardPile]);
      const penaltyCard = deck.shift();
      updates[`players.${claimantId}.cards`] = [...room.players[claimantId].cards, { ...penaltyCard, isRevealed: false }];
      updates.deck = deck;
      updates.discardPile = discardPile;
      updates.matchNotification = { type: 'wrongOwn', playerId: claimantId, ts: Date.now() };
    } else if (!isOwn && isCorrect) {
      const oppCards = [...room.players[targetPlayerId].cards];
      const [removed] = oppCards.splice(cardIndex, 1);
      const discardPile = [...room.discardPile, { ...removed, isRevealed: true }];
      const ptype = hasPower(removed.rank) ? powerType(removed.rank) : null;
      updates[`players.${targetPlayerId}.cards`] = oppCards;
      updates.discardPile = discardPile;
      updates.currentCenterCard = { ...removed, isRevealed: true };
      if (ptype) {
        updates.pendingPower = { type: ptype, activatingPlayerId: claimantId, phase: 'selecting', sourceCard: removed, fromMatch: true, pendingGiveAfter: { givingPlayerId: claimantId, receivingPlayerId: targetPlayerId } };
      } else {
        updates.pendingGive = { givingPlayerId: claimantId, receivingPlayerId: targetPlayerId };
        updates.matchWindowActive = true;
        updates.matchWindowExpiry = Date.now() + 2000;
        updates.matchWindowClaimedBy = null;
      }
    } else {
      let { deck, discardPile } = reshuffleIfNeeded([...room.deck], [...room.discardPile]);
      const penaltyCard = deck.shift();
      updates[`players.${claimantId}.cards`] = [...room.players[claimantId].cards, { ...penaltyCard, isRevealed: false }];
      updates.deck = deck;
      updates.discardPile = discardPile;
      updates.matchNotification = { type: 'wrongOpp', playerId: claimantId, ts: Date.now() };
    }

    tx.update(ref, updates);
  });
}

export async function giveCard(code, givingPlayerId, cardIndex) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (!room.pendingGive || room.pendingGive.givingPlayerId !== givingPlayerId) throw new Error('No pending give for you');

    const { receivingPlayerId } = room.pendingGive;
    const giverCards = [...room.players[givingPlayerId].cards];
    const [moved] = giverCards.splice(cardIndex, 1);
    const receiverCards = [...room.players[receivingPlayerId].cards, { ...moved, isRevealed: false }];

    tx.update(ref, {
      [`players.${givingPlayerId}.cards`]: giverCards,
      [`players.${receivingPlayerId}.cards`]: receiverCards,
      pendingGive: null,
    });
  });
}

// ─── Special powers ───────────────────────────────────────────────────────────

export async function selectLookTarget(code, activatingPlayerId, targetPlayerId, cardIndex) {
  // Used for lookOwn, lookOpponent, and king (selecting phase)
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const pp = room.pendingPower;
    if (!pp || pp.activatingPlayerId !== activatingPlayerId) throw new Error('Not your power');
    if (pp.phase !== 'selecting') throw new Error('Wrong phase');

    tx.update(ref, {
      pendingPower: { ...pp, phase: 'revealing', targetPlayerId, targetCardIndex: cardIndex },
    });
  });
}

export async function setPowerOwnCard(code, activatingPlayerId, ownCardIndex) {
  // For swap power step 1: record own card index
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const pp = room.pendingPower;
    if (!pp || pp.type !== 'swap' || pp.activatingPlayerId !== activatingPlayerId) throw new Error('Not your swap power');
    tx.update(ref, { pendingPower: { ...pp, ownCardIndex } });
  });
}

export async function doneLooking(code, playerId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const pp = room.pendingPower;
    if (!pp || pp.activatingPlayerId !== playerId) throw new Error('Not your power');

    const updates = { pendingPower: null };

    if (pp.fromMatch) {
      if (pp.pendingGiveAfter) updates.pendingGive = pp.pendingGiveAfter;
      tx.update(ref, updates);
      return;
    }
    applyTurnAdvance(tx, ref, room, updates);
  });
}

export async function kingDecide(code, playerId, wantsSwap) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const pp = room.pendingPower;
    if (!pp || pp.type !== 'king' || pp.activatingPlayerId !== playerId) throw new Error('Not your king power');

    if (!wantsSwap) {
      const updates = { pendingPower: null };
      applyTurnAdvance(tx, ref, room, updates);
      return;
    }
    tx.update(ref, { pendingPower: { ...pp, phase: 'selectOwnForKing' } });
  });
}

export async function kingSwap(code, playerId, ownCardIndex) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const pp = room.pendingPower;
    if (!pp || pp.type !== 'king' || pp.activatingPlayerId !== playerId) throw new Error('Not your king power');
    if (pp.phase !== 'selectOwnForKing') throw new Error('Wrong phase');

    const { targetPlayerId, targetCardIndex } = pp;
    const myCards = [...room.players[playerId].cards];
    const theirCards = [...room.players[targetPlayerId].cards];
    const tmp = myCards[ownCardIndex];
    myCards[ownCardIndex] = { ...theirCards[targetCardIndex], isRevealed: false };
    theirCards[targetCardIndex] = { ...tmp, isRevealed: false };

    const updates = {
      [`players.${playerId}.cards`]: myCards,
      [`players.${targetPlayerId}.cards`]: theirCards,
      pendingPower: null,
    };

    if (pp.fromMatch) {
      if (pp.pendingGiveAfter) updates.pendingGive = pp.pendingGiveAfter;
      tx.update(ref, updates);
      return;
    }
    applyTurnAdvance(tx, ref, room, updates);
  });
}

export async function resolveSwap(code, playerId, ownCardIndex, targetPlayerId, targetCardIndex) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const pp = room.pendingPower;
    if (!pp || pp.type !== 'swap' || pp.activatingPlayerId !== playerId) throw new Error('Not your swap power');

    const myCards = [...room.players[playerId].cards];
    const theirCards = [...room.players[targetPlayerId].cards];
    const tmp = myCards[ownCardIndex];
    myCards[ownCardIndex] = { ...theirCards[targetCardIndex], isRevealed: false };
    theirCards[targetCardIndex] = { ...tmp, isRevealed: false };

    const updates = {
      [`players.${playerId}.cards`]: myCards,
      [`players.${targetPlayerId}.cards`]: theirCards,
      pendingPower: null,
    };

    if (pp.fromMatch) {
      if (pp.pendingGiveAfter) updates.pendingGive = pp.pendingGiveAfter;
      tx.update(ref, updates);
      return;
    }
    applyTurnAdvance(tx, ref, room, updates);
  });
}

// ─── Cabo ─────────────────────────────────────────────────────────────────────

export async function callCabo(code, playerId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.currentTurnPlayerId !== playerId) throw new Error('Not your turn');
    if (room.caboCalled) throw new Error('Cabo already called');
    if (room.drawnCard) throw new Error('Finish your draw first');

    const order = room.turnOrder;
    const idx = order.indexOf(playerId);
    const remaining = Array.from({ length: order.length - 1 }, (_, i) => order[(idx + 1 + i) % order.length]);

    if (remaining.length === 0) {
      return endRoundInTx(tx, ref, room, { caboCalled: true, caboCallerId: playerId, finalTurnsRemaining: [] });
    }

    tx.update(ref, {
      caboCalled: true,
      caboCallerId: playerId,
      finalTurnsRemaining: remaining,
      currentTurnPlayerId: remaining[0],
    });
  });
}

// ─── Round / Game end ─────────────────────────────────────────────────────────

export async function endGame(code) {
  await updateDoc(roomRef(code), { status: 'gameEnd' });
}

export async function resetGame(code, hostId) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.hostId !== hostId) throw new Error('Not host');

    const playersUpdate = {};
    for (const pid of Object.keys(room.players)) {
      playersUpdate[`players.${pid}.totalScore`] = 0;
      playersUpdate[`players.${pid}.roundScore`] = 0;
      playersUpdate[`players.${pid}.cards`] = [];
    }
    tx.update(ref, {
      ...playersUpdate,
      status: 'lobby',
      currentRound: 0,
      caboCalled: false, caboCallerId: null, finalTurnsRemaining: [],
      deck: [], discardPile: [], currentCenterCard: null,
      drawnCard: null, pendingPower: null, pendingGive: null,
      matchWindowActive: false, matchNotification: null,
    });
  });
}

export async function closeMatchWindow(code) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (!room.matchWindowActive) return;
    if (Date.now() < room.matchWindowExpiry) return;
    tx.update(ref, { matchWindowActive: false });
  });
}
