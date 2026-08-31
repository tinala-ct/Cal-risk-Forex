import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import type { PortfolioState } from './portfolio';

export const firebaseConfig = {
  apiKey: 'AIzaSyC2TacZITnMFH8sIrM1DnhBYMcbHE18fuw',
  authDomain: 'cal-risk-forex.firebaseapp.com',
  projectId: 'cal-risk-forex',
  storageBucket: 'cal-risk-forex.firebasestorage.app',
  messagingSenderId: '290969564027',
  appId: '1:290969564027:web:1f2174460b10aab72303de',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logoutFirebase(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * ติดตามข้อมูลพอร์ตแบบ Realtime จาก Firestore
 */
export function subscribeToCloudPortfolio(
  userId: string,
  onData: (data: PortfolioState) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const portfolioDocRef = doc(db, 'portfolios', userId);

  return onSnapshot(
    portfolioDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onData(snapshot.data() as PortfolioState);
      }
    },
    (error) => {
      if (onError) onError(error);
    },
  );
}

/**
 * โหลดข้อมูลพอร์ตครั้งแรกเมื่อล็อกอิน
 */
export async function getCloudPortfolio(
  userId: string,
): Promise<PortfolioState | null> {
  const portfolioDocRef = doc(db, 'portfolios', userId);
  const snapshot = await getDoc(portfolioDocRef);
  if (snapshot.exists()) {
    return snapshot.data() as PortfolioState;
  }
  return null;
}

/**
 * บันทึกข้อมูลพอร์ตขึ้น Cloud Firestore
 */
export async function saveCloudPortfolio(
  userId: string,
  state: PortfolioState,
): Promise<void> {
  const portfolioDocRef = doc(db, 'portfolios', userId);
  await setDoc(portfolioDocRef, state);
}
