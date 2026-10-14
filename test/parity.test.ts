/* eslint-disable -- test file, not part of the published package */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { INodeProperties } from 'n8n-workflow';
import { Dakoty } from '../nodes/Dakoty/Dakoty.node';
import { DakotyTrigger } from '../nodes/DakotyTrigger/DakotyTrigger.node';
import { EVENT_OPTIONS } from '../nodes/DakotyTrigger/events.generated';
import { PACKAGE_VERSION } from '../nodes/Dakoty/version';
import { loadOptionsMethods } from '../nodes/Dakoty/transport/loadOptions';
import { OPERATIONS } from '../scripts/operations';
import { loadSpec, makeResolver } from '../scripts/spec';

const spec = loadSpec();
const { deref, norm } = makeResolver(spec);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const node = new Dakoty();
const props = node.description.properties;

// The 33 modules of the Make app (dakoty-make-app/modules), as "<resource>.<operation>".
const MAKE_SCOPE = [
	'lead.create', 'lead.update', 'lead.get', 'lead.getAll', 'lead.find', 'lead.archive', 'lead.move',
	'company.create', 'company.update', 'company.get', 'company.getAll', 'company.find',
	'contact.create', 'contact.update', 'contact.get', 'contact.getAll', 'contact.find',
	'activity.create', 'activity.update', 'activity.get', 'activity.getAll', 'activity.complete',
	'task.create', 'task.update', 'task.get', 'task.getAll',
	'invoice.create', 'invoice.get', 'invoice.getAll',
	'booking.create', 'booking.get', 'booking.getAll', 'booking.cancel',
];

function forOperation(resource: string, operation: string): INodeProperties[] {
	return props.filter((p) => {
		const show = p.displayOptions?.show;
		return show?.resource?.includes(resource) && show?.operation?.includes(operation);
	});
}

describe('scope parity with the Make app', () => {
	it('has exactly the 33 Make operations', () => {
		expect(OPERATIONS.map((o) => `${o.resource}.${o.value}`).sort()).toEqual([...MAKE_SCOPE].sort());
	});

	it('exposes every operation in the node description', () => {
		for (const def of OPERATIONS) {
			const selector = props.find((p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(def.resource));
			const option = (selector?.options as { value: string }[]).find((o) => o.value === def.value);
			expect(option, `${def.resource}.${def.value}`).toBeTruthy();
		}
	});
});

describe('generated description vs OpenAPI', () => {
	it('every operation exists in the spec with the same method and a scope', () => {
		for (const def of OPERATIONS) {
			const o = spec.paths[def.path]?.[def.method.toLowerCase()];
			expect(o, `${def.method} ${def.path}`).toBeTruthy();
			expect(o['x-dakoty-scope'], `${def.method} ${def.path} scope`).toMatch(/:(read|write)$/);
		}
	});

	it('covers every required body field of each write operation', () => {
		for (const def of OPERATIONS.filter((d) => d.kind === 'create' || (d.kind === 'action' && d.method === 'POST'))) {
			const o = spec.paths[def.path][def.method.toLowerCase()];
			if (!o.requestBody) continue;
			const bs = norm(o.requestBody.content['application/json'].schema);
			const fields = forOperation(def.resource, def.value);
			const sent = JSON.stringify(fields);
			for (const required of bs.required ?? []) {
				expect(sent, `${def.path} required field ${required}`).toContain(`"property":"${required}`);
			}
		}
	});

	it('covers every query filter of each search operation', () => {
		for (const def of OPERATIONS.filter((d) => d.kind === 'getAll' || d.kind === 'find')) {
			const o = spec.paths[def.path].get;
			const sent = JSON.stringify(forOperation(def.resource, def.value));
			for (const raw of o.parameters ?? []) {
				const p = deref(raw);
				if (['Accept-Language', 'cursor', 'limit'].includes(p.name)) continue;
				expect(sent, `${def.path} filter ${p.name}`).toContain(`"property":"${p.name}"`);
			}
		}
	});

	it('every dropdown references an existing loadOptions method', () => {
		const methods = Object.keys(loadOptionsMethods);
		const walk = (list: INodeProperties[]) => {
			for (const p of list) {
				const m = p.typeOptions?.loadOptionsMethod;
				if (m) expect(methods, `${p.name} -> ${m}`).toContain(m);
				if (Array.isArray(p.options)) walk(p.options as INodeProperties[]);
			}
		};
		walk(props);
		expect(methods).toHaveLength(10);
	});

	it('dropdown endpoints exist in the spec', () => {
		for (const path of ['/users', '/lead-origins', '/lead-pipelines', '/lost-reasons', '/activity-types', '/projects', '/booking-services', '/booking-staff']) {
			expect(spec.paths[path]?.get, path).toBeTruthy();
		}
	});
});

describe('pagination', () => {
	it('keeps filters and limit on every page (n8n replaces qs of the paginated request, so it must extend $request.qs)', () => {
		for (const def of OPERATIONS.filter((d) => d.kind === 'getAll')) {
			const returnAll = forOperation(def.resource, def.value).find((p) => p.name === 'returnAll');
			const pagination = returnAll?.routing?.operations?.pagination as { type: string; properties: { continue: string; request: { qs: string } } };
			expect(pagination.type, def.resource).toBe('generic');
			expect(pagination.properties.request.qs).toContain('$request.qs');
			expect(pagination.properties.request.qs).toContain('next_cursor');
			expect(pagination.properties.continue).toContain('has_more');
		}
	});

	it('requests pages of 100 with Return All and caps the limit at 100 otherwise', () => {
		const selector = props.find((p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('lead'));
		const getAll = (selector?.options as { value: string; routing: { request: { qs: { limit: string } } } }[]).find((o) => o.value === 'getAll');
		expect(getAll?.routing.request.qs.limit).toBe('={{ $parameter.returnAll ? 100 : Math.min($parameter.limit, 100) }}');
	});
});

describe('package metadata', () => {
	it('keeps the User-Agent version equal to package.json', () => {
		expect(PACKAGE_VERSION).toBe(pkg.version);
		expect(node.description.requestDefaults?.headers?.['User-Agent']).toBe(`n8n-nodes-dakoty/${pkg.version} (n8n)`);
	});

	it('has no runtime dependencies (n8n Cloud requirement)', () => {
		expect(pkg.dependencies ?? {}).toEqual({});
		expect(pkg.license).toBe('MIT');
		expect(pkg.keywords).toContain('n8n-community-node-package');
		expect(pkg.repository.url).toBe('git+https://github.com/dakoty/dakoty-n8n-nodes.git');
	});

	it('registers both nodes and the credential', () => {
		expect(pkg.n8n.nodes).toEqual(['dist/nodes/Dakoty/Dakoty.node.js', 'dist/nodes/DakotyTrigger/DakotyTrigger.node.js']);
		expect(pkg.n8n.credentials).toEqual(['dist/credentials/DakotyApi.credentials.js']);
	});
});

describe('trigger events', () => {
	it('lists the 41 events of the Make Watch Events module, all with a scope-bearing entity', () => {
		expect(EVENT_OPTIONS).toHaveLength(41);
		const values = EVENT_OPTIONS.map((e) => e.value as string);
		for (const t of ['lead.created', 'lead.updated', 'company.created', 'contact.created', 'activity.created', 'activity.completed', 'task.created', 'invoice.created', 'invoice.paid', 'invoice.overdue']) {
			expect(values).toContain(t);
		}
		expect(values.filter((v) => v.startsWith('booking.'))).toHaveLength(5);
		expect(values.filter((v) => v.startsWith('order.'))).toHaveLength(14);
		expect(values.some((v) => v.startsWith('quote.') || v.startsWith('product.'))).toBe(false);
	});

	it('is a webhook trigger node with the REST hook methods', () => {
		const t = new DakotyTrigger();
		expect(t.description.webhooks?.[0]).toMatchObject({ httpMethod: 'POST', path: 'webhook' });
		expect(Object.keys(t.webhookMethods.default)).toEqual(['checkExists', 'create', 'delete']);
	});
});
