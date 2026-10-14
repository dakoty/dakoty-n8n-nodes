# n8n verification submission (copy for the Creator Portal)

Portal: https://creators.n8n.io/nodes (submitted by a maintainer after the first npm release).

| Field | Value |
|---|---|
| Package | `n8n-nodes-dakoty` |
| Repository | https://github.com/dakoty/dakoty-n8n-nodes (public, MIT) |
| Name | Dakoty |
| Category | Sales, Productivity |
| Short description | Read and write leads, companies, contacts, activities, tasks, invoices and bookings in Dakoty CRM, and trigger workflows from Dakoty events. |
| Documentation | https://github.com/dakoty/dakoty-n8n-nodes#readme and https://docs.dakoty.com/developers/n8n-node/ |
| Credentials | Dakoty API key (Settings → Integrations → API keys in Dakoty). A test key for the demo organization is shared only when n8n asks. |
| Language | English UI, README, errors. Slovak help is in the Dakoty help center. |

Checklist (n8n verification guidelines): no runtime dependencies; no environment variable or file system
access; published from GitHub Actions with provenance; `n8n-node lint` passes in strict mode;
`npx @n8n/scan-community-package n8n-nodes-dakoty` passes; MIT license; README with credential and
operation documentation.
