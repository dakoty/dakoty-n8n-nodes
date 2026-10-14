# n8n-nodes-dakoty

[n8n](https://n8n.io) community nodes for [Dakoty CRM](https://dakoty.com): read and write leads, companies,
contacts, activities, tasks, invoices and bookings, and start workflows the moment something happens in
Dakoty.

Slovak version: [README.sk.md](README.sk.md).

- **Dakoty** node: 33 operations across 7 resources, the same scope as the Dakoty app for Make.
- **Dakoty Trigger** node: instant triggers over Dakoty REST hooks, with signature verification.
- **Dakoty API** credential: one API key.
- No runtime dependencies. MIT licensed.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger](#dakoty-trigger) · [Scopes](#api-key-scopes) · [Development](#development)

## Installation

Self-hosted n8n: **Settings → Community nodes → Install**, enter `n8n-nodes-dakoty`, accept the risk notice
and install. See the [n8n guide to community nodes](https://docs.n8n.io/integrations/community-nodes/installation/gui-install/).

n8n Cloud: the nodes appear in the node panel once n8n has verified the package. Until then use n8n's
*HTTP Request* node with a *Header Auth* credential (`Authorization: Bearer dk_live_…`) against
`https://api.dakoty.com/api/v1/public`.

## Credentials

1. In Dakoty open **Settings → Integrations → API keys** and create a key. The preset
   **Make / Zapier / n8n – bežné použitie** covers everything below except writing invoices and bookings;
   add *Invoices – write* and *Bookings – write* if you need them.
2. In n8n create a **Dakoty API** credential and paste the key (it starts with `dk_live_`).
3. Leave **Base URL** at `https://api.dakoty.com/api/v1/public` (change it only to test against a local
   Dakoty).
4. Save. n8n tests the credential with `GET /me`; a wrong key shows the 401 message from the API.

## Operations

All operations return the record(s) from the `data` field of the API response, one n8n item per record.
Write operations accept an optional **Idempotency Key** (under *Additional Fields*): a repeated request
with the same key returns the stored result instead of creating a duplicate.

| Resource | Operations |
|---|---|
| Lead | Create, Update, Get, Get Many, Find, Archive, Move to Stage |
| Company | Create, Update, Get, Get Many, Find |
| Contact | Create, Update, Get, Get Many, Find |
| Activity | Create, Update, Get, Get Many, Complete |
| Task | Create, Update, Get, Get Many |
| Invoice | Create, Get, Get Many |
| Booking | Create, Get, Get Many, Cancel |

- **Get Many** has **Return All** (follows the API cursor until the last page) or **Limit** (1 to 100),
  plus filters such as *Created After*, *Updated Since*, *Sort By* and per-resource filters.
- **Find** matches exactly (e-mail, registration ID, phone, invoice number …) and returns nothing when
  there is no match. Fill in at least one field.
- **Create Lead** can create or match the company and contact in the same step (fields *Company: …* and
  *Contact: …*); *Duplicate Check = Company* returns an existing active lead of the same company instead
  of creating a second one (the output then has `deduplicated: true`).
- Dropdowns (owner, pipeline, stage, lost reason, activity type, project, booking service, staff) are
  loaded from your Dakoty organization.
- **Errors** carry the API message and a description such as `[403] FORBIDDEN`. For HTTP 429 enable
  *Retry On Fail* in the node settings; Dakoty rate-limits per API key.

## Dakoty Trigger

Starts a workflow when events happen in Dakoty. Pick one or more **Events** (41 are offered: leads,
companies, contacts, clients, activities, tasks, invoices, bookings, orders).

- Activating the workflow registers a REST hook in Dakoty named `n8n – <workflow name>`
  (`POST /webhooks`). Deactivating or deleting the workflow removes it. Nothing to copy or paste.
- **Output**: *Simplified* (default) gives the record fields plus `event_id`, `event_type`, `occurred_at`,
  `organization` and `test`. *Raw* gives the whole envelope with the record under `data`.
- **Verify Signature** (on by default) checks the Standard Webhooks headers (`webhook-id`,
  `webhook-timestamp`, `webhook-signature`, HMAC-SHA256, 5 minute tolerance) with the secret Dakoty
  returned when the hook was created. Requests that fail the check get `401` and start no execution.
- n8n's *Listen for test event* registers its own hook for the test and removes it afterwards.
- The n8n webhook URL must be reachable from the internet over https. Dakoty rejects `localhost` and
  private addresses.

## API key scopes

| Scope | Needed for |
|---|---|
| `leads:read` / `leads:write` | Lead: get, get many, find / create, update, archive, move. Dropdowns: lead origin, pipeline, stage, lost reason |
| `companies:read` / `companies:write` | Company and Contact operations |
| `activities:read` / `activities:write` | Activity operations, activity type dropdown |
| `tasks:read` / `tasks:write` | Task operations, project and stage dropdowns |
| `invoices:read` / `invoices:write` | Invoice get, get many / create |
| `bookings:read` / `bookings:write` | Booking get, get many / create, cancel. Service and staff dropdowns |
| `users:read` | Owner, assignee dropdowns |
| `webhooks:manage` | Dakoty Trigger (plus the read scope of every selected entity) |

A missing scope returns `403 FORBIDDEN` with the name of the scope in the message.

## Development

```
npm install
npm run generate   # regenerates nodes/Dakoty/descriptions from spec/openapi-public-v1.yaml
npm run spec:sync  # downloads the current OpenAPI document into spec/
npm run lint       # n8n-node lint (strict mode, required for verification)
npm test           # unit tests
npm run build
npm run dev        # starts n8n with the nodes linked
```

The operation table lives in `scripts/operations.ts`; everything else (fields, required flags, enums,
paths) is generated from the OpenAPI document, and `test/parity.test.ts` checks the generated nodes against
it. Releases are published from GitHub Actions with npm provenance (see `docs/RELEASING.md`).

## Links

- [Dakoty API documentation](https://docs.dakoty.com/developers/n8n-node/)
- [Dakoty REST API reference](https://docs.dakoty.com/developers/reference/)
- [Issues](https://github.com/dakoty/dakoty-n8n-nodes/issues)

## License

[MIT](LICENSE)
