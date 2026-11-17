(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var MOCK = !CFG.API_URL;
  var KEY = 'hrb_token';
  var $ = function (s) { return document.querySelector(s); };
  var state = { days: {}, order: [], day: null, time: null, openedAt: 0, token: null, widgets: {}, captcha: {} };

  /* ---------- Хранилище (может быть недоступно) ---------- */
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ничего */ }
    return null;
  }

  /* ---------- API ---------- */
  function call(action, data) {
    if (MOCK) return mockApi(action, data);
    var req;
    if (data === undefined) {
      req = fetch(CFG.API_URL + '?action=' + encodeURIComponent(action));
    } else if (action === 'booking') {
      req = fetch(CFG.API_URL + '?action=booking&token=' + encodeURIComponent(data.token));
    } else {
      // text/plain, чтобы браузер не делал предварительный запрос (Apps Script его не поддерживает)
      req = fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action: action }, data)) });
    }
    return req.then(function (r) { return r.json(); }).catch(function () { return { ok: false, error: 'NETWORK' }; });
  }

  /* ---------- Демо-режим ---------- */
  var mockDb = { bookings: {}, phones: {} };
  function mockApi(action, d) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(mockHandle(action, d || {})); }, 250);
    });
  }
  function ymd(date) { return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mockHandle(action, d) {
    if (action === 'config') return { ok: true, accepting: true, title: 'Запис на співбесіду', subtitle: 'Менеджер з продажу · 30 хвилин', durationMin: 30 };
    if (action === 'slots') {
      var out = {}, base = new Date(); base.setUTCHours(0, 0, 0, 0);
      var all = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
      for (var i = 1; i <= 14; i++) {
        var dt = new Date(base.getTime() + i * 86400000), wd = dt.getUTCDay();
        if (wd === 0 || wd === 6) continue;
        var day = ymd(dt), taken = mockDb.bookings;
        out[day] = all.filter(function (t, k) {
          if ((i * 7 + k) % 5 === 0) return false;
          return !Object.keys(taken).some(function (tk) { return taken[tk].day === day && taken[tk].time === t && taken[tk].status === 'Записан'; });
        });
      }
      return { ok: true, accepting: true, days: out };
    }
    if (action === 'book') {
      if (!/^\+380\d{9}$/.test(normPhone(d.phone))) return { ok: false, error: 'VALIDATION', fields: { phone: 'Номер у форматі +380 XX XXX XX XX' } };
      var p = normPhone(d.phone);
      if (Object.keys(mockDb.bookings).some(function (t) { return mockDb.bookings[t].phone === p && mockDb.bookings[t].status === 'Записан'; })) return { ok: false, error: 'ALREADY_BOOKED' };
      var token = 'demo-' + Math.random().toString(16).slice(2) + '-0000-0000-0000-000000000000';
      mockDb.bookings[token] = { day: d.day, time: d.time, phone: p, status: 'Записан' };
      return { ok: true, booking: { token: token, day: d.day, time: d.time } };
    }
    if (action === 'request') {
      if (!/^\+380\d{9}$/.test(normPhone(d.phone))) return { ok: false, error: 'VALIDATION', fields: { phone: 'Номер у форматі +380 XX XXX XX XX' } };
      return { ok: true };
    }
    if (action === 'booking') {
      var b = mockDb.bookings[d.token];
      return b ? { ok: true, status: b.status, day: b.day, time: b.time, past: false } : { ok: false, error: 'NOT_FOUND' };
    }
    if (action === 'cancel') {
      var c = mockDb.bookings[d.token];
      if (!c || c.status !== 'Записан') return { ok: false, error: 'NOT_FOUND' };
      c.status = 'Отменён';
      return { ok: true };
    }
    return { ok: false, error: 'UNKNOWN_ACTION' };
  }

  /* ---------- Утилиты ---------- */
  function normPhone(raw) {
    var s = String(raw || '').replace(/[\s\-().]/g, '');
    if (/^\+380\d{9}$/.test(s)) return s;
    if (/^380\d{9}$/.test(s)) return '+' + s;
    if (/^0\d{9}$/.test(s)) return '+38' + s;
    return '';
  }
  function dateOf(day) { return new Date(day + 'T00:00:00Z'); }
  var fWeek = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: 'UTC' });
  var fMonth = new Intl.DateTimeFormat('uk-UA', { month: 'short', timeZone: 'UTC' });
  var fFull = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  function fullLabel(day, time) { return fFull.format(dateOf(day)) + ', ' + time; }
  function show(id) {
    ['vPick', 'vForm', 'vRequest', 'vDone', 'vClosed'].forEach(function (v) { $('#' + v).hidden = v !== id; });
    window.scrollTo(0, 0);
  }
  function setErr(form, errors) {
    form.querySelectorAll('.err').forEach(function (e) { e.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    Object.keys(errors || {}).forEach(function (k) {
      var e = form.querySelector('.err[data-for="' + k + '"]'), i = form.querySelector('[name="' + k + '"]');
      if (e) e.textContent = errors[k];
      if (i) i.setAttribute('aria-invalid', 'true');
    });
  }
  function box(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  var MESSAGES = {
    TAKEN: 'Цей час уже зайнятий. Оберіть інший.',
    ALREADY_BOOKED: 'У вас уже є запис. Скасуйте його в блоці «Ваш запис» на цьому пристрої або зателефонуйте менеджеру.',
    CAP: 'На сьогодні запис закрито. Залиште заявку, і менеджер зв’яжеться з вами.',
    CLOSED: 'Запис тимчасово закрито.',
    BUSY: 'Зараз багато звернень. Спробуйте за хвилину.',
    CAPTCHA: 'Не вдалося підтвердити, що ви не робот. Оновіть сторінку й спробуйте знову.',
    NETWORK: 'Немає зв’язку із сервером. Перевірте інтернет і спробуйте знову.',
    SERVER: 'Щось пішло не так. Спробуйте ще раз або зателефонуйте менеджеру.',
    FILE_TYPE: 'Підходять лише файли PDF, DOC, DOCX.',
    FILE_SIZE: 'Файл завеликий: максимум 5 МБ.',
    FILE_CONTENT: 'Не вдалося прочитати файл. Перевірте, що це справжній PDF, DOC або DOCX.'
  };
  function msgFor(res) { return MESSAGES[res.error] || MESSAGES.SERVER; }

  /* ---------- Файл резюме ---------- */
  var MAX_FILE = 5 * 1024 * 1024;
  function fileProblem(file) {
    if (!file) return '';
    if (!/\.(pdf|doc|docx)$/i.test(file.name)) return 'Підходять лише файли PDF, DOC, DOCX.';
    if (!file.size) return 'Файл порожній.';
    if (file.size > MAX_FILE) return 'Файл завеликий: максимум 5 МБ.';
    return '';
  }
  function readFile(input) {
    var file = input && input.files && input.files[0];
    if (!file) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result), i = s.indexOf(','); resolve({ name: file.name, data: s.slice(i + 1) }); };
      r.onerror = function () { reject(new Error('read')); };
      r.readAsDataURL(file);
    });
  }

  /* ---------- Turnstile ---------- */
  function loadTurnstile() {
    if (!CFG.TURNSTILE_SITEKEY || window.turnstile || document.getElementById('cfScript')) return;
    var s = document.createElement('script');
    s.id = 'cfScript'; s.async = true; s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    document.head.appendChild(s);
  }
  function mountCaptcha(name, sel) {
    state.captcha[name] = '';
    if (!CFG.TURNSTILE_SITEKEY) return;
    var tries = 0;
    (function tryMount() {
      if (window.turnstile) {
        if (state.widgets[name] !== undefined) { window.turnstile.reset(state.widgets[name]); return; }
        state.widgets[name] = window.turnstile.render(sel, { sitekey: CFG.TURNSTILE_SITEKEY, callback: function (t) { state.captcha[name] = t; }, 'expired-callback': function () { state.captcha[name] = ''; } });
      } else if (tries++ < 50) setTimeout(tryMount, 200);
    })();
  }
  function resetCaptcha(name) {
    state.captcha[name] = '';
    if (window.turnstile && state.widgets[name] !== undefined) window.turnstile.reset(state.widgets[name]);
  }

  /* ---------- Выбор времени ---------- */
  function renderDays() {
    var wrap = $('#days'); wrap.textContent = '';
    state.order.forEach(function (day) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'day' + (state.days[day].length ? '' : ' none'); b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(day === state.day));
      var dt = dateOf(day);
      b.append(fWeek.format(dt));
      var n = document.createElement('b'); n.textContent = String(dt.getUTCDate()); b.appendChild(n);
      b.append(fMonth.format(dt));
      b.addEventListener('click', function () { state.day = day; renderDays(); renderSlots(); });
      wrap.appendChild(b);
    });
  }
  function renderSlots() {
    var wrap = $('#slots'), empty = $('#slotsEmpty'); wrap.textContent = '';
    var list = state.days[state.day] || [];
    empty.hidden = list.length > 0;
    empty.textContent = list.length ? '' : 'На цей день вільного часу немає. Оберіть інший день або залиште заявку.';
    var shown = state.days[state.day] ? list.map(function (t) { return { t: t }; }).concat((state.lunch || []).map(function (t) { return { t: t, lunch: true }; })) : [];
    shown.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
    shown.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; b.textContent = x.t;
      if (x.lunch) { b.disabled = true; b.title = 'Обід'; b.setAttribute('aria-label', x.t + ', обід, недоступно'); }
      else b.addEventListener('click', function () { openForm(x.t); });
      wrap.appendChild(b);
    });
  }
  function loadSlots() {
    return call('slots').then(function (res) {
      $('#slotsLoading').hidden = true; $('#toRequest').hidden = false;
      if (!res.ok) { box($('#slotsEmpty'), msgFor(res)); return; }
      if (!res.accepting) { show('vClosed'); return; }
      state.days = res.days || {};
      state.lunch = res.lunch || [];
      state.order = Object.keys(state.days).sort();
      if (!state.day || state.order.indexOf(state.day) < 0) {
        state.day = state.order.filter(function (d) { return state.days[d].length; })[0] || state.order[0] || null;
      }
      renderDays(); renderSlots();
      $('#slotsEmpty').hidden = state.order.length > 0 && (state.days[state.day] || []).length > 0;
      if (!state.order.length) { $('#slotsEmpty').hidden = false; $('#slotsEmpty').textContent = 'Вільних днів поки немає. Залиште заявку.'; }
    });
  }

  /* ---------- Форма записи ---------- */
  function openForm(time) {
    state.time = time; state.openedAt = Date.now();
    $('#formWhen').textContent = fullLabel(state.day, time);
    setErr($('#bookForm'), {}); box($('#formErr'), '');
    show('vForm'); loadTurnstile(); mountCaptcha('book', '#cfBook');
    $('#fName').focus();
  }
  function submitBook(ev) {
    ev.preventDefault();
    var form = $('#bookForm'), btn = $('#submitBook'), errs = {};
    var phone = normPhone($('#fPhone').value);
    if ($('#fName').value.trim().length < 2) errs.name = 'Вкажіть ПІБ';
    if (!phone) errs.phone = 'Номер у форматі +380 XX XXX XX XX';
    if ($('#fVacancy').value.trim().length < 2) errs.vacancy = 'Вкажіть вакансію';
    setErr(form, errs); box($('#formErr'), '');
    if (Object.keys(errs).length) return;
    if (CFG.TURNSTILE_SITEKEY && !state.captcha.book) { box($('#formErr'), 'Підтвердіть, що ви не робот.'); return; }
    var fileMsg = fileProblem($('#fFile').files[0]);
    if (fileMsg) { setErr(form, { file: fileMsg }); return; }
    btn.disabled = true; btn.textContent = 'Записуємо…';
    readFile($('#fFile')).catch(function () { return false; }).then(function (fileObj) {
      if (fileObj === false) { btn.disabled = false; btn.textContent = 'Записатися'; setErr(form, { file: 'Не вдалося прочитати файл.' }); return null; }
      return call('book', {
      day: state.day, time: state.time, name: $('#fName').value, phone: phone, email: $('#fEmail').value,
      vacancy: $('#fVacancy').value, about: $('#fAbout').value, website: $('#fWebsite').value,
      elapsedMs: Date.now() - state.openedAt, captcha: state.captcha.book, file: fileObj
      });
    }).then(function (res) {
      if (!res) return;
      btn.disabled = false; btn.textContent = 'Записатися';
      if (res.ok) { onBooked(res.booking); return; }
      resetCaptcha('book');
      if (res.error === 'VALIDATION') { setErr(form, res.fields); return; }
      box($('#formErr'), msgFor(res));
      if (res.error === 'TAKEN') loadSlots();
    });
  }
  function onBooked(b) {
    store(KEY, b.token); state.token = b.token;
    $('#fFile').value = '';
    $('#doneTitle').textContent = 'Ви записані';
    $('#doneWhen').textContent = fullLabel(b.day, b.time);
    $('#doneText').textContent = 'Співбесіда триватиме близько ' + (state.cfg.durationMin || 30) + ' хвилин. Якщо плани зміняться, скасуйте запис за кнопкою нижче.';
    $('#doneLink').value = location.origin + location.pathname + '#b=' + b.token;
    $('#doneLinkBox').hidden = false; box($('#doneMsg'), ''); $('#doneMeet').hidden = false;
    show('vDone'); refreshMine(); loadSlots();
  }

  /* ---------- Заявка без времени ---------- */
  function submitReq(ev) {
    ev.preventDefault();
    var form = $('#reqForm'), btn = $('#submitReq'), errs = {};
    var phone = normPhone($('#rPhone').value);
    if ($('#rName').value.trim().length < 2) errs.name = 'Вкажіть ПІБ';
    if (!phone) errs.phone = 'Номер у форматі +380 XX XXX XX XX';
    if ($('#rVacancy').value.trim().length < 2) errs.vacancy = 'Вкажіть вакансію';
    setErr(form, errs); box($('#reqErr'), '');
    if (Object.keys(errs).length) return;
    if (CFG.TURNSTILE_SITEKEY && !state.captcha.req) { box($('#reqErr'), 'Підтвердіть, що ви не робот.'); return; }
    var fileMsg = fileProblem($('#rFile').files[0]);
    if (fileMsg) { setErr(form, { file: fileMsg }); return; }
    btn.disabled = true; btn.textContent = 'Надсилаємо…';
    readFile($('#rFile')).catch(function () { return false; }).then(function (fileObj) {
      if (fileObj === false) { btn.disabled = false; btn.textContent = 'Надіслати заявку'; setErr(form, { file: 'Не вдалося прочитати файл.' }); return null; }
      return call('request', {
      name: $('#rName').value, phone: phone, vacancy: $('#rVacancy').value, about: $('#rAbout').value,
      website: $('#rWebsite').value, elapsedMs: Date.now() - state.openedAt, captcha: state.captcha.req, file: fileObj
      });
    }).then(function (res) {
      if (!res) return;
      btn.disabled = false; btn.textContent = 'Надіслати заявку';
      if (res.ok) {
        $('#rFile').value = '';
        $('#doneTitle').textContent = 'Заявку надіслано';
        $('#doneWhen').textContent = '';
        $('#doneText').textContent = 'Менеджер зв’яжеться з вами найближчим часом.';
        $('#doneLinkBox').hidden = true; $('#doneMeet').hidden = true;
        show('vDone'); return;
      }
      resetCaptcha('req');
      if (res.error === 'VALIDATION') { setErr(form, res.fields); return; }
      box($('#reqErr'), msgFor(res));
    });
  }

  /* ---------- Моя запись и отмена ---------- */
  function refreshMine() {
    var token = store(KEY);
    if (!token) { $('#mine').hidden = true; return; }
    call('booking', { token: token }).then(function (res) {
      if (res.ok && (res.status === 'Записан' || res.status === 'Записано') && !res.past) {
        state.token = token;
        $('#mineWhen').textContent = fullLabel(res.day, res.time);
        box($('#mineMsg'), ''); $('#mineCancel').hidden = false; $('#mine').hidden = false;
      } else { store(KEY, null); $('#mine').hidden = true; }
    });
  }
  function cancel(btn, msgEl, done) {
    if (!state.token) return;
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1'; btn.textContent = 'Точно скасувати?';
      setTimeout(function () { btn.dataset.armed = ''; btn.textContent = 'Скасувати запис'; }, 5000);
      return;
    }
    btn.disabled = true;
    call('cancel', { token: state.token }).then(function (res) {
      btn.disabled = false; btn.dataset.armed = ''; btn.textContent = 'Скасувати запис';
      if (res.ok) { store(KEY, null); state.token = null; box(msgEl, ''); done(); loadSlots(); }
      else box(msgEl, res.error === 'NOT_FOUND' ? 'Запис уже скасовано або не знайдено.' : msgFor(res));
    });
  }

  /* ---------- Запуск ---------- */
  function init() {
    if (MOCK) $('#demo').hidden = false;
    var m = /#b=([0-9a-zA-Z-]{20,60})/.exec(location.hash);
    if (m) { store(KEY, m[1]); }
    call('config').then(function (c) {
      if (c.ok) {
        state.cfg = c;
        $('#title').textContent = c.title || 'Запис на співбесіду';
        document.title = c.title || document.title;
        $('#subtitle').textContent = c.subtitle || '';
      }
    });
    $('#toRequest').addEventListener('click', function () {
      state.openedAt = Date.now(); setErr($('#reqForm'), {}); box($('#reqErr'), '');
      show('vRequest'); loadTurnstile(); mountCaptcha('req', '#cfReq'); $('#rName').focus();
    });
    $('#backFromForm').addEventListener('click', function () { show('vPick'); });
    $('#backFromRequest').addEventListener('click', function () { show('vPick'); });
    $('#doneBack').addEventListener('click', function () { show('vPick'); });
    $('#bookForm').addEventListener('submit', submitBook);
    $('#reqForm').addEventListener('submit', submitReq);
    $('#mineCancel').addEventListener('click', function () { cancel($('#mineCancel'), $('#mineMsg'), function () { $('#mine').hidden = true; }); });
    $('#doneCancel').addEventListener('click', function () { cancel($('#doneCancel'), $('#doneMsg'), function () { $('#doneLinkBox').hidden = true; $('#doneMeet').hidden = true; $('#doneTitle').textContent = 'Запис скасовано'; $('#doneWhen').textContent = ''; $('#doneText').textContent = 'Ви можете обрати інший час.'; refreshMine(); }); });
    $('#copyBtn').addEventListener('click', function () {
      var inp = $('#doneLink'); inp.select();
      var ok = function () { $('#copyBtn').textContent = 'Скопійовано'; setTimeout(function () { $('#copyBtn').textContent = 'Копіювати'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(ok, function () { document.execCommand && document.execCommand('copy'); ok(); });
      else { try { document.execCommand('copy'); ok(); } catch (e) { /* ссылка выделена, можно скопировать вручную */ } }
    });
    refreshMine();
    loadSlots();
  }
  init();
})();
