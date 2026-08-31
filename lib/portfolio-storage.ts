import {
  createDefaultState,
  normalizePortfolioState,
  type PortfolioState,
} from './portfolio';

const DATABASE_NAME = 'riskledger-portfolio';
const STORE_NAME = 'state';
const STATE_KEY = 'primary';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadPortfolio() {
  const database = await openDatabase();
  return new Promise<PortfolioState>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () =>
      resolve(
        request.result
          ? normalizePortfolioState(request.result as PortfolioState)
          : createDefaultState(),
      );
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function savePortfolio(state: PortfolioState) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
