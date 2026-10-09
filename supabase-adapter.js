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
  let readyResolve;
  let saveQueue = Promise.resolve();
  window.SupabaseReady = new Promise(resolve => { readyResolve = resolve; });
  window.__remoteStateLoaded = false;
  window.__remoteRole = null;
  window.__remoteAuthenticated = false;

  function publicState() {
    const state = JSON.parse(JSON.stringify(window.DEMO_DB || {}));
    delete state.adminAuth;
    delete state.invites; // invitation codes are never published in the public JSON state
    // Topic bodies and posts live in forum_threads, where RLS can hide closed topics.
    delete state.threads;
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
    if (!client) return { ok: false, reason: 'Сервис базы данных не настроен.' };
    const [{ data, error }, threadResult, indexResult] = await Promise.all([
      client.from('app_state').select('state').eq('id', 1).maybeSingle(),
      client.from('forum_threads').select('id,data,guest_access').order('id', { ascending: true }),
      client.from('forum_topic_index').select('id,title,category,author,topic_date,views,answers,pinned,guest_access').order('id', { ascending: true })
    ]);
    if (error) return { ok: false, reason: error.message };
    if (threadResult.error) return { ok: false, reason: 'Загрузка содержимого тем: ' + threadResult.error.message };
    if (indexResult.error) return { ok: false, reason: 'Загрузка списка тем: ' + indexResult.error.message + '. Примените миграцию 006_topic_listing_index.sql.' };
    const remoteState = data && data.state ? data.state : {};
    try {
      window.__remoteRole = await getRole();
      const authResult = await client.auth.getUser();
      window.__remoteAuthenticated = !!(authResult && authResult.data && authResult.data.user);
    } catch (_) { window.__remoteRole = null; window.__remoteAuthenticated = false; }
    // Topic titles/metadata are public in forum_topic_index; bodies remain protected by RLS in forum_threads.
    // For a closed topic that a guest cannot read, return a metadata-only placeholder, never its posts/body.
    const bodyById = new Map((threadResult.data || []).filter(row => row && row.data).map(row => [String(row.id), row]));
    const remoteThreads = (indexResult.data || []).map(meta => {
      if (!meta) return null;
      const body = bodyById.get(String(meta.id));
      const base = body && body.data ? body.data : {
        id: meta.id, title: meta.title, category: meta.category, author: meta.author,
        date: meta.topic_date, views: meta.views, answers: meta.answers, pinned: meta.pinned,
        posts: [], mediaIds: [], _metadataOnly: true
      };
      return Object.assign({}, base, {
        id: meta.id,
        title: meta.title,
        category: meta.category,
        author: meta.author,
        date: meta.topic_date,
        views: Number(meta.views) || 0,
        answers: Number(meta.answers) || 0,
        pinned: !!meta.pinned,
        guestAccess: meta.guest_access === 'invite' ? 'invite' : 'public',
        _metadataOnly: !body
      });
    }).filter(Boolean);
    const merged = Object.assign({}, window.DEMO_DB || {}, remoteState);
    merged.threads = remoteThreads;
    delete merged.adminAuth;
    delete merged.invites;
    window.DEMO_DB = merged;
    window.__remoteStateLoaded = true;
    // Media metadata and public URLs are sourced from the dedicated media table.
    const mediaResult = await refreshMediaMetadata();
    if (!mediaResult.ok) console.warn('[Supabase] media metadata read failed:', mediaResult.reason);
    lastRemoteHash = hash({ state: remoteState, threads: remoteThreads });
    try {
      localStorage.setItem('PROBIV_DEMO_DB', JSON.stringify(window.DEMO_DB));
      localStorage.setItem('PROBIV_DB_VERSION', 'v10-supabase');
    } catch (_) {}
    try { await refreshAdminInvites(); } catch (e) { console.warn('[Supabase] invite load failed:', e.message); }
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
      if (!verifiedAdmin) return { ok: false, reason: 'Только администратор может сохранять изменения сайта.' };
      const state = publicState();
      const threads = (window.DEMO_DB && Array.isArray(window.DEMO_DB.threads)) ? window.DEMO_DB.threads : [];
      const saveResult = await client.rpc('admin_save_site_state', { p_state: state, p_threads: threads });
      if (saveResult.error) return { ok: false, reason: saveResult.error.message };
      const invites = (window.DEMO_DB && Array.isArray(window.DEMO_DB.invites)) ? window.DEMO_DB.invites : [];
      const inviteResult = await client.rpc('admin_replace_invites', { p_invites: invites });
      if (inviteResult.error) return { ok: false, reason: inviteResult.error.message };
      lastRemoteHash = hash({ state, threads });
      return { ok: true };
    } catch (e) { return { ok: false, reason: e.message || String(e) }; }
    finally { syncBusy = false; }
  }

  async function verifyTopic(id, expectedAccess, expectedTitle) {
    if (!client) return { ok: false, reason: 'Сервис базы данных не настроен.' };
    try {
      await requireVerifiedAdmin();
      const { data, error } = await client.from('forum_threads')
        .select('id,guest_access,data')
        .eq('id', Number(id))
        .maybeSingle();
      if (error) return { ok: false, reason: 'Проверка сохранения темы: ' + error.message };
      if (!data) return { ok: false, reason: 'База данных не вернула сохранённую тему. Проверьте настройки доступа.' };
      const wanted = expectedAccess === 'invite' ? 'invite' : 'public';
      if (data.guest_access !== wanted) return { ok: false, reason: `Неверный доступ в базе: ожидался ${wanted}, записан ${data.guest_access}.` };
      if (expectedTitle && data.data && data.data.title !== expectedTitle) return { ok: false, reason: 'Заголовок в базе не совпадает с созданной темой.' };
      if (!data.data || (data.data.guestAccess === 'invite') !== (wanted === 'invite')) return { ok: false, reason: 'Поле guestAccess в данных темы не совпадает с guest_access.' };
      return { ok: true, topic: data.data, guest_access: data.guest_access };
    } catch (e) { return { ok: false, reason: e.message || String(e) }; }
  }

  async function requireVerifiedAdmin() {
    if (!client) throw new Error('Сервис базы данных не настроен.');
    const role = await getRole();
    verifiedAdmin = role === 'admin';
    if (!verifiedAdmin) throw new Error('Недостаточно прав: требуется роль администратора.');
    const { data: { user } = {}, error } = await client.auth.getUser();
    if (error || !user) throw new Error(error?.message || 'Сессия пользователя не найдена.');
    return user;
  }
  function mediaRowToUi(row) {
    return { id: row.id, name: row.name, alt: row.alt || '', href: row.href || '', type: row.content_type || '', src: row.public_url, storagePath: row.storage_path, enabled: row.enabled !== false };
  }
  async function uploadMediaFile(file, metadata = {}) {
    const user = await requireVerifiedAdmin();
    if (!(file instanceof File)) throw new Error('Файл не выбран.');
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','image/avif'];
    if (!allowed.includes(file.type)) throw new Error('Поддерживаются JPG, PNG, WebP, GIF и AVIF.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Максимальный размер файла — 10 МБ.');
    const cleanName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100) || 'image';
    const id = 'm' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const storagePath = `admin/${user.id}/${id}-${cleanName}`;
    const { error: uploadError } = await client.storage.from('probiv-media').upload(storagePath, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
    if (uploadError) throw new Error('Storage upload: ' + uploadError.message);
    const { data: urlData } = client.storage.from('probiv-media').getPublicUrl(storagePath);
    const row = {
      id, name: String(metadata.name || file.name).trim().slice(0, 160) || file.name,
      alt: String(metadata.alt || '').slice(0, 500), href: String(metadata.href || '').slice(0, 2000),
      content_type: file.type, storage_path: storagePath, public_url: urlData.publicUrl,
      enabled: true, created_by: user.id, updated_at: new Date().toISOString()
    };
    const { data, error: insertError } = await client.from('media').insert(row).select('*').single();
    if (insertError) {
      await client.storage.from('probiv-media').remove([storagePath]).catch(() => {});
      throw new Error('Не удалось сохранить метаданные media: ' + insertError.message);
    }
    return mediaRowToUi(data);
  }
  async function updateMediaRecord(item) {
    await requireVerifiedAdmin();
    if (!item?.id || !item.storagePath) throw new Error('Это старый локальный файл. Загрузите его заново через медиатеку.');
    const patch = { name: String(item.name || '').trim().slice(0, 160), alt: String(item.alt || '').slice(0, 500), href: String(item.href || '').slice(0, 2000), enabled: item.enabled !== false, updated_at: new Date().toISOString() };
    const { data, error } = await client.from('media').update(patch).eq('id', item.id).select('*').maybeSingle();
    if (error) throw new Error('Не удалось обновить media: ' + error.message);
    if (!data) throw new Error('Запись медиа не найдена. Загрузите файл заново через медиатеку.');
    return mediaRowToUi(data);
  }
  async function deleteMediaRecord(id) {
    await requireVerifiedAdmin();
    const { data: row, error: readError } = await client.from('media').select('id,storage_path').eq('id', id).maybeSingle();
    if (readError) throw new Error('Не удалось найти медиа: ' + readError.message);
    if (!row) return { ok: true, missing: true };
    const { error: deleteError } = await client.from('media').delete().eq('id', id);
    if (deleteError) throw new Error('Не удалось удалить метаданные: ' + deleteError.message);
    if (row.storage_path) {
      const { error: storageError } = await client.storage.from('probiv-media').remove([row.storage_path]);
      if (storageError) console.warn('[Supabase] metadata deleted, but Storage file could not be removed:', storageError.message);
    }
    return { ok: true };
  }
  async function refreshMediaMetadata() {
    if (!client) return { ok: false };
    let query = client.from('media').select('*').order('created_at', { ascending: false });
    let role = null;
    try { role = await getRole(); } catch (_) {}
    if (role !== 'admin') query = query.eq('enabled', true);
    const { data, error } = await query;
    if (error) return { ok: false, reason: error.message };
    window.DEMO_DB = window.DEMO_DB || {};
    window.DEMO_DB.media = (data || []).map(mediaRowToUi);
    return { ok: true, count: window.DEMO_DB.media.length };
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
      localUser = { id: numericId, name: profile.username || (authUser.email || 'Участник').split('@')[0], rating: 0, posts: 0, likes: 0, dislikes: 0, joined: new Date().toLocaleDateString('ru-RU'), avatar: String(profile.username || 'У').slice(0,1).toUpperCase(), color: '#65745c', online: true, usdt: 0, guarant: 0, deposits: 0, awards: [], bio: 'Профиль участника форума.', status: 'Участник' };
      window.DEMO_DB.users.push(localUser);
    }
    window.__remoteRole = profile.role || null;
    localUser.supabaseUid = authUser.id;
    localUser.role = profile.role === 'admin' ? 'Администратор' : 'Участник';
    if (/supabase/i.test(String(localUser.bio || ''))) localUser.bio = 'Профиль участника форума.';
    // Hide auto-generated technical usernames from the public profile UI.
    if (/^test_[0-9a-f]{8}$/i.test(String(localUser.name || ''))) {
      localUser.name = profile.role === 'admin' ? 'Администратор' : 'Участник';
      localUser.avatar = localUser.name.slice(0, 1);
    }
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
    if (!client) throw new Error('Сервис базы данных не настроен. Проверьте supabase-config.js.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const role = await getRole(); verifiedAdmin = role === 'admin';
    await syncLocalProfile(data.user);
    return { user: data.user, role };
  }
  async function signUp(email, password, username, inviteCode) {
    if (!client) throw new Error('Сервис базы данных не настроен. Проверьте supabase-config.js.');
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
      if (!verifiedAdmin) { alert('Для этого действия нужна учётная запись администратора.'); location.href = 'login.html?return=admin.html'; }
      return verifiedAdmin;
    } catch (e) { alert('Не удалось проверить права администратора: ' + e.message); location.href = 'login.html'; return false; }
  }
  window.SupabaseAdapter = { enabled, client, signIn, signUp, signOut, getRole, refreshState, persistState, verifyTopic, requireAdmin, uploadMediaFile, updateMediaRecord, deleteMediaRecord, refreshMediaMetadata,
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
        window.__remoteRole = null;
        window.__remoteAuthenticated = false;
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
      if (!result.ok) console.warn('[Supabase] state read failed:', result.reason);
      if (result.loaded) {
        if (typeof window.renderHome === 'function') window.renderHome();
        if (typeof window.renderThread === 'function') window.renderThread();
      }
      readyResolve(result);
    }).catch(e => { console.warn('[Supabase] state read failed:', e.message); readyResolve({ ok: false, reason: e.message }); });
    const originalSave = window.saveDB;
    if (typeof originalSave === 'function') {
      window.saveDB = function () {
        const localOk = originalSave.apply(this, arguments);
        saveQueue = saveQueue.catch(() => {}).then(() => persistState());
        window.__supabasePersistPromise = saveQueue.then(r => {
          if (!r.ok && r.reason !== 'Только администратор может сохранять изменения сайта.') console.warn('[Supabase] save failed:', r.reason);
          if (!r.ok && window.isAdmin && window.isAdmin()) alert('Изменение сохранено только в этом браузере, но не в базе: ' + r.reason);
          return r;
        });
        return localOk;
      };
      window.saveDemoDB = window.saveDB;
    }
  } else { readyResolve({ ok: false, reason: 'Сервис базы данных не настроен.' }); }
})();
