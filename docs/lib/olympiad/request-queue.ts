// Serializes every call to Lichess's broadcast API. Lichess enforces "only
// one request in flight per client" on these endpoints (confirmed live: a
// second concurrent call gets HTTP 429 with that exact message — see
// broadcast-api.ts) — but this page has several independent data hooks
// (two useStandings instances, useSectionRounds, useOlympiadSection) that
// each fire their own fetches on mount/section-switch with no knowledge of
// each other, so without this they collide and 429 each other out right
// when the page loads or the section toggle changes. Every fetchTournamentInfo
// / fetchRoundPgnSnapshot call is routed through `enqueue` so only one is
// ever in flight at a time, no matter which hook queued it.
let tail: Promise<void> = Promise.resolve();

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = tail.then(task, task);
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
