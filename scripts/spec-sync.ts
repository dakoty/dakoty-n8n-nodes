/* eslint-disable -- development-only script, not part of the published package */
// Downloads the current public OpenAPI document into spec/ (then run `npm run generate`).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './spec';

const URL = process.env.DAKOTY_OPENAPI_URL ?? 'https://api.dakoty.com/api/v1/openapi/public-v1.yaml';

async function main() {
	const res = await fetch(URL);
	if (!res.ok) throw new Error(`GET ${URL} -> ${res.status}`);
	writeFileSync(join(ROOT, 'spec', 'openapi-public-v1.yaml'), await res.text());
	console.log(`spec/openapi-public-v1.yaml updated from ${URL}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
