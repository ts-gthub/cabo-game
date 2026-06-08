# Cabo — Online Multiplayer Card Game

## Setup

### 1. Install dependencies
```bash
cd cabo-game
npm install
```

### 2. Firebase setup
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Add a **Web app** — copy the config values
4. Go to **Firestore Database** → Create database → Start in **test mode**
5. Copy `.env.local.example` to `.env.local` and fill in your Firebase values:

```bash
cp .env.local.example .env.local
```

### 3. Run locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 4. Deploy to Vercel
```bash
npx vercel
```
Add your `.env.local` values as Environment Variables in the Vercel dashboard.

---

## Firestore Security Rules (recommended)
In Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomCode} {
      allow read, write: if true; // MVP: open access
    }
  }
}
```

For production, tighten these rules.

---

## How to Play
- One person creates a room (Game Master)
- Others join using the 4-letter room code
- Game Master picks 4 or 6 players and number of rounds
- Full rules available in-app at /rules
