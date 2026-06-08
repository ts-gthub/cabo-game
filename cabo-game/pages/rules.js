import Link from 'next/link';

const RULES = [
  {
    title: '🎯 Objective',
    body: 'Have the lowest total card score when the round ends. The player with the lowest cumulative score after all rounds wins.',
  },
  {
    title: '🃏 Card Values',
    body: 'Ace = 1 point. Numbers 2–10 = face value. Jack = 11. Queen = 12. Red King (♥♦) = 0 points. Black King (♠♣) = 13 points. For matching purposes, all Kings match each other regardless of colour.',
  },
  {
    title: '🏠 Room Setup',
    body: 'The Game Master creates a room, chooses 4 or 6 players and the number of rounds. Players join using the 4-letter room code. The game starts when the room is full.',
  },
  {
    title: '👁 Start of Round Preview',
    body: 'Every player starts with 4 cards in a 2×2 grid. You may peek at your bottom 2 cards (positions 3 and 4) for 15 seconds. The top 2 cards are never shown. After the preview ends, all cards are hidden. You must remember what you saw.',
  },
  {
    title: '🔄 Your Turn',
    body: 'Draw a card from the deck, or take the top card from the discard pile. Then: Keep the card (choose one of your grid cards to replace — the replaced card is discarded), or Discard the card directly to the center pile. If the discarded card has a special power, it activates.',
  },
  {
    title: '✨ Special Card Powers',
    body: '7 or 8 — Look at one of your own hidden cards.\n9 or 10 — Look at one opponent\'s hidden card.\nJack or Queen — Swap one of your cards with an opponent\'s card. You do not see the card you receive.\nKing (red or black) — Look at an opponent\'s card, then decide whether to swap it with one of your cards.',
  },
  {
    title: '⚡ Matching',
    body: 'Whenever a card enters the center pile, a 2-second window opens. Any player can click a card they believe has the same rank as the center card.\n\nCorrect self-match: Your card is discarded. You lose it (good!).\nWrong self-match: Draw 1 penalty card.\nCorrect opponent match: Their card is discarded, but you must give them one of your own cards.\nWrong opponent match: Draw 1 penalty card.',
  },
  {
    title: '📣 Calling Cabo',
    body: 'On your turn, if you believe you have the lowest total, you may call Cabo. You are locked in — you get no more turns. Every other player gets exactly one final turn. Then all cards are revealed and scores are calculated.',
  },
  {
    title: '⚠ Cabo Penalty',
    body: 'If you called Cabo but your score is NOT the lowest, your round score becomes: 20 + your card total. If you are tied for the lowest score, no penalty applies.',
  },
  {
    title: '📊 Scoring',
    body: 'After each round, each player\'s card values are summed. The Cabo penalty is applied if needed. Round scores add to the cumulative total.',
  },
  {
    title: '🏆 Winning',
    body: 'After all rounds are played, the player with the lowest total score wins. In the final leaderboard, lower is better.',
  },
];

export default function Rules() {
  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-8 mt-4">
        <Link href="/" className="text-gray-400 hover:text-white text-2xl">←</Link>
        <h1 className="text-3xl font-bold text-white">📖 How to Play Cabo</h1>
      </div>

      <div className="space-y-4">
        {RULES.map((rule) => (
          <div key={rule.title} className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
            <h2 className="text-white font-bold text-lg mb-2">{rule.title}</h2>
            <p className="text-gray-300 text-sm whitespace-pre-line leading-relaxed">{rule.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 mb-4 flex flex-col sm:flex-row gap-3">
        <Link href="/create">
          <button className="w-full sm:w-auto px-8 py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl">Create Game</button>
        </Link>
        <Link href="/join">
          <button className="w-full sm:w-auto px-8 py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl">Join Game</button>
        </Link>
      </div>
    </div>
  );
}
