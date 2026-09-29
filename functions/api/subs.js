/* 訂閱管家 — /api/subs 訂閱 CRUD
 * GET  /api/subs        列表
 * POST /api/subs        新增
 * （單筆操作由 functions/api/subs/[id].js 代理進來，共用下方 export 的函數）
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  cycle TEXT NOT NULL DEFAULT 'monthly',
  cycle_days INTEGER,
  first_billing TEXT NOT NULL,
  pay_method TEXT DEFAULT '',
  category TEXT DEFAULT '',
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  trial_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

// 自癒建表：DB 未綁定時回 JSON 500（錯誤碼 db_not_bound），不拋例外。
// 回傳 null 表示可用；回傳 Response 表示已產生錯誤回應，呼叫端直接 return。
export async function ensureSchema(env) {
  if (!env || !env.DB) {
    return new Response(
      JSON.stringify({ ok: false, error: 'db_not_bound', message: 'D1 資料庫未綁定（DB）' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  await env.DB.exec(SCHEMA);
  return null;
}

const FIELDS = ['name', 'amount', 'currency', 'cycle', 'cycle_days',
  'first_billing', 'pay_method', 'category', 'note', 'status', 'trial_end'];

const VALID_CYCLES = ['weekly', 'monthly', 'quarterly', 'halfyear', 'yearly', 'custom'];
const VALID_STATUS = ['trial', 'active', 'paused', 'cancelled'];

function cleanSub(input) {
  const out = {};
  if (typeof input.name !== 'string' || !input.name.trim()) {
    return { error: 'name 必填' };
  }
  out.name = input.name.trim().slice(0, 100);
  out.amount = Math.max(0, Number(input.amount) || 0);
  out.currency = String(input.currency || 'TWD').toUpperCase() === 'USD' ? 'USD' : 'TWD';
  out.cycle = VALID_CYCLES.includes(input.cycle) ? input.cycle : 'monthly';
  out.cycle_days = out.cycle === 'custom' ? Math.max(1, parseInt(input.cycle_days, 10) || 30) : null;
  if (typeof input.first_billing !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.first_billing)) {
    return { error: 'first_billing 格式須為 YYYY-MM-DD' };
  }
  out.first_billing = input.first_billing;
  out.pay_method = String(input.pay_method || '').slice(0, 50);
  out.category = String(input.category || '').slice(0, 30);
  out.note = String(input.note || '').slice(0, 500);
  out.status = VALID_STATUS.includes(input.status) ? input.status : 'active';
  out.trial_end = (out.status === 'trial' && /^\d{4}-\d{2}-\d{2}$/.test(input.trial_end || ''))
    ? input.trial_end : null;
  return out;
}

export async function listSubs(env) {
  const r = await env.DB.prepare('SELECT * FROM subs ORDER BY created_at DESC, id DESC').all();
  return r.results || [];
}

export async function createSub(env, input) {
  const c = cleanSub(input);
  if (c.error) return { error: c.error };
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO subs (name, amount, currency, cycle, cycle_days, first_billing,
      pay_method, category, note, status, trial_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(c.name, c.amount, c.currency, c.cycle, c.cycle_days, c.first_billing,
    c.pay_method, c.category, c.note, c.status, c.trial_end, now, now).run();
  const row = await env.DB.prepare('SELECT * FROM subs WHERE id = ?').bind(r.meta.last_row_id).first();
  return { row };
}

export async function getSub(env, id) {
  return env.DB.prepare('SELECT * FROM subs WHERE id = ?').bind(id).first();
}

export async function updateSub(env, id, input) {
  const old = await getSub(env, id);
  if (!old) return { error: 'not_found', status: 404 };
  const merged = Object.assign({}, old, input);
  const c = cleanSub(merged);
  if (c.error) return { error: c.error, status: 400 };
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE subs SET name=?, amount=?, currency=?, cycle=?, cycle_days=?, first_billing=?,
      pay_method=?, category=?, note=?, status=?, trial_end=?, updated_at=? WHERE id=?`
  ).bind(c.name, c.amount, c.currency, c.cycle, c.cycle_days, c.first_billing,
    c.pay_method, c.category, c.note, c.status, c.trial_end, now, id).run();
  return { row: await getSub(env, id) };
}

export async function deleteSub(env, id) {
  const old = await getSub(env, id);
  if (!old) return { error: 'not_found', status: 404 };
  await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(id).run();
  return { ok: true };
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export async function onRequestGet({ env }) {
  try {
    const blocked = await ensureSchema(env);
    if (blocked) return blocked;
    return json({ ok: true, subs: await listSubs(env) });
  } catch (e) {
    return json({ ok: false, error: 'server_error', message: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const blocked = await ensureSchema(env);
    if (blocked) return blocked;
    let body = {};
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json' }, 400); }
    const r = await createSub(env, body);
    if (r.error) return json({ ok: false, error: r.error }, 400);
    return json({ ok: true, sub: r.row }, 201);
  } catch (e) {
    return json({ ok: false, error: 'server_error', message: String((e && e.message) || e) }, 500);
  }
}
