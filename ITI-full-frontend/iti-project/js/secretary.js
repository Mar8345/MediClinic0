/* ============================================================
   secretary.js — لوحة السكرتير (العرض والأحداث فقط)
   كل منطق التخزين وتغيير الحالة في storage.js
   (Appointments.mutations / Patients / Session / Export / Seed)
   الصفحات عبر body[data-page]:
   secretary-dashboard | secretary-appointments | secretary-patients
   ============================================================ */
'use strict';

(function () {
  const page = document.body.dataset.page || '';
  const $ = (id) => document.getElementById(id);

  /* أسماء أيام قصيرة للرسم البياني */
  const SHORT_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  const CHART_COLORS = {
    pending: '#f59e0b', approved: '#16a34a', checkedIn: '#0369a1',
    completed: '#2563eb', cancelled: '#94a3b8', rejected: '#dc2626', noShow: '#64748b'
  };

  /* ربط حقول «مريض جديد» بقواعد التحقق المشتركة */
  const NP_FIELDS = {
    npName: 'fullName',
    npPhone: 'phone',
    npNationalId: 'nationalId',
    npAge: 'age',
    npGender: 'gender'
  };

  /* ---------- حالة الواجهة ---------- */
  const state = {
    filters: { q: '', status: 'all', doctorId: 'all', date: 'all' },
    sort: { key: 'datetime', dir: 'asc' },
    selected: new Set(),
    bulkRejectIds: null,
    detailId: null,
    rejectId: null,
    rescheduleId: null,
    rescheduleTime: null,
    newAppt: { patientId: null, doctorId: null, date: null, time: null }
  };

  /* ---------- أدوات صغيرة ---------- */
  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value == null ? '' : value;
  }

  function validateField(ruleId, inputId) {
    const input = $(inputId || ruleId);
    const errorEl = document.querySelector(`[data-error-for="${inputId || ruleId}"]`);
    if (!input || !Validators[ruleId]) return true;
    const result = Validators[ruleId](input.value);
    const ok = result === true;
    input.classList.toggle('is-invalid', !ok);
    if (errorEl) errorEl.textContent = ok ? '' : result;
    return ok;
  }

  /* ============================================================
     Render helpers
     ============================================================ */
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

  function patientCell(appt) {
    return `
      <span class="cell-main">${Utils.escapeHtml(appt.patientName || '—')}</span>
      <span class="cell-sub" dir="ltr">${Utils.escapeHtml(appt.patientPhone || '')}</span>`;
  }

  function datetimeCell(appt) {
    return `
      <span class="cell-main">${Utils.escapeHtml(Utils.formatArabicDate(appt.date, false))}</span>
      <span class="cell-sub">${Utils.escapeHtml(Utils.to12h(appt.time))}</span>`;
  }

  function doctorOptionsHtml(selectedId) {
    return Store.getAll(Store.KEYS.DOCTORS).map((d) =>
      `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(d.name)} — ${Utils.escapeHtml(d.specialty)}</option>`
    ).join('');
  }

  function actionButtons(appt) {
    const b = (action, label, cls, title) =>
      `<button type="button" class="btn btn-sm ${cls}" data-action="${action}" data-id="${appt.id}" title="${title || label}">${label}</button>`;
    switch (appt.status) {
      case 'pending':
        return b('approve', '✅ موافقة', 'btn-success')
             + b('reject', '✖️ رفض', 'btn-danger')
             + b('reschedule', '🕐 تأجيل', 'btn-outline')
             + b('details', '👁️', 'btn-outline', 'تفاصيل');
      case 'approved':
        return b('checkin', '🖥️ تسجيل حضور', 'btn-primary')
             + referralButton(appt)
             + b('reschedule', '🕐 تأجيل', 'btn-outline')
             + b('noshow', '💤 لم يحضر', 'btn-outline')
             + b('cancel', '⛔ إلغاء', 'btn-outline')
             + b('details', '👁️', 'btn-outline', 'تفاصيل');
      case 'checkedIn':
        return referralButton(appt)
             + b('complete', '✅ إكمال الزيارة', 'btn-success')
             + b('cancel', '⛔ إلغاء', 'btn-outline')
             + b('details', '👁️', 'btn-outline', 'تفاصيل');
      default:
        return b('details', '👁️', 'btn-outline', 'تفاصيل')
             + b('remove', '🗑️', 'btn-outline', 'حذف');
    }
  }

  function appointmentRow(appt) {
    const selected = state.selected.has(appt.id);
    return `
      <tr data-id="${appt.id}">
        <td class="no-print checkbox-cell" data-label="تحديد"><input type="checkbox" class="row-check" data-id="${appt.id}" ${selected ? 'checked' : ''} aria-label="تحديد ${Utils.escapeHtml(appt.code)}"></td>
        <td data-label="التاريخ والوقت">${datetimeCell(appt)}</td>
        <td data-label="المريض">${patientCell(appt)}</td>
        <td data-label="الطبيب">${doctorCell(appt)}</td>
        <td data-label="رقم الحجز"><span class="cell-main" dir="ltr">${Utils.escapeHtml(appt.code)}</span></td>
        <td data-label="الحالة">${badge(appt.status)}${appt.cancelReason ? `<span class="cell-sub">السبب: ${Utils.escapeHtml(appt.cancelReason)}</span>` : ''}${appt.rejectReason ? `<span class="cell-sub">السبب: ${Utils.escapeHtml(appt.rejectReason)}</span>` : ''}</td>
        <td class="no-print" data-label="إجراءات"><div class="row-actions">${actionButtons(appt)}</div></td>
      </tr>`;
  }

  function pendingRow(appt) {
    return `
      <tr data-id="${appt.id}">
        <td data-label="رقم الحجز"><span class="cell-main" dir="ltr">${Utils.escapeHtml(appt.code)}</span></td>
        <td data-label="المريض">${patientCell(appt)}</td>
        <td data-label="الطبيب">${doctorCell(appt)}</td>
        <td data-label="التاريخ والوقت">${datetimeCell(appt)}</td>
        <td class="no-print" data-label="إجراءات">
          <div class="row-actions">
            <button type="button" class="btn btn-success btn-sm" data-action="approve" data-id="${appt.id}">✅ موافقة</button>
            <button type="button" class="btn btn-danger btn-sm" data-action="reject" data-id="${appt.id}">✖️ رفض</button>
            <button type="button" class="btn btn-outline btn-sm" data-action="details" data-id="${appt.id}" title="تفاصيل">👁️</button>
          </div>
        </td>
      </tr>`;
  }

  /* ============================================================
     النوافذ المنبثقة (Modals)
     ============================================================ */
  function openModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const first = modal.querySelector('input, select, textarea, button');
    if (first) first.focus();
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay:not([hidden])').forEach((m) => closeModal(m.id));
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
    const closer = e.target.closest('[data-close]');
    if (closer) {
      const overlay = closer.closest('.modal-overlay');
      if (overlay) closeModal(overlay.id);
    }
  });

  /* ============================================================
     الجلسة التجريبية + الإجراءات المشتركة
     ============================================================ */
  function initSession(onLogin) {
    const userName = $('secUserName');
    if (userName && typeof MOCK_STAFF !== 'undefined') userName.textContent = `👤 ${MOCK_STAFF.name}`;

    const logoutBtn = $('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      Session.logout();
      window.location.href = '../index.html';
    });

    const gate = $('loginGate');
    const content = $('secContent');
    const apply = (loggedIn) => {
      if (gate) gate.hidden = loggedIn;
      if (content) content.hidden = !loggedIn;
    };

    if (Session.is('secretary') && Session.currentStaff()) { apply(true); return true; }
    Session.logout();
    apply(false);

    const form = $('loginForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const identifier = $('loginUser').value.trim();
        const password = $('loginPin').value;
        const result = identifier.includes('@')
          ? Session.loginSecretaryByEmail(identifier, password)
          : (Session.login(identifier, password) ? { ok: true, staff: Session.currentStaff() } : { ok: false, reason: 'بيانات الدخول غير صحيحة' });
        if (result.ok) {
          apply(true);
          Utils.showToast(`مرحبًا ${(result.staff || Session.currentStaff() || MOCK_STAFF).name} 👋`);
          if (onLogin) onLogin();
        } else {
          Utils.showToast(result.reason || 'بيانات الدخول غير صحيحة', 'error');
        }
      });
    }
    return false;
  }

  function initCommonActions(onChange) {
    const refreshBtn = $('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { onChange(); Utils.showToast('تم التحديث'); });

    const resetBtn = $('resetSeedBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (!confirm('سيتم مسح كل البيانات الحالية وإعادة زرع البيانات التجريبية. متابعة؟')) return;
      Seed.reset();
      onChange();
      Utils.showToast('تمت إعادة زرع البيانات التجريبية');
    });

    /* مزامنة فورية بين التبويبات المفتوحة */
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.indexOf('clinic_') === 0) onChange();
    });
  }

  function afterChange(res, successMsg, rerender) {
    if (res && res.ok) {
      Utils.showToast(successMsg);
    } else {
      Utils.showToast((res && res.reason) || 'حدث خطأ غير متوقع', 'error');
    }
    if (rerender) rerender();
  }

  function handleAction(action, id, rerender) {
    const appt = Appointments.find(id);
    if (!appt) { Utils.showToast('الموعد غير موجود', 'error'); return; }
    switch (action) {
      case 'approve':
        afterChange(Appointments.approve(id), `تم تأكيد موعد ${appt.patientName}`, rerender);
        break;
      case 'reject':
        openRejectModal(id);
        break;
      case 'reschedule':
        openRescheduleModal(id);
        break;
      case 'checkin':
        afterChange(Appointments.checkIn(id), `تم تسجيل حضور ${appt.patientName}`, rerender);
        break;
      case 'refer': {
        const existing = Referrals.findByAppointment(id);
        if (existing && ['waiting', 'inRoom'].includes(existing.queueStatus)) {
          Utils.showToast('الموعد موجود بالفعل في قائمة الطبيب', 'info');
          rerender();
          break;
        }
        afterChange(Referrals.send(id), `تم تحويل ${appt.patientName} إلى قائمة الطبيب`, rerender);
        break;
      }
      case 'complete':
        afterChange(Appointments.complete(id), `تم إنهاء زيارة ${appt.patientName}`, rerender);
        break;
      case 'noshow':
        afterChange(Appointments.noShow(id), `تم تسجيل ${appt.patientName} كـ«لم يحضر»`, rerender);
        break;
      case 'cancel':
        if (!confirm(`إلغاء موعد ${appt.patientName} (${appt.code})؟`)) return;
        afterChange(Appointments.cancel(id), 'تم إلغاء الموعد', rerender);
        break;
      case 'remove':
        if (!confirm(`حذف الموعد ${appt.code} نهائيًا؟ لا يمكن التراجع.`)) return;
        afterChange(Appointments.remove(id), 'تم حذف الموعد', rerender);
        break;
      case 'details':
        openDetailModal(id);
        break;
      default:
        break;
    }
  }

  /* ============================================================
     نافذة الرفض (سبب إلزامي + دعم الرفض الجماعي)
     ============================================================ */
  function openRejectModal(id) {
    state.rejectId = id;
    state.bulkRejectIds = null;
    const appt = Appointments.find(id);
    const input = $('rejectReason');
    const error = $('rejectError');
    if (input) input.value = '';
    if (error) error.textContent = '';
    const title = $('rejectTitle');
    if (title && appt) title.textContent = `رفض طلب الحجز ${appt.code}`;
    openModal('rejectModal');
  }

  function bindRejectModal(rerender) {
    const save = $('rejectSave');
    if (!save) return;
    save.addEventListener('click', () => {
      const reason = ($('rejectReason') || {}).value || '';
      const ids = (state.bulkRejectIds && state.bulkRejectIds.length > 1)
        ? state.bulkRejectIds
        : [state.rejectId];
      const results = ids.map((id) => Appointments.reject(id, reason));
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const error = $('rejectError');
        if (error) error.textContent = failed.reason;
        return;
      }
      state.bulkRejectIds = null;
      closeModal('rejectModal');
      afterChange({ ok: true }, ids.length > 1 ? `تم رفض ${ids.length} موعدًا` : 'تم رفض الطلب', rerender);
    });
  }

  /* ============================================================
     نافذة التفاصيل (بيانات كاملة + سجل الحالة)
     ============================================================ */
  function openDetailModal(id) {
    const appt = Appointments.find(id);
    if (!appt) return;
    state.detailId = id;
    const doctor = Store.findById(Store.KEYS.DOCTORS, appt.doctorId);
    const loc = doctor ? Clinic.locationForDate(doctor, appt.date) : null;
    const branch = loc ? Clinic.branch(loc.branchId) : null;
    const patient = Store.findById(Store.KEYS.PATIENTS, appt.patientId);

    setText('detailTitle', `تفاصيل الموعد ${appt.code}`);
    const rows = [
      ['رقم الحجز', appt.code],
      ['الحالة', Appointments.statusMeta(appt.status).label],
      ['المريض', appt.patientName],
      ['الموبايل', appt.patientPhone],
      ['الرقم القومي', patient ? patient.nationalId : '—'],
      ['العمر / النوع', patient ? `${patient.age} / ${patient.gender === 'male' ? 'ذكر' : 'أنثى'}` : '—'],
      ['الطبيب', doctor ? `${doctor.name} — ${doctor.specialty}` : '—'],
      ['المكان', Clinic.locationText(loc)],
      ['العنوان', branch ? branch.address : '—'],
      ['التاريخ والوقت', `${Utils.formatArabicDate(appt.date)} — ${Utils.to12h(appt.time)}`],
      ['سبب الزيارة', appt.reason],
      ['المصدر', appt.source === 'secretary' ? 'حجز من السكرتير' : 'حجز إلكتروني من المريض'],
      ['تاريخ الطلب', appt.createdAt ? new Date(appt.createdAt).toLocaleString('ar-EG') : '—']
    ];
    const body = $('detailBody');
    if (body) {
      body.innerHTML = rows.map(([k, v]) =>
        `<div class="summary-row"><dt>${k}</dt><dd>${Utils.escapeHtml(v == null || v === '' ? '—' : v)}</dd></div>`
      ).join('');
    }

    const history = $('historyList');
    if (history) {
      const steps = (appt.history && appt.history.length)
        ? appt.history
        : [{ status: appt.status, by: appt.source === 'secretary' ? 'secretary' : 'patient', at: appt.createdAt }];
      history.innerHTML = steps.map((h) => {
        const meta = Appointments.statusMeta(h.status);
        const extra = h.reason ? ` — ${h.reason}` : (h.note ? ` — ${h.note}` : '');
        return `
          <div class="timeline-item">
            <span class="timeline-time">${badge(h.status)}</span>
            <div class="timeline-body history-step">
              <span>${Utils.escapeHtml(meta.label)}${Utils.escapeHtml(extra)}</span>
              <span class="cell-sub">${h.at ? new Date(h.at).toLocaleString('ar-EG') : ''}</span>
            </div>
          </div>`;
      }).join('');
    }
    openModal('detailModal');
  }

  /* ============================================================
     طباعة بطاقة الموعد (بدون مكتبات)
     ============================================================ */
  function bindPrintCard() {
    const btn = $('printCardBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const appt = Appointments.find(state.detailId);
      if (!appt) return;
      const doctor = Store.findById(Store.KEYS.DOCTORS, appt.doctorId);
      const loc = doctor ? Clinic.locationForDate(doctor, appt.date) : null;
      const branch = loc ? Clinic.branch(loc.branchId) : null;
      const content = $('printCardContent');
      if (content) {
        content.innerHTML = `
          <div class="card-head">
            <img src="../assets/logo.svg" alt="شعار العيادة">
            <span class="card-title">${Utils.escapeHtml(CLINIC.name)}</span>
          </div>
          <div class="card-code" dir="ltr">${Utils.escapeHtml(appt.code)}</div>
          <dl class="summary-list">
            <div class="summary-row"><dt>المريض</dt><dd>${Utils.escapeHtml(appt.patientName)}</dd></div>
            <div class="summary-row"><dt>الطبيب</dt><dd>${Utils.escapeHtml(doctor ? doctor.name : '—')}</dd></div>
            <div class="summary-row"><dt>المكان</dt><dd>${Utils.escapeHtml(Clinic.locationText(loc) || '—')}</dd></div>
            <div class="summary-row"><dt>العنوان</dt><dd>${Utils.escapeHtml(branch ? branch.address : '—')}</dd></div>
            <div class="summary-row"><dt>التاريخ</dt><dd>${Utils.escapeHtml(Utils.formatArabicDate(appt.date))}</dd></div>
            <div class="summary-row"><dt>الوقت</dt><dd>${Utils.escapeHtml(Utils.to12h(appt.time))}</dd></div>
          </dl>
          <p class="card-note">يُرجى الحضور 10 دقائق قبل الموعد، ومعك رقم الحجز للمتابعة — ${Utils.escapeHtml(CLINIC.name)}</p>`;
      }
      const card = $('printCard');
      if (card) card.hidden = false;
      document.body.classList.add('printing-card');
      window.print();
    });
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('printing-card');
      const card = $('printCard');
      if (card) card.hidden = true;
    });
  }

  /* ============================================================
     نافذة التأجيل (يوم + أوقات من دوام الطبيب، مع استثناء الموعد)
     ============================================================ */
  function openRescheduleModal(id) {
    const appt = Appointments.find(id);
    if (!appt) return;
    state.rescheduleId = id;
    state.rescheduleTime = null;
    const doctor = Store.findById(Store.KEYS.DOCTORS, appt.doctorId);
    const info = $('rescheduleInfo');
    if (info) {
      info.innerHTML = `
        <div class="selected-doctor-inner">
          <span class="doctor-avatar sm" aria-hidden="true">${doctor ? doctor.avatar : ''}</span>
          <div><strong>${Utils.escapeHtml(appt.patientName)}</strong>
          <span class="text-muted"> — ${Utils.escapeHtml(doctor ? doctor.name : '—')}</span></div>
          <span class="badge badge-primary">${Utils.escapeHtml(Utils.formatArabicDate(appt.date, false))} — ${Utils.escapeHtml(Utils.to12h(appt.time))}</span>
        </div>`;
    }
    const dateInput = $('rescheduleDate');
    if (dateInput) {
      dateInput.value = appt.date;
      dateInput.min = Utils.todayISO();
    }
    const err = $('rescheduleDateError');
    if (err) err.textContent = '';
    const save = $('rescheduleSave');
    if (save) save.disabled = true;
    renderRescheduleSlots();
    openModal('rescheduleModal');
  }

  function renderRescheduleSlots() {
    const appt = state.rescheduleId ? Appointments.find(state.rescheduleId) : null;
    const doctor = appt ? Store.findById(Store.KEYS.DOCTORS, appt.doctorId) : null;
    const dateInput = $('rescheduleDate');
    const grid = $('rescheduleSlots');
    const save = $('rescheduleSave');
    if (!appt || !doctor || !dateInput || !grid) return;
    const date = dateInput.value;
    state.rescheduleTime = null;
    if (save) save.disabled = true;
    if (!date) { grid.innerHTML = ''; return; }
    if (!doctor.workDays.includes(Utils.dayOfWeek(date))) {
      grid.innerHTML = '<p class="lookup-empty">الطبيب لا يعمل في هذا اليوم — اختر يومًا من أيام عمله</p>';
      return;
    }
    const slots = Appointments.slotsFor(doctor, date, { excludeId: appt.id });
    grid.innerHTML = slots.map((s) => {
      const past = Appointments.isPastDateTime(date, s.time);
      const disabled = s.taken || past;
      const label = s.taken ? 'محجوز' : past ? 'فات وقته' : '';
      return `
        <button type="button" class="slot" data-time="${s.time}" ${disabled ? 'disabled' : ''} title="${label || 'متاح'}">
          ${Utils.to12h(s.time)}${label ? `<small>${label}</small>` : ''}
        </button>`;
    }).join('');
  }

  function bindRescheduleModal(rerender) {
    const dateInput = $('rescheduleDate');
    if (dateInput) {
      dateInput.addEventListener('change', () => {
        const err = $('rescheduleDateError');
        if (err) err.textContent = '';
        renderRescheduleSlots();
      });
    }
    const grid = $('rescheduleSlots');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const slot = e.target.closest('[data-time]');
        if (!slot || slot.disabled) return;
        state.rescheduleTime = slot.dataset.time;
        grid.querySelectorAll('.slot').forEach((s) => s.classList.toggle('is-selected', s === slot));
        const save = $('rescheduleSave');
        if (save) save.disabled = false;
      });
    }
    const save = $('rescheduleSave');
    if (save) {
      save.addEventListener('click', () => {
        const date = ($('rescheduleDate') || {}).value;
        const res = Appointments.reschedule(state.rescheduleId, date, state.rescheduleTime);
        if (!res.ok) {
          const err = $('rescheduleDateError');
          if (err) err.textContent = res.reason;
          return;
        }
        closeModal('rescheduleModal');
        afterChange(res, `تم التأجيل إلى ${Utils.formatArabicDate(date, false)} — ${Utils.to12h(state.rescheduleTime)}`, rerender);
      });
    }
  }

  /* ============================================================
     نافذة الحجز الهاتفي (موعد جديد من السكرتير)
     ============================================================ */
  function resetNewAppt() {
    state.newAppt = { patientId: null, doctorId: null, date: null, time: null };
    const formEl = $('newApptForm');
    if (formEl) formEl.reset();
    const fields = $('newPatientFields');
    if (fields) fields.hidden = true;
    const toggle = $('toggleNewPatient');
    if (toggle) toggle.textContent = '＋ مريض جديد';
    const summary = $('apptSummary');
    if (summary) summary.hidden = true;
    const selected = $('lookupSelected');
    if (selected) selected.hidden = true;
    const chips = $('apptDateChips');
    if (chips) chips.innerHTML = '';
    const slots = $('apptSlots');
    if (slots) slots.innerHTML = '';
    const results = $('lookupResults');
    if (results) { results.innerHTML = ''; results.classList.remove('is-open'); }
    document.querySelectorAll('#newApptModal .field-error').forEach((el) => { el.textContent = ''; });
    document.querySelectorAll('#newApptModal .is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  }

  function renderLookup(q) {
    const results = $('lookupResults');
    if (!results) return;
    if (!q) { results.innerHTML = ''; results.classList.remove('is-open'); return; }
    const ql = q.toLowerCase();
    const matches = Store.getAll(Store.KEYS.PATIENTS).filter((p) =>
      String(p.phone).includes(q) || String(p.name || '').toLowerCase().includes(ql)
    ).slice(0, 6);
    results.innerHTML = matches.length
      ? matches.map((p) => `
          <button type="button" class="lookup-item" data-patient="${p.id}">
            <span class="cell-main">${Utils.escapeHtml(p.name)}</span>
            <span class="cell-sub" dir="ltr">${Utils.escapeHtml(p.phone)}</span>
          </button>`).join('')
      : '<p class="lookup-empty">لا يوجد مريض مطابق — يمكنك إضافته كمريض جديد</p>';
    results.classList.add('is-open');
  }

  function selectPatient(id) {
    const p = Store.findById(Store.KEYS.PATIENTS, id);
    if (!p) return;
    state.newAppt.patientId = id;
    const selected = $('lookupSelected');
    if (selected) {
      selected.hidden = false;
      selected.innerHTML = `✅ تم اختيار: ${Utils.escapeHtml(p.name)} <span dir="ltr">${Utils.escapeHtml(p.phone)}</span>`;
    }
    const results = $('lookupResults');
    if (results) { results.innerHTML = ''; results.classList.remove('is-open'); }
    const lookup = $('patientLookup');
    if (lookup) lookup.value = p.phone;
    const fields = $('newPatientFields');
    if (fields) fields.hidden = true;
    const toggle = $('toggleNewPatient');
    if (toggle) toggle.textContent = '＋ مريض جديد';
    const err = $('patientError');
    if (err) err.textContent = '';
    renderApptSummary();
  }

  function bindNewApptModal() {
    const openBtn = $('newAppointmentBtn');
    if (!openBtn) return;
    openBtn.addEventListener('click', () => {
      resetNewAppt();
      const doctorSelect = $('apptDoctor');
      if (doctorSelect) {
        doctorSelect.innerHTML = '<option value="">— اختر الطبيب —</option>' + doctorOptionsHtml();
      }
      openModal('newApptModal');
    });

    const lookup = $('patientLookup');
    if (lookup) {
      lookup.addEventListener('input', () => renderLookup(lookup.value.trim()));
    }

    const results = $('lookupResults');
    if (results) {
      results.addEventListener('click', (e) => {
        const item = e.target.closest('[data-patient]');
        if (item) selectPatient(item.dataset.patient);
      });
    }

    const toggle = $('toggleNewPatient');
    if (toggle) {
      toggle.addEventListener('click', () => {
        state.newAppt.patientId = null;
        const fields = $('newPatientFields');
        const selected = $('lookupSelected');
        if (fields) fields.hidden = !fields.hidden;
        if (selected) selected.hidden = true;
        toggle.textContent = (fields && !fields.hidden) ? '— إلغاء المريض الجديد' : '＋ مريض جديد';
        const lookupInput = $('patientLookup');
        if (lookupInput) lookupInput.value = '';
        renderLookup('');
      });
    }

    const doctorSelect = $('apptDoctor');
    if (doctorSelect) {
      doctorSelect.addEventListener('change', () => {
        state.newAppt.doctorId = doctorSelect.value;
        state.newAppt.date = null;
        state.newAppt.time = null;
        const err = $('apptDoctorError');
        if (err) err.textContent = '';
        renderApptDates();
        renderApptSlots();
      });
    }

    const chips = $('apptDateChips');
    if (chips) {
      chips.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-date]');
        if (!chip) return;
        state.newAppt.date = chip.dataset.date;
        state.newAppt.time = null;
        chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-selected', c === chip));
        renderApptSlots();
      });
    }

    const slots = $('apptSlots');
    if (slots) {
      slots.addEventListener('click', (e) => {
        const slot = e.target.closest('[data-time]');
        if (!slot || slot.disabled) return;
        state.newAppt.time = slot.dataset.time;
        slots.querySelectorAll('.slot').forEach((s) => s.classList.toggle('is-selected', s === slot));
        const err = $('apptSlotError');
        if (err) err.textContent = '';
        renderApptSummary();
      });
    }

    const form = $('newApptForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveNewAppointment();
    });
  }

  function renderApptDates() {
    const chips = $('apptDateChips');
    const doctor = state.newAppt.doctorId
      ? Store.findById(Store.KEYS.DOCTORS, state.newAppt.doctorId)
      : null;
    if (!chips) return;
    if (!doctor) { chips.innerHTML = ''; return; }
    const todayIso = Utils.todayISO();
    const todayDow = Utils.dayOfWeek(todayIso);
    const dates = [];
    for (let i = 0; i <= 13; i++) {
      if (doctor.workDays.includes((todayDow + i) % 7)) dates.push(Utils.addDaysISO(todayIso, i));
    }
    chips.innerHTML = dates.map((iso, i) => {
      const dow = Utils.dayOfWeek(iso);
      const [y, m, d] = iso.split('-').map(Number);
      return `
        <button type="button" class="chip date-chip ${i === 0 ? 'is-selected' : ''}" data-date="${iso}" role="option" aria-selected="${i === 0}">
          <strong>${Utils.dayNames[dow]}</strong>
          <span>${d} ${Utils.monthNames[m - 1]}</span>
        </button>`;
    }).join('');
    state.newAppt.date = dates.length ? dates[0] : null;
  }

  function renderApptSlots() {
    const grid = $('apptSlots');
    const doctor = state.newAppt.doctorId
      ? Store.findById(Store.KEYS.DOCTORS, state.newAppt.doctorId)
      : null;
    if (!grid) return;
    if (!doctor || !state.newAppt.date) { grid.innerHTML = ''; return; }
    const slots = Appointments.slotsFor(doctor, state.newAppt.date);
    grid.innerHTML = slots.map((s) => {
      const past = Appointments.isPastDateTime(state.newAppt.date, s.time);
      const disabled = s.taken || past;
      const label = s.taken ? 'محجوز' : past ? 'فات وقته' : '';
      return `
        <button type="button" class="slot" data-time="${s.time}" ${disabled ? 'disabled' : ''} title="${label || 'متاح'}">
          ${Utils.to12h(s.time)}${label ? `<small>${label}</small>` : ''}
        </button>`;
    }).join('') || '<p class="lookup-empty">لا توجد أوقات في هذا اليوم</p>';
    renderApptSummary();
  }

  function renderApptSummary() {
    const box = $('apptSummary');
    if (!box) return;
    const doctor = state.newAppt.doctorId
      ? Store.findById(Store.KEYS.DOCTORS, state.newAppt.doctorId)
      : null;
    if (!doctor || !state.newAppt.date || !state.newAppt.time) { box.hidden = true; return; }
    const loc = Clinic.locationForDate(doctor, state.newAppt.date);
    box.hidden = false;
    box.innerHTML = `
      <div class="selected-doctor-inner">
        <span class="doctor-avatar sm" aria-hidden="true">${doctor.avatar}</span>
        <div><strong>${Utils.escapeHtml(doctor.name)}</strong>
        <span class="text-muted"> — ${Utils.escapeHtml(doctor.specialty)}</span></div>
        <span class="badge badge-primary">${Utils.escapeHtml(Utils.formatArabicDate(state.newAppt.date, false))} — ${Utils.escapeHtml(Utils.to12h(state.newAppt.time))}</span>
      </div>
      <div class="selected-doctor-inner location-row">
        <span aria-hidden="true">📍</span>
        <span>${Utils.escapeHtml(Clinic.locationText(loc) || '—')}</span>
      </div>`;
  }

  function saveNewAppointment() {
    const errors = [];

    /* 1) المريض: مختار من البحث أو بيانات جديدة */
    let patient = state.newAppt.patientId
      ? Store.findById(Store.KEYS.PATIENTS, state.newAppt.patientId)
      : null;
    const fields = $('newPatientFields');
    const creatingNew = fields && !fields.hidden;
    if (creatingNew) {
      let newOk = true;
      Object.keys(NP_FIELDS).forEach((inputId) => {
        if (!validateField(NP_FIELDS[inputId], inputId)) newOk = false;
      });
      if (!newOk) errors.push('بيانات المريض الجديد');
    } else if (!patient) {
      const err = $('patientError');
      if (err) err.textContent = 'اختر مريضًا من البحث أو أضف مريضًا جديدًا';
      errors.push('المريض');
    }

    /* 2) الطبيب واليوم والوقت */
    if (!state.newAppt.doctorId) {
      const err = $('apptDoctorError');
      if (err) err.textContent = 'اختر الطبيب';
      errors.push('الطبيب');
    }
    if (!state.newAppt.date || !state.newAppt.time) {
      const err = $('apptSlotError');
      if (err) err.textContent = 'اختر اليوم والوقت';
      errors.push('اليوم والوقت');
    }

    /* 3) سبب الزيارة */
    if (!validateField('reason', 'apptReason')) errors.push('سبب الزيارة');

    if (errors.length) {
      Utils.showToast('راجع الحقول المطلوبة من فضلك', 'error');
      return;
    }

    /* إنشاء المريض الجديد إن لزم */
    if (!patient && creatingNew) {
      const res = Patients.upsert({
        nationalId: $('npNationalId').value.trim(),
        name: $('npName').value.trim(),
        phone: $('npPhone').value.trim(),
        age: Number($('npAge').value),
        gender: $('npGender').value
      });
      patient = res.patient;
    }

    /* فحص تعارض نهائي قبل الحفظ */
    if (Appointments.takenSlots(state.newAppt.doctorId, state.newAppt.date).includes(state.newAppt.time)) {
      Utils.showToast('عذرًا، تم حجز هذا الوقت للتو — اختر وقتًا آخر', 'error');
      renderApptSlots();
      return;
    }

    const now = new Date().toISOString();
    const appt = Store.insert(Store.KEYS.APPOINTMENTS, {
      id: Utils.uid('apt'),
      code: Appointments.nextCode(),
      doctorId: state.newAppt.doctorId,
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone,
      date: state.newAppt.date,
      time: state.newAppt.time,
      reason: $('apptReason').value.trim(),
      status: 'approved',
      source: 'secretary',
      createdAt: now,
      history: [{ status: 'approved', by: 'secretary', at: now, note: 'حجز من السكرتير' }]
    });

    closeModal('newApptModal');
    renderAll();
    Utils.showToast(`تم تأكيد موعد ${appt.patientName} — ${appt.code}`);
  }

  /* ============================================================
     صفحة المواعيد — دوال العرض
     ============================================================ */
  function renderAll() {
    renderDoctorFilter();
    renderStatusChips();
    renderAppointments();
    renderReception();
  }

  function renderDoctorFilter() {
    const select = $('doctorFilter');
    if (!select) return;
    select.innerHTML = '<option value="all">كل الأطباء</option>' + doctorOptionsHtml(state.filters.doctorId);
    select.value = state.filters.doctorId;
  }

  function renderStatusChips() {
    const wrap = $('statusChips');
    if (!wrap) return;
    const all = Store.getAll(Store.KEYS.APPOINTMENTS);
    const counts = Appointments.statusCounts(all);
    const chips = [{ value: 'all', label: 'الكل', count: all.length }]
      .concat(Object.keys(Appointments.STATUSES).map((s) => ({
        value: s,
        label: Appointments.statusMeta(s).label,
        count: counts[s] || 0
      })));
    wrap.innerHTML = chips.map((c) => `
      <button type="button" class="seg ${state.filters.status === c.value ? 'is-selected' : ''}"
              data-status="${c.value}" aria-pressed="${state.filters.status === c.value}">
        ${Utils.escapeHtml(c.label)} <span class="count">${c.count}</span>
      </button>`).join('');
  }

  function visibleAppointments() {
    const f = {
      q: state.filters.q,
      status: state.filters.status,
      doctorId: state.filters.doctorId,
      date: state.filters.date
    };
    const explicitDate = ($('dateFrom') || {}).value;
    if (explicitDate) f.date = explicitDate;
    return Appointments.sort(
      Appointments.filter(Store.getAll(Store.KEYS.APPOINTMENTS), f),
      state.sort.key,
      state.sort.dir
    );
  }

  function renderAppointments() {
    const body = $('appointmentsTableBody');
    if (!body) return;
    const list = visibleAppointments();
    setText('resultCount', `${list.length} موعد`);
    body.innerHTML = list.map(appointmentRow).join('');
    const empty = $('emptyAppointments');
    if (empty) empty.hidden = list.length > 0;
    updateBulkBar();
    syncSelectAll(list);
  }

  function syncSelectAll(list) {
    const selectAll = $('selectAll');
    if (!selectAll) return;
    selectAll.checked = list.length > 0 && list.every((a) => state.selected.has(a.id));
  }

  function updateBulkBar() {
    const bar = $('bulkBar');
    if (!bar) return;
    bar.classList.toggle('is-visible', state.selected.size > 0);
    setText('bulkCount', `${state.selected.size} محدد`);
  }

  function renderReception() {
    const body = $('receptionBoard');
    if (!body) return;
    const today = Utils.todayISO();
    setText('receptionDate', Utils.formatArabicDate(today));
    const list = Appointments.waitingList(today);
    body.innerHTML = list.map((a) => {
      const late = Appointments.isPastDateTime(a.date, a.time) && a.status === 'approved';
      const action = a.status === 'approved'
        ? `<button type="button" class="btn btn-primary btn-sm" data-action="checkin" data-id="${a.id}">🖥️ تسجيل حضور</button>`
        : `<button type="button" class="btn btn-success btn-sm" data-action="complete" data-id="${a.id}">✅ إكمال الزيارة</button>`;
      return `
        <tr data-id="${a.id}">
          <td data-label="الوقت"><span class="cell-main">${Utils.to12h(a.time)}</span>${late ? ' <span class="badge badge-warning">متأخر</span>' : ''}</td>
          <td data-label="المريض">${patientCell(a)}</td>
          <td data-label="الطبيب">${doctorCell(a)}</td>
          <td data-label="الحالة">${badge(a.status)}</td>
          <td class="no-print" data-label="إجراء">${action}</td>
        </tr>`;
    }).join('');
    const empty = $('emptyReception');
    if (empty) empty.hidden = list.length > 0;
  }

  /* ============================================================
     صفحة المواعيد — الربط والأحداث
     ============================================================ */
  function bindTableEvents() {
    const body = $('appointmentsTableBody');
    if (!body) return;
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) { handleAction(btn.dataset.action, btn.dataset.id, renderAll); return; }
      const check = e.target.closest('.row-check');
      if (check) {
        if (check.checked) state.selected.add(check.dataset.id);
        else state.selected.delete(check.dataset.id);
        updateBulkBar();
      }
    });
    const selectAll = $('selectAll');
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        const list = visibleAppointments();
        list.forEach((a) => {
          if (selectAll.checked) state.selected.add(a.id);
          else state.selected.delete(a.id);
        });
        renderAppointments();
      });
    }
    document.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort = { key, dir: 'asc' };
        }
        document.querySelectorAll('th.sortable').forEach((h) => h.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', state.sort.dir === 'asc' ? 'ascending' : 'descending');
        renderAppointments();
      });
    });
  }

  function bindBulkActions() {
    const clear = $('bulkClear');
    if (clear) clear.addEventListener('click', () => { state.selected.clear(); renderAppointments(); });

    const approve = $('bulkApprove');
    if (approve) approve.addEventListener('click', () => {
      let done = 0, skipped = 0;
      state.selected.forEach((id) => {
        const appt = Appointments.find(id);
        if (appt && appt.status === 'pending') { Appointments.approve(id); done += 1; }
        else skipped += 1;
      });
      state.selected.clear();
      renderAll();
      Utils.showToast(done
        ? `تم تأكيد ${done} موعدًا${skipped ? ` — تم تجاهل ${skipped} غير معلّق` : ''}`
        : 'لا توجد مواعيد معلّقة بين المحددين', done ? 'success' : 'info');
    });

    const reject = $('bulkReject');
    if (reject) reject.addEventListener('click', () => {
      const pendingIds = [...state.selected].filter((id) => {
        const appt = Appointments.find(id);
        return appt && appt.status === 'pending';
      });
      if (!pendingIds.length) {
        Utils.showToast('لا توجد مواعيد معلّقة بين المحددين', 'info');
        return;
      }
      openRejectModal(pendingIds[0]);
      state.bulkRejectIds = pendingIds;
    });
  }

  function bindFilterInputs() {
    const search = $('searchInput');
    if (search) search.addEventListener('input', () => {
      state.filters.q = search.value;
      renderAppointments();
    });
    const doctor = $('doctorFilter');
    if (doctor) doctor.addEventListener('change', () => {
      state.filters.doctorId = doctor.value;
      renderAppointments();
    });
    const quick = $('quickDates');
    if (quick) quick.addEventListener('change', () => {
      state.filters.date = quick.value;
      const dateInput = $('dateFrom');
      if (dateInput && quick.value !== 'all') dateInput.value = '';
      renderAppointments();
    });
    const dateFrom = $('dateFrom');
    if (dateFrom) dateFrom.addEventListener('change', () => {
      state.filters.date = dateFrom.value || 'all';
      const quickSel = $('quickDates');
      if (quickSel && dateFrom.value) quickSel.value = 'all';
      renderAppointments();
    });
  }

  function bindTabs() {
    const tabs = [{ btn: 'tabAll', view: 'viewAll' }, { btn: 'tabReception', view: 'viewReception' }];
    tabs.forEach(({ btn, view }) => {
      const button = $(btn);
      if (!button) return;
      button.addEventListener('click', () => {
        tabs.forEach((t) => {
          const b = $(t.btn);
          const v = $(t.view);
          const active = t.btn === btn;
          if (b) {
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-selected', String(active));
          }
          if (v) v.hidden = !active;
        });
      });
    });
  }

  function bindCsv() {
    const btn = $('csvBtn');
    if (btn) btn.addEventListener('click', () => {
      const rows = visibleAppointments().map((a) => {
        const doctor = Store.findById(Store.KEYS.DOCTORS, a.doctorId);
        const loc = doctor ? Clinic.locationForDate(doctor, a.date) : null;
        return [
          a.code, a.date, a.time,
          a.patientName, a.patientPhone,
          doctor ? doctor.name : '',
          Clinic.locationText(loc),
          Appointments.statusMeta(a.status).label,
          a.reason || ''
        ];
      });
      Export.download('appointments.csv', Export.csvContent(
        ['رقم الحجز', 'التاريخ', 'الوقت', 'المريض', 'الموبايل', 'الطبيب', 'المكان', 'الحالة', 'سبب الزيارة'],
        rows
      ));
      Utils.showToast('تم تصدير ملف CSV');
    });

    const patientsBtn = $('csvPatientsBtn');
    if (patientsBtn) patientsBtn.addEventListener('click', () => {
      const rows = Patients.withStats().map((p) => [
        p.name, p.phone, p.nationalId, p.age,
        p.gender === 'male' ? 'ذكر' : 'أنثى',
        p.count,
        p.upcoming ? `${p.upcoming.date} ${p.upcoming.time}` : ''
      ]);
      Export.download('patients.csv', Export.csvContent(
        ['الاسم', 'الموبايل', 'الرقم القومي', 'العمر', 'النوع', 'عدد المواعيد', 'الموعد القادم'],
        rows
      ));
      Utils.showToast('تم تصدير ملف CSV');
    });
  }

  function initAppointments() {
    initSession(renderAll);
    initCommonActions(renderAll);
    bindTableEvents();
    bindBulkActions();
    bindFilterInputs();
    bindTabs();
    bindCsv();
    bindPrintCard();
    bindRejectModal(renderAll);
    bindRescheduleModal(renderAll);
    bindNewApptModal();
    const printBtn = $('printBtn');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    const receptionBody = $('receptionBoard');
    if (receptionBody) {
      receptionBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) handleAction(btn.dataset.action, btn.dataset.id, renderAll);
      });
    }
    renderAll();
  }

  /* ============================================================
     لوحة التحكم
     ============================================================ */
  function renderKpis() {
    const s = Appointments.stats();
    setText('statToday', s.today);
    setText('statPending', s.pending);
    setText('statApproved', s.approvedToday);
    setText('statRejected', s.rejected + s.cancelled);
    setText('statPatients', s.patients);
    setText('statOccupancy', `${s.occupancy}%`);
    const bar = $('occupancyBar');
    if (bar) bar.style.width = `${s.occupancy}%`;
  }

  function renderProfileSummary() {
    const card = $('dashboardProfileSummary');
    const staff = Session.currentStaff();
    if (!card || !staff) return;
    const stats = Appointments.statsForClinic();
    card.hidden = false;
    card.innerHTML = `<div class="profile-avatar" aria-hidden="true">🗂️</div><div class="profile-info"><h2>${Utils.escapeHtml(staff.name)}</h2><div class="profile-meta"><span>👤 ${Utils.escapeHtml(staff.user)}</span><span>📅 ${stats.total} حجز في العيادة</span><span>⏳ ${stats.pending} قيد المراجعة</span></div></div><a class="btn btn-outline btn-sm" href="profile.html">عرض الملف</a>`;
  }

  function renderPending() {
    const body = $('pendingTableBody');
    if (!body) return;
    const list = Store.getAll(Store.KEYS.APPOINTMENTS)
      .filter((a) => a.status === 'pending')
      .sort(Utils.byDateTime);
    setText('pendingCount', String(list.length));
    body.innerHTML = list.map(pendingRow).join('');
    const empty = $('emptyPending');
    if (empty) empty.hidden = list.length > 0;
  }

  function renderToday() {
    const timeline = $('todayTimeline');
    if (!timeline) return;
    const today = Utils.todayISO();
    setText('todayLabel', Utils.formatArabicDate(today));
    const list = Appointments.waitingList(today);
    if (!list.length) {
      timeline.innerHTML = '<p class="lookup-empty">لا توجد مواعيد مؤكدة اليوم</p>';
      return;
    }
    timeline.innerHTML = list.map((a) => {
      const past = Appointments.isPastDateTime(a.date, a.time);
      const doctor = Store.findById(Store.KEYS.DOCTORS, a.doctorId) || {};
      return `
        <div class="timeline-item ${past ? 'is-past' : ''}">
          <span class="timeline-time">${Utils.to12h(a.time)}</span>
          <div class="timeline-body">
            <span class="cell-main">${Utils.escapeHtml(a.patientName)}</span>
            <span class="cell-sub">${Utils.escapeHtml(doctor.name || '')} — ${Utils.escapeHtml(a.code)}</span>
            <span class="cell-sub">${badge(a.status)}</span>
          </div>
        </div>`;
    }).join('');
  }

  function renderDoctorsToday() {
    const container = $('doctorsTodayList');
    if (!container) return;
    const today = Utils.todayISO();
    const dow = Utils.dayOfWeek(today);
    const waiting = Appointments.waitingList(today);
    const doctors = Store.getAll(Store.KEYS.DOCTORS).filter((d) => d.workDays.includes(dow));
    if (!doctors.length) {
      container.innerHTML = '<p class="lookup-empty">لا يعمل أي طبيب اليوم (إجازة أسبوعية)</p>';
      return;
    }
    container.innerHTML = doctors.map((d) => {
      const loc = Clinic.locationForDate(d, today);
      const count = waiting.filter((a) => a.doctorId === d.id).length;
      return `
        <div class="timeline-item">
          <span class="doctor-avatar sm" aria-hidden="true">${d.avatar}</span>
          <div class="timeline-body">
            <span class="cell-main">${Utils.escapeHtml(d.name)}</span>
            <span class="cell-sub">📍 ${Utils.escapeHtml(Clinic.locationText(loc) || '—')}</span>
            <span class="cell-sub">مواعيد اليوم: ${count}</span>
          </div>
        </div>`;
    }).join('');
  }

  function renderWeeklyChart() {
    const svg = $('weeklyChart');
    if (!svg) return;
    const data = Appointments.weeklyUpcoming();
    const W = 560, H = 220;
    const pad = { top: 24, right: 10, bottom: 36, left: 10 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;
    const totals = data.map((d) => d.pending + d.active);
    const max = Math.max(1, ...totals);
    const barW = innerW / data.length;
    let out = '';
    [0, .5, 1].forEach((t) => {
      const y = pad.top + innerH - t * innerH;
      out += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1"></line>`;
    });
    data.forEach((d, i) => {
      const total = totals[i];
      const x = pad.left + i * barW + barW * .18;
      const w = barW * .64;
      const base = pad.top + innerH;
      const hActive = (d.active / max) * innerH;
      const hPending = (d.pending / max) * innerH;
      if (total) {
        out += `<rect x="${x}" y="${base - hActive - hPending}" width="${w}" height="${hPending}" fill="${CHART_COLORS.pending}" rx="3"><title>${d.date}: ${d.pending} قيد المراجعة</title></rect>`;
        out += `<rect x="${x}" y="${base - hActive}" width="${w}" height="${hActive}" fill="${CHART_COLORS.approved}" rx="3"><title>${d.date}: ${d.active} مؤكدة</title></rect>`;
        out += `<text x="${x + w / 2}" y="${base - hActive - hPending - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e293b">${total}</text>`;
      }
      out += `<text x="${x + w / 2}" y="${H - 14}" text-anchor="middle" font-size="11" fill="#64748b">${SHORT_DAYS[Utils.dayOfWeek(d.date)]}</text>`;
    });
    svg.innerHTML = out;
    const legend = $('weeklyLegend');
    if (legend) {
      legend.innerHTML = '<span><i style="background:#16a34a"></i> مؤكدة</span><span><i style="background:#f59e0b"></i> قيد المراجعة</span>';
    }
  }

  function renderStatusChart() {
    const svg = $('statusChart');
    if (!svg) return;
    const counts = Appointments.statusCounts();
    const entries = Object.entries(counts).filter(([, n]) => n > 0);
    const legend = $('statusLegend');
    if (!entries.length) {
      svg.innerHTML = '<text x="110" y="110" text-anchor="middle" font-size="12" fill="#64748b">لا توجد بيانات</text>';
      if (legend) legend.innerHTML = '';
      return;
    }
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const cx = 110, cy = 110, r = 78, sw = 26;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    let out = '';
    entries.forEach(([status, n]) => {
      const dash = (n / total) * circumference;
      const meta = Appointments.statusMeta(status);
      out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CHART_COLORS[status] || '#94a3b8'}" stroke-width="${sw}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"><title>${meta.label}: ${n}</title></circle>`;
      offset += dash;
    });
    out += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="28" font-weight="800" fill="#1e293b">${total}</text>`;
    svg.innerHTML = out;
    if (legend) {
      legend.innerHTML = entries.map(([status, n]) => {
        const meta = Appointments.statusMeta(status);
        return `<span><i style="background:${CHART_COLORS[status] || '#94a3b8'}"></i> ${Utils.escapeHtml(meta.label)} (${n})</span>`;
      }).join('');
    }
  }

  function initDashboard() {
    const render = () => {
      renderKpis();
      renderProfileSummary();
      renderPending();
      renderToday();
      renderDoctorsToday();
      renderWeeklyChart();
      renderStatusChart();
    };
    initSession(render);
    initCommonActions(render);
    const pendingBody = $('pendingTableBody');
    if (pendingBody) {
      pendingBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) handleAction(btn.dataset.action, btn.dataset.id, render);
      });
    }
    bindRejectModal(render);
    render();
  }

  /* ============================================================
     صفحة المرضى
     ============================================================ */
  const patientState = { q: '', sort: 'name', editingId: null };

  function visiblePatients() {
    let list = Patients.withStats();
    if (patientState.q) {
      list = list.filter((p) =>
        `${p.name} ${p.phone} ${p.nationalId}`.toLowerCase().includes(patientState.q));
    }
    const sorters = {
      name: (a, b) => String(a.name).localeCompare(String(b.name), 'ar'),
      count: (a, b) => b.count - a.count,
      upcoming: (a, b) => {
        const av = a.upcoming ? a.upcoming.date : '9999-12-31';
        const bv = b.upcoming ? b.upcoming.date : '9999-12-31';
        return av.localeCompare(bv);
      }
    };
    return [...list].sort(sorters[patientState.sort] || sorters.name);
  }

  function renderPatients() {
    const body = $('patientsTableBody');
    if (!body) return;
    const list = visiblePatients();
    setText('resultCount', `${list.length} مريض`);
    body.innerHTML = list.map((p) => `
      <tr data-id="${p.id}">
        <td data-label="المريض"><span class="cell-main">${Utils.escapeHtml(p.name)}</span></td>
        <td data-label="الموبايل" dir="ltr">${Utils.escapeHtml(p.phone)}</td>
        <td data-label="الرقم القومي" dir="ltr">${Utils.escapeHtml(p.nationalId)}</td>
        <td data-label="العمر/النوع">${p.age} / ${p.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
        <td data-label="المواعيد">${p.count} ${p.activeCount ? `<span class="badge badge-success">${p.activeCount} فعّال</span>` : ''}</td>
        <td data-label="الموعد القادم">${p.upcoming ? `${Utils.escapeHtml(Utils.formatArabicDate(p.upcoming.date, false))} — ${Utils.escapeHtml(Utils.to12h(p.upcoming.time))}` : '—'}</td>
        <td class="no-print" data-label="إجراءات">
          <div class="row-actions">
            <button type="button" class="btn btn-outline btn-sm" data-patient-action="open" data-id="${p.id}" title="الملف">📄</button>
            <button type="button" class="btn btn-outline btn-sm" data-patient-action="edit" data-id="${p.id}" title="تعديل">✏️</button>
            <button type="button" class="btn btn-outline btn-sm" data-patient-action="delete" data-id="${p.id}" title="حذف">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
    const empty = $('emptyPatients');
    if (empty) empty.hidden = list.length > 0;
  }

  function openPatientModal(id, readOnly = false) {
    patientState.editingId = id;
    const patient = id ? Store.findById(Store.KEYS.PATIENTS, id) : null;
    const inputIds = ['pName', 'pPhone', 'pNationalId', 'pAge', 'pGender'];
    setText('patientModalTitle', patient ? `ملف المريض — ${patient.name}` : 'إضافة مريض جديد');
    const form = $('patientForm');
    if (form) form.reset();
    inputIds.forEach((inputId) => {
      const input = $(inputId);
      if (input) input.classList.remove('is-invalid');
    });
    document.querySelectorAll('#patientModal .field-error').forEach((el) => { el.textContent = ''; });
    if (patient) {
      setValue('pName', patient.name);
      setValue('pPhone', patient.phone);
      setValue('pNationalId', patient.nationalId);
      setValue('pAge', patient.age);
      setValue('pGender', patient.gender);
    }
    inputIds.forEach((inputId) => {
      const input = $(inputId);
      if (input) input.disabled = readOnly;
    });
    const save = $('patientSave');
    if (save) save.hidden = readOnly;

    const list = $('patientAppointmentsList');
    if (list) {
      if (!patient) {
        list.innerHTML = '<p class="lookup-empty">مريض جديد — أدخل بياناته ثم اضغط حفظ</p>';
      } else {
        const mine = Store.getAll(Store.KEYS.APPOINTMENTS)
          .filter((a) => a.patientId === patient.id)
          .sort(Utils.byDateTime)
          .reverse();
        list.innerHTML = mine.length ? mine.map((a) => {
          const doctor = Store.findById(Store.KEYS.DOCTORS, a.doctorId) || {};
          return `
            <div class="timeline-item">
              <span class="timeline-time">${Utils.to12h(a.time)}</span>
              <div class="timeline-body">
                <span class="cell-main">${Utils.escapeHtml(Utils.formatArabicDate(a.date, false))} — ${Utils.escapeHtml(a.code)}</span>
                <span class="cell-sub">${Utils.escapeHtml(doctor.name || '')}</span>
                <span class="cell-sub">${badge(a.status)}</span>
              </div>
            </div>`;
        }).join('') : '<p class="lookup-empty">لا توجد مواعيد لهذا المريض</p>';
      }
    }
    openModal('patientModal');
  }

  function savePatient() {
    const rules = {
      pName: 'fullName',
      pPhone: 'phone',
      pNationalId: 'nationalId',
      pAge: 'age',
      pGender: 'gender'
    };
    let ok = true;
    Object.keys(rules).forEach((inputId) => {
      if (!validateField(rules[inputId], inputId)) ok = false;
    });
    if (!ok) { Utils.showToast('راجع الحقول المطلوبة', 'error'); return; }

    const data = {
      name: $('pName').value.trim(),
      phone: $('pPhone').value.trim(),
      nationalId: $('pNationalId').value.trim(),
      age: Number($('pAge').value),
      gender: $('pGender').value
    };

    /* منع تكرار الموبايل مع مريض آخر */
    const existingByPhone = Patients.findByPhone(data.phone);
    if (existingByPhone && existingByPhone.id !== patientState.editingId) {
      const errorEl = document.querySelector('[data-error-for="pPhone"]');
      if (errorEl) errorEl.textContent = 'هذا الرقم مسجّل لمريض آخر';
      Utils.showToast('رقم الموبايل مسجّل بالفعل لمريض آخر', 'error');
      return;
    }

    const res = Patients.upsert(
      patientState.editingId ? { id: patientState.editingId, ...data } : data
    );
    closeModal('patientModal');
    renderPatients();
    Utils.showToast(res.isNew ? `تمت إضافة المريض ${data.name}` : 'تم تحديث بيانات المريض');
  }

  function bindPatientsEvents() {
    const search = $('patientSearch');
    if (search) search.addEventListener('input', () => {
      patientState.q = search.value.trim().toLowerCase();
      renderPatients();
    });
    const sort = $('patientsSort');
    if (sort) sort.addEventListener('change', () => {
      patientState.sort = sort.value;
      renderPatients();
    });
    const newBtn = $('newPatientBtn');
    if (newBtn) newBtn.addEventListener('click', () => openPatientModal(null));
    const save = $('patientSave');
    if (save) save.addEventListener('click', savePatient);
    const body = $('patientsTableBody');
    if (body) {
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-patient-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const action = btn.dataset.patientAction;
        if (action === 'open' || action === 'edit') {
          openPatientModal(id, action === 'open');
        } else if (action === 'delete') {
          const patient = Store.findById(Store.KEYS.PATIENTS, id);
          if (!patient) return;
          if (!confirm(`حذف المريض «${patient.name}»؟`)) return;
          afterChange(Patients.removeSafe(id), 'تم حذف المريض', renderPatients);
        }
      });
    }
    document.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        patientState.sort = th.dataset.sort;
        document.querySelectorAll('th.sortable').forEach((h) => h.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', 'ascending');
        renderPatients();
      });
    });
  }

  function initPatients() {
    initSession(renderPatients);
    initCommonActions(renderPatients);
    bindPatientsEvents();
    bindCsv();
    renderPatients();
  }

  /* ============================================================
     التحويل للطبيب (Referrals)
     ============================================================ */
  /* حالة الطابور عند الطبيب */
  const QUEUE_STATUSES = {
    waiting: { label: 'بانتظار الطبيب', badge: 'badge-warning' },
    inRoom: { label: 'داخل الكشف', badge: 'badge-info' },
    done: { label: 'تمت الزيارة', badge: 'badge-primary' }
  };

  function updateReferralBadge() {
    const badge = $('referralBadge');
    if (!badge) return;
    const count = Referrals.stats().waiting;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function queueLabel(status) {
    const meta = QUEUE_STATUSES[status] || {};
    return `<span class="badge ${meta.badge || 'badge-muted'}">${Utils.escapeHtml(meta.label || status)}</span>`;
  }

  function priorityLabel(priority) {
    return priority === 'urgent'
      ? '<span class="badge badge-urgent">🚨 عاجل</span>'
      : '<span class="cell-sub">عادية</span>';
  }

  /* زر «🔁 تحويل» يظهر للمواعيد المؤكدة أو المسجّل حضورها */
  function referralButton(appt) {
    if (!['approved', 'checkedIn'].includes(appt.status)) return '';
    return `<button type="button" class="btn btn-sm btn-primary" data-action="refer" data-id="${appt.id}" title="إرسال المريض إلى قائمة الطبيب">🔁 تحويل</button>`;
  }

  /* ---------- جدول التحويلات + الإحصاءات ---------- */
  const refState = {
    filters: { q: '', doctorId: 'all', date: '', queue: 'all' },
    sort: { key: 'datetime', dir: 'asc' },
    modalVisitId: null
  };

  function referralFilters() {
    return {
      q: refState.filters.q,
      doctorId: refState.filters.doctorId === 'all' ? '' : refState.filters.doctorId,
      queueStatus: refState.filters.queue,
      date: refState.filters.date || ''
    };
  }

  function referralRow(visit) {
    const appt = visit.appointment || {};
    const doctor = Store.findById(Store.KEYS.DOCTORS, visit.doctorId);
    const loc = doctor ? Clinic.locationForDate(doctor, visit.date) : null;
    const patient = Store.findById(Store.KEYS.PATIENTS, visit.patientId);
    const canRecall = visit.queueStatus === 'waiting';
    const canEdit = visit.queueStatus !== 'done';
    return `
      <tr data-visit="${visit.id}">
        <td data-label="الموعد">
          <span class="cell-main">${Utils.escapeHtml(Utils.formatArabicDate(visit.date, false))}</span>
          <span class="cell-sub">${Utils.escapeHtml(Utils.to12h(visit.time))} · ${Utils.escapeHtml(appt.code || '')}</span>
        </td>
        <td data-label="المريض">
          <span class="cell-main">${Utils.escapeHtml(appt.patientName || (patient ? patient.name : '—'))}</span>
          <span class="cell-sub" dir="ltr">${Utils.escapeHtml(appt.patientPhone || (patient ? patient.phone : ''))}</span>
        </td>
        <td data-label="الطبيب">
          <span class="cell-main">${Utils.escapeHtml(doctor ? doctor.name : '—')}</span>
          <span class="cell-sub">${Utils.escapeHtml(Clinic.locationText(loc) || '—')}</span>
        </td>
        <td data-label="الأولوية">${priorityLabel(visit.priority)}</td>
        <td data-label="حالة الطابور">${queueLabel(visit.queueStatus)}
          ${visit.secretaryNote ? `<span class="cell-sub">📝 ${Utils.escapeHtml(visit.secretaryNote)}</span>` : ''}</td>
        <td class="no-print" data-label="إجراءات">
          <div class="row-actions">
            ${canEdit ? `<button type="button" class="btn btn-sm btn-outline" data-action="ref-note" data-visit="${visit.id}" title="ملاحظة للطبيب وأولوية">📝</button>` : ''}
            ${canEdit ? `<button type="button" class="btn btn-sm btn-outline" data-action="ref-urgent" data-visit="${visit.id}" title="تبديل الأولوية">🚨</button>` : ''}
            ${canRecall ? `<button type="button" class="btn btn-sm btn-outline" data-action="ref-recall" data-visit="${visit.id}" title="سحب التحويل">↩️</button>` : ''}
            <button type="button" class="btn btn-sm btn-outline" data-action="ref-print" data-visit="${visit.id}" title="طباعة بطاقة تحويل">🖨️</button>
            <button type="button" class="btn btn-sm btn-outline" data-action="ref-details" data-visit="${visit.id}" title="تفاصيل">👁️</button>
          </div>
        </td>
      </tr>`;
  }

  function sortReferrals(list) {
    const dir = refState.sort.dir === 'asc' ? 1 : -1;
    const key = refState.sort.key;
    return list.slice().sort((a, b) => {
      if (key === 'patient') {
        const an = (a.appointment && a.appointment.patientName) || '';
        const bn = (b.appointment && b.appointment.patientName) || '';
        return an.localeCompare(bn, 'ar') * dir;
      }
      if (key === 'doctor') {
        const ad = Store.findById(Store.KEYS.DOCTORS, a.doctorId);
        const bd = Store.findById(Store.KEYS.DOCTORS, b.doctorId);
        return String(ad ? ad.name : '').localeCompare(String(bd ? bd.name : ''), 'ar') * dir;
      }
      return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) * dir;
    });
  }

  function renderReferralStats() {
    const s = Referrals.stats();
    setText('statWaiting', s.waiting);
    setText('statInRoom', s.inRoom);
    setText('statDone', s.done);
    setText('statUrgent', s.urgent);
  }

  function renderReferrals() {
    const body = $('referralsBody');
    if (!body) return;
    const list = sortReferrals(Referrals.list(referralFilters()));
    setText('referralCount', `${list.length} تحويل`);
    body.innerHTML = list.map(referralRow).join('');
    const empty = $('emptyReferrals');
    if (empty) empty.hidden = list.length > 0;
    renderReferralStats();
    updateReferralBadge();
  }

  function fillReferralDoctorFilter() {
    const select = $('referralDoctor');
    if (!select) return;
    select.innerHTML = `<option value="all">كل الأطباء</option>`
      + Store.getAll(Store.KEYS.DOCTORS).map((d) =>
        `<option value="${d.id}">${Utils.escapeHtml(`${d.name} — ${d.specialty}`)}</option>`).join('');
    select.value = refState.filters.doctorId;
  }

  function renderQueueChips() {
    const wrap = $('queueChips');
    if (!wrap) return;
    const chips = [['all', 'الكل'], ['waiting', 'بانتظار الطبيب'], ['inRoom', 'داخل الكشف'], ['done', 'تمت']];
    wrap.innerHTML = chips.map(([value, label]) =>
      `<button type="button" class="seg-btn ${refState.filters.queue === value ? 'is-active' : ''}" data-queue="${value}">${label}</button>`
    ).join('');
  }

  function referralById(visitId) {
    return Store.findById(Store.KEYS.VISITS, visitId);
  }

  function openReferralModal(visitId) {
    const visit = referralById(visitId);
    if (!visit) return;
    const appt = Appointments.find(visit.appointmentId);
    const doctor = Store.findById(Store.KEYS.DOCTORS, visit.doctorId);
    refState.modalVisitId = visitId;
    setText('referralModalTitle', `ملاحظة التحويل — ${appt ? appt.patientName : 'المريض'}`);
    setText('referralModalSub', `${doctor ? doctor.name : '—'} · ${Utils.formatArabicDate(visit.date, false)} · ${Utils.to12h(visit.time)}`);
    setValue('referralNote', visit.secretaryNote || '');
    setValue('referralPriority', visit.priority || 'normal');
    openModal('referralModal');
  }

  function saveReferralModal() {
    const visitId = refState.modalVisitId;
    if (!visitId) return;
    const noteRes = Referrals.setNote(visitId, ($('referralNote') || {}).value || '');
    const priorityRes = Referrals.setPriority(visitId, ($('referralPriority') || {}).value || 'normal');
    closeModal('referralModal');
    refState.modalVisitId = null;
    afterChange(noteRes.ok && priorityRes.ok ? { ok: true } : (noteRes.ok ? priorityRes : noteRes), 'تم حفظ ملاحظة التحويل وأولويته', renderReferrals);
  }

  function referralDetails(visitId) {
    const visit = referralById(visitId);
    if (!visit) return;
    const appt = Appointments.find(visit.appointmentId) || {};
    const doctor = Store.findById(Store.KEYS.DOCTORS, visit.doctorId);
    const loc = doctor ? Clinic.locationForDate(doctor, visit.date) : null;
    const branch = loc ? Clinic.branch(loc.branchId) : null;
    let modal = $('referralDetailsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'referralDetailsModal';
      modal.className = 'modal-overlay no-print';
      modal.hidden = true;
      modal.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="referralDetailsTitle"><h3 id="referralDetailsTitle"></h3><div id="referralDetailsBody"></div><div class="modal-actions"><button type="button" class="btn btn-outline" data-close>إغلاق</button><button type="button" class="btn btn-primary" id="referralDetailsPrint">🖨️ طباعة</button></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('#referralDetailsPrint').addEventListener('click', () => printReferralCard(refState.modalVisitId));
    }
    refState.modalVisitId = visitId;
    setText('referralDetailsTitle', `تفاصيل التحويل — ${appt.patientName || 'المريض'}`);
    const body = $('referralDetailsBody');
    if (body) body.innerHTML = `<dl class="summary-list">
      <div class="summary-row"><dt>رقم الحجز</dt><dd dir="ltr">${Utils.escapeHtml(appt.code || '—')}</dd></div>
      <div class="summary-row"><dt>الطبيب</dt><dd>${Utils.escapeHtml(doctor ? doctor.name : '—')}</dd></div>
      <div class="summary-row"><dt>المكان</dt><dd>${Utils.escapeHtml(Clinic.locationText(loc) || '—')}</dd></div>
      <div class="summary-row"><dt>العنوان</dt><dd>${Utils.escapeHtml(branch ? branch.address : '—')}</dd></div>
      <div class="summary-row"><dt>الموعد</dt><dd>${Utils.escapeHtml(Utils.formatArabicDate(visit.date, false))} — ${Utils.escapeHtml(Utils.to12h(visit.time))}</dd></div>
      <div class="summary-row"><dt>الأولوية</dt><dd>${priorityLabel(visit.priority)}</dd></div>
      <div class="summary-row"><dt>الحالة</dt><dd>${queueLabel(visit.queueStatus)}</dd></div>
      <div class="summary-row"><dt>ملاحظة السكرتير</dt><dd>${Utils.escapeHtml(visit.secretaryNote || '—')}</dd></div>
    </dl>`;
    openModal('referralDetailsModal');
  }

  function printReferralCard(visitId) {
    const visit = referralById(visitId);
    if (!visit) return;
    const appt = Appointments.find(visit.appointmentId) || {};
    const doctor = Store.findById(Store.KEYS.DOCTORS, visit.doctorId);
    const loc = doctor ? Clinic.locationForDate(doctor, visit.date) : null;
    const branch = loc ? Clinic.branch(loc.branchId) : null;
    let card = $('printCard');
    if (!card) {
      card = document.createElement('section');
      card.id = 'printCard';
      card.className = 'appt-card';
      card.hidden = true;
      const root = $('printRoot') || document.querySelector('main');
      if (root) root.appendChild(card);
    }
    card.innerHTML = `<div class="card-head"><img src="../assets/logo.svg" alt="شعار العيادة"><span class="card-title">${Utils.escapeHtml(CLINIC.name)} — تحويل للطبيب</span></div>
      <div class="card-code" dir="ltr">${Utils.escapeHtml(appt.code || '—')}</div>
      <dl class="summary-list">
        <div class="summary-row"><dt>المريض</dt><dd>${Utils.escapeHtml(appt.patientName || '—')}</dd></div>
        <div class="summary-row"><dt>الطبيب</dt><dd>${Utils.escapeHtml(doctor ? doctor.name : '—')}</dd></div>
        <div class="summary-row"><dt>المكان</dt><dd>${Utils.escapeHtml(Clinic.locationText(loc) || '—')}</dd></div>
        <div class="summary-row"><dt>العنوان</dt><dd>${Utils.escapeHtml(branch ? branch.address : '—')}</dd></div>
        <div class="summary-row"><dt>التاريخ والوقت</dt><dd>${Utils.escapeHtml(Utils.formatArabicDate(visit.date, false))} — ${Utils.escapeHtml(Utils.to12h(visit.time))}</dd></div>
        <div class="summary-row"><dt>الأولوية</dt><dd>${visit.priority === 'urgent' ? 'عاجل' : 'عادية'}</dd></div>
      </dl><p class="card-note">${Utils.escapeHtml(visit.secretaryNote || 'يرجى انتظار النداء من الطبيب.')}</p>`;
    card.hidden = false;
    document.body.classList.add('printing-card');
    window.print();
  }

  function handleReferralAction(action, visitId) {
    const visit = referralById(visitId);
    if (!visit) return;
    switch (action) {
      case 'ref-note': openReferralModal(visitId); break;
      case 'ref-urgent':
        afterChange(Referrals.setPriority(visitId, visit.priority === 'urgent' ? 'normal' : 'urgent'), 'تم تحديث أولوية التحويل', renderReferrals);
        break;
      case 'ref-recall':
        if (confirm('سحب هذا التحويل من قائمة الطبيب؟')) afterChange(Referrals.recall(visitId), 'تم سحب التحويل', renderReferrals);
        break;
      case 'ref-print': printReferralCard(visitId); break;
      case 'ref-details': referralDetails(visitId); break;
      default: break;
    }
  }

  function sendAllApprovedToday() {
    const today = Utils.todayISO();
    let created = 0;
    Store.getAll(Store.KEYS.APPOINTMENTS)
      .filter((a) => a.date === today && ['approved', 'checkedIn'].includes(a.status))
      .forEach((appt) => {
        const existing = Referrals.findByAppointment(appt.id);
        if (!existing || !['waiting', 'inRoom'].includes(existing.queueStatus)) {
          if (Referrals.send(appt.id).ok) created += 1;
        }
      });
    renderReferrals();
    Utils.showToast(created ? `تم تحويل ${created} موعدًا اليوم` : 'لا توجد مواعيد مؤكدة جديدة للتحويل اليوم', created ? 'success' : 'info');
  }

  function bindReferralEvents() {
    const refresh = $('refreshReferralsBtn');
    if (refresh) refresh.addEventListener('click', () => { renderReferrals(); Utils.showToast('تم التحديث'); });
    const sync = $('syncQueueBtn');
    if (sync) sync.addEventListener('click', () => afterChange(Referrals.syncMissing(), 'تمت مزامنة قائمة الطبيب', renderReferrals));
    const sendAll = $('sendAllApprovedBtn');
    if (sendAll) sendAll.addEventListener('click', sendAllApprovedToday);
    const search = $('referralSearch');
    if (search) search.addEventListener('input', () => { refState.filters.q = search.value; renderReferrals(); });
    const doctor = $('referralDoctor');
    if (doctor) doctor.addEventListener('change', () => { refState.filters.doctorId = doctor.value; renderReferrals(); });
    const date = $('referralDate');
    if (date) date.addEventListener('change', () => { refState.filters.date = date.value; renderReferrals(); });
    const chips = $('queueChips');
    if (chips) chips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-queue]');
      if (!chip) return;
      refState.filters.queue = chip.dataset.queue;
      renderQueueChips();
      renderReferrals();
    });
    const body = $('referralsBody');
    if (body) body.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action][data-visit]');
      if (button) handleReferralAction(button.dataset.action, button.dataset.visit);
    });
    const save = $('referralSave');
    if (save) save.addEventListener('click', saveReferralModal);
    document.querySelectorAll('th.sortable').forEach((th) => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      refState.sort = refState.sort.key === key
        ? { key, dir: refState.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' };
      document.querySelectorAll('th.sortable').forEach((h) => h.setAttribute('aria-sort', 'none'));
      th.setAttribute('aria-sort', refState.sort.dir === 'asc' ? 'ascending' : 'descending');
      renderReferrals();
    }));
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('printing-card');
      const card = $('printCard');
      if (card) card.hidden = true;
    });
  }

  function initReferrals() {
    initSession(() => { fillReferralDoctorFilter(); renderQueueChips(); renderReferrals(); });
    initCommonActions(() => { fillReferralDoctorFilter(); renderQueueChips(); renderReferrals(); });
    bindReferralEvents();
    fillReferralDoctorFilter();
    renderQueueChips();
    renderReferrals();
  }

  if (page === 'secretary-dashboard') initDashboard();
  else if (page === 'secretary-appointments') initAppointments();
  else if (page === 'secretary-patients') initPatients();
  else if (page === 'secretary-referrals') initReferrals();
})();
