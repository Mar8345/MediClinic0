/* ============================================================
   patient.js — ملف المريض: دخول برقم الهاتف + عرض الحجوزات
   بتصنيفات: قادمة / قيد المراجعة / مؤكدة / مرفوضة / سابقة / الكل
   + إلغاء المريض لمواعيده المعلّقة/المؤكدة (قبل انقضاء الوقت)
   ============================================================ */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  /* حالة الواجهة */
  const state = {
    patient: null,
    filter: 'upcoming',
    appointments: []
  };

  /* التصنيفات: المفتاح ← الحالات المسموحة */
  const FILTERS = {
    upcoming:  { label: '📅 قادمة',      statuses: ['pending', 'approved', 'checkedIn'], onlyFuture: true },
    pending:   { label: '⏳ قيد المراجعة', statuses: ['pending'],                          onlyFuture: true },
    approved:  { label: '✅ مؤكدة',      statuses: ['approved', 'checkedIn'],              onlyFuture: true },
    rejected:  { label: '✖️ مرفوضة',     statuses: ['rejected'] },
    past:      { label: '📜 سابقة',      statuses: ['completed', 'cancelled', 'noShow', 'rejected'] },
    all:       { label: '🗂️ الكل',       statuses: null }
  };

  /* ---------- أدوات عرض ---------- */
  function badge(status) {
    const meta = Appointments.statusMeta(status);
    return `<span class="badge ${meta.badge}">${Utils.escapeHtml(meta.label)}</span>`;
  }

  function doctorCell(appt) {
    const doctor = Store.findById(Store.KEYS.DOCTORS, appt.doctorId);
    const loc = doctor ? Clinic.locationForDate(doctor, appt.date) : null;
    return `
      <span class="cell-main">${Utils.escapeHtml(doctor ? doctor.name : '—')}</span>
      <span class="cell-sub">${Utils.escapeHtml(Clinic.locationText(loc) || '—')}</span>`;
  }

  function datetimeCell(appt) {
    return `
      <span class="cell-main">${Utils.escapeHtml(Utils.formatArabicDate(appt.date, false))}</span>
      <span class="cell-sub">${Utils.escapeHtml(Utils.to12h(appt.time))}</span>`;
  }

  /* يمكن للمريض إلغاء موعده إذا كان pending/approved ولم ينقضِ وقته */
  function canCancel(appt) {
    return ['pending', 'approved'].includes(appt.status)
        && !Appointments.isPastDateTime(appt.date, appt.time);
  }

  /* ---------- بوابة الدخول ---------- */
  function showGate() {
    $('patientLoginGate').hidden = false;
    $('patientContent').hidden = true;
  }

  function showContent() {
    $('patientLoginGate').hidden = true;
    $('patientContent').hidden = false;
  }

  function setError(inputId, errorId, message) {
    const input = $(inputId);
    const err = $(errorId);
    if (input) input.classList.toggle('is-invalid', !!message);
    if (err) err.textContent = message || '';
  }

  function bindLogin() {
    const form = $('patientLoginForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = $('patientLoginEmail').value.trim();
      const password = $('patientLoginPassword').value;

      let ok = true;
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        setError('patientLoginEmail', 'patientLoginEmailError', 'أدخل بريدًا إلكترونيًا صحيحًا');
        ok = false;
      } else {
        setError('patientLoginEmail', 'patientLoginEmailError', '');
      }
      if (password.length < 6) {
        setError('patientLoginPassword', 'patientLoginPasswordError', 'الرقم السري يجب أن يكون 6 أحرف على الأقل');
        ok = false;
      } else {
        setError('patientLoginPassword', 'patientLoginPasswordError', '');
      }
      if (!ok) return;

      const res = Session.loginPatientByCredentials(email, password);
      if (!res.ok) {
        setError('patientLoginPassword', 'patientLoginPasswordError', res.reason);
        return;
      }
      state.patient = res.patient;
      Utils.showToast(`مرحبًا ${res.patient.name} 👋`);
      render();
    });
  }

  /* ---------- جلب حجوزات المريض ---------- */
  function loadAppointments() {
    state.appointments = Store.getAll(Store.KEYS.APPOINTMENTS)
      .filter((a) => a.patientId === state.patient.id)
      .sort(Utils.byDateTime)
      .reverse();
  }

  function visibleAppointments() {
    const today = Utils.todayISO();
    const cfg = FILTERS[state.filter] || FILTERS.all;
    return state.appointments.filter((a) => {
      if (cfg.statuses && !cfg.statuses.includes(a.status)) return false;
      if (cfg.onlyFuture && a.date < today) return false;
      return true;
    });
  }

  /* ---------- العرض ---------- */
  function renderProfileCard() {
    const p = state.patient;
    const card = $('profileCard');
    if (!card) return;
    card.innerHTML = `
      <div class="profile-avatar" aria-hidden="true">🧑</div>
      <div class="profile-info">
        <h2>${Utils.escapeHtml(p.name)}</h2>
        <div class="profile-meta">
          <span>📞 <span dir="ltr">${Utils.escapeHtml(p.phone)}</span></span>
          <span>🪪 <span dir="ltr">${Utils.escapeHtml(p.nationalId)}</span></span>
          <span>🎂 ${p.age} سنة</span>
          <span>${p.gender === 'male' ? '👨 ذكر' : '👩 أنثى'}</span>
        </div>
      </div>`;
  }

  function renderStats() {
    const stats = Appointments.statsForPatient(state.patient.id);
    setStat('statUpcoming', stats.upcoming);
    setStat('statPending', stats.pending);
    setStat('statApproved', stats.approved);
    setStat('statRejected', stats.rejected);
  }

  function setStat(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function renderChips() {
    const wrap = $('apptFilterChips');
    if (!wrap) return;
    wrap.innerHTML = Object.entries(FILTERS).map(([key, cfg]) => `
      <button type="button" class="seg ${state.filter === key ? 'is-selected' : ''}"
              data-pfilter="${key}" aria-pressed="${state.filter === key}">
        ${Utils.escapeHtml(cfg.label)}
      </button>`).join('');
  }

  function renderTable() {
    const body = $('patientAppointments');
    if (!body) return;
    const list = visibleAppointments();
    body.innerHTML = list.map((a) => `
      <tr data-id="${a.id}">
        <td data-label="الطبيب">${doctorCell(a)}</td>
        <td data-label="التاريخ والوقت">${datetimeCell(a)}</td>
        <td data-label="رقم الحجز"><span class="cell-main" dir="ltr">${Utils.escapeHtml(a.code)}</span>${a.reason ? `<span class="cell-sub">💬 ${Utils.escapeHtml(a.reason)}</span>` : ''}</td>
        <td data-label="الحالة">${badge(a.status)}${a.status === 'rejected' && a.rejectReason ? `<span class="cell-sub">السبب: ${Utils.escapeHtml(a.rejectReason)}</span>` : ''}${a.status === 'cancelled' && a.cancelReason ? `<span class="cell-sub">سبب الاعتذار/الإلغاء: ${Utils.escapeHtml(a.cancelReason)}</span>` : ''}</td>
        <td class="no-print" data-label="إجراء">
          ${canCancel(a)
            ? `<button type="button" class="btn btn-outline btn-sm" data-cancel="${a.id}">⛔ إلغاء الموعد</button>`
            : '<span class="cell-sub">—</span>'}
        </td>
      </tr>`).join('');
    const empty = $('emptyAppts');
    if (empty) empty.hidden = list.length > 0;
  }

  function render() {
    if (!state.patient) return;
    loadAppointments();
    renderProfileCard();
    renderStats();
    renderChips();
    renderTable();
    renderSelectedDoctorAction();
    showContent();
  }

  function renderSelectedDoctorAction() {
    const button = $('selectedDoctorBookingBtn');
    if (!button) return;
    const doctorId = Session.selectedDoctorId();
    const doctor = doctorId ? Store.findById(Store.KEYS.DOCTORS, doctorId) : null;
    if (!doctor || doctor.active === false || doctor.archived) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.href = `booking.html?doctorId=${encodeURIComponent(doctor.id)}`;
    button.textContent = `🩺 احجز مع ${doctor.name}`;
  }

  /* ---------- الأحداث ---------- */
  function bindEvents() {
    const chips = $('apptFilterChips');
    if (chips) {
      chips.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-pfilter]');
        if (!chip) return;
        state.filter = chip.dataset.pfilter;
        renderChips();
        renderTable();
      });
    }

    const body = $('patientAppointments');
    if (body) {
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cancel]');
        if (!btn) return;
        const appt = Appointments.find(btn.dataset.cancel);
        if (!appt) return;
        if (!confirm(`إلغاء موعدك ${appt.code} (${Utils.formatArabicDate(appt.date, false)} — ${Utils.to12h(appt.time)})؟`)) return;
        const res = Appointments.cancelByPatient(appt.id, state.patient.id);
        if (!res.ok) {
          Utils.showToast(res.reason, 'error');
          return;
        }
        Utils.showToast('تم إلغاء موعدك');
        render();
      });
    }

    const logoutBtn = $('patientLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        Session.logout();
        state.patient = null;
        state.filter = 'upcoming';
        const form = $('patientLoginForm');
        if (form) form.reset();
        showGate();
      });
    }
  }

  /* ---------- التشغيل ---------- */
  (function init() {
    bindLogin();
    bindEvents();
    const existing = Session.currentPatient();
    if (existing) {
      state.patient = existing;
      render();
    } else {
      window.location.href = 'patient-login.html';
    }
  })();
})();
