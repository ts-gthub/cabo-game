import { useRouter } from 'next/router';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #1a0a00 0%, #0d2a0a 100%)' }}>
      <div className="text-center mb-12">
        <div className="text-7xl mb-4">🃏</div>
        <h1 className="text-5xl font-bold text-white mb-2 tracking-wide">CABO</h1>
        <p className="text-green-300 text-lg">Online Multiplayer Card Game</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => router.push('/create')}
          className="py-4 px-8 bg-green-700 hover:bg-green-600 text-white text-xl font-bold rounded-xl transition-all shadow-lg hover:shadow-green-900"
        >
          🏠 Create Game
        </button>

        <button
          onClick={() => router.push('/join')}
          className="py-4 px-8 bg-blue-700 hover:bg-blue-600 text-white text-xl font-bold rounded-xl transition-all shadow-lg"
        >
          🔗 Join Game
        </button>

        <Link href="/rules">
          <button className="py-4 px-8 bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold rounded-xl transition-all w-full">
            📖 Rules
          </button>
        </Link>
      </div>

      <p className="text-gray-500 text-sm mt-12">4 or 6 players · No login required</p>
    </div>
  );
}
