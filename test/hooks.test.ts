import { describe, expect, it, vi } from 'vitest';
import { checkExists, create, remove, type HookContext } from '../nodes/DakotyTrigger/hooks';

const URL = 'https://n8n.example.com/webhook/abc/webhook';

function fake(responses: { statusCode: number; body?: unknown }[], events = ['lead.created']) {
	const staticData: Record<string, unknown> = {};
	const request = vi.fn(async () => {
		const r = responses.shift();
		if (!r) throw new Error('unexpected request');
		return r;
	});
	const ctx = {
		getCredentials: async () => ({ apiKey: 'dk_live_x', baseUrl: 'http://localhost:3000/api/v1/public/' }),
		getNodeWebhookUrl: () => URL,
		getNodeParameter: (name: string, fallback: unknown) => (name === 'events' ? events : fallback),
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({ name: 'My flow' }),
		helpers: { httpRequestWithAuthentication: request },
	} as unknown as HookContext;
	return { ctx, staticData, request };
}

const lastCall = (request: ReturnType<typeof fake>['request']) => request.mock.calls.at(-1)! as unknown as [string, Record<string, unknown>];

describe('REST hook lifecycle', () => {
	it('create posts target_url, events and a name, and stores id and secret', async () => {
		const { ctx, staticData, request } = fake([{ statusCode: 201, body: { data: { id: 'hook-1', secret: 'whsec_abc' } } }]);
		expect(await create(ctx)).toBe(true);
		const [cred, opts] = lastCall(request);
		expect(cred).toBe('dakotyApi');
		expect(opts).toMatchObject({
			method: 'POST',
			url: 'http://localhost:3000/api/v1/public/webhooks',
			body: { target_url: URL, events: ['lead.created'], name: 'n8n – My flow' },
		});
		expect(staticData).toEqual({ webhookId: 'hook-1', secret: 'whsec_abc' });
	});

	it('create surfaces the API error', async () => {
		const { ctx } = fake([{ statusCode: 422, body: { error: { code: 'VALIDATION_ERROR', message: 'Missing scope leads:read' } } }]);
		await expect(create(ctx)).rejects.toThrow(/422 VALIDATION_ERROR.*Missing scope leads:read/);
	});

	it('checkExists is false without a stored id and does not call the API', async () => {
		const { ctx, request } = fake([]);
		expect(await checkExists(ctx)).toBe(false);
		expect(request).not.toHaveBeenCalled();
	});

	it('checkExists is true when URL and events match', async () => {
		const { ctx, staticData } = fake([{ statusCode: 200, body: { data: { id: 'hook-1', target_url: URL, events: ['lead.created'] } } }]);
		staticData.webhookId = 'hook-1';
		expect(await checkExists(ctx)).toBe(true);
	});

	it('checkExists is false when the events changed', async () => {
		const { ctx, staticData } = fake([{ statusCode: 200, body: { data: { id: 'hook-1', target_url: URL, events: ['lead.updated'] } } }]);
		staticData.webhookId = 'hook-1';
		expect(await checkExists(ctx)).toBe(false);
	});

	it('checkExists on 404 forgets the stored hook and returns false', async () => {
		const { ctx, staticData } = fake([{ statusCode: 404, body: { error: { code: 'NOT_FOUND', message: 'x' } } }]);
		staticData.webhookId = 'hook-1';
		staticData.secret = 'whsec_abc';
		expect(await checkExists(ctx)).toBe(false);
		expect(staticData).toEqual({});
	});

	it('delete treats 204 and 404 as success and clears the static data', async () => {
		for (const statusCode of [204, 404]) {
			const { ctx, staticData, request } = fake([{ statusCode }]);
			staticData.webhookId = 'hook-1';
			staticData.secret = 'whsec_abc';
			expect(await remove(ctx)).toBe(true);
			expect(lastCall(request)[1]).toMatchObject({ method: 'DELETE', url: 'http://localhost:3000/api/v1/public/webhooks/hook-1' });
			expect(staticData).toEqual({});
		}
	});

	it('delete fails on a server error', async () => {
		const { ctx, staticData } = fake([{ statusCode: 500, body: {} }]);
		staticData.webhookId = 'hook-1';
		await expect(remove(ctx)).rejects.toThrow(/500/);
	});
});
