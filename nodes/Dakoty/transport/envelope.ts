import type { IExecuteSingleFunctions, IN8nHttpFullResponse, INodeExecutionData } from 'n8n-workflow';

/**
 * `POST /leads` answers `{"data": {...lead}, "deduplicated": true|false}`. The operation output is the lead from
 * `data`; this keeps the envelope flag as the output field `deduplicated` (true when `dedupe=company` returned an
 * existing lead instead of creating one).
 */
export async function addDeduplicated(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const flag = (response.body as { deduplicated?: unknown } | undefined)?.deduplicated;
	if (typeof flag === 'boolean') {
		for (const item of items) item.json = { ...item.json, deduplicated: flag };
	}
	return items;
}
