/* 訂閱管家 — /api/subs/:id 單筆操作（代理 functions/api/subs.js 的共用函數） */
import { ensureSchema, getSub, updateSub, deleteSub } from '../subs.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export async function onRequestGet({ env, params }) {
  try {
    const blocked = await ensureSchema(env);
    if (blocked) return blocked;
    const row = await getSub(env, params.id);
    if (!row) return json({ ok: false, error: 'not_found' }, 404);
    return json({ ok: true, sub: row });
  } catch (e) {
    return json({ ok: false, error: 'server_error', message: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestPut({ env, params, request }) {
  try {
    const blocked = await ensureSchema(env);
    if (blocked) return blocked;
    let body = {};
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json' }, 400); }
    const r = await updateSub(env, params.id, body);
    if (r.error) return json({ ok: false, error: r.error }, r.status || 400);
    return json({ ok: true, sub: r.row });
  } catch (e) {
    return json({ ok: false, error: 'server_error', message: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const blocked = await ensureSchema(env);
    if (blocked) return blocked;
    const r = await deleteSub(env, params.id);
    if (r.error) return json({ ok: false, error: r.error }, r.status || 400);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: 'server_error', message: String((e && e.message) || e) }, 500);
  }
}
