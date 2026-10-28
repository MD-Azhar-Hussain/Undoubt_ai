// Preserve committed newer revisions when snapshots, pagination and live events
// overlap. Reusing unchanged objects also avoids unnecessary card updates.
export function mergeDoubts(current, incoming) {
  const byId = new Map(current.map(doubt => [doubt.id, doubt]));
  for (const doubt of incoming) {
    const previous = byId.get(doubt.id);
    if (!previous || (doubt.revision || 0) >= (previous.revision || 0)) byId.set(doubt.id, doubt);
  }
  return [...byId.values()];
}

export function updateDoubt(current, update) {
  return current.map(doubt => doubt.id === update.id && (update.revision || 0) >= (doubt.revision || 0)
    ? { ...doubt, ...update } : doubt);
}

export function reconcileSnapshot(current, snapshot, pendingUpdates, liveIds) {
  // A reconnect reloads the latest page. Older loaded pages may have changed
  // while offline and must be fetched again rather than retained as stale data.
  const keep = new Set([...snapshot.map(doubt => doubt.id), ...liveIds]);
  return pendingUpdates.reduce(updateDoubt, mergeDoubts(current.filter(doubt => keep.has(doubt.id)), snapshot));
}
