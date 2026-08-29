import { hammingDistance } from "@/server/media/images";

/**
 * Media selection for chapters and recaps: pure, deterministic, testable.
 *
 * Greedy selection maximizing quality × relevance × diversity:
 * - near-duplicates (dHash distance ≤ threshold) collapse into burst clusters
 *   and at most the strongest few of a cluster are picked
 * - time diversity: picks spread across the period's event clusters
 * - parents always override the result in the editor
 */

export interface SelectableMedia {
  id: string;
  kind: "photo" | "video";
  capturedAt: Date | null;
  phash: string | null;
  qualityScore: number;   // 0..1 deterministic
  relevance: number;      // 0..1 (AI suggestion or fallback heuristic)
  isFavorite: boolean;
  hasMemoryContext: boolean;
}

export interface EventCluster<T extends SelectableMedia = SelectableMedia> {
  start: Date | null;
  items: T[];
}

const BURST_HASH_DISTANCE = 10;
const EVENT_GAP_MS = 90 * 60 * 1000; // 90 min gap starts a new event

/** Group media into time-based event clusters (unknown dates → one cluster). */
export function clusterByEvent<T extends SelectableMedia>(items: T[]): EventCluster<T>[] {
  const dated = items
    .filter((i) => i.capturedAt)
    .sort((a, b) => a.capturedAt!.getTime() - b.capturedAt!.getTime());
  const undated = items.filter((i) => !i.capturedAt);

  const clusters: EventCluster<T>[] = [];
  for (const item of dated) {
    const last = clusters[clusters.length - 1];
    const lastItem = last?.items[last.items.length - 1];
    if (
      last &&
      lastItem?.capturedAt &&
      item.capturedAt!.getTime() - lastItem.capturedAt.getTime() <= EVENT_GAP_MS
    ) {
      last.items.push(item);
    } else {
      clusters.push({ start: item.capturedAt, items: [item] });
    }
  }
  if (undated.length > 0) clusters.push({ start: null, items: undated });
  return clusters;
}

/** Collapse near-duplicate photos within a cluster; keep the strongest. */
export function collapseBursts<T extends SelectableMedia>(items: T[]): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const group = groups.find((g) => {
      const rep = g[0]!;
      return (
        item.kind === "photo" &&
        rep.kind === "photo" &&
        item.phash &&
        rep.phash &&
        hammingDistance(item.phash, rep.phash) <= BURST_HASH_DISTANCE
      );
    });
    if (group) group.push(item);
    else groups.push([item]);
  }
  for (const group of groups) {
    group.sort((a, b) => score(b) - score(a));
  }
  return groups;
}

function score(item: SelectableMedia): number {
  return (
    item.qualityScore * 0.45 +
    item.relevance * 0.4 +
    (item.isFavorite ? 0.25 : 0) +
    (item.hasMemoryContext ? 0.1 : 0)
  );
}

export interface SelectionResult {
  selected: string[];       // media ids in chronological order
  duplicatesCollapsed: number;
}

/**
 * Pick up to `count` items spreading across event clusters, at most
 * `maxPerBurst` from any burst group, favorites always considered first.
 */
export function selectBest(
  items: SelectableMedia[],
  count: number,
  opts: { maxPerBurst?: number } = {}
): SelectionResult {
  const maxPerBurst = opts.maxPerBurst ?? 2;
  const clusters = clusterByEvent(items);
  let duplicatesCollapsed = 0;

  // per cluster: burst-collapse, rank groups by best member
  const clusterPools = clusters.map((cluster) => {
    const groups = collapseBursts(cluster.items);
    duplicatesCollapsed += cluster.items.length - groups.length;
    return {
      start: cluster.start,
      groups: groups.sort((a, b) => score(b[0]!) - score(a[0]!)),
      taken: 0,
    };
  });

  const picked: SelectableMedia[] = [];
  const takenPerGroup = new Map<T[], number>();
  type T = SelectableMedia;

  // round-robin across clusters so the month is chronologically diverse
  let progress = true;
  while (picked.length < count && progress) {
    progress = false;
    for (const pool of clusterPools) {
      if (picked.length >= count) break;
      // find next un-exhausted group in this cluster
      for (const group of pool.groups) {
        const taken = takenPerGroup.get(group) ?? 0;
        if (taken >= maxPerBurst || taken >= group.length) continue;
        const candidate = group[taken]!;
        takenPerGroup.set(group, taken + 1);
        picked.push(candidate);
        progress = true;
        break;
      }
    }
  }

  picked.sort((a, b) => {
    const ta = a.capturedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = b.capturedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  return { selected: picked.map((p) => p.id), duplicatesCollapsed };
}
