import { createHmac, timingSafeEqual } from 'node:crypto';

/** Tolerance of the `webhook-timestamp` header, in seconds (Standard Webhooks recommends 5 minutes). */
export const TOLERANCE_SECONDS = 300;

export type HeaderBag = Record<string, string | string[] | undefined>;

function header(headers: HeaderBag, name: string): string | undefined {
	const v = headers[name];
	return Array.isArray(v) ? v[0] : v;
}

/**
 * Standard Webhooks (https://www.standardwebhooks.com) verification:
 * `webhook-signature` = space-separated `v1,<base64(HMAC-SHA256(secret_bytes, "<id>.<timestamp>.<body>"))>`.
 * `secret` is the `whsec_...` string returned when the REST hook was created (key = base64 part).
 */
export function verifyStandardWebhook(
	secret: string,
	headers: HeaderBag,
	rawBody: Buffer | string,
	now: Date = new Date(),
): boolean {
	const id = header(headers, 'webhook-id');
	const timestamp = header(headers, 'webhook-timestamp');
	const signatures = header(headers, 'webhook-signature');
	if (!id || !timestamp || !signatures) return false;

	const ts = Number(timestamp);
	if (!Number.isFinite(ts)) return false;
	if (Math.abs(now.getTime() / 1000 - ts) > TOLERANCE_SECONDS) return false;

	// Dakoty: "whsec_" secrets are base64 (decoded key); anything else is used as raw bytes (legacy secrets).
	const key = secret.startsWith('whsec_')
		? Buffer.from(secret.slice('whsec_'.length), 'base64')
		: Buffer.from(secret, 'utf8');
	const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
	const expected = createHmac('sha256', key)
		.update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), body]))
		.digest();

	for (const candidate of signatures.split(' ')) {
		const [version, value] = candidate.split(',');
		if (version !== 'v1' || !value) continue;
		const given = Buffer.from(value, 'base64');
		if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
	}
	return false;
}
