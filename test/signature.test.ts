/* eslint-disable -- test file, not part of the published package */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyStandardWebhook } from '../nodes/DakotyTrigger/signature';

// Official test vector of the Standard Webhooks specification / libraries.
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
const TS = '1614265330';
const BODY = '{"test": 2432232314}';
const SIG = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';
const NOW = new Date(1614265330 * 1000 + 1000);

const headers = (over: Record<string, string> = {}) => ({
	'webhook-id': ID,
	'webhook-timestamp': TS,
	'webhook-signature': SIG,
	...over,
});

describe('verifyStandardWebhook', () => {
	it('accepts the official test vector', () => {
		expect(verifyStandardWebhook(SECRET, headers(), BODY, NOW)).toBe(true);
		expect(verifyStandardWebhook(SECRET, headers(), Buffer.from(BODY), NOW)).toBe(true);
	});

	it('accepts a rotated secret (several signatures, one valid)', () => {
		const sig = `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${SIG}`;
		expect(verifyStandardWebhook(SECRET, headers({ 'webhook-signature': sig }), BODY, NOW)).toBe(true);
	});

	it('rejects a wrong secret', () => {
		expect(verifyStandardWebhook('whsec_d3Jvbmcgc2VjcmV0IQ==', headers(), BODY, NOW)).toBe(false);
	});

	it('rejects a changed body', () => {
		expect(verifyStandardWebhook(SECRET, headers(), `${BODY} `, NOW)).toBe(false);
	});

	it('rejects a timestamp outside the 5 minute tolerance, both directions', () => {
		expect(verifyStandardWebhook(SECRET, headers(), BODY, new Date(1614265330 * 1000 + 301_000))).toBe(false);
		expect(verifyStandardWebhook(SECRET, headers(), BODY, new Date(1614265330 * 1000 - 301_000))).toBe(false);
		expect(verifyStandardWebhook(SECRET, headers(), BODY, new Date(1614265330 * 1000 + 299_000))).toBe(true);
	});

	it('rejects missing headers and unknown signature versions', () => {
		expect(verifyStandardWebhook(SECRET, {}, BODY, NOW)).toBe(false);
		expect(verifyStandardWebhook(SECRET, headers({ 'webhook-signature': SIG.replace('v1,', 'v2,') }), BODY, NOW)).toBe(false);
		expect(verifyStandardWebhook(SECRET, headers({ 'webhook-timestamp': 'abc' }), BODY, NOW)).toBe(false);
	});

	it('treats a non-whsec secret as raw key bytes (legacy secrets)', () => {
		const legacy = 'a'.repeat(64);
		const sig = `v1,${createHmac('sha256', Buffer.from(legacy)).update(`${ID}.${TS}.${BODY}`).digest('base64')}`;
		expect(verifyStandardWebhook(legacy, headers({ 'webhook-signature': sig }), BODY, NOW)).toBe(true);
	});
});
