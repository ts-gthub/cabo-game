import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBptWq1ygrSG2pR6qyYZViE21JGg-1okco",
  authDomain: "cabo-game-9f3e2.firebaseapp.com",
  projectId: "cabo-game-9f3e2",
  storageBucket: "cabo-game-9f3e2.firebasestorage.app",
  messagingSenderId: "461839735588",
  appId: "1:461839735588:web:0be5724123e1541a33b1b1"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
