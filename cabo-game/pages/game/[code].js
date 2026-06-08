import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import * as A from '../../lib/actions';
import { suitSymbol, isRed, powerLabel } from '../../lib/deck';
import Link from 'next/link';

// ─── Card component ────────────────────────────────────────────────────────
function Card({ card, size = 'md', onClick, highlight, selectable }) {
  const sizes = { sm:'w-10 h-14 text-xs', md:'w-14 h-20 text-sm', lg:'w-16 h-24 text-sm', xl:'w-20 h-28 text-base' };
  const sz = sizes[size] || sizes.md;
  const ring = highlight === 'gold' ? 'ring-2 ring-yellow-400 shadow-yellow-400/50 shadow-lg scale-105'
             : highlight === 'green' ? 'ring-2 ring-green-400 shadow-green-400/50 shadow-md scale-105'
             : highlight === 'red' ? 'ring-2 ring-red-400 scale-105' : '';
  const cursor = (selectable || onClick) ? 'cursor-pointer hover:scale-110 active:scale-95' : '';
  const base = `relative rounded-lg select-none transition-all duration-150 flex-shrink-0 ${sz} ${ring} ${cursor}`;

  if (!card?.isRevealed) {
    return (
      <div className={`${base} card-back`} onClick={onClick}>
        <div className="absolute inset-0 rounded-lg" />
      </div>
    );
  }

  const red = isRed(card.suit);
  const color = red ? 'text-red-600' : 'text-gray-900';
  const sym = suitSymbol(card.suit);

  return (
    <div className={`${base} card-face flex flex-col p-1 shadow-md`} onClick={onClick}>
      <div className={`font-bold leading-none ${color}`}>{card.rank}</div>
      <div className={`text-xs leading-none ${color}`}>{sym}</div>
      <div className={`flex-1 flex items-center justify-center ${color}`} style={{ fontSize: size === 'sm' ? '1rem' : '1.4rem' }}>{sym}</div>
      <div className={`font-bold leading-none self-end rotate-180 ${color}`}>{card.rank}</div>
    </div>
  );
}

// ─── Player grid ───────────────────────────────────────────────────────────
function PlayerGrid({ player, isMe, isCurrentTurn, room, myId, onCardClick, showPreview }) {
  const cards = player.cards || [];
  const extra = cards.slice(4);
  const base4 = cards.slice(0, 4);
  const pp = room.pendingPower;
  const pg = room.pendingGive;

  function revealed(idx) {
    const card = cards[idx];
    if (!card) return false;
    if (card.isRevealed) return true;
    if (showPreview && isMe && (idx === 2 || idx === 3)) return true;
    if (pp?.phase === 'revealing' && pp.targetPlayerId === player.id && pp.targetCardIndex === idx && pp.activatingPlayerId === myId) return true;
    return false;
  }

  function cardHighlight(idx) {
    if (pp?.activatingPlayerId === myId) {
      if (pp.phase === 'selecting') {
        if (pp.type === 'lookOwn' && isMe) return 'green';
        if ((pp.type === 'lookOpponent' || pp.type === 'king') && !isMe) return 'green';
        if (pp.type === 'swap') {
          if (pp.ownCardIndex === undefined && isMe) return 'gold';
          if (pp.ownCardIndex !== undefined && !isMe) return 'green';
        }
      }
      if (pp.phase === 'selectOwnForKing' && isMe) return 'gold';
    }
    if (pg?.givingPlayerId === myId && isMe) return 'red';
    if (room.matchWindowActive && !room.matchWindowClaimedBy) return 'gold';
    return '';
  }

  const turnRing = isCurrentTurn ? 'ring-2 ring-yellow-400/60' : '';

  return (
    <div className={`p-2 rounded-xl bg-black/40 backdrop-blur-sm ${turnRing}`}>
      <div className="flex items-center gap-1 mb-1 min-w-0">
        <span className={`text-xs font-bold truncate ${isMe ? 'text-yellow-300' : 'text-gray-200'}`}>
          {player.name}{isMe ? ' ★' : ''}
        </span>
        {isCurrentTurn && <span className="text-yellow-400 text-xs ml-0.5">▶</span>}
        <span className="text-gray-400 text-xs ml-auto whitespace-nowrap">{cards.length}🃏</span>
      </div>
      <div className="text-xs text-gray-400 mb-1">{player.totalScore}pts</div>

      {extra.length > 0 && (
        <div className="flex gap-1 justify-center mb-1 flex-wrap">
          {extra.map((card, i) => {
            const realIdx = i + 4;
            const hl = cardHighlight(realIdx);
            return (
              <Card key={realIdx} size="sm"
                card={revealed(realIdx) ? { ...card, isRevealed: true } : { ...card, isRevealed: false }}
                highlight={hl || undefined} selectable={!!hl}
                onClick={() => onCardClick?.(player.id, realIdx)} />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        {[0,1,2,3].map(idx => {
          const card = base4[idx];
          const hl = cardHighlight(idx);
          return card ? (
            <Card key={idx} size="md"
              card={revealed(idx) ? { ...card, isRevealed: true } : { ...card, isRevealed: false }}
              highlight={hl || undefined} selectable={!!hl}
              onClick={() => onCardClick?.(player.id, idx)} />
          ) : (
            <div key={idx} className="w-14 h-20 rounded-lg border border-gray-700 border-dashed opacity-20" />
          );
        })}
      </div>
    </div>
  );
}

// ─── Center area ───────────────────────────────────────────────────────────
function CenterArea({ room, myId, onDrawDeck, onTakeDiscard, onCallCabo, isMyTurn }) {
  const discard = room.discardPile || [];
  const topDiscard = discard.length > 0 ? { ...discard[discard.length - 1], isRevealed: true } : null;
  const canAct = isMyTurn && !room.drawnCard && !room.pendingPower && !room.pendingGive;

  return (
    <div className="felt rounded-2xl p-4 flex flex-col items-center gap-3 min-w-[190px] shadow-2xl">
      <div className="text-xs text-green-200/60 uppercase tracking-widest">Round {room.currentRound}/{room.totalRounds}</div>

      {room.caboCalled && (
        <div className="bg-red-700/90 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
          ⚠ CABO — {room.players[room.caboCallerId]?.name}
        </div>
      )}

      <div className="text-xs text-green-100/80">
        Turn: <b className="text-yellow-300">{room.players[room.currentTurnPlayerId]?.name ?? '—'}</b>
      </div>

      <div className="flex gap-4 items-end">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-gray-400">{room.deck?.length ?? 0}</span>
          <div
            className={`w-14 h-20 rounded-lg card-back pile-stack flex items-center justify-center ${canAct ? 'cursor-pointer hover:scale-105 transition-transform ring-2 ring-yellow-300/50' : 'opacity-60'}`}
            onClick={canAct ? onDrawDeck : undefined}
          >
            <span className="text-white/40 text-xs">DECK</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-gray-400">Discard</span>
          <div className={canAct && topDiscard ? 'cursor-pointer hover:scale-105 transition-transform ring-2 ring-blue-300/50 rounded-lg' : ''}
               onClick={canAct && topDiscard ? onTakeDiscard : undefined}>
            {topDiscard
              ? <Card card={topDiscard} size="md" />
              : <div className="w-14 h-20 rounded-lg border-2 border-dashed border-gray-600 opacity-30" />}
          </div>
        </div>
      </div>

      {room.matchWindowActive && (
        <div className="bg-yellow-500/90 text-black text-xs font-bold px-3 py-1 rounded-full match-pulse text-center">
          ⚡ Match window! Click a matching card
        </div>
      )}

      {canAct && !room.caboCalled && (
        <button onClick={onCallCabo}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl text-xs transition-all">
          📣 Call Cabo
        </button>
      )}
    </div>
  );
}

// ─── Held card panel ───────────────────────────────────────────────────────
function HeldCardPanel({ drawnCard, onKeep, onDiscard, selectingReplace }) {
  const card = drawnCard?.card;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-600 rounded-2xl p-4 shadow-2xl z-30 fade-in flex items-center gap-4 max-w-[calc(100vw-2rem)]">
      <div>
        <p className="text-gray-400 text-xs mb-1">In hand · {drawnCard?.source === 'deck' ? 'from deck' : 'from discard'}</p>
        <Card card={{ ...card, isRevealed: true }} size="xl" />
      </div>
      <div className="flex flex-col gap-2">
        {selectingReplace ? (
          <p className="text-yellow-300 text-sm font-bold max-w-[160px]">↑ Click one of your cards to replace it</p>
        ) : (
          <>
            <button onClick={onKeep} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl text-sm">Keep → replace</button>
            <button onClick={onDiscard} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl text-sm">Discard to center</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Power overlay ─────────────────────────────────────────────────────────
function PowerOverlay({ room, myId, onKingDecide, onDoneLooking }) {
  const pp = room.pendingPower;
  if (!pp) return null;

  const isMyPower = pp.activatingPlayerId === myId;
  const activatorName = room.players[pp.activatingPlayerId]?.name ?? '?';

  if (!isMyPower) {
    return (
      <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-indigo-900/90 border border-indigo-500 rounded-xl px-5 py-3 z-40 text-indigo-200 text-sm shadow-xl">
        🔮 <b>{activatorName}</b> is using: {powerLabel(pp.sourceCard?.rank)}
      </div>
    );
  }

  const label = powerLabel(pp.sourceCard?.rank);

  // Prompt for selecting
  if (pp.phase === 'selecting') {
    const msg =
      pp.type === 'lookOwn' ? '👆 Click one of your own cards to look at it.' :
      pp.type === 'lookOpponent' ? "👆 Click an opponent's card to look at it." :
      pp.type === 'king' ? "👆 Click an opponent's card to look at it." :
      pp.type === 'swap' && pp.ownCardIndex === undefined ? '👆 Click one of YOUR cards first.' :
      pp.type === 'swap' && pp.ownCardIndex !== undefined ? "👆 Now click an OPPONENT'S card to swap." : '';

    return (
      <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-purple-900/95 border border-purple-400 rounded-xl px-5 py-3 z-40 text-purple-100 text-sm shadow-xl max-w-xs text-center">
        <div className="font-bold mb-1">🔮 {label}</div>
        <div>{msg}</div>
      </div>
    );
  }

  if (pp.phase === 'revealing') {
    const targetCard = room.players[pp.targetPlayerId]?.cards?.[pp.targetCardIndex];
    const targetName = room.players[pp.targetPlayerId]?.name;
    return (
      <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-purple-900/95 border border-purple-400 rounded-2xl p-5 z-50 shadow-2xl fade-in text-center max-w-xs w-full">
        <div className="font-bold text-purple-200 mb-2">🔮 {pp.targetPlayerId === myId ? 'Your card:' : `${targetName}'s card:`}</div>
        {targetCard && (
          <div className="flex justify-center mb-3">
            <Card card={{ ...targetCard, isRevealed: true }} size="xl" />
          </div>
        )}
        <p className="text-purple-300 text-xs mb-3">{targetCard?.scoreValue} points</p>
        {pp.type === 'king' ? (
          <div className="flex gap-2 justify-center">
            <button onClick={() => onKingDecide(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl text-sm">Don't Swap</button>
            <button onClick={() => onKingDecide(true)} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm">Swap →</button>
          </div>
        ) : (
          <button onClick={onDoneLooking} className="px-6 py-2 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl text-sm">✓ Got it</button>
        )}
      </div>
    );
  }

  if (pp.phase === 'selectOwnForKing') {
    return (
      <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-purple-900/95 border border-purple-400 rounded-xl px-5 py-3 z-40 text-purple-100 text-sm shadow-xl text-center">
        <div className="font-bold mb-1">🔮 King Swap</div>
        <div>👆 Click one of YOUR cards to give away.</div>
      </div>
    );
  }

  return null;
}

// ─── Round results ─────────────────────────────────────────────────────────
function RoundResults({ room, myId, onNextRound }) {
  const players = Object.values(room.players).sort((a, b) => a.roundScore - b.roundScore);
  const isHost = room.hostId === myId;
  const isLast = room.currentRound >= room.totalRounds;
  const caboCallerName = room.caboCalled ? room.players[room.caboCallerId]?.name : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #1a0a00 0%, #0d2a0a 100%)' }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <h2 className="text-2xl font-bold text-center text-white mb-1">Round {room.currentRound} Results</h2>
        {caboCallerName && <p className="text-center text-yellow-300 text-sm mb-4">📣 Cabo called by <b>{caboCallerName}</b></p>}

        <div className="space-y-2 mb-4">
          {players.map((p, i) => {
            const rawTotal = (p.cards || []).reduce((s, c) => s + c.scoreValue, 0);
            const minRaw = Math.min(...players.map(x => (x.cards||[]).reduce((s,c)=>s+c.scoreValue,0)));
            const penalised = room.caboCalled && p.id === room.caboCallerId && rawTotal > minRaw;
            return (
              <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${i === 0 ? 'bg-green-900/40 border-green-600' : 'bg-gray-800 border-gray-700'}`}>
                <span className="text-xl">{['🏆','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'][i] || (i+1)+'.'}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-white font-medium">{p.name}</span>
                  {penalised && <span className="ml-2 text-red-400 text-xs">+20 penalty</span>}
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">{p.roundScore}pts</div>
                  <div className="text-gray-400 text-xs">Total: {p.totalScore}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
          {players.map(p => (
            <div key={p.id} className="bg-gray-800 rounded-xl p-3">
              <p className="text-gray-300 text-xs font-medium mb-2">{p.name}'s cards:</p>
              <div className="flex gap-1 flex-wrap">
                {(p.cards||[]).map((c,i) => <Card key={i} card={{ ...c, isRevealed: true }} size="sm" />)}
              </div>
            </div>
          ))}
        </div>

        {isHost ? (
          <button onClick={onNextRound} className="w-full py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl">
            {isLast ? '🏆 See Final Results' : '▶ Next Round'}
          </button>
        ) : (
          <p className="text-center text-gray-400 text-sm">Waiting for Game Master...</p>
        )}
      </div>
    </div>
  );
}

// ─── Final results ─────────────────────────────────────────────────────────
function FinalResults({ room, myId, onRestart }) {
  const players = Object.values(room.players).sort((a, b) => a.totalScore - b.totalScore);
  const isHost = room.hostId === myId;
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #1a0a00 0%, #0d2a0a 100%)' }}>
      <div className="bg-gray-900 border border-yellow-600 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🏆</div>
          <h2 className="text-3xl font-bold text-yellow-400">Game Over!</h2>
          <p className="text-gray-300 mt-1"><b className="text-white">{players[0]?.name}</b> wins with {players[0]?.totalScore} pts!</p>
        </div>
        <div className="space-y-2 mb-6">
          {players.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${i===0?'bg-yellow-900/30 border-yellow-600':'bg-gray-800 border-gray-700'}`}>
              <span className="text-xl">{['🥇','🥈','🥉'][i] || `${i+1}.`}</span>
              <span className="text-white font-medium flex-1">{p.name}</span>
              <span className={`font-bold text-lg ${i===0?'text-yellow-300':'text-white'}`}>{p.totalScore} pts</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {isHost && <button onClick={onRestart} className="py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl">🔄 Play Again</button>}
          <Link href="/"><button className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl">← Home</button></Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main game page ────────────────────────────────────────────────────────
export default function GamePage() {
  const router = useRouter();
  const { code } = router.query;
  const [room, setRoom] = useState(null);
  const [myId, setMyId] = useState('');
  const [error, setError] = useState('');
  const [previewSecs, setPreviewSecs] = useState(15);
  const [selectingReplace, setSelectingReplace] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [toast, setToast] = useState('');
  const previewRef = useRef(null);
  const matchRef = useRef(null);
  const toastRef = useRef(null);

  useEffect(() => { setMyId(localStorage.getItem('cabo_player_id') || ''); }, []);

  useEffect(() => {
    if (!code) return;
    return onSnapshot(doc(db, 'rooms', code), snap => {
      if (!snap.exists()) return setError('Room not found');
      setRoom(snap.data());
    });
  }, [code]);

  // Preview countdown
  useEffect(() => {
    if (!room || room.status !== 'preview') { clearInterval(previewRef.current); return; }
    const tick = () => {
      const remaining = Math.max(0, 15 - Math.floor((Date.now() - room.previewStartTime) / 1000));
      setPreviewSecs(remaining);
      if (remaining <= 0) { clearInterval(previewRef.current); A.endPreview(code).catch(()=>{}); }
    };
    tick();
    previewRef.current = setInterval(tick, 500);
    return () => clearInterval(previewRef.current);
  }, [room?.status, room?.previewStartTime, code]);

  // Match window expiry
  useEffect(() => {
    if (!room?.matchWindowActive) return;
    clearTimeout(matchRef.current);
    const delay = room.matchWindowExpiry - Date.now() + 150;
    if (delay > 0) matchRef.current = setTimeout(() => A.closeMatchWindow(code).catch(()=>{}), delay);
    return () => clearTimeout(matchRef.current);
  }, [room?.matchWindowActive, room?.matchWindowExpiry, code]);

  // Match notification toast
  useEffect(() => {
    if (!room?.matchNotification) return;
    const n = room.matchNotification;
    const pname = room.players?.[n.playerId]?.name ?? '?';
    showToast(n.type === 'wrongOwn' ? `❌ ${pname}: wrong self-match → penalty card` : `❌ ${pname}: wrong guess → penalty card`);
  }, [room?.matchNotification?.ts]);

  function showToast(msg, duration = 3000) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), duration);
  }

  async function act(fn, ...args) {
    try { await fn(code, ...args); }
    catch (e) { showToast(`⚠ ${e.message}`); }
  }

  function handleCardClick(targetPlayerId, cardIndex) {
    if (!room) return;
    const pp = room.pendingPower;
    const pg = room.pendingGive;

    if (pg?.givingPlayerId === myId && targetPlayerId === myId) {
      act(A.giveCard, myId, cardIndex);
      return;
    }

    if (pp?.activatingPlayerId === myId) {
      if (pp.phase === 'selecting') {
        if (pp.type === 'lookOwn' && targetPlayerId === myId)
          act(A.selectLookTarget, myId, myId, cardIndex);
        else if ((pp.type === 'lookOpponent' || pp.type === 'king') && targetPlayerId !== myId)
          act(A.selectLookTarget, myId, targetPlayerId, cardIndex);
        else if (pp.type === 'swap') {
          if (pp.ownCardIndex === undefined && targetPlayerId === myId)
            act(A.setPowerOwnCard, myId, cardIndex);
          else if (pp.ownCardIndex !== undefined && targetPlayerId !== myId)
            act(A.resolveSwap, myId, pp.ownCardIndex, targetPlayerId, cardIndex);
        }
      } else if (pp.phase === 'selectOwnForKing' && targetPlayerId === myId) {
        act(A.kingSwap, myId, cardIndex);
      }
      return;
    }

    if (selectingReplace && room.drawnCard?.playerId === myId && targetPlayerId === myId) {
      setSelectingReplace(false);
      act(A.keepDrawnCard, myId, cardIndex);
      return;
    }

    if (room.matchWindowActive && !room.matchWindowClaimedBy)
      act(A.attemptMatch, myId, targetPlayerId, cardIndex);
  }

  if (error) return <div className="min-h-screen flex items-center justify-center text-red-400 text-xl p-8 text-center">{error}</div>;
  if (!room) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;

  if (room.status === 'roundEnd') {
    return <RoundResults room={room} myId={myId}
      onNextRound={() => act(room.currentRound >= room.totalRounds ? A.endGame : A.startNextRound, myId)} />;
  }
  if (room.status === 'gameEnd') {
    return <FinalResults room={room} myId={myId} onRestart={() => act(A.resetGame, myId)} />;
  }
  if (room.status === 'lobby') { router.push(`/lobby/${code}`); return null; }

  const isMyTurn = room.currentTurnPlayerId === myId;
  const isHost = room.hostId === myId;
  const drawnCard = room.drawnCard?.playerId === myId ? room.drawnCard : null;
  const showPreview = room.status === 'preview';
  const pp = room.pendingPower;
  const pg = room.pendingGive;

  const sortedPlayers = Object.values(room.players).sort((a, b) => a.seatNumber - b.seatNumber);
  const posStyle4 = [
    'absolute top-2 left-1/2 -translate-x-1/2',
    'absolute right-2 top-1/2 -translate-y-1/2',
    'absolute bottom-2 left-1/2 -translate-x-1/2',
    'absolute left-2 top-1/2 -translate-y-1/2',
  ];
  const posStyle6 = [
    'absolute top-2 left-[20%] -translate-x-1/2',
    'absolute top-2 right-[20%] translate-x-1/2',
    'absolute right-2 top-1/2 -translate-y-1/2',
    'absolute bottom-2 right-[20%] translate-x-1/2',
    'absolute bottom-2 left-[20%] -translate-x-1/2',
    'absolute left-2 top-1/2 -translate-y-1/2',
  ];
  const positions = room.playerLimit === 6 ? posStyle6 : posStyle4;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#2c1600' }}>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-9 bg-black/60 flex items-center px-3 gap-4 z-20 text-xs text-gray-400">
        <span className="font-mono text-green-400 font-bold">{code}</span>
        <span className="hidden sm:inline">Round {room.currentRound}/{room.totalRounds}</span>
        <span>Turn: <b className="text-yellow-300">{room.players[room.currentTurnPlayerId]?.name ?? '—'}</b></span>
        {showPreview && <span className="text-orange-300 font-bold">👀 {previewSecs}s</span>}
        <div className="ml-auto flex gap-3 items-center">
          <button onClick={() => setShowRules(v => !v)} className="text-gray-300 hover:text-white">📖</button>
          {isHost && <button onClick={() => act(A.resetGame, myId)} className="text-gray-500 hover:text-red-400 text-xs">↺ Reset</button>}
        </div>
      </div>

      {/* Table */}
      <div className="absolute inset-0 top-9">
        {/* Felt */}
        <div className="absolute inset-10 felt rounded-3xl flex items-center justify-center">
          <CenterArea room={room} myId={myId} isMyTurn={isMyTurn}
            onDrawDeck={() => act(A.drawFromDeck, myId)}
            onTakeDiscard={() => act(A.takeFromDiscard, myId)}
            onCallCabo={() => act(A.callCabo, myId)} />
        </div>

        {/* Deck pile corner */}
        <div className="absolute bottom-3 right-3 opacity-50">
          <div className="w-12 h-16 rounded-lg card-back pile-stack" />
        </div>

        {/* Player grids */}
        {sortedPlayers.map((player, i) => (
          <div key={player.id} className={positions[i] || 'absolute top-2 left-1/2 -translate-x-1/2'}>
            <PlayerGrid player={player} isMe={player.id === myId}
              isCurrentTurn={room.currentTurnPlayerId === player.id}
              room={room} myId={myId} onCardClick={handleCardClick}
              showPreview={showPreview} />
          </div>
        ))}
      </div>

      {/* Held card panel */}
      {drawnCard && (
        <HeldCardPanel drawnCard={drawnCard} selectingReplace={selectingReplace}
          onKeep={() => setSelectingReplace(true)}
          onDiscard={() => act(A.discardDrawnCard, myId)} />
      )}

      {/* Power overlay */}
      <PowerOverlay room={room} myId={myId}
        onKingDecide={(wants) => act(A.kingDecide, myId, wants)}
        onDoneLooking={() => act(A.doneLooking, myId)} />

      {/* Pending give message */}
      {pg?.givingPlayerId === myId && (
        <div className="fixed top-11 left-1/2 -translate-x-1/2 bg-orange-900/95 border border-orange-500 rounded-xl px-5 py-3 z-40 text-orange-100 font-bold text-sm shadow-xl text-center fade-in max-w-xs">
          ✅ Correct! Click one of your cards to give to {room.players[pg.receivingPlayerId]?.name}
        </div>
      )}
      {pg && pg.givingPlayerId !== myId && (
        <div className="fixed top-11 left-1/2 -translate-x-1/2 bg-blue-900/90 border border-blue-600 rounded-xl px-5 py-2 z-40 text-blue-200 text-xs shadow-xl">
          {room.players[pg.givingPlayerId]?.name} is choosing a card to give...
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-11 left-1/2 -translate-x-1/2 bg-gray-800/95 border border-gray-600 rounded-xl px-5 py-3 z-50 text-white text-sm shadow-xl fade-in">
          {toast}
        </div>
      )}

      {/* Preview banner */}
      {showPreview && (
        <div className="fixed top-11 left-1/2 -translate-x-1/2 bg-green-900/95 border border-green-500 rounded-xl px-5 py-3 z-40 text-green-100 font-bold text-sm shadow-xl text-center">
          👀 Memorise your bottom 2 cards! ({previewSecs}s)
        </div>
      )}

      {/* Rules modal */}
      {showRules && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowRules(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-xl w-full max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">📖 Rules</h2>
              <button onClick={() => setShowRules(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <RulesContent />
          </div>
        </div>
      )}
    </div>
  );
}

function RulesContent() {
  const sections = [
    ['Objective', 'Have the lowest total card score when the round ends.'],
    ['Card Values', 'A=1 · 2-10=face · J=11 · Q=12 · Red King (♥♦)=0 · Black King (♠♣)=13\nAll Kings match each other regardless of colour.'],
    ['Start of Round', 'You get 4 cards. Bottom 2 are shown for 15 seconds — memorise them!'],
    ['Your Turn', 'Draw from deck OR take top discard. Then keep it (replace one of your grid cards) OR discard it to center. Special powers fire when special cards are discarded.'],
    ['Powers', '7/8: Look at own card · 9/10: Look at opponent card · J/Q: Swap cards · King: Look then optionally swap.'],
    ['Matching', 'Click any card you think matches the center card rank within 2 seconds.\nCorrect self: lose that card (good). Wrong self: +1 penalty.\nCorrect opp: their card discarded, give them one of yours. Wrong opp: +1 penalty.'],
    ['Cabo', "Call Cabo when you think you're lowest. Everyone else gets one final turn. Then scores are revealed."],
    ['Cabo Penalty', "If Cabo caller isn't lowest: their score = 20 + card total. Tied for lowest = no penalty."],
    ['Winning', 'Lowest cumulative score after all rounds wins.'],
  ];
  return (
    <div className="space-y-3">
      {sections.map(([t, b]) => (
        <div key={t} className="bg-gray-800 rounded-xl p-3">
          <h3 className="text-white font-bold mb-1">{t}</h3>
          <p className="text-gray-400 text-xs whitespace-pre-line">{b}</p>
        </div>
      ))}
    </div>
  );
}
