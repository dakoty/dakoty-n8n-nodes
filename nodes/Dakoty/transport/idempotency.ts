import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

/** Sends the optional "Idempotency Key" field of the additional fields as the Idempotency-Key header. */
export async function idempotencyHeader(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const key = this.getNodeParameter('additionalFields.idempotencyKey', '') as string;
	if (key) {
		requestOptions.headers = { ...requestOptions.headers, 'Idempotency-Key': key };
	}
	return requestOptions;
}
