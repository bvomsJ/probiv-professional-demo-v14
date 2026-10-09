#!/usr/bin/env python3
"""Lightweight static assertions for the Supabase migration (not a PostgreSQL execution test)."""
from pathlib import Path
import sys
sql = Path(__file__).resolve().parents[1] / 'supabase' / '001_schema.sql'
s = sql.read_text(encoding='utf-8').lower()
checks = {
    'RLS enabled on profiles': 'alter table public.profiles enable row level security' in s,
    'RLS enabled on invitations': 'alter table public.invites enable row level security' in s,
    'RLS enabled on shared app state': 'alter table public.app_state enable row level security' in s,
    'public state read policy exists': 'create policy app_state_public_read' in s,
    'app state writes require admin': "with check (public.is_app_admin())" in s and 'create policy app_state_admin_insert' in s,
    'invite writes require admin': 'create policy invites_admin_all' in s and 'using (public.is_app_admin())' in s,
    'signup trigger validates invitation': 'a valid invitation code is required' in s and 'invalid or exhausted invitation code' in s,
    'admin invite RPC checks role': 'if not public.is_app_admin() then raise exception' in s,
    'no anonymous invitation select grant': 'grant select on public.invites to anon' not in s,
    'no privileged key literal in SQL': 'sb_secret_' not in s and 'service_role key' not in s,
}
for name, ok in checks.items(): print(('PASS' if ok else 'FAIL') + ' ' + name)
failed = [k for k,v in checks.items() if not v]
print(f'\nSCHEMA STATIC: {len(checks)-len(failed)} PASS / {len(failed)} FAIL')
sys.exit(bool(failed))
