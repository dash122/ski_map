export function createTreeStream(config) {
  let worker, failed = false, completed = 0;
  const pending = new Set(), ready = new Map();
  const fail = () => { failed = true; worker?.terminate(); pending.clear(); ready.clear(); };
  try {
    worker = new Worker(new URL('./tree-worker.js', import.meta.url), { type: 'module' });
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = ({ data }) => { completed++; pending.delete(data.key); ready.set(data.key, data.result); };
    worker.postMessage({ config }); // structured clone once; the game retains its DEM and masks
  } catch { fail(); }
  return {
    get available() { return !failed; },
    request(ci, cj) {
      const key = `${ci},${cj}`;
      if (failed || pending.has(key) || ready.has(key) || pending.size >= 4) return;
      pending.add(key); worker.postMessage({ ci, cj, key });
    },
    take(ci, cj) {
      const key = `${ci},${cj}`, result = ready.get(key); ready.delete(key); return result;
    },
    prune(wanted) { for (const key of ready.keys()) if (!wanted.has(key)) ready.delete(key); },
    stats() { return { available: !failed, pending: pending.size, ready: ready.size, completed }; },
    dispose() { worker?.terminate(); pending.clear(); ready.clear(); failed = true; },
  };
}
