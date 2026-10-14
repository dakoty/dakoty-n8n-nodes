import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { resourceDescriptions, resourceProperty } from './descriptions';
import { loadOptionsMethods } from './transport/loadOptions';
import { PACKAGE_VERSION } from './version';

export class Dakoty implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Dakoty',
		name: 'dakoty',
		icon: { light: 'file:dakoty.svg', dark: 'file:dakoty.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Work with leads, companies, contacts, activities, tasks, invoices and bookings in Dakoty CRM',
		defaults: {
			name: 'Dakoty',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'dakotyApi', required: true }],
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl}}',
			ignoreHttpStatusErrors: true,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'Accept-Language': 'en',
				'User-Agent': `n8n-nodes-dakoty/${PACKAGE_VERSION} (n8n)`,
			},
		},
		properties: [resourceProperty, ...resourceDescriptions],
	};

	methods = { loadOptions: loadOptionsMethods };
}
