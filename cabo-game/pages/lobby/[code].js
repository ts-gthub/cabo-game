import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { startGame } from '../../lib/actions';
import Link from 'next/link';

export default function Lobby() {
  const router = useRouter();
  const { code } = router.query;
  const [room, setRoom] = useState(null);
  const [myId] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('cabo_player_id') || '') : ''
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    const unsub = onSnapshot(doc(db, 'rooms', code), (snap) => {
      if (!snap.exists()) return setError('Room not found');
      const data = snap.data();
      setRoom(data);
      if (data.status === 'preview' || data.status === 'playing') {
        router.push(`/game/${code}`);
      }
    });
    return () => unsub();
  }, [code]);

  if (error) return <ErrorScreen msg={error} />;
  if (!room) return <Loading />;

  const players = Object.values(room.players).sort((a, b) => a.seatNumber - b.seatNumber);
  const isFull = players.length >= room.playerLimit;
  const isHost = myId === room.hostId;

  async function handleStart() {
    try {
      await startGame(code, myId);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #1a0a00 0%, #0d2a0a 100%)' }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Game Lobby</h1>
          <p className="text-gray-400 text-sm">{room.totalRounds} rounds · {room.playerLimit} players</p>
        </div>

        {/* Room code */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6 text-center border border-gray-600">
          <p className="text-gray-400 text-sm mb-1">Room Code</p>
          <p className="text-5xl font-mono font-bold text-green-400 tracking-widest">{code}</p>
          <p className="text-gray-500 text-xs mt-2">Share this code with friends</p>
        </div>

        {/* Players list */}
        <div className="space-y-2 mb-6">
          {Array.from({ length: room.playerLimit }).map((_, i) => {
            const player = players[i];
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                player ? 'bg-gray-800 border-gray-600' : 'bg-gray-900 border-gray-800 opacity-50'
              }`}>
                <span className="text-gray-500 font-mono text-sm w-5">{i + 1}.</span>
                {player ? (
                  <>
                    <span className="text-white font-medium flex-1">{player.name}</span>
                    {player.isHost && <span className="text-yellow-400 text-xs bg-yellow-900/30 px-2 py-0.5 rounded-full">Game Master</span>}
                    {player.id === myId && !player.isHost && <span className="text-blue-400 text-xs bg-blue-900/30 px-2 py-0.5 rounded-full">You</span>}
                  </>
                ) : (
                  <span className="text-gray-600 italic text-sm">Waiting...</span>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-red-400 bg-red-900/30 px-4 py-2 rounded-lg mb-4">{error}</p>}

        {isHost ? (
          <button
            onClick={handleStart}
            disabled={!isFull}
            className={`w-full py-4 text-xl font-bold rounded-xl transition-all ${
              isFull
                ? 'bg-green-700 hover:bg-green-600 text-white shadow-lg hover:shadow-green-900'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isFull ? '▶ Start Game' : `Waiting for players (${players.length}/${room.playerLimit})`}
          </button>
        ) : (
          <div className="text-center text-gray-400 py-4">
            {isFull ? 'Waiting for host to start...' : `Waiting for players (${players.length}/${room.playerLimit})`}
          </div>
        )}

        <div className="mt-4 text-center">
          <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">← Leave lobby</Link>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-xl">Loading...</div>
    </div>
  );
}

function ErrorScreen({ msg }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-red-900/40 border border-red-700 rounded-2xl p-8 text-center max-w-sm">
        <p className="text-red-300 text-xl font-bold mb-4">Error</p>
        <p className="text-gray-300 mb-6">{msg}</p>
        <Link href="/" className="text-blue-400 hover:text-blue-300">← Go Home</Link>
      </div>
    </div>
  );
}
