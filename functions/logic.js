/* 訂閱管家 — 核心日期邏輯（純函數）
 * 前端 public/logic.js 與後端 functions/logic.js 為同一份內容，保持一致。
 * 瀏覽器載入後掛在 window.SubLogic；Node / Workers 下用 module.exports / import。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SubLogic = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  // 本地日期字串 YYYY-MM-DD
  function todayStr(d) {
    d = d || new Date();
    return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function parseParts(s) {
    var p = String(s).split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  }

  function lastDayOf(y, m) { return new Date(y, m, 0).getDate(); }

  // 月相關週期：以原始 firstBilling 的「日」為錨點，加 n 個週期月數；
  // 若目標月份沒有該日（例 1/31 → 2月），取該月最後一天。
  function addMonthsAnchored(firstBilling, months) {
    var p = parseParts(firstBilling);
    var total = (p.m - 1) + months;
    var ny = p.y + Math.floor(total / 12);
    var nm = (total % 12) + 1;
    var nd = Math.min(p.d, lastDayOf(ny, nm));
    return fmtDate(ny, nm, nd);
  }

  function addDaysStr(dateStr, days) {
    var p = parseParts(dateStr);
    var d = new Date(p.y, p.m - 1, p.d);
    d.setDate(d.getDate() + days);
    return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function cycleMonths(cycle) {
    switch (cycle) {
      case 'monthly': return 1;
      case 'quarterly': return 3;
      case 'halfyear': return 6;
      case 'yearly': return 12;
      default: return 0;
    }
  }

  // 第 n 次扣款日（n 從 0 起，n=0 即 first_billing 本身）
  function billingAt(sub, n) {
    var first = sub.first_billing;
    if (sub.cycle === 'weekly') return addDaysStr(first, n * 7);
    if (sub.cycle === 'custom') {
      var days = parseInt(sub.cycle_days, 10);
      if (!days || days <= 0) days = 30;
      return addDaysStr(first, n * days);
    }
    return addMonthsAnchored(first, n * cycleMonths(sub.cycle));
  }

  // 下次扣款日：嚴格大於 today 的第一個扣款日
  function nextBilling(sub, today) {
    today = today || todayStr();
    var n = 0, date = billingAt(sub, 0), guard = 0;
    while (date <= today && guard < 5000) { n++; date = billingAt(sub, n); guard++; }
    return date;
  }

  // 某日（含當日）之後的第一個扣款日
  function billingOnOrAfter(sub, date) {
    var n = 0, d = billingAt(sub, 0), guard = 0;
    while (d < date && guard < 5000) { n++; d = billingAt(sub, n); guard++; }
    return d;
  }

  // dateStr 距 today 還有幾天（可為 0 或負數）
  function daysUntil(dateStr, today) {
    today = today || todayStr();
    var a = parseParts(dateStr), b = parseParts(today);
    var ms = Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d);
    return Math.round(ms / 86400000);
  }

  // 已發生扣款次數（扣款日 <= today）
  function billingCount(sub, today) {
    today = today || todayStr();
    var n = 0, count = 0, guard = 0;
    while (guard < 5000) {
      if (billingAt(sub, n) > today) break;
      count++; n++; guard++;
    }
    return count;
  }

  function totalPaid(sub, today) {
    return billingCount(sub, today) * Number(sub.amount || 0);
  }

  // 換算每月平均花費（原幣別）；年繳即 amount/12
  function monthlyAvg(sub) {
    var amt = Number(sub.amount || 0);
    switch (sub.cycle) {
      case 'weekly': return amt * 52 / 12;
      case 'monthly': return amt;
      case 'quarterly': return amt / 3;
      case 'halfyear': return amt / 6;
      case 'yearly': return amt / 12;
      case 'custom': {
        var days = parseInt(sub.cycle_days, 10);
        if (!days || days <= 0) days = 30;
        return amt * 30 / days;
      }
      default: return amt;
    }
  }

  var USD_RATE = 32; // USD 轉 TWD 固定匯率（估算用）
  function toTWD(amount, currency) {
    return String(currency || 'TWD').toUpperCase() === 'USD'
      ? Number(amount) * USD_RATE
      : Number(amount);
  }

  // 會產生費用的狀態（paused 暫停中不計、cancelled 已取消不計）
  function isLive(sub) { return sub.status === 'active' || sub.status === 'trial'; }

  /* 到期判斷（純函數，供 /api/due 與前端共用）
   * 回傳 { dueSoon:[{sub,date,daysLeft}], trialEnding:[{sub,daysLeft}] }
   * dueSoon：扣款日在 [today, today+7] 內（含今天）
   * trialEnding：試用中且 trial_end 在 [today, today+3] 內
   */
  function getDue(subs, today) {
    today = today || todayStr();
    var horizon = addDaysStr(today, 7);
    var dueSoon = [], trialEnding = [];
    (subs || []).forEach(function (sub) {
      if (!sub || sub.status === 'cancelled') return;
      if (sub.status === 'trial' && sub.trial_end) {
        var dt = daysUntil(sub.trial_end, today);
        if (dt >= 0 && dt <= 3) trialEnding.push({ sub: sub, daysLeft: dt });
      }
      if (sub.status === 'paused') return;
      var nb = billingOnOrAfter(sub, today);
      if (nb <= horizon) dueSoon.push({ sub: sub, date: nb, daysLeft: daysUntil(nb, today) });
    });
    dueSoon.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    trialEnding.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
    return { dueSoon: dueSoon, trialEnding: trialEnding };
  }

  return {
    todayStr: todayStr,
    pad: pad,
    addMonthsAnchored: addMonthsAnchored,
    addDaysStr: addDaysStr,
    billingAt: billingAt,
    nextBilling: nextBilling,
    billingOnOrAfter: billingOnOrAfter,
    daysUntil: daysUntil,
    billingCount: billingCount,
    totalPaid: totalPaid,
    monthlyAvg: monthlyAvg,
    toTWD: toTWD,
    USD_RATE: USD_RATE,
    isLive: isLive,
    getDue: getDue
  };
});
