// End-to-end test of the nodes against a REAL n8n and a REAL (local) Dakoty API.
//
//   N8N_URL=http://localhost:5678 N8N_EMAIL=... N8N_PASSWORD=... \
//   DAKOTY_API=http://localhost:3000 DAKOTY_JWT=... DAKOTY_KEY=dk_live_... DAKOTY_KEY_LIMITED=dk_live_... \
//   DAKOTY_ORG=jedna-tricat RECEIVER_HOST=172.18.0.1 OUT=/path/results.json  node scripts/e2e/run.mjs
//
// Each Dakoty operation is run as the only node behind a production Webhook of a freshly activated workflow
// (so the declarative routing, pagination and error handling of n8n itself are exercised). Test data is
// prefixed E2E-123kjkdmejb-n8n. Secrets are never printed.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const env = (k, d) => process.env[k] ?? d ?? (() => { throw new Error(`missing ${k}`); })();
const N8N = env('N8N_URL', 'http://localhost:5678');
const API = env('DAKOTY_API', 'http://localhost:3000');
const ORG = env('DAKOTY_ORG', 'jedna-tricat');
const KEY = env('DAKOTY_KEY');
const KEY_LIMITED = env('DAKOTY_KEY_LIMITED');
let JWT = '';
const PREFIX = 'E2E-123kjkdmejb-n8n';
const NODE = 'CUSTOM.dakoty';
const TRIGGER = 'CUSTOM.dakotyTrigger';
const BASE = `${API}/api/v1/public`;
// base URL that n8n itself uses (n8n may run in a container on the Dakoty network)
const N8N_BASE = process.env.N8N_DAKOTY_BASE ?? BASE;
const RUN = String(Date.now()).slice(-6);

const results = [];
const record = (id, ok, detail) => {
	results.push({ id, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` - ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = (name) => `={{ $json.body.${name} }}`;

// ---------- n8n REST
let cookie = '';
async function n8n(method, path, body) {
	const res = await fetch(`${N8N}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const sc = res.headers.getSetCookie?.() ?? [];
	if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
	const text = await res.text();
	let json;
	try { json = JSON.parse(text); } catch { json = text; }
	return { status: res.status, body: json };
}

async function login() {
	const r = await n8n('POST', '/rest/login', { emailOrLdapLoginId: env('N8N_EMAIL'), password: env('N8N_PASSWORD') });
	if (r.status !== 200) throw new Error(`n8n login failed ${r.status}`);
}

async function createCredential(name, apiKey, baseUrl = N8N_BASE) {
	const r = await n8n('POST', '/rest/credentials', { name, type: 'dakotyApi', data: { apiKey, baseUrl } });
	if (r.status !== 200) throw new Error(`credential: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
	return r.body.data;
}

async function testCredential(cred, apiKey, baseUrl = N8N_BASE) {
	const r = await n8n('POST', '/rest/credentials/test', { credentials: { id: cred?.id, name: 'test', type: 'dakotyApi', data: { apiKey, baseUrl } } });
	return r.body.data ?? r.body;
}

let wfCounter = 0;
const workflows = [];
async function makeWorkflow(name, nodes, connections) {
	const r = await n8n('POST', '/rest/workflows', { name: `${PREFIX} ${name}`, nodes, connections, settings: {}, active: false });
	if (r.status !== 200) throw new Error(`workflow create ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
	const wf = r.body.data;
	workflows.push(wf.id);
	return wf;
}
async function activate(wf) {
	const r = await n8n('POST', `/rest/workflows/${wf.id}/activate`, { versionId: wf.versionId ?? wf.activeVersionId });
	if (r.status !== 200) throw new Error(`activate ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
	return r.body.data;
}
async function deactivate(wf) {
	const r = await n8n('POST', `/rest/workflows/${wf.id}/deactivate`, {});
	return r.status;
}

const opCache = new Map();
/** Runs one Dakoty node behind a production webhook, returns {status, body}. */
async function runOp(cred, parameters, body = {}, { continueOnFail = false } = {}) {
	const key = JSON.stringify([cred.id, parameters, continueOnFail]);
	let entry = opCache.get(key);
	if (!entry) {
		const path = `e2e-${randomUUID()}`;
		const wh = { id: randomUUID(), name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: randomUUID(), parameters: { httpMethod: 'POST', path, responseMode: 'lastNode', options: { responseData: 'allEntries' } } };
		const dk = { id: randomUUID(), name: 'Dakoty', type: NODE, typeVersion: 1, position: [300, 0], credentials: { dakotyApi: { id: cred.id, name: cred.name } }, parameters, ...(continueOnFail ? { onError: 'continueRegularOutput' } : {}) };
		const wf = await makeWorkflow(`op ${++wfCounter} ${parameters.resource}.${parameters.operation}`, [wh, dk], { Webhook: { main: [[{ node: 'Dakoty', type: 'main', index: 0 }]] } });
		await activate(wf);
		entry = { wf, path };
		opCache.set(key, entry);
		await sleep(300);
	}
	let res, text;
	for (let attempt = 0; attempt < 6; attempt++) {
		// a freshly activated webhook can need a moment before n8n routes it
		res = await fetch(`${N8N}/webhook/${entry.path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		text = await res.text();
		if (res.status !== 404) break;
		await sleep(1000);
	}
	let json;
	try { json = JSON.parse(text); } catch { json = text; }
	const out = { status: res.status, body: json, wfId: entry.wf.id };
	await sleep(250);
	if (res.status >= 400) out.error = await lastExecutionError(entry.wf.id);
	out.items = await lastExecutionItems(entry.wf.id, 'Dakoty');
	globalThis.__last = out;
	return out;
}

// ---------- Dakoty API (direct, for setup and verification)
async function dk(method, path, body, key = KEY, extraHeaders = {}) {
	const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await res.text();
	let json;
	try { json = JSON.parse(text); } catch { json = text; }
	return { status: res.status, body: json };
}

/** Output items of a node in the newest execution of a workflow (the webhook responder only returns the first item). */
async function lastExecutionItems(workflowId, nodeName) {
	for (let i = 0; i < 20; i++) {
		const list = await n8n('GET', `/rest/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId }))}&limit=1`);
		const row = list.body.data?.results?.[0];
		if (row && row.status !== 'running' && row.status !== 'new') {
			const d = await n8n('GET', `/rest/executions/${row.id}`);
			if (typeof d.body.data?.data !== 'string') return [];
			const tree = unflatten(d.body.data.data);
			return (tree.resultData.runData[nodeName]?.[0]?.data?.main?.[0] ?? []).map((x) => x.json);
		}
		await sleep(250);
	}
	return [];
}

/** n8n stores execution data in the "flatted" format; resolve the first error object of an execution. */
async function lastExecutionError(workflowId) {
	const list = await n8n('GET', `/rest/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId }))}&limit=1`);
	const row = list.body.data?.results?.[0];
	if (!row) return undefined;
	const d = await n8n('GET', `/rest/executions/${row.id}`);
	const raw = d.body.data?.data;
	if (typeof raw !== 'string') return undefined;
	const arr = JSON.parse(raw);
	const obj = arr.find((o) => o && typeof o === 'object' && !Array.isArray(o) && 'httpCode' in o && 'message' in o) ?? arr.find((o) => o && typeof o === 'object' && !Array.isArray(o) && 'message' in o && 'stack' in o);
	if (!obj) return undefined;
	const val = (k) => (obj[k] === undefined ? undefined : typeof obj[k] === 'string' && /^\d+$/.test(obj[k]) ? arr[Number(obj[k])] : obj[k]);
	return { message: val('message'), description: val('description'), httpCode: val('httpCode') };
}

const list = (r) => r.items ?? [];
const shape = (r) => `${r.status} items=${(r.items ?? []).length}`;
/** Minimal parser of n8n's "flatted" execution data. */
function unflatten(raw) {
	const arr = JSON.parse(raw);
	const cache = new Map();
	const rev = (i) => {
		if (cache.has(i)) return cache.get(i);
		const v = arr[i];
		if (v === null || typeof v !== 'object') return v;
		const out = Array.isArray(v) ? [] : {};
		cache.set(i, out);
		for (const k of Object.keys(v)) {
			const x = v[k];
			out[k] = typeof x === 'string' && /^\d+$/.test(x) && Number(x) < arr.length ? rev(Number(x)) : x;
		}
		return out;
	};
	return rev(0);
}

const one = (r) => (r.items ?? [])[0];
const check = (id, cond, detail) => record(id, Boolean(cond), !cond && globalThis.__last?.error ? `${detail} | node error: ${JSON.stringify(globalThis.__last.error)}` : detail);

async function createKey(name, scopes) {
	const res = await fetch(`${API}/${ORG}/settings/api-tokens`, { method: 'POST', headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, scopes }) });
	const j = await res.json();
	if (!j.data?.raw) throw new Error(`createKey ${res.status}`);
	return j.data.raw;
}

const noItems = (r) => r.status === 500 && /No item to return was found/.test(JSON.stringify(r.body));

async function main() {
	JWT = (await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env('DAKOTY_EMAIL'), password: env('DAKOTY_PASSWORD'), org_slug: ORG }) })).json()).token.access_token;
	await login();
	const BULK_KEY = await createKey(`${PREFIX} bulk setup`, ['leads:read', 'leads:write']);
	const good = await createCredential(`${PREFIX} key`, KEY);
	const limited = await createCredential(`${PREFIX} limited key`, KEY_LIMITED);

	// ---- AK-N3: credential test
	const badCred = await createCredential(`${PREFIX} wrong key`, 'dk_live_wrong_wrong_wrong');
	const bad = await testCredential(badCred, 'dk_live_wrong_wrong_wrong');
	check('AK-N3 credential with a wrong key fails with the API message', bad.status === 'Error' && /401|Unauthorized|invalid|API key/i.test(JSON.stringify(bad)), JSON.stringify(bad).slice(0, 220));
	const ok = await testCredential(good, KEY);
	check('AK-N3 credential with a good key tests OK', ok.status === 'OK', JSON.stringify(ok).slice(0, 160));

	// ---- loadOptions (dropdowns) through n8n
	for (const [method, path] of [['getUsers', 'owner_id'], ['getLeadOrigins', 'origin_id'], ['getLeadPipelines', 'pipeline_id'], ['getLeadStages', 'stage_id'], ['getLostReasons', 'lost_reason_id'], ['getActivityTypes', 'type_id'], ['getProjects', 'project_id'], ['getProjectStages', 'stage_id'], ['getBookingServices', 'service_id'], ['getBookingStaff', 'staff_id']]) {
		const r = await n8n('POST', '/rest/dynamic-node-parameters/options', { path: `parameters.additionalFields.${path}`, nodeTypeAndVersion: { name: NODE, version: 1 }, currentNodeParameters: { resource: 'lead', operation: 'create' }, methodName: method, credentials: { dakotyApi: { id: good.id, name: good.name } } });
		const arr = r.body.data ?? r.body;
		check(`loadOptions ${method}`, r.status === 200 && Array.isArray(arr), `${r.status} ${Array.isArray(arr) ? arr.length + ' options' : JSON.stringify(arr).slice(0, 150)}`);
		if (method === 'getLeadStages') check('loadOptions getLeadStages lists "pipeline / stage" without a selected pipeline', arr.length > 0 && /\//.test(arr[0].name), arr[0]?.name);
	}
	const limitedUsers = await n8n('POST', '/rest/dynamic-node-parameters/options', { path: 'parameters.additionalFields.owner_id', nodeTypeAndVersion: { name: NODE, version: 1 }, currentNodeParameters: { resource: 'lead', operation: 'create' }, methodName: 'getUsers', credentials: { dakotyApi: { id: limited.id, name: limited.name } } });
	check('dropdown without users:read fails with a readable error (403)', limitedUsers.status >= 400 && /403|scope|forbidden|permission/i.test(JSON.stringify(limitedUsers.body)), JSON.stringify(limitedUsers.body).slice(0, 220));

	// ---- shared data
	const pipelines = (await dk('GET', '/lead-pipelines')).body.data;
	const pipeline = pipelines.find((p) => p.is_default) ?? pipelines[0];
	const stageNew = pipeline.stages[0].id;
	const stageNext = pipeline.stages[1].id;
	const lostReason = (await dk('GET', '/lost-reasons')).body.data[0].id;
	const users = (await dk('GET', '/users')).body.data;
	const service = (await dk('GET', '/booking-services')).body.data[0];

	// ---- Company
	let r = await runOp(good, { resource: 'company', operation: 'create', name: b('name'), additionalFields: { registration_id: b('reg'), email: b('email'), country_code: 'SK', city: 'Bratislava' } }, { name: `${PREFIX} Company A`, reg: `36${RUN}1`, email: `e2e-a-${RUN}@example.com` });
	const company = one(r);
	check('company.create', r.status === 200 && company?.id && company.name === `${PREFIX} Company A`, `${r.status} ${JSON.stringify(company).slice(0, 160)}`);
	r = await runOp(good, { resource: 'company', operation: 'get', companyId: b('id') }, { id: company.id });
	check('company.get', one(r)?.id === company.id, `${r.status}`);
	r = await runOp(good, { resource: 'company', operation: 'update', companyId: b('id'), updateFields: { note: b('note'), city: 'Kosice' } }, { id: company.id, note: 'updated by n8n e2e' });
	check('company.update', one(r)?.id === company.id && one(r)?.note === 'updated by n8n e2e', `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 160)}`);
	r = await runOp(good, { resource: 'company', operation: 'find', filters: { registration_id: b('reg') } }, { reg: `36${RUN}1` });
	check('company.find (exact)', list(r).some((x) => x.id === company.id), `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
	r = await runOp(good, { resource: 'company', operation: 'find', filters: { registration_id: '00000000' } }, {});
	check('company.find without a match returns nothing (n8n: "No item to return" from the webhook responder, node itself succeeded)', list(r).length === 0 && (r.status === 200 || noItems(r)), `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
	r = await runOp(good, { resource: 'company', operation: 'getAll', returnAll: false, limit: 5, filters: { search: PREFIX } }, {});
	check('company.getAll with limit', r.status === 200 && list(r).length >= 1 && list(r).length <= 5, shape(r));

	// ---- Contact
	r = await runOp(good, { resource: 'contact', operation: 'create', company_id: b('company_id'), name: b('name'), additionalFields: { email: b('email'), position: 'CEO', is_primary: true } }, { company_id: company.id, name: `${PREFIX} Contact A`, email: `e2e-contact-a-${RUN}@example.com` });
	const contact = one(r);
	check('contact.create', r.status === 200 && contact?.id, `${r.status} ${JSON.stringify(contact).slice(0, 140)}`);
	r = await runOp(good, { resource: 'contact', operation: 'get', contactId: b('id') }, { id: contact.id });
	check('contact.get', one(r)?.id === contact.id, `${r.status}`);
	r = await runOp(good, { resource: 'contact', operation: 'update', contactId: b('id'), updateFields: { name: b('name'), position: 'CTO' } }, { id: contact.id, name: `${PREFIX} Contact A` });
	check('contact.update', one(r)?.id === contact.id && one(r)?.position === 'CTO', `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 160)}`);
	r = await runOp(good, { resource: 'contact', operation: 'find', filters: { email: b('email') } }, { email: `e2e-contact-a-${RUN}@example.com` });
	check('contact.find (exact)', list(r).some((x) => x.id === contact.id), `${r.status}`);
	r = await runOp(good, { resource: 'contact', operation: 'getAll', returnAll: true, filters: { company_id: b('company_id') } }, { company_id: company.id });
	check('contact.getAll (Return All, company filter)', list(r).some((x) => x.id === contact.id), shape(r));

	// ---- Lead
	const leadBody = { name: `${PREFIX} Lead 1`, reg: `36${RUN}2`, pipeline: pipeline.id, stage: stageNew, email: `e2e-lead-company-${RUN}@example.com` };
	const leadCreate = { resource: 'lead', operation: 'create', additionalFields: { name: b('name'), value: 1500, pipeline_id: b('pipeline'), stage_id: b('stage'), expected_close_date: '2026-12-31T00:00:00', company_name: `${PREFIX} Lead Company`, company_registration_id: b('reg'), company_email: b('email'), contact_name: `${PREFIX} Lead Contact`, contact_email: `e2e-lead-contact-${RUN}@example.com`, dedupe: 'company', assignee_ids: [users[0].id], idempotencyKey: b('idem') } };
	r = await runOp(good, leadCreate, { ...leadBody, idem: `${PREFIX}-idem-${Date.now()}` });
	const lead = one(r);
	check('lead.create (inline company + contact, dedupe, assignees, idempotency key)', r.status === 200 && lead?.id, `${r.status} ${JSON.stringify(lead).slice(0, 200)}`);
	r = await runOp(good, leadCreate, { ...leadBody, idem: `${PREFIX}-idem-2-${Date.now()}` });
	check('lead.create dedupe=company a second time returns deduplicated:true', one(r)?.id === lead?.id && one(r)?.deduplicated === true, `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 200)}`);
	r = await runOp(good, { resource: 'lead', operation: 'get', leadId: b('id') }, { id: lead.id });
	check('lead.get', one(r)?.id === lead.id, `${r.status}`);
	r = await runOp(good, { resource: 'lead', operation: 'update', leadId: b('id'), updateFields: { note: 'updated by n8n e2e', value: 2500 } }, { id: lead.id });
	check('lead.update', one(r)?.id === lead.id && Number(one(r)?.value) === 2500, `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 160)}`);
	r = await runOp(good, { resource: 'lead', operation: 'find', filters: { registration_id: b('reg') } }, { reg: `36${RUN}2` });
	check('lead.find (exact)', list(r).some((x) => x.id === lead.id), `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
	r = await runOp(good, { resource: 'lead', operation: 'move', leadId: b('id'), pipeline_id: pipeline.id, stage_id: stageNext, additionalFields: {} }, { id: lead.id });
	check('lead.move to stage', one(r)?.id === lead.id, `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 160)}`);
	r = await runOp(good, { resource: 'lead', operation: 'archive', leadId: b('id'), additionalFields: { lost_reason_id: lostReason, lost_note: 'e2e' } }, { id: lead.id });
	check('lead.archive with a lost reason', one(r)?.id === lead.id, `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 160)}`);

	// ---- pagination: 105 leads -> two pages of 100
	let created = 0;
	for (let i = 0; i < 105; i++) {
		const x = await dk('POST', '/leads', { name: `${PREFIX} Page${RUN} ${String(i).padStart(3, '0')}` }, BULK_KEY);
		if (x.status === 429) { await sleep(3000); i--; continue; }
		if (x.status === 201) created++;
	}
	check('setup: 105 leads for pagination', created === 105, `created ${created}`);
	r = await runOp(good, { resource: 'lead', operation: 'getAll', returnAll: true, filters: { search: `${PREFIX} Page${RUN}` } }, {});
	const ids = new Set(list(r).map((x) => x.id));
	check('lead.getAll Return All walks every page (105 records over 2 pages)', r.status === 200 && ids.size === 105, `${shape(r)} unique=${ids.size}`);
	r = await runOp(good, { resource: 'lead', operation: 'getAll', returnAll: false, limit: 2, filters: { search: `${PREFIX} Page${RUN}`, sort: '-created_at' } }, {});
	check('lead.getAll with limit=2 returns exactly 2', list(r).length === 2, shape(r));

	// ---- Activity (no end -> default +30 min)
	r = await runOp(good, { resource: 'activity', operation: 'create', name: b('name'), start_at: '2026-11-02T10:00:00Z', additionalFields: { lead_id: b('lead'), importance: 'high', location: 'Office' } }, { name: `${PREFIX} Activity`, lead: lead.id });
	const activity = one(r);
	check('activity.create', r.status === 200 && activity?.id, `${r.status} ${JSON.stringify(activity).slice(0, 200)}`);
	const start = Date.parse(activity?.start_at), end = Date.parse(activity?.end_at);
	check('activity.create without end_at ends 30 minutes after the start', end - start === 30 * 60 * 1000, `start=${activity?.start_at} end=${activity?.end_at}`);
	r = await runOp(good, { resource: 'activity', operation: 'get', activityId: b('id') }, { id: activity.id });
	check('activity.get', one(r)?.id === activity.id, `${r.status}`);
	r = await runOp(good, { resource: 'activity', operation: 'update', activityId: b('id'), updateFields: { name: b('name'), start_at: '2026-11-02T11:00:00Z', note: 'moved' } }, { id: activity.id, name: `${PREFIX} Activity` });
	check('activity.update', one(r)?.id === activity.id, `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 160)}`);
	r = await runOp(good, { resource: 'activity', operation: 'getAll', returnAll: true, filters: { lead_id: b('lead') } }, { lead: lead.id });
	check('activity.getAll (lead filter)', list(r).some((x) => x.id === activity.id), `${r.status}`);
	r = await runOp(good, { resource: 'activity', operation: 'complete', activityId: b('id') }, { id: activity.id });
	check('activity.complete', one(r)?.id === activity.id && one(r)?.status === 'closed', `${r.status} status=${one(r)?.status}`);

	// ---- Task
	r = await runOp(good, { resource: 'task', operation: 'create', title: b('title'), additionalFields: { priority: 'high', due_date: '2026-12-01T00:00:00', lead_id: b('lead') } }, { title: `${PREFIX} Task`, lead: lead.id });
	const task = one(r);
	check('task.create', r.status === 200 && task?.id, `${r.status} ${JSON.stringify(task).slice(0, 200)}`);
	if (task?.id) {
		r = await runOp(good, { resource: 'task', operation: 'get', taskId: b('id') }, { id: task.id });
		check('task.get', one(r)?.id === task.id, `${r.status}`);
		r = await runOp(good, { resource: 'task', operation: 'update', taskId: b('id'), updateFields: { description: 'updated', completed: true } }, { id: task.id });
		check('task.update', one(r)?.id === task.id, `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 160)}`);
		r = await runOp(good, { resource: 'task', operation: 'getAll', returnAll: true, filters: { lead_id: b('lead'), completed: true } }, { lead: lead.id });
		check('task.getAll (lead + completed filter)', list(r).some((x) => x.id === task.id), `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
	}

	// ---- Invoice
	r = await runOp(good, { resource: 'invoice', operation: 'create', items: { item: [{ name: `${PREFIX} item`, quantity: 2, unit: 'ks', unit_price: 10, vat_rate: 20 }] }, additionalFields: { company_id: b('company'), currency: 'EUR', note: 'e2e', due_date: '2026-12-15T00:00:00' } }, { company: company.id });
	const invoice = one(r);
	check('invoice.create (items fixedCollection -> array)', r.status === 200 && invoice?.id, `${r.status} ${JSON.stringify(invoice).slice(0, 220)}`);
	if (invoice?.id) {
		r = await runOp(good, { resource: 'invoice', operation: 'get', invoiceId: b('id') }, { id: invoice.id });
		check('invoice.get', one(r)?.id === invoice.id, `${r.status}`);
		r = await runOp(good, { resource: 'invoice', operation: 'getAll', returnAll: true, filters: { company_id: b('company') } }, { company: company.id });
		check('invoice.getAll (company filter)', list(r).some((x) => x.id === invoice.id), `${r.status}`);
	}

	// ---- Booking
	if (service) {
		r = await runOp(good, { resource: 'booking', operation: 'create', service_id: service.id, starts_at: '2026-12-10T09:00:00Z', customer_name: b('cname'), additionalFields: { customer_email: 'e2e-booking@example.com', notes: 'e2e' } }, { cname: `${PREFIX} Customer` });
		const booking = one(r);
		check('booking.create (flattened customer object)', r.status === 200 && booking?.id, `${r.status} ${JSON.stringify(booking).slice(0, 220)}`);
		if (booking?.id) {
			r = await runOp(good, { resource: 'booking', operation: 'get', bookingId: b('id') }, { id: booking.id });
			check('booking.get', one(r)?.id === booking.id, `${r.status}`);
			r = await runOp(good, { resource: 'booking', operation: 'getAll', returnAll: true, filters: { starts_after: '2026-12-01T00:00:00' } }, {});
			check('booking.getAll (starts_after filter)', list(r).some((x) => x.id === booking.id), shape(r));
			r = await runOp(good, { resource: 'booking', operation: 'cancel', bookingId: b('id'), additionalFields: { reason: 'e2e' } }, { id: booking.id });
			check('booking.cancel', one(r)?.id === booking.id, `${r.status} ${JSON.stringify(one(r) ?? r.error ?? r.body).slice(0, 160)}`);
		}
	} else {
		record('booking.* not run', false, 'no booking service in the local seed');
	}

	// ---- FORBIDDEN (key without leads:write)
	r = await runOp(limited, { resource: 'lead', operation: 'create', additionalFields: { name: `${PREFIX} forbidden` } }, {});
	check('AK-N5 missing scope -> NodeApiError with description "[403] FORBIDDEN" and the English API message', r.error?.description === '[403] FORBIDDEN' && /leads:write/.test(r.error?.message ?? ''), JSON.stringify(r.error));

	// ---- Trigger
	await triggerScenario(good);

	// ---- cleanup: deactivate workflows, remove REST hooks left behind by this harness
	for (const h of (await dk('GET', '/webhooks')).body.data ?? []) { if (h.name?.startsWith('n8n – ')) await dk('DELETE', `/webhooks/${h.id}`); }
	for (const wf of workflows) { await n8n('POST', `/rest/workflows/${wf}/deactivate`, {}); }
}

async function triggerScenario(cred) {
	const trig = { id: randomUUID(), name: 'Dakoty Trigger', type: TRIGGER, typeVersion: 1, position: [0, 0], webhookId: randomUUID(), credentials: { dakotyApi: { id: cred.id, name: cred.name } }, parameters: { events: ['lead.created'], output: 'simplified', verifySignature: true } };
	const noop = { id: randomUUID(), name: 'No Operation', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [300, 0], parameters: {} };
	const wf = await makeWorkflow('trigger lead.created', [trig, noop], { 'Dakoty Trigger': { main: [[{ node: 'No Operation', type: 'main', index: 0 }]] } });
	const before = (await dk('GET', '/webhooks')).body.data ?? [];
	await activate(wf);
	await sleep(1500);
	let hooks = (await dk('GET', '/webhooks')).body.data ?? [];
	const hook = hooks.find((h) => h.name?.startsWith('n8n – ') && !before.some((x) => x.id === h.id));
	check('AK-N4 activation creates a REST hook named "n8n – ..." (GET /webhooks)', Boolean(hook), JSON.stringify(hooks.map((h) => ({ name: h.name, events: h.events, url: h.target_url }))).slice(0, 300));

	const execBefore = await n8n('GET', `/rest/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId: wf.id }))}&limit=50`);
	const countBefore = execBefore.body.data?.count ?? execBefore.body.data?.results?.length ?? 0;
	const t0 = Date.now();
	const lead = await dk('POST', '/leads', { name: `${PREFIX} Trigger Lead`, value: 99 });
	check('trigger: lead created through the API', lead.status === 201, `${lead.status}`);
	let exec;
	for (let i = 0; i < 40 && !exec; i++) {
		await sleep(500);
		const list = await n8n('GET', `/rest/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId: wf.id }))}&limit=50`);
		const rows = list.body.data?.results ?? [];
		if (rows.length > 0) exec = rows[0];
	}
	const secs = ((Date.now() - t0) / 1000).toFixed(1);
	check('AK-N4 a lead created in Dakoty starts an execution within 10 s', Boolean(exec) && Date.now() - t0 < 10000, `${exec ? 'execution ' + exec.id : 'none'} after ${secs}s`);
	if (exec) {
		const d = await n8n('GET', `/rest/executions/${exec.id}`);
		const tree = unflatten(d.body.data.data);
		const item = tree.resultData.runData['Dakoty Trigger']?.[0]?.data?.main?.[0]?.[0]?.json ?? {};
		const dataStr = JSON.stringify(item);
		const hasFields = item.name === `${PREFIX} Trigger Lead` && item.event_type === 'lead.created' && /^evt_/.test(item.event_id) && Boolean(item.occurred_at) && item.test === false && Boolean(item.id);
		check('AK-N4 output has the lead fields plus event_id, event_type, occurred_at', hasFields, dataStr.slice(0, 200));
	}

	// tampered body -> 401, no execution. The n8n production webhook URL of the trigger node.
	// the hook URL uses the container host name; the harness reaches the published port
	const url = hook?.target_url?.replace(/^http:\/\/[^/]+/, N8N);
	const body = JSON.stringify({ id: 'evt_tamper', type: 'lead.created', timestamp: new Date().toISOString(), organization: {}, test: false, data: { id: 'x', name: 'tampered' } });
	const ts = Math.floor(Date.now() / 1000);
	const forged = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': 'evt_tamper', 'webhook-timestamp': String(ts), 'webhook-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }, body });
	check('AK-N4 a body with a wrong signature is rejected with 401', forged.status === 401, `${forged.status}`);
	const unsigned = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
	check('AK-N4 a body without signature headers is rejected with 401', unsigned.status === 401, `${unsigned.status}`);
	await sleep(1000);
	const after = await n8n('GET', `/rest/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId: wf.id }))}&limit=50`);
	const rowsAfter = after.body.data?.results ?? [];
	check('AK-N4 rejected requests start no execution', rowsAfter.length === 1, `executions=${rowsAfter.length}`);

	// deactivate -> hook removed
	await deactivate(wf);
	await sleep(1000);
	hooks = (await dk('GET', '/webhooks')).body.data ?? [];
	check('AK-N4 deactivation deletes the REST hook', !hooks.some((h) => h.id === hook?.id), `remaining=${hooks.length}`);
}

main()
	.catch((e) => { record('harness error', false, String(e.stack ?? e).slice(0, 500)); })
	.finally(() => {
		const out = process.env.OUT;
		if (out) writeFileSync(out, JSON.stringify(results, null, 2));
		const fails = results.filter((r) => !r.ok).length;
		console.log(`\n${results.length - fails}/${results.length} passed`);
		process.exit(fails ? 1 : 0);
	});
