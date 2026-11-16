# Fault Line — Digital Snapshot Modal Worker

Playwright-based URL snapshot worker for the digital-infrastructure reporting flow (DEFERRED #26). Called from the Fault Line app whenever a resident files a Group F report (broken city website form, screen-reader-inaccessible PDF, missing translation, WCAG violation, etc.). Captures HTML + full-page screenshot + response metadata; stores in a private Supabase Storage bucket; returns a `ref` key that goes on the report's `digital.snapshotRef` field.

## Why this exists

Digital-infrastructure failures don't photograph well — a screen-reader trap has no visual footprint that a phone camera can capture. But cities can remediate a URL after receiving a report and then claim the report was inaccurate. The snapshot is the evidence: captured at submission time, immutable, retrievable later.

## First-time setup

1. Install Modal CLI: `pip install modal && modal setup`
2. Generate a worker secret: `openssl rand -base64 32`
3. Create the Supabase storage bucket `digital-infra-snapshots` (private).
4. Register secrets:
   ```
   modal secret create fault-line-digital-snapshot \
     WORKER_SECRET=<the-random-32-byte-base64> \
     SUPABASE_URL=https://dzewklljiksyivsfpunt.supabase.co
   ```
5. Deploy: `modal deploy main.py`
6. Modal prints the endpoint URL (e.g. `https://moons7onr--fault-line-digital-snapshot-capture-snapshot.modal.run`)
7. Set the endpoint + worker secret in Fault Line's config so `src/services/digitalSnapshot.ts` can call it:
   ```
   npx supabase secrets set \
     DIGITAL_SNAPSHOT_WORKER_URL=<modal-endpoint> \
     DIGITAL_SNAPSHOT_WORKER_SECRET=<same-secret> \
     --project-ref dzewklljiksyivsfpunt
   ```
8. Point `captureSnapshot()` in `src/services/digitalSnapshot.ts` at the endpoint (currently returns a placeholder).

## API

See the docstring at the top of `main.py` for the full contract. In short:
`POST <endpoint>/capture-snapshot` with header `x-worker-secret` and body
`{ "url", "reportId"?, "uploadUrls"? }`. The worker holds no Supabase key:
pass signed upload URLs (html / png / meta, created by the caller with
`createSignedUploadUrl` in `digital-infra-snapshots`) to have it upload, or
omit them to get the HTML and PNG back base64-encoded. Errors: `400` bad
input or non-public URL, `401` bad secret, `502` capture/upload failed,
`503` worker not configured.

## Cost estimate

- Modal execution: ~5-15 seconds per snapshot (Playwright + Chromium boot + full-page render + 3 Supabase uploads)
- Modal price at time of writing: ~$0.001-0.003 per snapshot (execution-second billing)
- Supabase storage: negligible per snapshot (HTML + PNG typically < 2 MB combined)

Expected volume during pilot: single-digit snapshots per day per pilot city. Plan for scale after a chain-wide Access & Equity aggregation triggers a batch of Group F reports.

## Security notes

- **Never accept URLs from unauthenticated callers.** The worker enforces `x-worker-secret`; the Fault Line app enforces user authentication before submitting a URL for snapshot.
- **Sandbox Chromium.** Chromium keeps its sandbox: it runs in a child process as the unprivileged `snapshot` user with `chromium_sandbox=True`. If the sandbox can't start, the capture fails (502) instead of running unsandboxed.
- **Public URLs only.** The URL and every request the page makes (each redirect hop included) must be http(s) and resolve only to public addresses.
- **Sensitive-header stripping.** Response headers are not persisted by default — only status code + body. If Fault Line ever surfaces response headers, add a strip pass before storage (auth tokens, session cookies, tracking IDs).
- **Storage bucket is private.** Public exposure of snapshots would create both privacy issues (residents might submit URLs that contain their own session state in query strings) and a legal target for cities that don't want their broken pages archived. Snapshots are retrievable only via signed URLs by ADA coordinators / reporters / DOJ complaint recipients.

## What's NOT in this worker

- Automated bulk auditing of cities. Snapshots are triggered by resident reports only. Wide-net auditing without a specific resident-affected use case shifts from accountability tooling into vulnerability discovery — different ethical and legal considerations, out of scope.
- Automated PDF or dynamic-content re-rendering (e.g., screen-reader traversal simulation). Snapshot is a point-in-time capture of the rendered page state as delivered.
- WCAG-violation detection. The user's report describes the violation; the snapshot preserves the evidence. Automated detection is a separate feature outside this worker.
