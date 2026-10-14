# Spike results (plan N1, 2026-10-14)

| Question | Answer | Evidence |
|---|---|---|
| Does `webhook()` get the raw request body (`req.rawBody`)? | Yes, on n8n 2.43.5. | `scripts/e2e/run.mjs`: with *Verify Signature* on, real deliveries from Dakoty (HMAC over the exact bytes) start the workflow, while a forged signature and a request without signature headers get 401 and start no execution. The node falls back to `JSON.stringify(body)` if `rawBody` is ever missing; that would fail verification (fail closed), never accept a bad signature. |
| Does `node:crypto` pass `n8n-node lint` (strict, cloud support) and the community package scan? | Yes. | `npm run lint` exit 0; `analyzePackage` of `@n8n/scan-community-package` 0.39.0 run on the source tree (`SOURCE_FILE_PATTERNS`) and on the packed tarball (`**/*.js`, `package.json`) both passed. |
| Can the credential be used in the HTTP Request node ("Predefined credential type")? | Not verified. | The credential has a generic `authenticate` (Bearer header), which is what that feature needs, but it was not exercised in the UI. The README documents a Header Auth credential for the HTTP Request fallback instead. |
