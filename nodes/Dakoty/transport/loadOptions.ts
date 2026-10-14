import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

type Item = Record<string, unknown>;

interface Page {
	data?: Item[];
	has_more?: boolean;
	next_cursor?: string | null;
}

const PAGE_LIMIT = 100;
/** Upper bound of dropdown entries, same as the Make app (500). */
const MAX_ITEMS = 500;

/** GET <baseUrl><path> with the Dakoty credential, following `next_cursor`. */
export async function listAll(
	this: ILoadOptionsFunctions,
	path: string,
	paginated = true,
): Promise<Item[]> {
	const credentials = await this.getCredentials('dakotyApi');
	const baseUrl = String(credentials.baseUrl).replace(/\/+$/, '');
	const items: Item[] = [];
	let cursor: string | undefined;
	do {
		const qs: Record<string, string | number> = paginated ? { limit: PAGE_LIMIT } : {};
		if (cursor) qs.cursor = cursor;
		const page = (await this.helpers.httpRequestWithAuthentication.call(this, 'dakotyApi', {
			method: 'GET',
			url: `${baseUrl}${path}`,
			qs,
			json: true,
		})) as Page;
		items.push(...(page.data ?? []));
		cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
	} while (cursor && items.length < MAX_ITEMS);
	return items.slice(0, MAX_ITEMS);
}

const str = (v: unknown) => String(v ?? '');

function toOptions(items: Item[], label: (i: Item) => string): INodePropertyOptions[] {
	return items.map((i) => ({ name: label(i), value: str(i.id) }));
}

const named = (i: Item) => str(i.name);

export const loadOptionsMethods = {
	async getUsers(this: ILoadOptionsFunctions) {
		return toOptions(await listAll.call(this, '/users'), (i) => `${str(i.name)} (${str(i.email)})`);
	},
	async getLeadOrigins(this: ILoadOptionsFunctions) {
		return toOptions(await listAll.call(this, '/lead-origins'), named);
	},
	async getLeadPipelines(this: ILoadOptionsFunctions) {
		return toOptions(await listAll.call(this, '/lead-pipelines'), named);
	},
	async getLeadStages(this: ILoadOptionsFunctions) {
		return stagesOf.call(this, '/lead-pipelines', ['pipeline_id']);
	},
	async getLostReasons(this: ILoadOptionsFunctions) {
		return toOptions(await listAll.call(this, '/lost-reasons'), named);
	},
	async getActivityTypes(this: ILoadOptionsFunctions) {
		return toOptions(await listAll.call(this, '/activity-types'), named);
	},
	async getProjects(this: ILoadOptionsFunctions) {
		return toOptions(await listAll.call(this, '/projects'), named);
	},
	async getProjectStages(this: ILoadOptionsFunctions) {
		return stagesOf.call(this, '/projects', ['project_id']);
	},
	async getBookingServices(this: ILoadOptionsFunctions) {
		return toOptions(
			await listAll.call(this, '/booking-services'),
			(i) => `${str(i.name)} (${str(i.duration_minutes)} min)`,
		);
	},
	async getBookingStaff(this: ILoadOptionsFunctions) {
		return toOptions(await listAll.call(this, '/booking-staff'), named);
	},
};

/** Where a dependent dropdown can find its parent: top level, or inside a collection of the operation. */
const PARENT_CONTAINERS = ['', 'additionalFields.', 'updateFields.', 'filters.'];

export function currentParent(this: ILoadOptionsFunctions, names: string[]): string | undefined {
	for (const prefix of PARENT_CONTAINERS) {
		for (const n of names) {
			const v = this.getCurrentNodeParameter(`${prefix}${n}`);
			if (typeof v === 'string' && v) return v;
		}
	}
	return undefined;
}

/**
 * Stages live inside their pipeline / project. With a selected parent only its stages are listed, otherwise
 * all of them, prefixed with the parent name.
 */
export async function stagesOf(
	this: ILoadOptionsFunctions,
	path: string,
	parentNames: string[],
): Promise<INodePropertyOptions[]> {
	const parents = await listAll.call(this, path);
	const selected = currentParent.call(this, parentNames);
	const out: INodePropertyOptions[] = [];
	for (const parent of parents) {
		if (selected && str(parent.id) !== selected) continue;
		for (const stage of (parent.stages as Item[] | undefined) ?? []) {
			out.push({ name: selected ? str(stage.name) : `${str(parent.name)} / ${str(stage.name)}`, value: str(stage.id) });
		}
	}
	return out;
}
