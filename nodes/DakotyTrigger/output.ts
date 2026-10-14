import type { IDataObject } from 'n8n-workflow';

/** Standard Webhooks envelope sent by Dakoty. */
export interface Envelope {
	id: string;
	type: string;
	timestamp: string;
	api_version?: string;
	organization?: IDataObject;
	test?: boolean;
	data?: IDataObject;
}

export type OutputMode = 'simplified' | 'raw';

/**
 * simplified: all fields of `data` plus `event_id`, `event_type`, `occurred_at`, `organization`, `test`
 * (same flat shape as the Make triggers). raw: the whole envelope.
 */
export function toOutput(envelope: Envelope, mode: OutputMode): IDataObject {
	if (mode === 'raw') return envelope as unknown as IDataObject;
	return {
		...(envelope.data ?? {}),
		event_id: envelope.id,
		event_type: envelope.type,
		occurred_at: envelope.timestamp,
		organization: envelope.organization ?? null,
		test: envelope.test ?? false,
	};
}
