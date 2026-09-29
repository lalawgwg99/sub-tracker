/* 訂閱管家 — 前端 */
(function () {
  'use strict';
  var L = window.SubLogic;

  var state = { subs: [], calY: 0, calM: 0, editingId: null };

  var PRESETS = [
    { name: 'Netflix', amount: 390, currency: 'TWD', cycle: 'monthly', category: '影音' },
    { name: 'Spotify', amount: 149, currency: 'TWD', cycle: 'monthly', category: '音樂' },
    { name: 'YouTube Premium', amount: 199, currency: 'TWD', cycle: 'monthly', category: '影音' },
    { name: 'iCloud+', amount: 90, currency: 'TWD', cycle: 'monthly', category: '雲端' },
    { name: 'Google One 100GB', amount: 65, currency: 'TWD', cycle: 'monthly', category: '雲端' },
    { name: 'Disney+', amount: 270, currency: 'TWD', cycle: 'monthly', category: '影音' },
    { name: 'KKBOX', amount: 149, currency: 'TWD', cycle: 'monthly', category: '音樂' }
  ];

  var GUIDE = [
    { name: 'Netflix', steps: ['開啟 Netflix 網頁版並登入', '右上角頭像 →「帳戶」', '「會員資格與帳單」→「取消會員資格」', '按指示確認，帳單週期結束前仍可觀看'] },
    { name: 'Spotify', steps: ['到 spotify.com/account 登入', '「變更方案」→ 捲到最下「取消 Premium」', '按指示確認即可'] },
    { name: 'YouTube Premium', steps: ['YouTube App → 右下「你」→ 右上齒輪', '「購買內容與會員資格」→ 點 Premium 方案', '「停用」→ 選擇原因確認'] },
    { name: 'iCloud+', steps: ['iPhone「設定」→ 點最上方 Apple ID', '「訂閱項目」→ 選擇 iCloud+', '「取消訂閱」確認（經 App Store 訂閱者皆在此取消）'] },
    { name: 'Google One', steps: ['Google One App → 左上選單 →「設定」', '「取消會員資格」→ 按指示確認', '注意：經由 Google Play 訂閱者改在 Play 商店「付款與訂閱」取消'] },
    { name: 'Disney+', steps: ['到 disneyplus.com 登入 →「帳戶」', '訂閱方案下點「取消訂閱」', '經 Apple / Google 訂閱者：請到該平台的訂閱管理取消'] },
    { name: 'KKBOX', steps: ['KKBOX App →「設定」→「方案管理」', '「取消自動續訂」→ 確認', '經電信帳單代收者：需到電信商 App 取消小額付費項目'] }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(id) { return document.getElementById(id); }

  function moneyOf(sub) {
    var a = Number(sub.amount || 0);
    return sub.currency === 'USD' ? 'US$' + a : 'NT$' + Math.round(a).toLocaleString('en-US');
  }

  function twd(n) { return 'NT$' + Math.round(n).toLocaleString('en-US'); }

  function cycleLabel(c) {
    return { weekly: '每週', monthly: '每月', quarterly: '每季', halfyear: '每半年', yearly: '每年', custom: '自訂' }[c] || '每月';
  }

  function statusLabel(s) {
    return { trial: '試用中', active: '使用中', paused: '已暫停', cancelled: '已取消' }[s] || s;
  }

  function countdownText(sub, today) {
    if (sub.status === 'cancelled') return '已取消';
    if (sub.status === 'paused') return '暫停中';
    var nb = L.nextBilling(sub, today);
    var d = L.daysUntil(nb, today);
    if (sub.status === 'trial' && sub.trial_end) {
      var t = L.daysUntil(sub.trial_end, today);
      return '試用剩 ' + t + ' 天';
    }
    return d === 0 ? '今天扣款' : d + ' 天後扣款';
  }

  /* ---- 資料 ---- */
  async function load() {
    try {
      var r = await fetch('api/subs');
      var j = await r.json();
      state.subs = (j.subs || []);
    } catch (e) {
      state.subs = [];
    }
    renderAll();
  }

  /* ---- 分頁切換 ---- */
  function switchView(id) {
    document.querySelectorAll('section.view').forEach(function (s) { s.classList.remove('show'); });
    $(id).classList.add('show');
    document.querySelectorAll('nav.tabbar button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === id);
    });
    if (id === 'view-form' && !state.editingId) resetForm();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('nav.tabbar button').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.dataset.view); });
  });

  /* ---- 首頁 ---- */
  function monthRange(y, m) { // m: 1-12
    var p = L.pad;
    return {
      start: y + '-' + p(m) + '-01',
      end: y + '-' + p(m) + '-' + new Date(y, m, 0).getDate()
    };
  }

  function sumBillingInRange(subs, start, end) {
    var total = 0;
    subs.forEach(function (s) {
      if (!L.isLive(s)) return;
      var n = 0, guard = 0;
      while (guard < 2000) {
        var d = L.billingAt(s, n);
        if (d > end) break;
        if (d >= start) total += L.toTWD(s.amount, s.currency);
        n++; guard++;
      }
    });
    return total;
  }

  function renderHome() {
    var today = L.todayStr();
    $('todayLabel').textContent = today;
    var t = today.split('-');
    var y = +t[0], m = +t[1];
    var cur = monthRange(y, m);
    var nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
    var nxt = monthRange(ny, nm);

    var live = state.subs.filter(L.isLive);
    $('statMonthPaid').textContent = twd(sumBillingInRange(live, cur.start, today));
    $('statNextMonth').textContent = twd(sumBillingInRange(live, nxt.start, nxt.end));

    var due = L.getDue(state.subs, today);

    // 橫幅
    var banner = '';
    var urgent = due.dueSoon.filter(function (x) { return x.daysLeft <= 3; });
    if (due.trialEnding.length || urgent.length) {
      var parts = [];
      due.trialEnding.forEach(function (x) {
        parts.push(esc(x.sub.name) + ' 試用剩 ' + x.daysLeft + ' 天');
      });
      urgent.forEach(function (x) {
        parts.push(esc(x.sub.name) + (x.daysLeft === 0 ? '今天' : x.daysLeft + ' 天後') + '扣款');
      });
      banner = '<div class="banner">⚠️ ' + parts.join('；') + '</div>';
    } else if (state.subs.length) {
      banner = '<div class="banner ok">✅ 近期沒有即將扣款的訂閱</div>';
    }
    $('homeBanner').innerHTML = banner;

    // 7 天內扣款
    var dl = $('dueList');
    if (!due.dueSoon.length) {
      dl.innerHTML = '<div class="muted">7 天內沒有扣款</div>';
    } else {
      dl.innerHTML = due.dueSoon.map(function (x) {
        var s = x.sub;
        var when = x.daysLeft === 0 ? '<span class="badge due">今天</span>' :
          '<span class="badge ' + (x.daysLeft <= 3 ? 'due' : '') + '">' + x.daysLeft + ' 天後</span>';
        return '<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">' +
          '<div><strong>' + esc(s.name) + '</strong><div class="muted">' + x.date + '・' + esc(s.pay_method || '') + '</div></div>' +
          '<div style="text-align:right">' + when + '<div class="muted">' + moneyOf(s) + '</div></div></div>';
      }).join('');
    }

    // 分類統計（月平均，轉 TWD）
    var cats = {};
    live.forEach(function (s) {
      var c = s.category || '未分類';
      cats[c] = (cats[c] || 0) + L.toTWD(L.monthlyAvg(s), s.currency);
    });
    var entries = Object.keys(cats).map(function (k) { return [k, cats[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    var cb = $('catBars');
    if (!entries.length) {
      cb.innerHTML = '<div class="muted">尚無資料</div>';
    } else {
      var max = entries[0][1] || 1;
      cb.innerHTML = entries.map(function (e) {
        var pct = Math.max(4, Math.round(e[1] / max * 100));
        return '<div class="bar"><div class="blabel"><span>' + esc(e[0]) + '</span><span>' + twd(e[1]) + '/月</span></div>' +
          '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>';
      }).join('');
    }
  }

  /* ---- 清單 ---- */
  function renderList() {
    var today = L.todayStr();
    var live = [], hist = [];
    state.subs.forEach(function (s) {
      (s.status === 'cancelled' ? hist : live).push(s);
    });
    live.sort(function (a, b) {
      var da = L.nextBilling(a, today), db = L.nextBilling(b, today);
      return da < db ? -1 : da > db ? 1 : 0;
    });

    function card(s) {
      var cancelled = s.status === 'cancelled';
      var nb = cancelled ? '' : L.nextBilling(s, today);
      var d = cancelled ? 0 : L.daysUntil(nb, today);
      var paid = L.totalPaid(s, today);
      return '<div class="card subcard' + (cancelled ? ' cancelled' : '') + '">' +
        '<div class="row"><div class="name">' + esc(s.name) + '</div>' +
        '<span class="badge ' + s.status + '">' + statusLabel(s.status) + '</span></div>' +
        '<div class="meta">' + moneyOf(s) + '・' + cycleLabel(s.cycle) +
        (s.cycle === 'custom' ? '(' + s.cycle_days + '天)' : '') +
        (s.category ? '・' + esc(s.category) : '') +
        (s.pay_method ? '・' + esc(s.pay_method) : '') + '</div>' +
        '<div class="row" style="margin-top:6px"><div class="count' + (d <= 3 ? ' soon' : '') + '">' +
        esc(countdownText(s, today)) + '</div>' +
        '<div class="muted">累計 ' + twd(L.toTWD(paid, s.currency)) + '</div></div>' +
        '<div class="btnrow">' +
        '<button class="small" data-act="edit" data-id="' + s.id + '">編輯</button>' +
        (cancelled
          ? '<button class="small" data-act="restore" data-id="' + s.id + '">恢復</button>'
          : '<button class="small" data-act="cancel" data-id="' + s.id + '">取消訂閱</button>') +
        '<button class="small danger" data-act="del" data-id="' + s.id + '">刪除</button>' +
        '</div></div>';
    }

    $('subList').innerHTML = live.length
      ? live.map(card).join('')
      : '<div class="empty">還沒有訂閱<br>按右下「＋新增」開始記錄</div>';

    var hw = $('histWrap');
    if (hist.length) {
      hw.style.display = 'block';
      $('histSummary').textContent = '已取消的訂閱（' + hist.length + '）';
      $('histList').innerHTML = hist.map(card).join('');
    } else {
      hw.style.display = 'none';
    }

    document.querySelectorAll('#view-list [data-act]').forEach(function (b) {
      b.addEventListener('click', function () { onCardAct(b.dataset.act, +b.dataset.id); });
    });
  }

  async function onCardAct(act, id) {
    if (act === 'edit') { openEdit(id); return; }
    if (act === 'cancel') {
      if (!confirm('確定取消這筆訂閱？紀錄會保留，方便查看累計花費。')) return;
      await fetch('api/subs/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
    } else if (act === 'restore') {
      await fetch('api/subs/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
    } else if (act === 'del') {
      if (!confirm('確定永久刪除？累計花費紀錄也會消失，建議用「取消訂閱」保留。')) return;
      await fetch('api/subs/' + id, { method: 'DELETE' });
    }
    await load();
  }

  /* ---- 表單 ---- */
  function resetForm() {
    state.editingId = null;
    $('formTitle').textContent = '新增訂閱';
    ['f_id', 'f_name', 'f_amount', 'f_pay_method', 'f_note'].forEach(function (id) { $(id).value = ''; });
    $('f_currency').value = 'TWD';
    $('f_cycle').value = 'monthly';
    $('f_cycle_days').value = 30;
    $('f_first_billing').value = L.todayStr();
    $('f_status').value = 'active';
    $('f_trial_end').value = '';
    $('f_category').value = '';
    toggleFormParts();
  }

  function toggleFormParts() {
    $('cycleDaysWrap').style.display = $('f_cycle').value === 'custom' ? 'block' : 'none';
    $('trialEndWrap').style.display = $('f_status').value === 'trial' ? 'block' : 'none';
  }
  $('f_cycle').addEventListener('change', toggleFormParts);
  $('f_status').addEventListener('change', toggleFormParts);

  $('presetChips').innerHTML = PRESETS.map(function (p, i) {
    return '<button data-preset="' + i + '">' + esc(p.name) + ' ' + p.amount + '</button>';
  }).join('');
  document.querySelectorAll('#presetChips [data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = PRESETS[+b.dataset.preset];
      $('f_name').value = p.name;
      $('f_amount').value = p.amount;
      $('f_currency').value = p.currency;
      $('f_cycle').value = p.cycle;
      $('f_category').value = p.category;
      if (!$('f_first_billing').value) $('f_first_billing').value = L.todayStr();
      toggleFormParts();
    });
  });

  function openEdit(id) {
    var s = state.subs.find(function (x) { return x.id === id; });
    if (!s) return;
    state.editingId = id;
    $('formTitle').textContent = '編輯訂閱';
    $('f_id').value = s.id;
    $('f_name').value = s.name || '';
    $('f_amount').value = s.amount || 0;
    $('f_currency').value = s.currency || 'TWD';
    $('f_cycle').value = s.cycle || 'monthly';
    $('f_cycle_days').value = s.cycle_days || 30;
    $('f_first_billing').value = s.first_billing || L.todayStr();
    $('f_status').value = ['trial', 'active', 'paused'].includes(s.status) ? s.status : 'active';
    $('f_trial_end').value = s.trial_end || '';
    $('f_category').value = s.category || '';
    $('f_pay_method').value = s.pay_method || '';
    $('f_note').value = s.note || '';
    toggleFormParts();
    switchView('view-form');
  }

  $('formSave').addEventListener('click', async function () {
    var body = {
      name: $('f_name').value.trim(),
      amount: parseFloat($('f_amount').value) || 0,
      currency: $('f_currency').value,
      cycle: $('f_cycle').value,
      cycle_days: parseInt($('f_cycle_days').value, 10) || 30,
      first_billing: $('f_first_billing').value,
      status: $('f_status').value,
      trial_end: $('f_trial_end').value || null,
      category: $('f_category').value,
      pay_method: $('f_pay_method').value.trim(),
      note: $('f_note').value.trim()
    };
    if (!body.name) { alert('請填寫名稱'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.first_billing)) { alert('請選擇首次扣款日'); return; }
    var url = 'api/subs' + (state.editingId ? '/' + state.editingId : '');
    var method = state.editingId ? 'PUT' : 'POST';
    var r = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var j = await r.json();
    if (!j.ok) { alert('儲存失敗：' + (j.error || '未知錯誤')); return; }
    resetForm();
    await load();
    switchView('view-list');
  });

  /* ---- 月曆 ---- */
  function renderCal() {
    var today = L.todayStr();
    if (!state.calY) {
      var t = today.split('-');
      state.calY = +t[0]; state.calM = +t[1];
    }
    var y = state.calY, m = state.calM;
    $('calTitle').textContent = y + ' 年 ' + m + ' 月';

    var firstDow = new Date(y, m - 1, 1).getDay();
    var daysIn = new Date(y, m, 0).getDate();
    var r = monthRange(y, m);

    // 該月每天的扣款訂閱
    var byDay = {};
    state.subs.filter(L.isLive).forEach(function (s) {
      var n = 0, guard = 0;
      while (guard < 2000) {
        var d = L.billingAt(s, n);
        if (d > r.end) break;
        if (d >= r.start) {
          (byDay[d] = byDay[d] || []).push(s.name);
          if (byDay[d].length > 2) break;
        }
        n++; guard++;
      }
      if (s.status === 'trial' && s.trial_end && s.trial_end >= r.start && s.trial_end <= r.end) {
        (byDay[s.trial_end] = byDay[s.trial_end] || []).push(s.name + '(試用到期)');
      }
    });

    var html = ['日', '一', '二', '三', '四', '五', '六'].map(function (d) {
      return '<div class="dow">' + d + '</div>';
    }).join('');
    for (var i = 0; i < firstDow; i++) html += '<div class="day other"></div>';
    for (var day = 1; day <= daysIn; day++) {
      var ds = y + '-' + L.pad(m) + '-' + L.pad(day);
      var names = byDay[ds] || [];
      html += '<div class="day"><div>' + day + '</div>' +
        names.map(function (n2) { return '<div class="dot"></div><div class="nm">' + esc(n2) + '</div>'; }).join('') +
        '</div>';
    }
    $('calGrid').innerHTML = html;
  }
  $('calPrev').addEventListener('click', function () {
    state.calM--; if (state.calM < 1) { state.calM = 12; state.calY--; } renderCal();
  });
  $('calNext').addEventListener('click', function () {
    state.calM++; if (state.calM > 12) { state.calM = 1; state.calY++; } renderCal();
  });

  /* ---- 取消指南 ---- */
  function renderGuide() {
    $('guideBody').innerHTML = '<h3>🔌 取消訂閱指南</h3>' +
      '<div class="muted">各平台取消路徑（2026 年整理，介面可能微調）：</div>' +
      GUIDE.map(function (g) {
        return '<h4>' + esc(g.name) + '</h4><ol>' +
          g.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
      }).join('') +
      '<div class="foot-note">小提醒：台灣數發部已修法，業者不得預設自動續約扣款，取消流程應與訂閱同等便利（易進易出）。若遇到惡意挽留，可向消保處申訴。</div>';
  }

  /* ---- 總渲染 ---- */
  function renderAll() {
    renderHome();
    renderList();
    renderCal();
    renderGuide();
  }

  // 初始載入
  load();
})();
