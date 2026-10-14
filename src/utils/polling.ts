/**
 * Runs `fn` every `intervalMs` until the returned stop function is called.
 * Use the stop function as a useEffect cleanup so intervals never leak or stack up.
 */
export function startPolling(fn: () => void, intervalMs: number): () => void {
  const id = setInterval(fn, intervalMs);
  return () => clearInterval(id);
}
