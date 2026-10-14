/* eslint-disable -- development-only generator, not part of the published package */
// Generates nodes/Dakoty/descriptions/*.ts and nodes/DakotyTrigger/events.generated.ts from
// spec/openapi-public-v1.yaml + scripts/operations.ts (same approach as dakoty-make-app/tools/gen.py).
// usage: npm run generate   (output is committed; the build never runs it)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import prettier from 'prettier';
import { Json, loadSpec, makeResolver, ROOT } from './spec';
import { FieldOverride, OPERATIONS, OperationDef, RESOURCES, Resource } from './operations';

const spec = loadSpec();
const { deref, norm } = makeResolver(spec);

class Raw {
	constructor(public code: string) {}
}
const raw = (code: string) => new Raw(code);

function ser(v: unknown): string {
	if (v instanceof Raw) return v.code;
	if (Array.isArray(v)) return `[${v.map(ser).join(',')}]`;
	if (v && typeof v === 'object') {
		return `{${Object.entries(v as Record<string, unknown>)
			.filter(([, x]) => x !== undefined)
			.map(([k, x]) => `${JSON.stringify(k)}:${ser(x)}`)
			.join(',')}}`;
	}
	return JSON.stringify(v);
}

/** Upper bound of pages one "Return All" run fetches (n8n generic pagination), so a misbehaving API cannot loop forever. */
const MAX_PAGES = 100;

const KEEP = new Set(['ID', 'URL', 'API', 'VAT', 'SK']);
const SMALL = new Set<string>();

function titleCase(label: string): string {
	return label
		.split(' ')
		.map((w, i) => {
			if (KEEP.has(w.toUpperCase())) return w.toUpperCase();
			if (w.includes('-')) return w.split('-').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join('-');
			if (i > 0 && SMALL.has(w.toLowerCase())) return w.toLowerCase();
			return w.charAt(0).toUpperCase() + w.slice(1);
		})
		.join(' ');
}

function defaultLabel(name: string): string {
	const n = name.replace('_ids', 's').replace('_id', '').replace(/_/g, ' ').replace('url', 'URL').trim();
	return titleCase(n);
}

function cleanHelp(d?: string): string | undefined {
	if (!d) return undefined;
	const out = d.replace('Required on create.', '').replace('POST only; ', '').replace('POST only.', '').trim();
	return out || undefined;
}

function noFinalPeriod(s: string): string {
	return s.replace(/\.$/, '');
}

/** n8n lint: a single sentence has no final period, several sentences end with one. */
function fixPeriod(s: string): string {
	const multi = /[.!?]\s+\S/.test(s.replace(/<[^>]+>/g, ''));
	const stripped = s.replace(/\.$/, '');
	return multi ? `${stripped}.` : stripped;
}

const DYNAMIC_SINGLE = 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.';
const DYNAMIC_MULTI = 'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.';

/** Post-process one parameter so it satisfies the n8n community-node lint rules. */
function polish(f: Json): Json {
	if (f.name === 'returnAll' || f.name === 'limit') return f;
	if (f.typeOptions?.loadOptionsMethod && (f.type === 'options' || f.type === 'multiOptions')) {
		const multi = f.type === 'multiOptions';
		f.displayName = `${f.displayName.replace(/ (Name or ID|Names or IDs)$/, '')} ${multi ? 'Names or IDs' : 'Name or ID'}`;
		const tail = multi ? DYNAMIC_MULTI : DYNAMIC_SINGLE;
		f.description = f.description ? `${f.description.replace(/\.$/, '')}. ${tail}` : tail.replace(/\.$/, '');
	} else if (f.description) {
		f.description = fixPeriod(f.description);
	}
	if (/email/i.test(f.name) && f.type === 'string') f.placeholder = 'name@email.com';
	if (f.type === 'collection' && Array.isArray(f.options)) {
		f.options = f.options.map(polish).sort((a: Json, b: Json) => a.displayName.localeCompare(b.displayName));
	}
	if (f.type === 'fixedCollection') {
		for (const o of f.options) o.values = o.values.map(polish);
	}
	if (f.type === 'options' && Array.isArray(f.options) && !f.typeOptions?.loadOptionsMethod) {
		f.options = [...f.options].sort((a: Json, b: Json) => a.name.localeCompare(b.name));
	}
	return f;
}

function enumOptions(vals: string[]) {
	return vals.map((v) => {
		let name: string;
		if (v === 'all') name = 'All';
		else if (v === 'false') name = 'Not Archived';
		else if (v === 'true') name = 'Archived Only';
		else if (v.startsWith('-')) name = `${defaultLabel(v.slice(1))} (Descending)`;
		else if (['created_at', 'updated_at', 'start_at', 'name', 'value', 'expected_close_date', 'title', 'due_date', 'issued_date', 'total', 'starts_at'].includes(v))
			name = `${defaultLabel(v)} (Ascending)`;
		else if (v === 'none') name = 'None';
		else if (v === 'company') name = 'Company';
		else name = defaultLabel(v);
		return { name, value: v };
	});
}

type Where = 'body' | 'query';

interface Ctx {
	where: Where;
	requiredAllowed: boolean;
}

/** One n8n parameter from one schema property. Inline objects are flattened (company.name -> company_name). */
function buildFields(
	name: string,
	schemaRaw: Json,
	opts: { required: boolean; ov: FieldOverride; ctx: Ctx; path?: string; labelPrefix?: string; labelName?: string },
): Json[] {
	const sc = norm(schemaRaw);
	const { ov, ctx } = opts;
	const path = opts.path ?? name;
	const label = titleCase(ov.label ?? defaultLabel(opts.labelName ?? name));
	const displayName = opts.labelPrefix ? `${opts.labelPrefix}: ${label}` : label;
	const help = ov.help ?? cleanHelp(sc.description);

	if (sc.type === 'object' && sc.properties) {
		const req = new Set<string>(sc.required ?? []);
		return Object.entries<Json>(sc.properties).flatMap(([k, v]) =>
			buildFields(`${name}_${k}`, v, {
				required: opts.required && req.has(k),
				ov: ov.children?.[k] ?? {},
				ctx,
				path: `${path}.${k}`,
				labelPrefix: label,
				labelName: k,
			}),
		);
	}

	const f: Json = { displayName, name, type: 'string', default: '' };
	if (help) f.description = noFinalPeriod(help);
	if (opts.required) f.required = true;
	const send = (value?: string) => ({ send: { type: ctx.where, property: path, ...(value ? { value } : {}) } });

	if (sc.type === 'array') {
		const it = norm(sc.items);
		if (it.type === 'object') {
			const req = new Set<string>(it.required ?? []);
			const values = Object.entries<Json>(it.properties).flatMap(([k, v]) =>
				buildFields(k, v, { required: req.has(k), ov: ov.children?.[k] ?? {}, ctx: { ...ctx, where: 'body' } }).map((x) => {
					delete x.routing;
					return x;
				}),
			);
			Object.assign(f, {
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Item',
				default: {},
				options: [{ displayName: 'Item', name: 'item', values }],
				routing: send('={{ $value.item }}'),
			});
			return [f];
		}
		if (!ov.rpc) throw new Error(`array of scalars needs a dropdown: ${name}`);
		Object.assign(f, { type: 'multiOptions', default: [], typeOptions: { loadOptionsMethod: ov.rpc }, routing: send() });
		return [f];
	}
	if (sc.type === 'string' && ov.rpc) {
		Object.assign(f, { type: 'options', typeOptions: { loadOptionsMethod: ov.rpc, ...(ov.dependsOn ? { loadOptionsDependsOn: ov.dependsOn } : {}) }, routing: send() });
		if (ov.rpc && !opts.required) f.default = '';
		return [f];
	}
	if (sc.type === 'string' && sc.enum) {
		const options = enumOptions(sc.enum);
		Object.assign(f, { type: 'options', options, default: options[0].value, routing: send() });
		return [f];
	}
	if (sc.type === 'string' && sc.format === 'date-time') {
		Object.assign(f, { type: 'dateTime', routing: send('={{ new Date($value).toISOString() }}') });
		return [f];
	}
	if (sc.type === 'string' && sc.format === 'date') {
		Object.assign(f, { type: 'dateTime', routing: send('={{ String($value).slice(0, 10) }}') });
		f.description = `${f.description ? `${f.description}. ` : ''}Only the date part is sent (YYYY-MM-DD)`;
		return [f];
	}
	if (sc.type === 'string') {
		if (sc.format === 'email') f.placeholder = 'name@email.com';
		f.routing = send();
		return [f];
	}
	if (sc.type === 'integer' || sc.type === 'number') {
		Object.assign(f, { type: 'number', default: 0, routing: send() });
		return [f];
	}
	if (sc.type === 'boolean') {
		Object.assign(f, { type: 'boolean', default: false, routing: send() });
		return [f];
	}
	throw new Error(`unsupported schema for ${name}: ${JSON.stringify(sc)}`);
}

function specOp(def: OperationDef): Json {
	const o = spec.paths?.[def.path]?.[def.method.toLowerCase()];
	if (!o) throw new Error(`operation not in spec: ${def.method} ${def.path}`);
	return o;
}

function responseHasData(o: Json) {
	for (const [code, r] of Object.entries<Json>(o.responses)) {
		if (code.startsWith('2')) return Boolean(norm(deref(r).content['application/json'].schema).properties?.data);
	}
	return false;
}

/**
 * `POST /leads` documents `deduplicated` as a field of the lead, but the API sends it next to `data`
 * (`{"data": {...}, "deduplicated": true}`), where the `data` output would lose it. Operations whose data schema
 * declares the flag keep it via addDeduplicated.
 */
function hasEnvelopeFlag(o: Json, flag: string): boolean {
	return Object.entries<Json>(o.responses).some(([code, r]) => {
		if (!code.startsWith('2')) return false;
		const data = norm(deref(r).content?.['application/json']?.schema ?? {}).properties?.data;
		return Boolean(data && norm(data).properties?.[flag]);
	});
}

const idParam = (def: OperationDef) => `${def.resource}Id`;

function scopeOf(o: Json): string {
	return o['x-dakoty-scope'];
}

function buildResource(resource: Resource) {
	const defs = OPERATIONS.filter((d) => d.resource === resource);
	const res = RESOURCES.find((r) => r.value === resource)!;
	const out: Json[] = [];

	const operationOptions = defs.map((def) => {
		const o = specOp(def);
		if (!responseHasData(o)) throw new Error(`no data in response of ${def.path}`);
		const url = `=${def.path.replace('{id}', `{{ encodeURIComponent($parameter.${idParam(def)}) }}`)}`;
		const sc = scopeOf(o);
		return {
			name: def.name,
			value: def.value,
			action: def.action,
			description: `${def.description} (needs scope ${sc})`,
			routing: {
				request: { method: def.method, url, ...(def.kind === 'getAll' ? { qs: { limit: '={{ $parameter.returnAll ? 100 : Math.min($parameter.limit, 100) }}' } } : {}) },
				output: { postReceive: [raw('handleApiError'), { type: 'rootProperty', properties: { property: 'data' } }, ...(hasEnvelopeFlag(o, 'deduplicated') ? [raw('addDeduplicated')] : [])] },
			},
		};
	});
	out.push({
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: operationOptions,
		default: defs[0].value,
	});

	for (const def of defs) {
		const o = specOp(def);
		const show = { resource: [resource], operation: [def.value] };
		const add = (f: Json) => out.push({ ...f, displayOptions: { show } });
		const overrides = def.overrides ?? {};

		if (['get', 'update', 'action'].includes(def.kind) && def.path.includes('{id}')) {
			add({ displayName: res.idLabel, name: idParam(def), type: 'string', required: true, default: '', description: 'The ID of the record. Map it from a previous node or a search' });
		}
		if (def.pipelineSelector) {
			const p = def.pipelineSelector;
			add({ displayName: p.label, name: p.name, type: 'options', default: '', typeOptions: { loadOptionsMethod: p.rpc }, description: p.description });
		}

		if (def.kind === 'create' || def.kind === 'update' || def.kind === 'action') {
			if (!o.requestBody) continue;
			const bs = norm(o.requestBody.content['application/json'].schema);
			const reqSet = def.kind === 'update' ? new Set<string>() : new Set<string>(bs.required ?? []);
			const skip = new Set(def.skip ?? []);
			const top: Json[] = [];
			const optional: Json[] = [];
			for (const [k, v] of Object.entries<Json>(bs.properties)) {
				if (skip.has(k)) continue;
				for (const f of buildFields(k, v, { required: reqSet.has(k), ov: overrides[k] ?? {}, ctx: { where: 'body', requiredAllowed: true } })) {
					(f.required ? top : optional).push(f);
				}
			}
			if (def.idem) {
				optional.push({
					displayName: 'Idempotency Key',
					name: 'idempotencyKey',
					type: 'string',
					default: '',
					description:
						'A repeat of the same request with the same key returns the stored result instead of creating a duplicate. Use a value that is unique per item (for example the ID of the source record); a fixed value blocks every further create with a different body (422 IDEMPOTENCY_KEY_REUSED for 24 hours)',
					routing: { send: { preSend: [raw('idempotencyHeader')] } },
				});
			}
			top.forEach(add);
			if (optional.length) {
				const collName = def.kind === 'update' ? 'updateFields' : 'additionalFields';
				add({
					displayName: def.kind === 'update' ? 'Update Fields' : 'Additional Fields',
					name: collName,
					type: 'collection',
					placeholder: 'Add Field',
					default: {},
					options: optional.map((f) => ({ ...f, displayOptions: undefined })),
				});
			}
		} else if (def.kind === 'getAll') {
			add({
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				routing: {
					send: { paginate: '={{ $value }}' },
					operations: {
						pagination: {
							type: 'generic',
							properties: {
								// same guard as loadOptions.listAll: stop without a cursor, and after MAX_PAGES pages (safety net)
								continue: `={{ !!$response.body.has_more && !!$response.body.next_cursor && $pageCount < ${MAX_PAGES} }}`,
								// n8n replaces the whole qs of the first request with this one, so keep the original (filters, limit)
								// (typed as IDataObject by n8n, but the engine evaluates expression strings in it)
								request: { qs: raw("'={{ Object.assign({}, $request.qs, { cursor: $response.body?.next_cursor }) }}' as unknown as IDataObject") },
							},
						},
					},
				},
			});
			out.push({
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1, maxValue: 100 },
				description: 'Max number of results to return',
				displayOptions: { show: { ...show, returnAll: [false] } },
				routing: { output: { maxResults: '={{ $value }}' } },
			});
			const filters = queryFields(o, def);
			add({ displayName: 'Filters', name: 'filters', type: 'collection', placeholder: 'Add Filter', default: {}, options: filters });
		} else if (def.kind === 'find') {
			const filters = queryFields(o, def);
			add({ displayName: 'Search By', name: 'filters', type: 'collection', placeholder: 'Add Field', default: {}, options: filters, description: 'Fill at least one field. The match is exact' });
		}
	}
	return out;
}

function queryFields(o: Json, def: OperationDef): Json[] {
	const rpcs = def.rpcs ?? {};
	const res: Json[] = [];
	for (const pRaw of o.parameters ?? []) {
		const p = deref(pRaw);
		if (['Accept-Language', 'cursor', 'limit'].includes(p.name)) continue;
		const ov = { ...(def.overrides?.[p.name] ?? {}) };
		if (rpcs[p.name]) ov.rpc = rpcs[p.name];
		res.push(...buildFields(p.name, p.schema, { required: false, ov, ctx: { where: 'query', requiredAllowed: false } }));
	}
	return res;
}

async function format(code: string): Promise<string> {
	const cfg = (await prettier.resolveConfig(join(ROOT, 'package.json'))) ?? {};
	return prettier.format(code, { ...cfg, parser: 'typescript' });
}

const HEADER = '// Generated by scripts/generate.ts from spec/openapi-public-v1.yaml. Do not edit by hand (npm run generate).\n';

async function main() {
	const dir = join(ROOT, 'nodes', 'Dakoty', 'descriptions');
	mkdirSync(dir, { recursive: true });
	const names: string[] = [];
	for (const r of RESOURCES) {
		const file = `${r.name}Description`;
		names.push(file);
		const props = buildResource(r.value).map(polish);
		const body = ser(props);
		const imports = [
			['handleApiError', '../transport/errors'],
			['idempotencyHeader', '../transport/idempotency'],
			['addDeduplicated', '../transport/envelope'],
		]
			.filter(([n]) => body.includes(n))
			.map(([n, from]) => `import { ${n} } from '${from}';`)
			.join('\n');
		const code = `${HEADER}import type { IDataObject, INodeProperties } from 'n8n-workflow';\n${imports}\n\nexport const ${r.value}Description: INodeProperties[] = ${body};\n`;
		writeFileSync(join(dir, `${file}.ts`), await format(code));
	}
	const resources = RESOURCES.map((r) => ({ name: r.name, value: r.value }));
	const indexCode = `${HEADER}import type { INodeProperties } from 'n8n-workflow';\n${RESOURCES.map((r) => `import { ${r.value}Description } from './${r.name}Description';`).join('\n')}\n\nexport const resourceProperty: INodeProperties = ${ser({
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [...resources].sort((a, b) => a.name.localeCompare(b.name)),
		default: 'lead',
	})};\n\nexport const resourceDescriptions: INodeProperties[] = [${RESOURCES.map((r) => `...${r.value}Description`).join(', ')}];\n`;
	writeFileSync(join(dir, 'index.ts'), await format(indexCode));

	// trigger events
	const events: { type: string; entity: string; group: string; label: string; description: string }[] = JSON.parse(readFileSync(join(ROOT, 'spec', 'events.json'), 'utf8'));
	const options = events.map((e) => ({ name: titleCase(e.label), value: e.type, description: fixPeriod(e.description) }));
	const tdir = join(ROOT, 'nodes', 'DakotyTrigger');
	mkdirSync(tdir, { recursive: true });
	const ecode = `${HEADER}import type { INodePropertyOptions } from 'n8n-workflow';\n\nexport const EVENT_OPTIONS: INodePropertyOptions[] = ${ser(options)};\n`;
	writeFileSync(join(tdir, 'events.generated.ts'), await format(ecode));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
