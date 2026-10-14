# Security notes

## Authentication
- Passwords: Argon2id (`argon2-cffi` defaults), transparently re-hashed at login if parameters change. Hashes are never returned or logged. Unknown-email logins still run one Argon2 verification to flatten timing.
- JWT (HS256 by default): claims `sub` (immutable user UUID), `iat`, `exp`, `jti`, `iss`, `aud`; all required and checked. Default lifetime 30 min. `JWT_SECRET` must be >= 32 chars in production (startup fails otherwise); in dev an ephemeral random secret is generated with a warning.
- **Logout is real revocation**: `jti` is stored in `revoked_tokens` with a TTL equal to the token's remaining life and checked on every request (one extra read). Limits: no refresh tokens, no "log out everywhere"; changing `JWT_SECRET` invalidates all tokens.
- Brute-force: login is limited per IP and per target email. Counters are per-process (below).

## Authorization
`modules/repositories/access.require()` runs before any Git/data access. Repo IDs are not capabilities: private repos return 404 to non-members; analytics re-checks access when the job is dispatched (membership may change between submit and run); upload keys are derived from the caller's id.

## Git and path safety
- argv lists only, `shell=False`; user data only after allow-list validation (`utils/validators.py`) and after `--`/`--end-of-options` where Git supports it. Branch/ref inputs cannot start with `-` or contain revision syntax (`~ ^ : @{ ..`).
- Filesystem path = `<GIT_REPOS_DIR>/<uuid>.git`, `resolve()`d and checked to stay directly under the root. Names/branches/usernames never touch the filesystem.
- File paths: normalized POSIX relative paths; reject `..`, `.`, empty components, absolute, drive letters, backslash, control chars, any `.git` component, > 20 levels, > 400 chars.
- Commits never create a work tree (plumbing + temp index), so symlinks, hooks, filters and `.gitattributes` in repository content are never followed or executed. A committed symlink is returned as its link text. Hooks are not installed (`init --template=`); system/global git config is ignored; only a minimal environment (PATH etc.) is passed to git - no app secrets.
- Timeouts (`GIT_TIMEOUT_S`), output cap (`GIT_MAX_OUTPUT_BYTES`), file (`GIT_MAX_FILE_BYTES`) and diff caps; failures are logged by category/op only and returned as generic messages. Uploaded code is stored, never executed.
- Source text is validated (UTF-8 or explicit base64) but never altered.

## Request protection
Body limit (413) enforced on `Content-Length` and while streaming; multipart limit separate. Security headers on every response (nosniff, DENY framing, no-referrer, no-store, CSP `default-src 'none'`, HSTS in production). `TrustedHostMiddleware`; CORS allow-list from env, no wildcard allowed in production, credentials disabled (bearer tokens, no cookies). `X-Forwarded-For` is honoured only with `TRUST_PROXY_HEADERS=true` - set it only behind a proxy that overwrites the header (Render does); also run uvicorn with `--proxy-headers --forwarded-allow-ips <proxy>`.

## Rate limiting
`limits` library, moving window. Policies: register, login, repo create/delete, commit, upload, analytics submit, WebSocket connect, plus per-user/anonymous defaults. Keys: user id when authenticated, else client IP. **Default storage is memory: counters are per process, reset on restart and not shared across instances.** Set `RATE_LIMIT_STORAGE_URI=redis://...` (and `pip install redis`) for shared limits.

## Uploads
- Avatars: server-side upload only (the Cloudinary secret never reaches a browser; no client-side signing is exposed). <= 2 MB, decoded with Pillow, only PNG/JPEG/WEBP, pixel cap against decompression bombs, public id `gitarchey/avatars/<user_id>` so users can only overwrite their own; deletion refuses ids outside that namespace.
- Generic uploads: size-capped, type decided from content, stored under `uploads/<user_id>/<uuid>` in R2, delivered via <= 5 min presigned URLs.

## Worker channel
Dedicated `WORKER_TOKEN` (>= 32 chars in production), constant-time comparison, sent in the `Authorization` header of the outbound WSS handshake - never in a URL, never to browsers. A user JWT is not accepted. Only fixed task names with strict params are dispatched; the worker maps names to its own code and rejects unknown tasks; no code travels over HTTP or WebSocket. Frames are schema-validated and size-capped; job messages for jobs a worker does not hold are ignored. Browser streams authenticate with a first-frame JWT so tokens stay out of URLs/logs. Dataset contents (commit authors, messages, file stats from repos the job owner can read) are sent to the worker - use a worker you trust.

## Logging
JSON to stdout with request id, route, status, duration, user id. A redaction layer masks values under keys like `password/secret/token/authorization/api_key/content` and scrubs Bearer tokens, JWTs and `AstraCS:` tokens from messages. Tracebacks are reduced to `ExcType: message` (redacted). Git failures log category + op only. Source files are never logged.

## Known limitations
- Per-repo write lock and rate limits are process-local.
- No email verification, password reset, MFA or account deletion endpoints yet.
- `JWT_SECRET` rotation = all sessions end.
- The Astra integration has not been exercised against a live Astra database in this repository's test run.
- Presigned R2 URLs are bearer URLs for their lifetime.
