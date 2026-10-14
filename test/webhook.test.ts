/* eslint-disable -- test file, not part of the published package */
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { IWebhookFunctions } from 'n8n-workflow';
import { DakotyTrigger } from '../nodes/DakotyTrigger/DakotyTrigger.node';

// Same secret and message id as the official Standard Webhooks vector; the timestamp is signed fresh per test.
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
const ENVELOPE = {
	id: 'evt_1',
	type: 'lead.created',
	timestamp: '2026-10-14T12:00:00Z',
	data: { id: 'lead-1', name: 'E2E Lead' },
};
const RAW = JSON.stringify(ENVELOPE);

function sign(secret: string, id: string, ts: string, body: string) {
	const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
	return `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`;
}

function run(opts: { staticData?: Record<string, unknown>; verify?: boolean; headers?: Record<string, string> }) {
	const staticData = opts.staticData ?? {};
	const ts = String(Math.floor(Date.now() / 1000));
	const headers = opts.headers ?? {
		'webhook-id': ID,
		'webhook-timestamp': ts,
		'webhook-signature': sign(SECRET, ID, ts, RAW),
	};
	const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
	const ctx = {
		getRequestObject: () => ({ headers, rawBody: Buffer.from(RAW) }),
		getResponseObject: () => res,
		getBodyData: () => ENVELOPE,
		getNodeParameter: (name: string, fallback: unknown) =>
			name === 'verifySignature' ? (opts.verify ?? true) : name === 'output' ? 'simplified' : fallback,
		getWorkflowStaticData: () => staticData,
		helpers: { returnJsonArray: (item: unknown) => [{ json: item }] },
	} as unknown as IWebhookFunctions;
	return new DakotyTrigger().webhook.call(ctx).then((out) => ({ out, res, staticData }));
}

describe('DakotyTrigger.webhook', () => {
	it('executes a correctly signed request and remembers its webhook-id', async () => {
		const { out, res, staticData } = await run({ staticData: { secret: SECRET } });
		expect(out.workflowData?.[0]).toMatchObject([{ json: { id: 'lead-1', event_id: 'evt_1' } }]);
		expect(res.status).not.toHaveBeenCalled();
		expect(staticData.deliveries).toHaveLength(1);
	});

	it('answers 401 and starts nothing when the stored secret is missing', async () => {
		const { out, res, staticData } = await run({ staticData: {} });
		expect(res.status).toHaveBeenCalledWith(401);
		expect(out).toEqual({ noWebhookResponse: true });
		expect(staticData).toEqual({});
	});

	it('answers 401 for a wrong signature and does not remember the id', async () => {
		const { out, res, staticData } = await run({
			staticData: { secret: 'whsec_d3Jvbmcgc2VjcmV0IQ==' },
			headers: { 'webhook-id': ID, 'webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'webhook-signature': 'v1,AAAA' },
		});
		expect(res.status).toHaveBeenCalledWith(401);
		expect(out).toEqual({ noWebhookResponse: true });
		expect(staticData.deliveries).toBeUndefined();
	});

	it('acknowledges a replayed webhook-id with 200 and does not execute it again', async () => {
		const staticData: Record<string, unknown> = { secret: SECRET };
		await run({ staticData });
		const second = await run({ staticData });
		expect(second.res.status).toHaveBeenCalledWith(200);
		expect(second.res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
		expect(second.out).toEqual({ noWebhookResponse: true });
	});

	it('skips the secret check and replay store when signature verification is off', async () => {
		const { out, staticData } = await run({ staticData: {}, verify: false, headers: {} });
		expect(out.workflowData?.[0]).toHaveLength(1);
		expect(staticData).toEqual({});
	});
});
