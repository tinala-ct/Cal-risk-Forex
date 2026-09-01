import {
  createDefaultState,
  parsePortfolioState,
  type PortfolioState,
} from './portfolio';

const DATABASE_NAME = 'riskledger-portfolio';
const STORE_NAME = 'state';
const STATE_KEY = 'primary';
const RECOVERY_STORE_NAME = 'recovery';

export type RecoverySnapshot = {
  id: string;
  reason: 'before-import' | 'before-cloud-replace' | 'before-recovery';
  savedAt: string;
  state: PortfolioState;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
      if (!database.objectStoreNames.contains(RECOVERY_STORE_NAME)) {
        database.createObjectStore(RECOVERY_STORE_NAME);
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
          ? parsePortfolioState(request.result)
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

export async function saveRecoverySnapshot(
  state: PortfolioState,
  reason: RecoverySnapshot['reason'],
) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RECOVERY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(RECOVERY_STORE_NAME);
    const savedAt = new Date().toISOString();
    const id = `${savedAt}-${crypto.randomUUID()}`;
    store.put({ id, reason, savedAt, state } satisfies RecoverySnapshot, id);
    const keysRequest = store.getAllKeys();
    keysRequest.onsuccess = () => {
      const keys = keysRequest.result.map(String).sort();
      for (const key of keys.slice(0, Math.max(0, keys.length - 10))) {
        store.delete(key);
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadLatestRecoverySnapshot() {
  const database = await openDatabase();
  return new Promise<RecoverySnapshot | null>((resolve, reject) => {
    const transaction = database.transaction(RECOVERY_STORE_NAME, 'readonly');
    const request = transaction
      .objectStore(RECOVERY_STORE_NAME)
      .openCursor(null, 'prev');
    request.onsuccess = () => {
      const value = request.result?.value as RecoverySnapshot | undefined;
      if (!value) {
        resolve(null);
        return;
      }
      try {
        resolve({ ...value, state: parsePortfolioState(value.state) });
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}
