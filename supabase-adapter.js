/* Supabase bridge for the existing static UI. It intentionally keeps the visual layer intact. */
(function () {
  'use strict';
  const cfg = window.SUPABASE_CONFIG || {};
  const api = window.supabase;
  const enabled = !!(api && cfg.url && cfg.publishableKey);
  const client = enabled ? api.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  let verifiedAdmin = false;
  let syncBusy = false;
  let lastRemoteHash = '';

  function publicState() {
    const state = JSON.parse(JSON.stringify(window.DEMO_DB || {}));
    delete state.adminAuth;
    delete state.invites; // invitation codes are never published in the public JSON state
    if (Array.isArray(state.users)) state.users = state.users.map(u => {
      const copy = Object.assign({}, u); delete copy.passHash; delete copy.password; return copy;
    });
    return state;
  }
  function hash(value) { return JSON.stringify(value); }
  async function getRole() {
    if (!client) return null;
    const { data: { user } = {}, error: authError } = await client.auth.getUser();
    if (authError || !user) return null;
    const { data, error } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data && data.role || null;
  }
  async function refreshState() {
    if (!client) return { ok: false, reason: 'Supabase client is not configured.' };
    const { data, error } = await client.from('app_state').select('state').eq('id', 1).maybeSingle();
    if (error) return { ok: false, reason: error.message };
    if (!data || !data.state) {
      try { await refreshAdminInvites(); } catch (e) { console.warn('[Supabase] invite load failed:', e.message); }
      return { ok: true, empty: true };
    }
    // Remote state is sanitized at write time. Merge only fields supported by the current UI.
    const previousHash = hash(publicState());
    const merged = Object.assign({}, window.DEMO_DB || {}, data.state);
    delete merged.adminAuth;
    window.DEMO_DB = merged;
    lastRemoteHash = hash(data.state);
    try {
      localStorage.setItem('PROBIV_DEMO_DB', JSON.stringify(merged));
      localStorage.setItem('PROBIV_DB_VERSION', 'v10-supabase');
    } catch (_) {}
    try { await refreshAdminInvites(); } catch (e) { console.warn('[Supabase] invite load failed:', e.message); }
    if (previousHash !== lastRemoteHash && sessionStorage.getItem('PROBIV_REMOTE_APPLIED') !== lastRemoteHash) {
      sessionStorage.setItem('PROBIV_REMOTE_APPLIED', lastRemoteHash);
      location.reload();
    }
    return { ok: true, loaded: true };
  }
  async function refreshAdminInvites() {
    if (!client) return;
    const role = await getRole();
    verifiedAdmin = role === 'admin';
    if (!verifiedAdmin) return;
    const { data, error } = await client.from('invites').select('code,label,active,max_uses,uses');
    if (error) throw error;
    window.DEMO_DB.invites = (data || []).map(i => ({ code: i.code, label: i.label, active: i.active, maxUses: i.max_uses, uses: i.uses }));
  }
  async function persistState() {
    if (!client || syncBusy) return { ok: false, reason: 'Supabase unavailable or sync already running.' };
    syncBusy = true;
    try {
      const role = await getRole();
      verifiedAdmin = role === 'admin';
      if (!verifiedAdmin) return { ok: false, reason: 'Only a Supabase admin can publish shared site changes.' };
      const state = publicState();
      const { data: { user } } = await client.auth.getUser();
      const { error } = await client.from('app_state').upsert({ id: 1, state, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: 'id' });
      if (error) return { ok: false, reason: error.message };
      const invites = (window.DEMO_DB && Array.isArray(window.DEMO_DB.invites)) ? window.DEMO_DB.invites : [];
      const inviteResult = await client.rpc('admin_replace_invites', { p_invites: invites });
      if (inviteResult.error) return { ok: false, reason: inviteResult.error.message };
      lastRemoteHash = hash(state);
      return { ok: true };
    } catch (e) { return { ok: false, reason: e.message || String(e) }; }
    finally { syncBusy = false; }
  }
  // Keep the legacy forum UI linked to the authenticated Supabase profile.
  // This is a display/compatibility mapping only; permissions are always checked via profiles.role.
  async function syncLocalProfile(authUser) {
    if (!client || !authUser) return null;
    const { data: profile, error } = await client.from('profiles')
      .select('username,role').eq('id', authUser.id).maybeSingle();
    if (error) throw error;
    if (!profile) return null;
    window.DEMO_DB = window.DEMO_DB || {};
    if (!Array.isArray(window.DEMO_DB.users)) window.DEMO_DB.users = [];
    let localUser = window.DEMO_DB.users.find(u =>
      String(u.supabaseUid || '') === authUser.id ||
      String(u.name || '').toLowerCase() === String(profile.username || '').toLowerCase()
    );
    if (!localUser) {
      let numericId = 0;
      for (const ch of authUser.id.replace(/-/g, '').slice(0, 8)) numericId = (numericId * 31 + ch.charCodeAt(0)) % 2000000000;
      numericId = Math.max(100000, numericId);
      while (window.DEMO_DB.users.some(u => Number(u.id) === numericId)) numericId = numericId >= 2000000000 ? 100000 : numericId + 1;
      localUser = { id: numericId, name: profile.username || (authUser.email || 'Участник').split('@')[0], rating: 0, posts: 0, likes: 0, dislikes: 0, joined: new Date().toLocaleDateString('ru-RU'), avatar: String(profile.username || 'У').slice(0,1).toUpperCase(), color: '#65745c', online: true, usdt: 0, guarant: 0, deposits: 0, awards: [], bio: 'Профиль участника Supabase.', status: 'Участник' };
      window.DEMO_DB.users.push(localUser);
    }
    localUser.supabaseUid = authUser.id;
    localUser.role = profile.role === 'admin' ? 'Администратор' : 'Участник';
    localUser.status = profile.role === 'admin' ? 'Администратор' : (localUser.status || 'Участник');
    localStorage.setItem('PROBIV_USER_ID', String(localUser.id));
    localStorage.setItem('PROBIV_MEMBER', '1');
    localStorage.setItem('PROBIV_AUTH_UID', authUser.id);
    try {
      localStorage.setItem('PROBIV_DEMO_DB', JSON.stringify(window.DEMO_DB));
      localStorage.setItem('PROBIV_DB_VERSION', window.DEMO_DB_VERSION || 'v10-supabase');
    } catch (e) { console.warn('[Supabase] local profile mapping persistence failed:', e.message); }
    return localUser;
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Supabase не настроен. Проверьте supabase-config.js.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const role = await getRole(); verifiedAdmin = role === 'admin';
    await syncLocalProfile(data.user);
    return { user: data.user, role };
  }
  async function signUp(email, password, username, inviteCode) {
    if (!client) throw new Error('Supabase не настроен. Проверьте supabase-config.js.');
    const { data, error } = await client.auth.signUp({
      email, password,
      options: { data: { username: username.trim(), invite_code: inviteCode.trim() } }
    });
    if (error) throw error;
    return data;
  }
  async function signOut() {
    if (client) await client.auth.signOut();
    verifiedAdmin = false;
    ['PROBIV_MEMBER','PROBIV_USER_ID','PROBIV_INVITE_CODE','PROBIV_ADMIN','PROBIV_ADMIN_SESSION'].forEach(k => localStorage.removeItem(k));
  }
  async function requireAdmin() {
    if (!client) { location.href = 'login.html?return=admin.html'; return false; }
    try {
      const role = await getRole(); verifiedAdmin = role === 'admin';
      if (!verifiedAdmin) { alert('Нужна учётная запись Supabase с ролью admin.'); location.href = 'login.html?return=admin.html'; }
      return verifiedAdmin;
    } catch (e) { alert('Не удалось проверить права администратора: ' + e.message); location.href = 'login.html'; return false; }
  }
  window.SupabaseAdapter = { enabled, client, signIn, signUp, signOut, getRole, refreshState, persistState, requireAdmin,
    isAdmin: () => verifiedAdmin };
  window.isAdmin = () => verifiedAdmin;
  const originalLogout = window.logout;
  window.logout = async function () {
    try { await signOut(); } catch (e) { console.warn('[Supabase] sign out failed:', e.message); }
    if (typeof originalLogout === 'function') originalLogout();
    else location.href = 'login.html';
  };

  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      if (!session) {
        verifiedAdmin = false;
        ['PROBIV_MEMBER','PROBIV_USER_ID','PROBIV_AUTH_UID'].forEach(k => localStorage.removeItem(k));
        return;
      }
      // Supabase emits this during initial restore; defer queries to avoid auth-lock deadlocks.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        Promise.resolve().then(() => syncLocalProfile(session.user)).catch(e => console.warn('[Supabase] profile sync failed:', e.message));
        getRole().then(role => { verifiedAdmin = role === 'admin'; }).catch(e => console.warn('[Supabase] role check failed:', e.message));
      }
    });
    // State refresh is deliberately non-blocking so the static pages still render if the network is down.
    refreshState().then(result => {
      if (result.loaded) {
        if (typeof window.renderHome === 'function') window.renderHome();
        if (typeof window.renderThread === 'function') window.renderThread();
      }
      if (!result.ok) console.warn('[Supabase] state read failed:', result.reason);
    }).catch(e => console.warn('[Supabase] state read failed:', e.message));
    const originalSave = window.saveDB;
    if (typeof originalSave === 'function') {
      window.saveDB = function () {
        const localOk = originalSave.apply(this, arguments);
        persistState().then(r => {
          if (!r.ok && r.reason !== 'Only a Supabase admin can publish shared site changes.') console.warn('[Supabase] save failed:', r.reason);
          if (!r.ok && window.isAdmin && window.isAdmin()) alert('Локально сохранено, но в Supabase не записано: ' + r.reason);
        });
        return localOk;
      };
      window.saveDemoDB = window.saveDB;
    }
  }
})();
