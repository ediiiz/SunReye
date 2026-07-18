// bun test preload. The generated Paraglide runtime resolves the locale from
// `localStorage` (then the browser's preferred language), neither of which
// exists under bun test — any module that renders a message would crash.
// Pin the locale to the base locale via a minimal localStorage stub.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>([["PARAGLIDE_LOCALE", "en"]]);
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}
