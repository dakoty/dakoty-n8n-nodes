/* eslint-disable -- development-only generator, not part of the published package */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const ROOT = join(__dirname, '..');

export type Json = any;

export function loadSpec(): Json {
	return parse(readFileSync(join(ROOT, 'spec', 'openapi-public-v1.yaml'), 'utf8'));
}

export function makeResolver(spec: Json) {
	const deref = (s: Json): Json => {
		let cur = s;
		while (cur && typeof cur === 'object' && '$ref' in cur) {
			let x: Json = spec;
			for (const part of String(cur.$ref).split('/').slice(1)) x = x[part];
			cur = x;
		}
		return cur;
	};
	/** Resolve $ref and collapse nullable (type list / oneOf with null) to a plain schema. */
	const norm = (s: Json): Json => {
		let cur = deref(s);
		if (cur.oneOf) {
			const alts = cur.oneOf.map(norm).filter((a: Json) => a.type !== 'null');
			return { ...alts[0] };
		}
		if (Array.isArray(cur.type)) {
			cur = { ...cur, type: cur.type.filter((x: string) => x !== 'null')[0] };
		}
		return cur;
	};
	return { deref, norm };
}
