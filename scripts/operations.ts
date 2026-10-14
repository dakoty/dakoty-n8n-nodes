// Operation table of the Dakoty node. 1:1 translation of dakoty-make-app/tools/gen.py (module list, labels,
// overrides, dropdowns). Everything else (fields, required flags, enums, paths) comes from spec/openapi-public-v1.yaml.

export type Resource = 'lead' | 'company' | 'contact' | 'activity' | 'task' | 'invoice' | 'booking';
export type Kind = 'create' | 'update' | 'get' | 'getAll' | 'find' | 'action';

export interface FieldOverride {
	label?: string;
	help?: string;
	/** loadOptions method that lists the values of this field. */
	rpc?: string;
	/** Parameter names that change the list of options. */
	dependsOn?: string[];
	/** Overrides for the fields of an inline object or array item. */
	children?: Record<string, FieldOverride>;
}

export interface OperationDef {
	resource: Resource;
	/** n8n operation value. */
	value: string;
	kind: Kind;
	/** Option name in the operation dropdown. */
	name: string;
	/** Action text, shown in the node picker. */
	action: string;
	description: string;
	method: 'GET' | 'POST' | 'PATCH';
	path: string;
	overrides?: Record<string, FieldOverride>;
	/** Body fields that are not exposed (inline objects the operation cannot take). */
	skip?: string[];
	/** Operation sends an Idempotency-Key header. */
	idem?: boolean;
	/** Search filters that are dropdowns. */
	rpcs?: Record<string, string>;
	/** Extra parameter that is not sent (only filters a dependent dropdown). */
	pipelineSelector?: { name: string; label: string; rpc: string; description: string };
}

export const RESOURCES: { value: Resource; name: string; idLabel: string }[] = [
	{ value: 'lead', name: 'Lead', idLabel: 'Lead ID' },
	{ value: 'company', name: 'Company', idLabel: 'Company ID' },
	{ value: 'contact', name: 'Contact', idLabel: 'Contact ID' },
	{ value: 'activity', name: 'Activity', idLabel: 'Activity ID' },
	{ value: 'task', name: 'Task', idLabel: 'Task ID' },
	{ value: 'invoice', name: 'Invoice', idLabel: 'Invoice ID' },
	{ value: 'booking', name: 'Booking', idLabel: 'Booking ID' },
];

const LEAD_OV: Record<string, FieldOverride> = {
	origin_id: { rpc: 'getLeadOrigins', label: 'Origin', help: 'Lead source. If empty, the origin named "API" is used.' },
	owner_id: { rpc: 'getUsers', label: 'Owner' },
	assignee_ids: { rpc: 'getUsers', label: 'Assignees' },
	company_id: { label: 'Company ID', help: 'Existing company (ID). Use Company: Find or Get Many to look it up.' },
	contact_id: { label: 'Contact ID', help: 'Existing contact (ID). Use Contact: Find or Get Many to look it up.' },
	pipeline_id: { rpc: 'getLeadPipelines', label: 'Pipeline' },
	stage_id: { rpc: 'getLeadStages', label: 'Stage', help: 'Stage of the selected pipeline.', dependsOn: ['pipeline_id'] },
	expected_close_date: { label: 'Expected Close Date' },
	acquisition_cost: { label: 'Acquisition Cost' },
	company: {
		label: 'Company',
		help: 'Matched to an existing company by registration ID, then e-mail; otherwise created. Fill at least the name or registration ID.',
		children: { registration_id: { label: 'Registration ID' }, country_code: { label: 'Country Code', help: 'ISO 3166-1 alpha-2, for example SK.' } },
	},
	contact: {
		label: 'Contact',
		help: 'Matched to an existing contact by e-mail within the company; otherwise created. Fill at least the name or e-mail.',
	},
	dedupe: {
		label: 'Duplicate Check',
		help: 'With "Company", an existing active lead of the same company is returned instead of creating a new one (output field "deduplicated" is then true).',
	},
};

const CO_OV: Record<string, FieldOverride> = {
	owner_id: { rpc: 'getUsers', label: 'Owner' },
	country_code: { label: 'Country Code', help: "ISO 3166-1 alpha-2, for example SK. Defaults to the organization's country." },
	registration_id: { label: 'Registration ID' },
	tax_id: { label: 'Tax ID' },
	vat_id: { label: 'VAT ID' },
	postal_code: { label: 'Postal Code' },
};
const CT_OV: Record<string, FieldOverride> = {
	company_id: { label: 'Company ID', help: 'The company (ID) the contact belongs to. Use Company: Find or Get Many to look it up.' },
	is_primary: { label: 'Primary Contact', help: 'Whether this is the primary contact of the company' },
};
const ACT_OV: Record<string, FieldOverride> = {
	type_id: { rpc: 'getActivityTypes', label: 'Type' },
	assignee_id: { rpc: 'getUsers', label: 'Assignee' },
	start_at: { label: 'Start' },
	end_at: { label: 'End', help: 'If empty, the activity ends 30 minutes after the start.' },
	company_id: { label: 'Company ID' },
	lead_id: { label: 'Lead ID' },
	contact_id: { label: 'Contact ID' },
	video_call_url: { label: 'Video Call URL' },
};
const TASK_OV: Record<string, FieldOverride> = {
	project_id: { rpc: 'getProjects', label: 'Project' },
	stage_id: { rpc: 'getProjectStages', label: 'Stage', help: 'Stage of the selected project.', dependsOn: ['project_id'] },
	assignee_ids: { rpc: 'getUsers', label: 'Assignees' },
	company_id: { label: 'Company ID' },
	lead_id: { label: 'Lead ID' },
	due_time: { label: 'Due Time', help: 'Time in the format HH:MM.' },
	start_date: { label: 'Start Date' },
	due_date: { label: 'Due Date' },
	completed: { label: 'Completed', help: 'Whether the task is completed; true completes it, false reopens it' },
};
const INV_OV: Record<string, FieldOverride> = {
	company_id: { label: 'Company ID', help: 'Customer company (ID). Fill the company or the client.' },
	client_id: { label: 'Client ID' },
	issued_date: { label: 'Issue Date' },
	due_date: { label: 'Due Date' },
	currency: { label: 'Currency', help: 'ISO 4217 code in upper case, for example EUR.' },
	items: { label: 'Items', children: { unit_price: { label: 'Unit Price' }, vat_rate: { label: 'VAT Rate (%)' } } },
};
const BK_OV: Record<string, FieldOverride> = {
	service_id: { rpc: 'getBookingServices', label: 'Service' },
	staff_id: { rpc: 'getBookingStaff', label: 'Staff Member' },
	starts_at: { label: 'Starts At' },
	customer: { label: 'Customer' },
};
const SR: Record<string, FieldOverride> = {
	created_after: { label: 'Created After' },
	updated_since: { label: 'Updated Since' },
	sort: { label: 'Sort By' },
	search: { label: 'Search Text' },
};

const find = (resource: Resource, name: string, desc: string, path: string, overrides?: Record<string, FieldOverride>): OperationDef => ({
	resource, value: 'find', kind: 'find', name: 'Find', action: `Find ${name} by exact match`, description: desc, method: 'GET', path, overrides,
});
const getOne = (resource: Resource, what: string, path: string, extra = ''): OperationDef => ({
	resource, value: 'get', kind: 'get', name: 'Get', action: `Get a ${what}`, description: `Return a ${what} by ID${extra}`, method: 'GET', path,
});
const getMany = (resource: Resource, plural: string, desc: string, path: string, overrides: Record<string, FieldOverride>, rpcs?: Record<string, string>): OperationDef => ({
	resource, value: 'getAll', kind: 'getAll', name: 'Get Many', action: `Get many ${plural}`, description: desc, method: 'GET', path, overrides, rpcs,
});

export const OPERATIONS: OperationDef[] = [
	// ---- leads
	{ resource: 'lead', value: 'create', kind: 'create', name: 'Create', action: 'Create a lead', description: 'Create a lead; the company and contact can be created or matched in the same step', method: 'POST', path: '/leads', overrides: LEAD_OV, idem: true },
	{ resource: 'lead', value: 'update', kind: 'update', name: 'Update', action: 'Update a lead', description: 'Update the given fields of a lead; empty fields stay unchanged', method: 'PATCH', path: '/leads/{id}', overrides: LEAD_OV, skip: ['company', 'contact', 'dedupe'] },
	getOne('lead', 'lead', '/leads/{id}'),
	getMany('lead', 'leads', 'Return leads that match the filters, newest first by default', '/leads',
		{ ...SR, origin_id: { label: 'Origin', rpc: 'getLeadOrigins' }, owner_id: { label: 'Owner', rpc: 'getUsers' }, company_id: { label: 'Company ID' }, pipeline_id: { label: 'Pipeline', rpc: 'getLeadPipelines' }, stage_id: { label: 'Stage', rpc: 'getLeadStages', dependsOn: ['pipeline_id'] }, archived: { label: 'Archived', help: 'Default is not archived.' } }),
	find('lead', 'leads', 'Find leads by the exact e-mail, registration ID or phone of their company or contact; returns nothing when none match; fill at least one field', '/leads/find', { registration_id: { label: 'Registration ID' } }),
	{ resource: 'lead', value: 'archive', kind: 'action', name: 'Archive', action: 'Archive a lead', description: 'Archive a lead, optionally with a lost reason', method: 'POST', path: '/leads/{id}/archive', idem: true, overrides: { lost_reason_id: { rpc: 'getLostReasons', label: 'Lost Reason' }, lost_note: { label: 'Lost Note' } } },
	{ resource: 'lead', value: 'move', kind: 'action', name: 'Move to Stage', action: 'Move a lead to a stage', description: 'Move a lead to another pipeline stage (use a lost stage together with a lost reason)', method: 'POST', path: '/leads/{id}/move', idem: true,
		overrides: { stage_id: { rpc: 'getLeadStages', label: 'Stage', help: 'Select the pipeline first, then the stage.', dependsOn: ['pipeline_id'] }, lost_reason_id: { rpc: 'getLostReasons', label: 'Lost Reason' }, lost_note: { label: 'Lost Note' } },
		pipelineSelector: { name: 'pipeline_id', label: 'Pipeline', rpc: 'getLeadPipelines', description: 'Only filters the list of stages; it is not sent to Dakoty' } },
	// ---- companies
	{ resource: 'company', value: 'create', kind: 'create', name: 'Create', action: 'Create a company', description: 'Create a company', method: 'POST', path: '/companies', overrides: CO_OV, idem: true },
	{ resource: 'company', value: 'update', kind: 'update', name: 'Update', action: 'Update a company', description: 'Update the given fields of a company; empty fields stay unchanged', method: 'PATCH', path: '/companies/{id}', overrides: CO_OV },
	getOne('company', 'company', '/companies/{id}', ', including its contacts'),
	getMany('company', 'companies', 'Return companies that match the filters', '/companies', SR),
	find('company', 'companies', 'Find companies by the exact registration ID, e-mail or phone; returns nothing when none match; fill at least one field', '/companies/find', { registration_id: { label: 'Registration ID' } }),
	// ---- contacts
	{ resource: 'contact', value: 'create', kind: 'create', name: 'Create', action: 'Create a contact', description: 'Create a contact person of a company', method: 'POST', path: '/contacts', overrides: CT_OV, idem: true },
	{ resource: 'contact', value: 'update', kind: 'update', name: 'Update', action: 'Update a contact', description: 'Update the given fields of a contact person; empty fields stay unchanged', method: 'PATCH', path: '/contacts/{id}', overrides: CT_OV },
	getOne('contact', 'contact', '/contacts/{id}'),
	getMany('contact', 'contacts', 'Return contact persons that match the filters', '/contacts', { ...SR, company_id: { label: 'Company ID' } }),
	find('contact', 'contacts', 'Find contact persons by the exact e-mail or phone; returns nothing when none match; fill at least one field', '/contacts/find'),
	// ---- activities
	{ resource: 'activity', value: 'create', kind: 'create', name: 'Create', action: 'Create an activity', description: 'Create a calendar activity (call, meeting, to-do)', method: 'POST', path: '/activities', overrides: ACT_OV, idem: true },
	{ resource: 'activity', value: 'update', kind: 'update', name: 'Update', action: 'Update an activity', description: 'Update the given fields of an activity; empty fields stay unchanged', method: 'PATCH', path: '/activities/{id}', overrides: ACT_OV },
	getOne('activity', 'activity', '/activities/{id}'),
	getMany('activity', 'activities', 'Return activities (calls, meetings, to-dos) that match the filters, newest first by default', '/activities',
		{ ...SR, assignee_id: { label: 'Assignee', rpc: 'getUsers' }, type_id: { label: 'Type', rpc: 'getActivityTypes' }, company_id: { label: 'Company ID' }, lead_id: { label: 'Lead ID' } }),
	{ resource: 'activity', value: 'complete', kind: 'action', name: 'Complete', action: 'Complete an activity', description: 'Mark an activity as completed', method: 'POST', path: '/activities/{id}/complete', idem: true },
	// ---- tasks
	{ resource: 'task', value: 'create', kind: 'create', name: 'Create', action: 'Create a task', description: 'Create a project task', method: 'POST', path: '/tasks', overrides: TASK_OV, idem: true },
	{ resource: 'task', value: 'update', kind: 'update', name: 'Update', action: 'Update a task', description: 'Update the given fields of a task; empty fields stay unchanged', method: 'PATCH', path: '/tasks/{id}', overrides: TASK_OV },
	getOne('task', 'task', '/tasks/{id}'),
	getMany('task', 'tasks', 'Return project tasks that match the filters, newest first by default', '/tasks',
		{ ...SR, assignee_id: { label: 'Assignee', rpc: 'getUsers' }, project_id: { label: 'Project', rpc: 'getProjects' }, stage_id: { label: 'Stage', rpc: 'getProjectStages', dependsOn: ['project_id'] }, company_id: { label: 'Company ID' }, lead_id: { label: 'Lead ID' },
			archived: { label: 'Archived', help: 'Default is not archived.' }, completed: { label: 'Completed', help: 'Whether to return only completed tasks (true) or only open ones (false); leave it out for both' }, overdue: { label: 'Overdue', help: 'Whether to return only open tasks past their due date' } }),
	// ---- invoices
	{ resource: 'invoice', value: 'create', kind: 'create', name: 'Create', action: 'Create an invoice', description: 'Issue a new invoice', method: 'POST', path: '/invoices', overrides: INV_OV, idem: true },
	getOne('invoice', 'invoice', '/invoices/{id}'),
	getMany('invoice', 'invoices', 'Return invoices that match the filters; use the number or the variable symbol to find a specific invoice', '/invoices',
		{ ...SR, company_id: { label: 'Company ID' }, client_id: { label: 'Client ID' }, variable_symbol: { label: 'Variable Symbol' }, number: { label: 'Invoice Number' } }),
	// ---- bookings
	{ resource: 'booking', value: 'create', kind: 'create', name: 'Create', action: 'Create a booking', description: 'Create a booking of a service', method: 'POST', path: '/bookings', overrides: BK_OV, idem: true },
	getOne('booking', 'booking', '/bookings/{id}'),
	getMany('booking', 'bookings', 'Return bookings that match the filters, newest first by default', '/bookings',
		{ ...SR, staff_id: { label: 'Staff Member', rpc: 'getBookingStaff' }, starts_after: { label: 'Starts After' }, starts_before: { label: 'Starts Before' } }),
	{ resource: 'booking', value: 'cancel', kind: 'action', name: 'Cancel', action: 'Cancel a booking', description: 'Cancel a booking', method: 'POST', path: '/bookings/{id}/cancel', idem: true },
];
