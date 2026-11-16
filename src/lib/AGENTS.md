<!-- AGENT-MEMORY:BEGIN -->
- Tasks use additive backed-up SQLite tables, civil Budapest dates and bounded read-time generation; unique approval snapshots are future personal-ledger sources, not balances. Parent ACL and revision checks run inside every task transaction.
- Media filters use per-user keys in the existing NAS store; migrate legacy browser values only into missing keys so family preferences remain isolated.
- Integration credentials remain server-only after durable writes; expire browser copies and require settings authorization for legacy imports.
- Node account storage failures fail closed; detect hosted Workers by their runtime user agent before opening SQLite, since their virtual filesystem is not NAS storage. Hosted previews cannot manage NAS family accounts.
- Missing solar flow fields remain nullable; self-sufficiency requires measured load and import, and first-plant flow is distinct from aggregate production.
- Family phase 1 adds only independent SQLite tables after a mandatory pre-upgrade snapshot; the first existing active admin is tagged as owner without rewriting users/sessions, and child_profiles never become login credentials. Keep owner-only security administration separate from parent family permissions.
- Manual scenes use additive SQLite tables with a mandatory pre-upgrade snapshot, and plain shared device transports rather than nested server-function RPCs; scene and per-device ACL are checked again before each step. Never auto-resume interrupted physical commands.
- Device locks are shared between scene and direct Gree/Tuya/blind handlers in the single NAS Node process; API acceptance is not proof of physical state, and child login accounts need explicit scene and device grants.
<!-- AGENT-MEMORY:END -->