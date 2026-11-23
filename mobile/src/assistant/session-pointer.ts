export type SessionPointer = { gateway: string; sessionId: string };

export interface SessionPointerStore {
  read(gateway: string): Promise<SessionPointer | null>;
  write(pointer: SessionPointer): Promise<void>;
  clear(gateway: string, sessionId: string): Promise<void>;
}

interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const key = 'cooklens.active-session.v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function gatewayKey(input: string): string | null {
  try {
    const url = new URL(input);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      && !url.search && !url.hash && /^\/api\/?$/.test(url.pathname)) return url.origin + '/api';
  } catch { /* Invalid stored origin. */ }
  return null;
}

function normalizePointer(value: unknown): SessionPointer | null {
  if (!value || typeof value !== 'object' || !('gateway' in value) || !('sessionId' in value)
    || typeof value.gateway !== 'string' || typeof value.sessionId !== 'string' || !uuid.test(value.sessionId)) return null;
  const gateway = gatewayKey(value.gateway);
  return gateway ? { gateway, sessionId: value.sessionId.toLowerCase() } : null;
}

export function createSessionPointerStore(storage: SecureStorage): SessionPointerStore {
  let queue = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.then(() => {}, () => {});
    return result;
  }

  async function load(): Promise<SessionPointer | null> {
    const value = await storage.getItemAsync(key);
    if (value === null) return null;
    try { return normalizePointer(JSON.parse(value)); } catch { return null; }
  }

  return {
    read: gateway => enqueue(async () => {
      const pointer = await load();
      return pointer?.gateway === gatewayKey(gateway) ? pointer : null;
    }),
    write: pointer => enqueue(async () => {
      const value = normalizePointer(pointer);
      if (!value) throw Error('Invalid cooking session pointer');
      await storage.setItemAsync(key, JSON.stringify(value));
    }),
    clear: (gateway, sessionId) => enqueue(async () => {
      const pointer = await load();
      if (pointer?.gateway === gatewayKey(gateway) && pointer.sessionId === sessionId.toLowerCase()) {
        await storage.deleteItemAsync(key);
      }
    }),
  };
}
