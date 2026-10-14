import { describe, expect, it } from 'vitest';
import { NodeApiError, type IExecuteSingleFunctions, type IN8nHttpFullResponse } from 'n8n-workflow';
import { handleApiError } from '../nodes/Dakoty/transport/errors';
import { idempotencyHeader } from '../nodes/Dakoty/transport/idempotency';

const self = { getNode: () => ({ name: 'Dakoty', type: 'n8n-nodes-dakoty.dakoty', typeVersion: 1, position: [0, 0], parameters: {}, id: 'x' }) } as unknown as IExecuteSingleFunctions;
const res = (statusCode: number, body: unknown) => ({ statusCode, body, headers: {} }) as IN8nHttpFullResponse;

describe('handleApiError', () => {
	it('passes successful responses through', async () => {
		const items = [{ json: { id: 1 } }];
		expect(await handleApiError.call(self, items, res(200, { data: {} }))).toBe(items);
	});

	it('turns an API error into a NodeApiError with message and "[status] CODE"', async () => {
		const body = { error: { code: 'FORBIDDEN', message: 'Missing scope leads:write' } };
		const err = await handleApiError.call(self, [], res(403, body)).catch((e) => e);
		expect(err).toBeInstanceOf(NodeApiError);
		expect(err.message).toBe('Missing scope leads:write');
		expect(err.description).toBe('[403] FORBIDDEN');
		expect(err.httpCode).toBe('403');
	});

	it('copes with a body that is not the API error shape', async () => {
		const err = await handleApiError.call(self, [], res(502, '<html>')).catch((e) => e);
		expect(err.message).toBe('Request failed with status code 502');
		expect(err.description).toBe('[502] ERROR');
	});
});

describe('idempotencyHeader', () => {
	const withKey = (key: string) => ({ getNodeParameter: () => key }) as unknown as IExecuteSingleFunctions;

	it('adds the Idempotency-Key header when a key is set', async () => {
		const out = await idempotencyHeader.call(withKey('order-42'), { url: '/x', headers: { A: 'b' } });
		expect(out.headers).toEqual({ A: 'b', 'Idempotency-Key': 'order-42' });
	});

	it('leaves the request alone without a key', async () => {
		const out = await idempotencyHeader.call(withKey(''), { url: '/x' });
		expect(out.headers).toBeUndefined();
	});
});
