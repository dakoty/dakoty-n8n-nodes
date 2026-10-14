import {
	NodeApiError,
	type IExecuteSingleFunctions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type JsonObject,
} from 'n8n-workflow';

interface ApiErrorBody {
	error?: { code?: string; message?: string };
}

/**
 * Dakoty answers errors with `{"error":{"code":"FORBIDDEN","message":"..."}}`. The node requests with
 * `ignoreHttpStatusErrors`, so this runs first in every operation and turns a 4xx/5xx into a NodeApiError
 * whose message is the API message and whose description is "[<status>] <code>".
 */
export async function handleApiError(
	this: IExecuteSingleFunctions,
	data: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode < 400) return data;
	const body = (response.body ?? {}) as ApiErrorBody;
	const code = body.error?.code ?? 'ERROR';
	throw new NodeApiError(this.getNode(), response.body as JsonObject, {
		message: body.error?.message ?? `Request failed with status code ${response.statusCode}`,
		description: `[${response.statusCode}] ${code}`,
		httpCode: String(response.statusCode),
	});
}
