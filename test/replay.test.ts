import { describe, expect, it } from 'vitest';
import { REPLAY_MAX_IDS, REPLAY_TTL_MS, recordDelivery, type ReplayData } from '../nodes/DakotyTrigger/replay';

const T0 = 1_700_000_000_000;

describe('recordDelivery', () => {
	it('accepts a new webhook-id and rejects the same id while it is remembered', () => {
		const data: ReplayData = {};
		expect(recordDelivery(data, 'msg_1', T0)).toBe(true);
		expect(recordDelivery(data, 'msg_1', T0 + 60_000)).toBe(false);
		expect(recordDelivery(data, 'msg_2', T0 + 60_000)).toBe(true);
		expect(data.deliveries).toEqual([
			['msg_1', T0],
			['msg_2', T0 + 60_000],
		]);
	});

	it('forgets an id after the TTL', () => {
		const data: ReplayData = {};
		recordDelivery(data, 'msg_1', T0);
		expect(recordDelivery(data, 'msg_1', T0 + REPLAY_TTL_MS - 1)).toBe(false);
		expect(recordDelivery(data, 'msg_1', T0 + REPLAY_TTL_MS)).toBe(true);
		expect(data.deliveries).toEqual([['msg_1', T0 + REPLAY_TTL_MS]]);
	});

	it('keeps only the newest REPLAY_MAX_IDS ids', () => {
		const data: ReplayData = {};
		for (let i = 0; i < REPLAY_MAX_IDS + 5; i++) recordDelivery(data, `msg_${i}`, T0 + i);
		expect(data.deliveries).toHaveLength(REPLAY_MAX_IDS);
		expect(data.deliveries![0][0]).toBe('msg_5');
		expect(data.deliveries!.at(-1)![0]).toBe(`msg_${REPLAY_MAX_IDS + 4}`);
	});
});
