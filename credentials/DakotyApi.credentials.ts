import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class DakotyApi implements ICredentialType {
	name = 'dakotyApi';

	displayName = 'Dakoty API';

	icon = { light: 'file:dakoty.svg', dark: 'file:dakoty.dark.svg' } as const;

	documentationUrl = 'https://github.com/dakoty/dakoty-n8n-nodes#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'API key from Dakoty: Settings → Integrations → API keys. It starts with dk_live_',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.dakoty.com/api/v1/public',
			description: 'Change only for local testing',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me',
		},
	};
}
