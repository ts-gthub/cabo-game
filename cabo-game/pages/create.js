import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { createRoom } from '../lib/actions';

export default function Create() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [players, setPlayers] = useState(4);
  const [rounds, setRounds] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    setLoading(true);
    try {
      const { code, playerId } = await createRoom(name.trim(), players, rounds);
      localStorage.setItem('cabo_player_id', playerId);
      localStorage.setItem('cabo_player_name', name.trim());
      router.push(`/lobby/${code}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #1a0a00 0%, #0d2a0a 100%)' }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="text-gray-400 hover:text-white text-2xl">←</Link>
          <h1 className="text-2xl font-bold text-white">Create Game</h1>
        </div>

        <form onSubmit={handleCreate} className="space-y-6">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Your Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={16}
              className="w-full bg-gray-800 border border-gray-600 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-green-500 text-lg"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">Number of Players</label>
            <div className="flex gap-4">
              {[4, 6].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPlayers(n)}
                  className={`flex-1 py-3 rounded-xl text-xl font-bold border-2 transition-all ${
                    players === n ? 'bg-green-700 border-green-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
                  }`}
                >
                  {n} Players
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">Number of Rounds</label>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setRounds(r => Math.max(1, r - 1))}
                className="w-12 h-12 bg-gray-700 rounded-xl text-2xl font-bold hover:bg-gray-600">−</button>
              <span className="text-3xl font-bold text-white w-12 text-center">{rounds}</span>
              <button type="button" onClick={() => setRounds(r => Math.min(20, r + 1))}
                className="w-12 h-12 bg-gray-700 rounded-xl text-2xl font-bold hover:bg-gray-600">+</button>
            </div>
          </div>

          {error && <p className="text-red-400 bg-red-900/30 px-4 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white text-xl font-bold rounded-xl transition-all"
          >
            {loading ? 'Creating...' : '🏠 Create Room'}
          </button>
        </form>
      </div>
    </div>
  );
}
