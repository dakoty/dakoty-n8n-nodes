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

function fail(action: string, statusCode: number, body: unknown): never {
	const msg = (body as { error?: { message?: string; code?: string } })?.error;
	throw new Error(`Dakoty: ${action} failed (${statusCode} ${msg?.code ?? ''}): ${msg?.message ?? JSON.stringify(body)}`);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export async function checkExists(ctx: HookContext): Promise<boolean> {
	const data = ctx.getWorkflowStaticData('node') as HookData;
	if (!data.webhookId) return false;
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
