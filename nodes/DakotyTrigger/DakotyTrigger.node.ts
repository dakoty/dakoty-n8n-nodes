import {
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';
import { EVENT_OPTIONS } from './events.generated';
import { checkExists, create, remove, type HookContext } from './hooks';
import { toOutput, type Envelope, type OutputMode } from './output';
import { recordDelivery, type ReplayData } from './replay';
import { verifyStandardWebhook, webhookId } from './signature';

export class DakotyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Dakoty Trigger',
		name: 'dakotyTrigger',
		icon: { light: 'file:dakoty.svg', dark: 'file:dakoty.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{ $parameter["events"].join(", ") }}',
		description: 'Starts the workflow when something happens in Dakoty CRM',
		defaults: {
			name: 'Dakoty Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'dakotyApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['lead.created'],
				options: EVENT_OPTIONS,
				description:
					'Events to listen for. The API key needs the scope webhooks:manage and the read scope of every selected entity (for example leads:read).',
			},
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				default: 'simplified',
				options: [
					{
						name: 'Simplified',
						value: 'simplified',
						description:
							'The record fields plus event_id, event_type, occurred_at, organization and test',
					},
					{
						name: 'Raw',
						value: 'raw',
						description: 'The whole webhook envelope, with the record under "data"',
					},
				],
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: true,
				description:
					'Whether to reject requests whose Standard Webhooks signature (webhook-signature header) does not match the secret of the REST hook',
			},
		],
	};

	webhookMethods = {
		default: {
			checkExists(this: IHookFunctions) {
				return checkExists(this as unknown as HookContext);
			},
			create(this: IHookFunctions) {
				return create(this as unknown as HookContext);
			},
			delete(this: IHookFunctions) {
				return remove(this as unknown as HookContext);
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const body = this.getBodyData() as unknown as Envelope;

		if (this.getNodeParameter('verifySignature', true) as boolean) {
			const staticData = this.getWorkflowStaticData('node') as IDataObject & ReplayData;
			const secret = staticData.secret as string | undefined;
			// Fail closed: without the stored secret nothing can be verified, so nothing runs.
			const rawBody = (req as unknown as { rawBody?: Buffer | string }).rawBody ?? JSON.stringify(body);
			if (!secret || !verifyStandardWebhook(secret, req.headers, rawBody)) {
				res.status(401).json({ error: 'invalid signature' });
				return { noWebhookResponse: true };
			}
			// Replay protection: a verified webhook-id already accepted (or a Dakoty retry) is acknowledged, not executed.
			if (!recordDelivery(staticData as ReplayData, webhookId(req.headers) ?? '', Date.now())) {
				res.status(200).json({ received: true, duplicate: true });
				return { noWebhookResponse: true };
			}
		}

		const mode = this.getNodeParameter('output', 'simplified') as OutputMode;
		return { workflowData: [this.helpers.returnJsonArray(toOutput(body, mode))] };
	}
}
