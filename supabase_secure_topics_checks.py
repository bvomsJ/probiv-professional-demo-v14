from pathlib import Path
root = Path(__file__).resolve().parents[1]
sql = (root / 'supabase' / '003_secure_topics_and_persistence.sql').read_text().lower()
adapter = (root / 'supabase-adapter.js').read_text()
thread = (root / 'thread.html').read_text()
site = (root / 'site.js').read_text()
checks = {
    'topics stored in normalized table': 'create table if not exists public.forum_threads' in sql,
    'public RLS filters invite-only topics': "guest_access = 'public'" in sql and 'create policy forum_threads_visible_read' in sql,
    'migration removes topics from public JSON': "result_state jsonb := coalesce(p_state, '{}'::jsonb) - 'threads'" in sql,
    'admin save RPC strips threads from app_state': "coalesce(p_state, '{}'::jsonb) - 'threads'" in sql,
    'adapter reads RLS-filtered forum_threads': "from('forum_threads').select('data')" in adapter,
    'adapter persists through transaction RPC': "rpc('admin_save_site_state'" in adapter,
    'thread page waits for Supabase': 'await window.SupabaseReady' in thread,
    'thread page fails closed on remote error': 'Не удалось проверить доступ' in thread,
    'preview/localStorage are not Supabase authorization': 'stale localstorage' in site.lower() and 'window.__remoteRole' in site,
}
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL') + ' ' + name)
if not all(checks.values()):
    raise SystemExit(1)
