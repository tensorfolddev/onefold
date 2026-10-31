/**
 * Runs `fn` one at a time: a call that comes while it runs makes it run once more afterwards — never more. A busy chat
 * sends many "something changed" events; this turns them into one fetch, plus one to catch up.
 */
export function coalesce(fn: () => Promise<unknown>): () => void {
  let running = false;
  let again = false;
  const go = () => {
    if (running) { again = true; return; }
    running = true;
    void fn().finally(() => {
      running = false;
      if (again) { again = false; go(); }
    });
  };
  return go;
}
