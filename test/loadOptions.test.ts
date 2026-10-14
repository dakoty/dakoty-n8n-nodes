import { describe, expect, it, vi } from 'vitest';
import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { listAll, loadOptionsMethods } from '../nodes/Dakoty/transport/loadOptions';

function ctx(pages: Record<string, unknown>[], current: Record<string, string> = {}) {
	const request = vi.fn(async () => pages.shift());
	const self = {
		getCredentials: async () => ({ baseUrl: 'http://localhost:3000/api/v1/public' }),
		getCurrentNodeParameter: (name: string) => current[name],
		helpers: { httpRequestWithAuthentication: request },
	} as unknown as ILoadOptionsFunctions;
	return { self, request };
}

describe('loadOptions', () => {
	it('follows next_cursor until has_more is false', async () => {
		const { self, request } = ctx([
			{ data: [{ id: '1' }], has_more: true, next_cursor: 'c1' },
			{ data: [{ id: '2' }], has_more: false, next_cursor: null },
		]);
		const items = await listAll.call(self, '/users');
		expect(items.map((i) => i.id)).toEqual(['1', '2']);
		const second = (request.mock.calls[1] as unknown as [string, { qs: Record<string, unknown> }])[1];
		expect(second.qs).toEqual({ limit: 100, cursor: 'c1' });
	});

	it('getUsers labels with name and e-mail', async () => {
		const { self } = ctx([{ data: [{ id: 'u1', name: 'Jana Nováková', email: 'jana@example.com' }] }]);
		expect(await loadOptionsMethods.getUsers.call(self)).toEqual([{ name: 'Jana Nováková (jana@example.com)', value: 'u1' }]);
	});

	const pipelines = {
		data: [
			{ id: 'p1', name: 'Sales', stages: [{ id: 's1', name: 'New' }, { id: 's2', name: 'Won' }] },
			{ id: 'p2', name: 'Support', stages: [{ id: 's3', name: 'Open' }] },
		],
	};

	it('getLeadStages lists the stages of the selected pipeline only', async () => {
		const { self } = ctx([structuredClone(pipelines)], { 'additionalFields.pipeline_id': 'p1' });
		expect(await loadOptionsMethods.getLeadStages.call(self)).toEqual([
			{ name: 'New', value: 's1' },
			{ name: 'Won', value: 's2' },
		]);
	});

	it('getLeadStages without a pipeline lists all stages prefixed with the pipeline', async () => {
		const { self } = ctx([structuredClone(pipelines)]);
		expect((await loadOptionsMethods.getLeadStages.call(self)).map((o) => o.name)).toEqual(['Sales / New', 'Sales / Won', 'Support / Open']);
	});

	it('getBookingServices shows the duration', async () => {
		const { self } = ctx([{ data: [{ id: 'b1', name: 'Haircut', duration_minutes: 30 }] }]);
		expect(await loadOptionsMethods.getBookingServices.call(self)).toEqual([{ name: 'Haircut (30 min)', value: 'b1' }]);
	});
});
