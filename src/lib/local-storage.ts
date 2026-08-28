// localStorage の薄いラッパー。Safari のプライベートモードや容量超過で例外が出るため、
// 読み書きは常に try/catch し、失敗しても呼び出し側は「キャッシュが無い」として扱えるようにする。

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過など。キャッシュなので諦める
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** prefix で始まるキーの一覧 */
export function keysWithPrefix(prefix: string): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

/** prefix で始まるキーをすべて削除する */
export function removeByPrefix(prefix: string): void {
  for (const key of keysWithPrefix(prefix)) removeItem(key);
}
