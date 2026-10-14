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

	it('create surfaces the status and error code, not the response body', async () => {
		const body = { error: { code: 'VALIDATION_ERROR', message: 'Missing scope leads:read' }, secret: 'whsec_leaked' };
		const { ctx } = fake([{ statusCode: 422, body }]);
		const err = (await create(ctx).catch((e: Error) => e)) as Error;
		expect(err.message).toBe('Dakoty: creating the REST hook failed (422 VALIDATION_ERROR)');
		expect(err.message).not.toContain('whsec_leaked');
	});

	it('create deletes the old REST hook first, then posts the new one', async () => {
		const { ctx, staticData, request } = fake([{ statusCode: 204 }, { statusCode: 201, body: { data: { id: 'hook-2', secret: 'whsec_new' } } }]);
		staticData.webhookId = 'hook-1';
		staticData.secret = 'whsec_old';
		await create(ctx);
		const methods = request.mock.calls.map((c) => (c as unknown as [string, Record<string, unknown>])[1]);
		expect(methods.map((o) => [o.method, o.url])).toEqual([
			['DELETE', 'http://localhost:3000/api/v1/public/webhooks/hook-1'],
			['POST', 'http://localhost:3000/api/v1/public/webhooks'],
		]);
		expect(staticData).toEqual({ webhookId: 'hook-2', secret: 'whsec_new' });
	});

	it('create still posts when the old REST hook is already gone (404)', async () => {
		const { ctx, staticData } = fake([{ statusCode: 404 }, { statusCode: 201, body: { data: { id: 'hook-2', secret: 'whsec_new' } } }]);
		staticData.webhookId = 'hook-1';
		expect(await create(ctx)).toBe(true);
		expect(staticData).toEqual({ webhookId: 'hook-2', secret: 'whsec_new' });
	});

	it('checkExists is false without a stored id and does not call the API', async () => {
		const { ctx, request } = fake([]);
		expect(await checkExists(ctx)).toBe(false);
		expect(request).not.toHaveBeenCalled();
	});

	it('checkExists is false when the secret is missing and signatures are verified (re-create to get one)', async () => {
		const { ctx, staticData, request } = fake([]);
		staticData.webhookId = 'hook-1';
		expect(await checkExists(ctx)).toBe(false);
		expect(request).not.toHaveBeenCalled();
	});

	it('checkExists does not need the secret when signatures are not verified', async () => {
		const { ctx, staticData } = fake([{ statusCode: 200, body: { data: { id: 'hook-1', target_url: URL, events: ['lead.created'] } } }]);
		staticData.webhookId = 'hook-1';
		const verifyOff = { ...ctx, getNodeParameter: (name: string, fallback: unknown) => (name === 'verifySignature' ? false : name === 'events' ? ['lead.created'] : fallback) } as HookContext;
		expect(await checkExists(verifyOff)).toBe(true);
	});

	it('checkExists is true when URL and events match', async () => {
		const { ctx, staticData } = fake([{ statusCode: 200, body: { data: { id: 'hook-1', target_url: URL, events: ['lead.created'] } } }]);
		staticData.webhookId = 'hook-1';
		staticData.secret = 'whsec_abc';
		expect(await checkExists(ctx)).toBe(true);
	});

	it('checkExists is false when the events changed', async () => {
		const { ctx, staticData } = fake([{ statusCode: 200, body: { data: { id: 'hook-1', target_url: URL, events: ['lead.updated'] } } }]);
		staticData.webhookId = 'hook-1';
		staticData.secret = 'whsec_abc';
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
