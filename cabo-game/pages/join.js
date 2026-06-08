import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { joinRoom } from '../lib/actions';
import { generateId } from '../lib/deck';

export default function Join() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    if (!code.trim()) return setError('Enter a room code');

    setLoading(true);
    try {
      let playerId = localStorage.getItem('cabo_player_id');
      if (!playerId) {
        playerId = generateId();
        localStorage.setItem('cabo_player_id', playerId);
      }
      localStorage.setItem('cabo_player_name', name.trim());

      await joinRoom(code.trim().toUpperCase(), name.trim(), playerId);
      router.push(`/lobby/${code.trim().toUpperCase()}`);
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
          <h1 className="text-2xl font-bold text-white">Join Game</h1>
        </div>

        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Your Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={16}
              className="w-full bg-gray-800 border border-gray-600 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 text-lg"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">Room Code</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. C7K9"
              maxLength={4}
              className="w-full bg-gray-800 border border-gray-600 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 text-2xl font-mono tracking-widest text-center uppercase"
            />
          </div>

          {error && <p className="text-red-400 bg-red-900/30 px-4 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white text-xl font-bold rounded-xl transition-all"
          >
            {loading ? 'Joining...' : '🔗 Join Room'}
          </button>
        </form>
      </div>
    </div>
  );
}
