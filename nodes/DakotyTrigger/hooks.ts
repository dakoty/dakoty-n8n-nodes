import type {
	IDataObject,
	IHookFunctions,
	IHttpRequestOptions,
} from 'n8n-workflow';

interface HookData {
	webhookId?: string;
	secret?: string;
}

interface RestHook {
	id: string;
	target_url?: string;
	events?: string[];
}

/** Minimal subset of the n8n hook context the REST hook lifecycle needs (also what unit tests fake). */
export type HookContext = Pick<
	IHookFunctions,
	'getNodeWebhookUrl' | 'getNodeParameter' | 'getWorkflowStaticData' | 'getWorkflow' | 'getCredentials'
> & {
	helpers: { httpRequestWithAuthentication: IHookFunctions['helpers']['httpRequestWithAuthentication'] };
};

async function call(
	ctx: HookContext,
	options: Omit<IHttpRequestOptions, 'url'> & { path: string },
): Promise<{ statusCode: number; body: unknown }> {
	const credentials = await ctx.getCredentials('dakotyApi');
	const { path, ...rest } = options;
	const response = (await ctx.helpers.httpRequestWithAuthentication.call(ctx as IHookFunctions, 'dakotyApi', {
		...rest,
		url: `${String(credentials.baseUrl).replace(/\/+$/, '')}${path}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as { statusCode: number; body: unknown };
	return response;
}

/** Throws with the status and the error code only: the response body is not echoed into the message. */
function fail(action: string, statusCode: number, body: unknown): never {
	const code = (body as { error?: { code?: string } } | undefined)?.error?.code;
	throw new Error(`Dakoty: ${action} failed (${statusCode}${code ? ` ${code}` : ''})`);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export async function checkExists(ctx: HookContext): Promise<boolean> {
	const data = ctx.getWorkflowStaticData('node') as HookData;
	if (!data.webhookId) return false;
	// Without the stored secret the signature cannot be checked (the webhook answers 401), so re-create the hook to get one.
	const verify = ctx.getNodeParameter('verifySignature', true) as boolean;
	if (verify && !data.secret) return false;
	const res = await call(ctx, { method: 'GET', path: `/webhooks/${encodeURIComponent(data.webhookId)}` });
	if (res.statusCode === 404) {
		delete data.webhookId;
		delete data.secret;
		return false;
	}
	if (res.statusCode >= 400) fail('reading the REST hook', res.statusCode, res.body);
	const hook = (res.body as { data: RestHook }).data;
	const events = ctx.getNodeParameter('events', []) as string[];
	return hook.target_url === ctx.getNodeWebhookUrl('default') && sameSet(hook.events ?? [], events);
}

export async function create(ctx: HookContext): Promise<boolean> {
	const data = ctx.getWorkflowStaticData('node') as HookData;
	const events = ctx.getNodeParameter('events', []) as string[];
	const body: IDataObject = {
		target_url: ctx.getNodeWebhookUrl('default') as string,
		events,
		name: `n8n – ${ctx.getWorkflow().name ?? 'workflow'}`,
	};
	// URL or events changed (or the secret was lost): remove the old REST hook so it does not keep posting to the old URL.
	if (data.webhookId) {
		const old = await call(ctx, { method: 'DELETE', path: `/webhooks/${encodeURIComponent(data.webhookId)}` });
		if (old.statusCode >= 400 && old.statusCode !== 404) fail('deleting the old REST hook', old.statusCode, old.body);
		delete data.webhookId;
		delete data.secret;
	}
	const res = await call(ctx, { method: 'POST', path: '/webhooks', body });
	if (res.statusCode >= 400) fail('creating the REST hook', res.statusCode, res.body);
	const created = (res.body as { data: { id: string; secret?: string } }).data;
	data.webhookId = created.id;
	data.secret = created.secret;
	return true;
}

export async function remove(ctx: HookContext): Promise<boolean> {
	const data = ctx.getWorkflowStaticData('node') as HookData;
	if (data.webhookId) {
		const res = await call(ctx, { method: 'DELETE', path: `/webhooks/${encodeURIComponent(data.webhookId)}` });
		if (res.statusCode >= 400 && res.statusCode !== 404) fail('deleting the REST hook', res.statusCode, res.body);
	}
	delete data.webhookId;
	delete data.secret;
	return true;
}
