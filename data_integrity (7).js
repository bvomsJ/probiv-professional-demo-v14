// Seed-data integrity check. Usage: node tests/data_integrity.js [project_dir]
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
global.window = {}; global.location = { search: '', href: 'http://x/' };
const mk = () => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => (s[k] = String(v)), removeItem: k => delete s[k] }; };
global.localStorage = mk(); global.sessionStorage = mk();
eval(fs.readFileSync(path.join(root, 'data.js'), 'utf8'));
const db = window.DEMO_DB, err = [];
const dup = a => a.filter((x, i) => a.indexOf(x) !== i);
['users', 'threads', 'categories'].forEach(k => { const d = dup(db[k].map(x => x.id)); if (d.length) err.push('duplicate ' + k + ' ids ' + d); });
const uid = new Set(db.users.map(u => u.id)), cat = new Set(db.categories.map(c => c.name));
db.threads.forEach(t => {
  if (!uid.has(t.author)) err.push('thread ' + t.id + ' bad author');
  if (!cat.has(t.category)) err.push('thread ' + t.id + ' bad category');
  if (!t.posts.length) err.push('thread ' + t.id + ' has no posts');
  t.posts.forEach((p, i) => { if (!uid.has(p.user)) err.push('thread ' + t.id + ' post ' + i + ' bad user'); });
});
db.recent.forEach(r => { if (!uid.has(r.author)) err.push('recent bad author: ' + r.title); if (!db.threads.some(t => t.title === r.title)) err.push('recent without thread: ' + r.title); });
db.hotTopics.forEach(h => { if (!db.threads.some(t => t.title === h.title)) err.push('hotTopic without thread: ' + h.title); });
const now = new Date(2026, 9, 9);
db.users.forEach(u => { const [d, m, y] = String(u.joined).split('.').map(Number); if (new Date(y, m - 1, d) > now) err.push('user ' + u.id + ' joined in the future'); });
if (!db.adminAuth) err.push('adminAuth missing (demo login would fail)');
if (err.length) { console.log(err.join('\n')); process.exit(1); }
console.log('ok: ' + db.users.length + ' users, ' + db.threads.length + ' threads, ' + db.categories.length + ' categories');
