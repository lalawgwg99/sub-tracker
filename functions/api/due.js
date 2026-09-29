/* 訂閱管家 — GET /api/due 到期提醒
* 回傳 7 天內要扣款的訂閱與 3 天內試用期到期的訂閱。
* 若環境變數有 RESEND_API_KEY 與 REMIND_EMAIL，會用 Resend API 發 email 通知；
* 沒有設定則只回 JSON（不影響排程打卡）。
* 建議用 cron-job.org 每天定時打這個端點一次。
*/
import { getDue, todayStr, toTWD} from '../logic.js';
import { ensureSchema} from './subs.js';

function money(n) {
return 'NT$' + Math.round(n).toLocaleString('en-US');
}

function buildText(due, today) {
const lines = ['到期提醒（' + today + '）', ''];
if (due.trialEnding.length) {
lines.push('■ 試用即將到期（3 天內）：');
due.trialEnding.forEach(function (it) {
const s = it.sub;
lines.push(`・${s.name}：試用 ${s.trial_end} 到期（剩 ${it.daysLeft} 天），之後 ${s.currency === 'USD'? 'US$' + s.amount: 'NT$' + s.amount}/${cycleLabel(s.cycle)} 扣款`);
});
lines.push('');
}
if (due.dueSoon.length) {
lines.push('■ 7 天內扣款：');
due.dueSoon.forEach(function (it) {
const s = it.sub;
const when = it.daysLeft === 0? '今天': it.daysLeft + ' 天後';
lines.push(`・${s.name}：${it.date}（${when}）扣 ${s.currency === 'USD'? 'US$' + s.amount: 'NT$' + s.amount}`);
});
lines.push('');
}
lines.push('USD 以 1:32 換算為估算值。');
return lines.join('\n');
}

function cycleLabel(cycle) {
return { weekly: '週', monthly: '月', quarterly: '季', halfyear: '半年', yearly: '年', custom: '自訂'}[cycle] || '月';
}

async function sendResendEmail(env, subject, text) {
if (!env.RESEND_API_KEY ||!env.REMIND_EMAIL) {
return { sent: false, reason: 'missing_config'};
}
const from = env.RESEND_FROM || '訂閱管家 <onboarding@resend.dev>';
try {
const resp = await fetch('https://api.resend.com/emails', {
method: 'POST',
headers: {
'Authorization': 'Bearer ' + env.RESEND_API_KEY,
'Content-Type': 'application/json'
},
body: JSON.stringify({ from: from, to: [env.REMIND_EMAIL], subject: subject, text: text})
});
let detail = null;
try { detail = await resp.json();} catch (e) { /* ignore */}
return { sent: resp.ok, status: resp.status, detail: detail};
} catch (e) {
return { sent: false, reason: 'fetch_error', detail: String(e)};
}
}

export async function onRequestGet({ env}) {
const blocked = await ensureSchema(env);
if (blocked) return blocked;
const today = todayStr();
const rows = await env.DB.prepare('SELECT * FROM subs').all();
const due = getDue(rows.results || [], today);

let email = { sent: false, reason: 'nothing_due'};
if (due.dueSoon.length || due.trialEnding.length) {
const subject = '' + today + ' 到期提醒（' +
(due.dueSoon.length + due.trialEnding.length) + ' 筆）';
email = await sendResendEmail(env, subject, buildText(due, today));
}

return new Response(JSON.stringify({
ok: true,
today: today,
dueSoon: due.dueSoon,
trialEnding: due.trialEnding,
email: email
}), { headers: { 'Content-Type': 'application/json'}});
}
