/** How long an accepted `webhook-id` is remembered. Longer than the 5 minute signature tolerance. */
export const REPLAY_TTL_MS = 10 * 60 * 1000;
/** Upper bound of remembered ids, so the static data stays small. */
export const REPLAY_MAX_IDS = 1000;

/** Node static data slice: accepted deliveries as [webhook-id, acceptedAtMs], oldest first. */
export interface ReplayData {
	deliveries?: Array<[string, number]>;
}

/**
 * Returns false when `id` was already accepted within the TTL (replay or retry: do not execute again).
 * Otherwise records it, drops expired entries and keeps only the newest REPLAY_MAX_IDS.
 */
export function recordDelivery(data: ReplayData, id: string, nowMs: number): boolean {
	const kept = (data.deliveries ?? []).filter(([, at]) => nowMs - at < REPLAY_TTL_MS);
	if (kept.some(([seen]) => seen === id)) {
		data.deliveries = kept;
		return false;
	}
	kept.push([id, nowMs]);
	data.deliveries = kept.slice(-REPLAY_MAX_IDS);
	return true;
}
