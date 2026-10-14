# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

### Added

- Credential **Dakoty API** (API key `dk_live_…`, optional base URL), tested with `GET /me`.
- Node **Dakoty** with 33 operations across 7 resources (Lead, Company, Contact, Activity, Task,
  Invoice, Booking): create, update, get, get many (cursor pagination, "Return All"), find (exact
  match), archive, move to stage, complete and cancel. Dropdowns for users, pipelines, stages, lost
  reasons, activity types, projects, booking services and staff. Optional idempotency key on writes.
- Node **Dakoty Trigger**: instant triggers through Dakoty REST hooks for 41 events (leads, companies,
  contacts, clients, activities, tasks, invoices, bookings, orders), Standard Webhooks signature
  verification, simplified or raw output.
- Same scope as the Dakoty Make app. Operations are generated from the Dakoty OpenAPI document.
