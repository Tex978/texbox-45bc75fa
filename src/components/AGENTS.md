<!-- AGENT-MEMORY:BEGIN -->
- StreamingBrowse is embedded in Search and reuses existing streaming queries/cache keys; the legacy streaming route redirects rather than implementing another UI.
- Session/profile UI must render loading, error, preview and expired states with recovery controls; never hide the account affordance when the me query fails, and revalidate on mount/focus and periodically.
<!-- AGENT-MEMORY:END -->