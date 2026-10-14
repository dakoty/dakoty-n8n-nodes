import { describe, expect, it } from 'vitest';
import { toOutput, type Envelope } from '../nodes/DakotyTrigger/output';

const envelope: Envelope = {
	id: 'evt_3f2c0a9e5b1d4c7e8a6f2b1c9d0e3a4b',
	type: 'lead.created',
	timestamp: '2026-10-14T12:00:00Z',
	api_version: '2026-10-01',
	organization: { id: 'org-1', slug: 'jedna-tricat' },
	test: false,
	data: { id: 'lead-1', name: 'E2E Lead', value: 1500 },
};

describe('toOutput', () => {
	it('simplified flattens data and adds the event fields', () => {
		expect(toOutput(envelope, 'simplified')).toEqual({
			id: 'lead-1',
			name: 'E2E Lead',
			value: 1500,
			event_id: 'evt_3f2c0a9e5b1d4c7e8a6f2b1c9d0e3a4b',
			event_type: 'lead.created',
			occurred_at: '2026-10-14T12:00:00Z',
			organization: { id: 'org-1', slug: 'jedna-tricat' },
			test: false,
		});
	});

	it('raw returns the whole envelope', () => {
		expect(toOutput(envelope, 'raw')).toEqual(envelope);
	});

	it('defaults test to false and organization to null', () => {
		const out = toOutput({ id: 'e', type: 't', timestamp: 'x', data: {} }, 'simplified');
		expect(out.test).toBe(false);
		expect(out.organization).toBeNull();
	});
});
