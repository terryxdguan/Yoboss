// Sentry event scrubber — redacts secret-shaped keys before events leave
// the process.
//
// Why this exists: the Sentry init in this project enables both
// `sendDefaultPii: true` and `includeLocalVariables: true`, which is the
// right tradeoff for a small B2C app (rich debugging context without a
// dedicated PII separation layer) but means every uncaught exception
// ships local-variable scopes and request bodies to Sentry. In practice
// those locals contain things we never want to leave the process:
//
//   • Anthropic API key (read into a local in lib/ai/client.ts)
//   • Stripe webhook raw body and signature header
//   • Full chat `message` / `fullMessage` strings (users paste API keys,
//     personal data, occasionally credentials into chats)
//   • DEV_AUTH_BYPASS_PASSWORD if a dev exception fires
//
// `beforeSend` is the only hook Sentry guarantees runs before transport.
// We use it to walk the event and redact values keyed by anything
// matching our sensitive-name list.

const REDACTED = "[scrubbed]" as const;

// Substring match (case-insensitive). Keep this list narrow — broad
// matches like "name" or "id" would over-redact and make events useless.
const SENSITIVE_KEY_PATTERNS = [
  // Generic secrets
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "x-api-key",
  "cookie",
  // Provider-specific
  "anthropic_api_key",
  "stripe_secret_key",
  "stripe-signature",
  "supabase_service_role_key",
  "service_role_key",
  "webhook_secret",
  "dev_auth_bypass_password",
  // App-level user content that has historically leaked sensitive
  // user-pasted material into Sentry. These keys are local-variable
  // names from the AI route handlers; redact unconditionally.
  "fullmessage",
  "rawbody",
] as const;

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pat) => k.includes(pat));
}

// Recursively walk a value and redact any sub-property whose key matches
// the sensitive list. Non-object values pass through unchanged. Arrays
// are walked element-wise. Cycle protection is via a visited set —
// Sentry events occasionally include cyclic references in
// `event.contexts`.
function scrubValue(value: unknown, visited: WeakSet<object>): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, visited));
  }
  if (typeof value !== "object") return value;
  if (visited.has(value as object)) return value;
  visited.add(value as object);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = scrubValue(v, visited);
    }
  }
  return out;
}

// Sentry's published Event type changes across SDK versions; we accept
// `unknown` and narrow with shape checks rather than coupling to one
// version's interface.
type AnyRecord = Record<string, unknown>;

export function scrubSentryEvent(event: unknown): unknown {
  if (!event || typeof event !== "object") return event;
  const e = event as AnyRecord;
  const visited = new WeakSet<object>();

  if (e.extra) e.extra = scrubValue(e.extra, visited) as AnyRecord;
  if (e.contexts) e.contexts = scrubValue(e.contexts, visited) as AnyRecord;
  if (e.tags) e.tags = scrubValue(e.tags, visited) as AnyRecord;

  // Locals captured by includeLocalVariables live on each stack frame as
  // `vars`. Walk every exception's stacktrace.
  const exception = e.exception as { values?: Array<AnyRecord> } | undefined;
  if (exception?.values) {
    for (const ex of exception.values) {
      const stack = ex.stacktrace as { frames?: Array<AnyRecord> } | undefined;
      if (stack?.frames) {
        for (const frame of stack.frames) {
          if (frame.vars) frame.vars = scrubValue(frame.vars, visited) as AnyRecord;
        }
      }
    }
  }

  // Request body is the most common silent-leak path (e.g., Stripe webhook
  // raw body, agent-chat message). Drop it entirely — URL + scrubbed
  // headers are enough to triage. Cookies are dropped for the same reason.
  const req = e.request as AnyRecord | undefined;
  if (req) {
    if ("data" in req) req.data = REDACTED;
    if ("cookies" in req) req.cookies = REDACTED;
    if (req.headers) req.headers = scrubValue(req.headers, visited) as AnyRecord;
  }

  // Breadcrumbs may carry outgoing-HTTP details (e.g., Authorization
  // header on a fetch breadcrumb).
  const breadcrumbs = e.breadcrumbs as Array<AnyRecord> | undefined;
  if (Array.isArray(breadcrumbs)) {
    for (const bc of breadcrumbs) {
      if (bc.data) bc.data = scrubValue(bc.data, visited) as AnyRecord;
    }
  }

  return e;
}
