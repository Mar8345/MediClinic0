/* ============================================================
   doctor.js — لوحة الطبيب + شاشة الكشف (العرض والأحداث فقط)
   كل المنطق في storage.js (Referrals / Visits / Session)
   الصفحات عبر body[data-page]: doctor-dashboard | doctor-visit
   ============================================================ */
'use strict';

(function () {
  const page = document.body.dataset.page || '';
  const $ = (id) => document.getElementById(id);

  const SHORT_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  const QUEUE_META = {
    waiting: { label: '⏳ في الانتظار', badge: 'badge-warning' },
    inRoom:  { label: '🩺 داخل الكشف',   badge: 'badge-info' },
    done:    { label: '✅ تمت الزيارة',  badge: 'badge-success' }
  };

  /* ---------- أدوات عامة ---------- */
  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function queueBadge(status) {
    const meta = QUEUE_META[status] || { label: status, badge: 'badge-muted' };
    return `<span class="badge ${meta.badge}">${Utils.escapeHtml(meta.label)}</span>`;
  }

  function apptBadge(status) {
    const meta = Appointments.statusMeta(status);
    return `<span class="badge ${meta.badge}">${Utils.escapeHtml(meta.label)}</span>`;
  }

  /* ---------- بوابة دخول الطبيب (مشتركة) ---------- */
  function fillDoctorOptions(selectId) {
    const select = $(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">— اختر اسمك —</option>' + Store.getAll(Store.KEYS.DOCTORS).filter((d) => d.active !== false && !d.archived).map((d) =>
      `<option value="${d.id}">${Utils.escapeHtml(d.name)} — ${Utils.escapeHtml(d.specialty)}</option>`
    ).join('');
  }

  function initDoctorSession(gateId, contentId, userLabelId, onLogin) {
    const userLabel = $(userLabelId);
    const logoutBtn = $('doctorLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      Session.logout();
      window.location.href = '../index.html';
    });

    const apply = (doctor) => {
      const gate = $(gateId);
      const content = $(contentId);
      if (gate) gate.hidden = !!doctor;
      if (content) content.hidden = !doctor;
      if (userLabel && doctor) userLabel.textContent = `👨‍⚕️ ${doctor.name}`;
    };

    const existing = Session.currentDoctor();
    if (existing) { apply(existing); return existing; }
    apply(null);

    fillDoctorOptions('doctorLoginSelect');
    const form = $('doctorLoginForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const res = Session.loginDoctor($('doctorLoginSelect').value, $('doctorLoginPin').value);
        if (!res.ok) {
          Utils.showToast(res.reason, 'error');
          return;
        }
        Utils.showToast(`مرحبًا ${res.doctor.name} 👋`);
        apply(res.doctor);
        if (onLogin) onLogin(res.doctor);
      });
    }
    return null;
  }

  function afterPrintCleanup() {
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('printing-card', 'printing-doc');
      ['printRx', 'printReport', 'printSickLeave'].forEach((id) => {
        const el = $(id);
        if (el) {
          el.hidden = true;
          el.classList.remove('is-printing');
        }
      });
    });
  }

  /* ============================================================
     الجزء الثاني: قوالب مشتركة + لوحة الطبيب (doctor-dashboard)
     ============================================================ */

  function patientOf(id) { return Store.findById(Store.KEYS.PATIENTS, id); }

  function doctorOf(id) { return Store.findById(Store.KEYS.DOCTORS, id); }

  function ageText(patient) {
    return patient && patient.age ? `${patient.age} سنة` : 'العمر غير مسجّل';
  }

  function genderText(gender) {
    return gender === 'male' ? 'ذكر' : gender === 'female' ? 'أنثى' : '—';
  }

  function listOf(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value || '').split(/[،,]/).map((s) => s.trim()).filter(Boolean);
  }

  /** تنبيهات المريض للطبيب: حساسية / أمراض مزمنة / أولوية عاجلة */
  function alertsHtml(patient, visit) {
    const items = [];
    const allergies = patient ? listOf(patient.allergies) : [];
    const chronic = patient ? listOf(patient.chronic) : [];
    if (allergies.length) {
      items.push(`<span class="patient-alert is-danger">⚠️ حساسية: ${Utils.escapeHtml(allergies.join('، '))}</span>`);
    }
    if (chronic.length) {
      items.push(`<span class="patient-alert is-warning">🩺 أمراض مزمنة: ${Utils.escapeHtml(chronic.join('، '))}</span>`);
    }
    if (visit && visit.priority === 'urgent') {
      items.push('<span class="patient-alert is-urgent">🚨 حالة عاجلة بطلب السكرتير</span>');
    }
    return items.length ? `<div class="patient-alerts">${items.join('')}</div>` : '';
  }

  function locationOf(doctor, iso) {
    return doctor ? Clinic.locationText(Clinic.locationForDate(doctor, iso)) : '';
  }

  /** سطر موجز عن المريض/الموعد يُستخدم في كل الشاشات */
  function patientLine(patient, appt) {
    const bits = [
      ageText(patient),
      genderText(patient && patient.gender),
      appt && appt.code ? `رقم الحجز ${appt.code}` : ''
    ].filter(Boolean);
    return bits.join(' · ');
  }

  /* ---------- لوحة الطبيب: قائمة اليوم ---------- */
  function queueItemHtml(visit, index) {
    const patient = patientOf(visit.patientId);
    const appt = visit.appointment || Appointments.find(visit.appointmentId) || {};
    const doctor = doctorOf(visit.doctorId);
    const urgent = visit.priority === 'urgent';
    const meta = [
      `⏱️ ${Utils.to12h(visit.time)}`,
      `📍 ${locationOf(doctor, visit.date) || '—'}`,
      `🧾 ${appt.code || ''}`
    ];
    const actions = visit.queueStatus === 'waiting'
      ? `<button type="button" class="btn btn-primary btn-sm" data-action="start" data-visit="${visit.id}">▶️ بدء الكشف</button>
         <a class="btn btn-outline btn-sm" href="visit.html?visit=${encodeURIComponent(visit.id)}">📋 فتح الملف</a>`
      : visit.queueStatus === 'inRoom'
        ? `<a class="btn btn-success btn-sm" href="visit.html?visit=${encodeURIComponent(visit.id)}">🩺 متابعة الكشف</a>`
        : `<a class="btn btn-outline btn-sm" href="visit.html?visit=${encodeURIComponent(visit.id)}">👁️ عرض الزيارة</a>`;
    return `
      <article class="queue-item ${urgent ? 'is-urgent' : ''} ${visit.queueStatus === 'done' ? 'is-done' : ''}" data-visit="${visit.id}">
        <span class="queue-index" aria-hidden="true">${index}</span>
        <div class="queue-main">
          <div class="queue-top">
            <strong class="queue-name">${Utils.escapeHtml(patient ? patient.name : (appt.patientName || '—'))}</strong>
            ${urgent ? '<span class="badge badge-urgent">🚨 عاجل</span>' : ''}
            ${queueBadge(visit.queueStatus)}
          </div>
          <div class="queue-sub">${Utils.escapeHtml(patientLine(patient, appt))}</div>
          <div class="queue-meta">${meta.map((m) => `<span>${Utils.escapeHtml(m)}</span>`).join('')}</div>
          ${visit.secretaryNote ? `<p class="queue-note">📝 ${Utils.escapeHtml(visit.secretaryNote)}</p>` : ''}
          ${visit.complaint ? `<p class="queue-note">💬 سبب الزيارة: ${Utils.escapeHtml(visit.complaint)}</p>` : ''}
          ${alertsHtml(patient, visit)}
        </div>
        <div class="queue-actions">${actions}</div>
      </article>`;
  }

  /* ---------- لوحة الطبيب: الرسم الأسبوعي (SVG خالص بلا مكتبات) ---------- */
  function renderDoctorWeekChart(doctor) {
    const svg = $('doctorWeekChart');
    if (!svg) return;
    const today = Utils.todayISO();
    const appts = Store.getAll(Store.KEYS.APPOINTMENTS).filter((a) => a.doctorId === doctor.id);
    const data = [];
    for (let i = 0; i < 7; i++) {
      const iso = Utils.addDaysISO(today, i);
      const day = appts.filter((a) => a.date === iso);
      data.push({
        date: iso,
        pending: day.filter((a) => a.status === 'pending').length,
        active: day.filter((a) => Appointments.ACTIVE.includes(a.status)).length
      });
    }
    const W = 560, H = 220;
    const pad = { top: 24, right: 10, bottom: 36, left: 10 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;
    const totals = data.map((d) => d.pending + d.active);
    const max = Math.max(1, ...totals);
    const barW = innerW / data.length;
    let out = '';
    [0, 0.5, 1].forEach((t) => {
      const y = pad.top + innerH - t * innerH;
      out += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1"></line>`;
    });
    data.forEach((d, i) => {
      const total = totals[i];
      const x = pad.left + i * barW + barW * 0.18;
      const w = barW * 0.64;
      const base = pad.top + innerH;
      const hActive = (d.active / max) * innerH;
      const hPending = (d.pending / max) * innerH;
      if (total) {
        out += `<rect x="${x}" y="${base - hActive - hPending}" width="${w}" height="${hPending}" fill="#f59e0b" rx="3"><title>${Utils.escapeHtml(d.date)}: ${d.pending} قيد المراجعة</title></rect>`;
        out += `<rect x="${x}" y="${base - hActive}" width="${w}" height="${hActive}" fill="#16a34a" rx="3"><title>${Utils.escapeHtml(d.date)}: ${d.active} مؤكد/فعال</title></rect>`;
        out += `<text x="${x + w / 2}" y="${base - hActive - hPending - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e293b">${total}</text>`;
      }
      out += `<text x="${x + w / 2}" y="${H - 14}" text-anchor="middle" font-size="11" fill="#64748b">${SHORT_DAYS[Utils.dayOfWeek(d.date)]}</text>`;
    });
    svg.innerHTML = out;
    const legend = $('doctorWeekLegend');
    if (legend) {
      legend.innerHTML = '<span><i style="background:#16a34a"></i> مؤكد / فعال</span>'
        + '<span><i style="background:#f59e0b"></i> قيد المراجعة</span>';
    }
  }

  /* ---------- لوحة الطبيب: تحديث كل الأقسام ---------- */
  function renderDoctorDashboard(doctor) {
    const today = Utils.todayISO();
    const visits = Referrals.list({ doctorId: doctor.id, date: today });
    const stats = Referrals.stats(today);
    const mine = Store.getAll(Store.KEYS.APPOINTMENTS)
      .filter((a) => a.doctorId === doctor.id)
      .sort(Utils.byDateTime);

    setText('statDayPatients', visits.length);
    setText('statDayWaiting', visits.filter((v) => v.queueStatus === 'waiting').length);
    setText('statDayInRoom', visits.filter((v) => v.queueStatus === 'inRoom').length);
    setText('statDayDone', visits.filter((v) => v.queueStatus === 'done').length);
    const avg = Visits.avgDuration(doctor.id, today);
    setText('statAvgMin', avg === null ? '—' : `${avg} د`);
    const weekTo = Utils.addDaysISO(today, 7);
    setText('statWeek', mine.filter((a) => a.date >= today && a.date <= weekTo
      && ['pending', 'approved', 'checkedIn'].includes(a.status)).length);

    setText('doctorMeta', `👨‍⚕️ ${doctor.name} — ${doctor.specialty} · 📍 ${locationOf(doctor, today) || 'إجازة اليوم'}`);
    const profileSummary = $('dashboardProfileSummary');
    if (profileSummary) {
      const apptStats = Appointments.statsForDoctor(doctor.id);
      profileSummary.hidden = false;
      profileSummary.innerHTML = `<div class="profile-avatar" aria-hidden="true">${Utils.escapeHtml(doctor.avatar || '👨‍⚕️')}</div><div class="profile-info"><h2>${Utils.escapeHtml(doctor.name)}</h2><div class="profile-meta"><span>🩺 ${Utils.escapeHtml(doctor.specialty)}</span><span>📅 ${apptStats.upcoming} مواعيد قادمة</span><span>👥 ${apptStats.patients} مرضى</span></div></div><a class="btn btn-outline btn-sm" href="profile.html">عرض الملف</a>`;
    }
    const queueDate = $('queueDate');
    if (queueDate) {
      queueDate.textContent = stats.inRoom
        ? `${Utils.formatArabicDate(today)} · 🩺 ${stats.inRoom} داخل الكشف`
        : Utils.formatArabicDate(today);
    }

    const board = $('queueBoard');
    const emptyQueue = $('emptyQueue');
    if (board) {
      board.innerHTML = visits.map((v, i) => queueItemHtml(v, i + 1)).join('');
      if (emptyQueue) emptyQueue.hidden = visits.length > 0;
    }

    const upcoming = mine.filter((a) => a.date >= today && ['pending', 'approved', 'checkedIn'].includes(a.status))
      .slice(0, 8);
    const body = $('upcomingBody');
    const emptyUpcoming = $('emptyUpcoming');
    if (body) {
      body.innerHTML = upcoming.map((a) => {
        const patient = patientOf(a.patientId);
        return `
          <tr data-id="${a.id}">
            <td data-label="المريض"><span class="cell-main">${Utils.escapeHtml(a.patientName || (patient ? patient.name : '—'))}</span>
              <span class="cell-sub" dir="ltr">${Utils.escapeHtml(a.code)}</span></td>
            <td data-label="التاريخ والوقت"><span class="cell-main">${Utils.escapeHtml(Utils.formatArabicDate(a.date, false))}</span>
              <span class="cell-sub">${Utils.escapeHtml(Utils.to12h(a.time))}</span></td>
            <td data-label="المكان"><span class="cell-sub">${Utils.escapeHtml(locationOf(doctor, a.date) || '—')}</span></td>
            <td data-label="الحالة">${apptBadge(a.status)}</td>
          </tr>`;
      }).join('');
      if (emptyUpcoming) emptyUpcoming.hidden = upcoming.length > 0;
    }

    const top = Visits.topDiagnoses(doctor.id, 5);
    const topList = $('topDiagnosesList');
    if (topList) {
      topList.innerHTML = top.length
        ? top.map((t) => `
            <div class="timeline-item">
              <span class="timeline-time">${t.count}</span>
              <div class="timeline-body"><span class="cell-main">${Utils.escapeHtml(t.diagnosis)}</span></div>
            </div>`).join('')
        : '<p class="lookup-empty">لا توجد تشخيصات مسجّلة بعد</p>';
    }

    renderDoctorWeekChart(doctor);
  }

  function initDoctorDashboard(doctor) {
    const render = () => renderDoctorDashboard(doctor);

    const refreshBtn = $('doctorRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      render();
      Utils.showToast('تم تحديث قائمة اليوم');
    });

    const board = $('queueBoard');
    if (board) {
      board.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="start"]');
        if (!btn) return;
        const res = Visits.start(btn.dataset.visit);
        if (!res.ok) { Utils.showToast(res.reason, 'error'); return; }
        Utils.showToast('بدأ الكشف — بالتوفيق 🩺');
        window.location.href = `visit.html?visit=${encodeURIComponent(btn.dataset.visit)}`;
      });
    }

    window.addEventListener('storage', (e) => {
      if (e.key && e.key.indexOf('clinic_') === 0) render();
    });
    render();
  }

  /* ============================================================
     الجزء الثالث: شاشة الكشف (doctor-visit)
     ============================================================ */

  /* قوالب روشتة جاهزة (تُملأ يدويًا بلا أي مكتبة) */
  const RX_PRESETS = {
    cold: [
      { name: 'باراسيتامول 500 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'كل 8 ساعات', duration: '٥ أيام', notes: 'عند الحاجة' },
      { name: 'لوراتادين 10 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'مرة يوميًا مساءً', duration: 'أسبوع', notes: '' },
      { name: 'محلول ملح للأنف', form: 'بخاخ', dose: 'رشتان', freq: '3 مرات يوميًا', duration: 'أسبوع', notes: '' }
    ],
    antibiotic: [
      { name: 'أموكسيسيلين 500 مجم', form: 'كبسول', dose: 'كبسولة واحدة', freq: 'كل 8 ساعات', duration: '٧ أيام', notes: 'بعد الأكل — أكمل المدة' },
      { name: 'باراسيتامول 500 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'كل ٨ ساعات', duration: '٤ أيام', notes: 'عند الحاجة للحرارة' }
    ],
    pain: [
      { name: 'إيبوبروفين 400 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'كل 12 ساعة بعد الأكل', duration: '٥ أيام', notes: '' },
      { name: 'أوميبرازول 20 مجم', form: 'كبسول', dose: 'كبسولة واحدة', freq: 'مرة يوميًا قبل الفطار', duration: '٥ أيام', notes: '' }
    ]
  };

  const ORDER_TYPES = { lab: '🧪 مختبر', imaging: '🩻 أشعة' };
  const MED_FORMS = ['', 'أقراص', 'كبسول', 'شراب', 'بخاخ', 'مرهم', 'قطرة', 'أمبول', 'لبوس'];

  const MED_FIELDS = [
    { field: 'name', label: 'اسم الدواء', placeholder: 'اسم الدواء' },
    { field: 'dose', label: 'الجرعة', placeholder: 'مثال: قرص واحد' },
    { field: 'freq', label: 'التكرار', placeholder: 'مثال: كل 8 ساعات' },
    { field: 'duration', label: 'المدة', placeholder: 'مثال: أسبوع' },
    { field: 'notes', label: 'تعليمات', placeholder: 'مثال: بعد الأكل' }
  ];

  const visitState = { id: null, visit: null, followUpTime: null, finished: false };

  function currentVisitId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('visit') || '';
  }

  function inputValue(id) {
    const el = $(id);
    return el ? String(el.value).trim() : '';
  }

  function setInput(id, value) {
    const el = $(id);
    if (el) el.value = value == null ? '' : value;
  }

  /* ---------- صفوف الروشتة والفحوصات (تُبنى بـ innerHTML آمن) ---------- */
  function medRowHtml(med, index) {
    const inputCell = (field, label, placeholder, list) => `
      <td data-label="${label}"><input type="text" class="cell-input" ${list ? 'list="medicineList"' : ''}
        data-field="${field}" value="${Utils.escapeHtml(med[field] || '')}" placeholder="${placeholder}"
        aria-label="${label}"></td>`;
    return `
      <tr data-index="${index}">
        ${inputCell('name', 'اسم الدواء', 'اسم الدواء', true)}
        <td data-label="الشكل"><select class="cell-input" data-field="form" aria-label="الشكل">
          ${MED_FORMS.map((f) => `<option value="${f}" ${med.form === f ? 'selected' : ''}>${f || '—'}</option>`).join('')}
        </select></td>
        ${inputCell('dose', 'الجرعة', 'مثال: قرص واحد')}
        ${inputCell('freq', 'التكرار', 'مثال: كل 8 ساعات')}
        ${inputCell('duration', 'المدة', 'مثال: أسبوع')}
        ${inputCell('notes', 'تعليمات', 'مثال: بعد الأكل')}
        <td class="no-print" data-label="حذف">
          <button type="button" class="btn btn-outline btn-sm" data-action="del-med" data-index="${index}" title="حذف الدواء">🗑️</button>
        </td>
      </tr>`;
  }

  function orderRowHtml(order, index) {
    const options = Object.entries(ORDER_TYPES)
      .map(([value, label]) => `<option value="${value}" ${order.type === value ? 'selected' : ''}>${label}</option>`).join('');
    return `
      <tr data-index="${index}">
        <td data-label="النوع"><select class="cell-input" data-field="type" aria-label="نوع الفحص">${options}</select></td>
        <td data-label="الفحص المطلوب"><input type="text" class="cell-input" data-field="text"
          value="${Utils.escapeHtml(order.text || '')}" placeholder="مثال: صورة دم كاملة CBC" aria-label="الفحص المطلوب"></td>
        <td class="no-print" data-label="حذف">
          <button type="button" class="btn btn-outline btn-sm" data-action="del-order" data-index="${index}" title="حذف الفحص">🗑️</button>
        </td>
      </tr>`;
  }

  function vitalsOf() {
    return {
      bpSys: inputValue('vBpSys'), bpDia: inputValue('vBpDia'), pulse: inputValue('vPulse'),
      temp: inputValue('vTemp'), sugar: inputValue('vSugar'), weight: inputValue('vWeight'),
      height: inputValue('vHeight')
    };
  }

  /** BMI = الوزن ÷ مربع الطول (بالمتر) + تقييم نصي */
  function bmiText(vitals) {
    const w = parseFloat(vitals.weight);
    const h = parseFloat(vitals.height);
    if (!w || !h) return '';
    const bmi = w / ((h / 100) ** 2);
    if (!isFinite(bmi) || bmi <= 0) return '';
    const verdict = bmi < 18.5 ? 'نقص في الوزن'
      : bmi < 25 ? 'وزن طبيعي'
        : bmi < 30 ? 'زيادة في الوزن' : 'سمنة';
    return `مؤشر كتلة الجسم (BMI): ${bmi.toFixed(1)} — ${verdict}`;
  }

  function updateBmi() {
    const line = $('bmiLine');
    if (!line) return;
    const text = bmiText(vitalsOf());
    line.textContent = text || 'أدخل الوزن والطول لحساب مؤشر كتلة الجسم تلقائيًا';
  }

  /* ---------- قراءة النموذج (مصدر الحقيقة عند الحفظ) ---------- */
  function collectMeds() {
    return Array.from(document.querySelectorAll('#rxBody tr')).map((row) => {
      const get = (field) => {
        const el = row.querySelector(`[data-field="${field}"]`);
        return el ? String(el.value).trim() : '';
      };
      return {
        name: get('name'), form: get('form'), dose: get('dose'),
        freq: get('freq'), duration: get('duration'), notes: get('notes')
      };
    }).filter((med) => med.name);
  }

  function collectOrders() {
    return Array.from(document.querySelectorAll('#ordersBody tr')).map((row) => {
      const type = row.querySelector('[data-field="type"]');
      const text = row.querySelector('[data-field="text"]');
      return { type: type ? type.value : 'lab', text: text ? String(text.value).trim() : '' };
    }).filter((order) => order.text);
  }

  function collectVisitData() {
    return {
      vitals: vitalsOf(),
      complaint: inputValue('vComplaint'),
      history: inputValue('vHistory'),
      examination: inputValue('vExamination'),
      diagnosis: inputValue('vDiagnosis'),
      icd: inputValue('vIcd'),
      severity: inputValue('vSeverity'),
      prescription: collectMeds(),
      orders: collectOrders(),
      advice: inputValue('vAdvice'),
      sickLeaveDays: Number(inputValue('vSickLeave') || 0),
      followUpDate: inputValue('followUpDate')
    };
  }

  function renderMedRows() {
    const body = $('rxBody');
    if (!body) return;
    const list = visitState.prescription || [];
    body.innerHTML = list.map((med, i) => medRowHtml(med, i)).join('');
    const empty = $('emptyRx');
    if (empty) empty.hidden = list.length > 0;
  }

  function renderOrderRows() {
    const body = $('ordersBody');
    if (!body) return;
    const list = visitState.orders || [];
    body.innerHTML = list.map((order, i) => orderRowHtml(order, i)).join('');
    const empty = $('emptyOrders');
    if (empty) empty.hidden = list.length > 0;
  }

  /** مزامنة القيم المكتوبة في الجدولين قبل إعادة الرسم */
  function syncTables() {
    visitState.prescription = collectMeds();
    visitState.orders = collectOrders();
  }

  function renderMedicineCatalog() {
    const list = $('medicineList');
    if (!list || typeof MOCK_MEDICINES === 'undefined') return;
    list.innerHTML = MOCK_MEDICINES
      .map((m) => `<option value="${Utils.escapeHtml(m.name)}">${Utils.escapeHtml(`${m.form} — ${m.dose} — ${m.freq}`)}</option>`)
      .join('');
  }

  /* ---------- رأس الشاشة + تبويبة ملخص المريض ---------- */
  function renderVisitHeader() {
    const visit = visitState.visit;
    const patient = patientOf(visit.patientId);
    const appt = Appointments.find(visit.appointmentId) || {};
    const doctor = doctorOf(visit.doctorId);
    const bar = $('visitPatientBar');
    if (bar) {
      bar.innerHTML = `
        <div class="visit-patient-main">
          <span class="doctor-avatar sm" aria-hidden="true">${patient && patient.gender === 'female' ? '👩' : '👨'}</span>
          <div>
            <strong class="cell-main">${Utils.escapeHtml(patient ? patient.name : (appt.patientName || '—'))}</strong>
            <span class="cell-sub">${Utils.escapeHtml(patientLine(patient, appt))}</span>
            <span class="cell-sub" dir="ltr">${Utils.escapeHtml(patient && patient.phone ? patient.phone : '')}</span>
          </div>
        </div>`;
    }
    const statusBar = $('visitStatusBar');
    if (statusBar) {
      const items = [
        `📅 ${Utils.formatArabicDate(visit.date)}`,
        `⏱️ ${Utils.to12h(visit.time)}`,
        `📍 ${locationOf(doctor, visit.date) || '—'}`,
        `🧑‍⚕️ ${doctor ? doctor.name : ''}`
      ];
      statusBar.innerHTML = items.map((i) => `<span class="visit-chip">${Utils.escapeHtml(i)}</span>`).join('')
        + queueBadge(visit.queueStatus)
        + (visit.priority === 'urgent' ? '<span class="badge badge-urgent">🚨 عاجل</span>' : '');
    }
  }

  function renderSummaryPanel() {
    const visit = visitState.visit;
    const patient = patientOf(visit.patientId);
    const appt = Appointments.find(visit.appointmentId) || {};
    const history = Visits.historyForPatient(visit.patientId).filter((v) => v.id !== visit.id);

    const alerts = $('patientAlerts');
    if (alerts) {
      alerts.innerHTML = alertsHtml(patient, visit)
        || '<p class="muted">لا توجد تنبيهات طبية مسجّلة لهذا المريض</p>';
    }

    const info = $('visitPatientInfo');
    if (info) {
      const rows = [
        ['الاسم', patient ? patient.name : (appt.patientName || '—')],
        ['الرقم القومي', patient && patient.nationalId ? patient.nationalId : '—'],
        ['الموبايل', patient ? patient.phone : (appt.patientPhone || '—')],
        ['العمر / النوع', `${ageText(patient)} · ${genderText(patient && patient.gender)}`],
        ['الحساسية', patient && listOf(patient.allergies).length ? listOf(patient.allergies).join('، ') : 'لا يوجد'],
        ['أمراض مزمنة', patient && listOf(patient.chronic).length ? listOf(patient.chronic).join('، ') : 'لا يوجد'],
        ['سبب الزيارة (من الحجز)', appt.reason || visit.complaint || '—'],
        ['ملاحظة السكرتير', visit.secretaryNote || 'لا توجد'],
        ['عدد الزيارات السابقة', String(history.length)],
        ['رقم الحجز', appt.code || '—']
      ];
      info.innerHTML = rows.map(([label, value]) => `
        <div class="summary-row"><dt>${Utils.escapeHtml(label)}</dt><dd>${Utils.escapeHtml(value)}</dd></div>`).join('');
    }

    const list = $('pastVisitsList');
    if (list) {
      list.innerHTML = history.length
        ? history.slice(0, 6).map((v) => {
          const d = doctorOf(v.doctorId);
          const meds = (v.prescription || []).map((m) => m.name).filter(Boolean);
          return `
            <div class="timeline-item">
              <span class="timeline-time">${Utils.escapeHtml(Utils.formatArabicDate(v.date, false))}</span>
              <div class="timeline-body">
                <span class="cell-main">${Utils.escapeHtml(v.diagnosis || 'بدون تشخيص مسجّل')}</span>
                <span class="cell-sub">${Utils.escapeHtml(d ? d.name : '')} ${v.icd ? `· ICD ${Utils.escapeHtml(v.icd)}` : ''}</span>
                ${meds.length ? `<span class="cell-sub">💊 ${Utils.escapeHtml(meds.join('، '))}</span>` : ''}
                ${v.advice ? `<span class="cell-sub">📝 ${Utils.escapeHtml(v.advice)}</span>` : ''}
              </div>
            </div>`;
        }).join('')
        : '<p class="lookup-empty">لا توجد زيارات سابقة لهذا المريض</p>';
    }
  }

  /* ---------- أوراق الطباعة (روشتة / تقرير / إجازة مرضية) ---------- */
  function sheetHeaderHtml(title, patient, doctor, visit, extra) {
    return `
      <div class="sheet-head">
        <img src="../assets/logo.svg" alt="شعار العيادة">
        <div class="sheet-head-text">
          <strong>${Utils.escapeHtml(CLINIC.name)}</strong>
          <span>${Utils.escapeHtml(title)}</span>
          <span>${Utils.escapeHtml(doctor ? `${doctor.name} — ${doctor.specialty}` : '')}</span>
        </div>
      </div>
      <div class="sheet-patient">
        <span>المريض: ${Utils.escapeHtml(patient ? patient.name : '—')}</span>
        <span>العمر: ${Utils.escapeHtml(ageText(patient))}</span>
        <span>التاريخ: ${Utils.escapeHtml(Utils.formatArabicDate(visit.date))}</span>
        ${extra || ''}
      </div>`;
  }

  function buildRxSheet() {
    const visit = visitState.visit;
    const data = collectVisitData();
    const patient = patientOf(visit.patientId);
    const doctor = doctorOf(visit.doctorId);
    const meds = data.prescription;
    const vitals = [];
    if (data.vitals.bpSys && data.vitals.bpDia) vitals.push(`الضغط ${data.vitals.bpSys}/${data.vitals.bpDia}`);
    if (data.vitals.pulse) vitals.push(`النبض ${data.vitals.pulse}`);
    if (data.vitals.temp) vitals.push(`الحرارة ${data.vitals.temp}`);
    const rows = meds.length
      ? meds.map((m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${Utils.escapeHtml(m.name)}</td>
          <td>${Utils.escapeHtml(m.form || '—')}</td>
          <td>${Utils.escapeHtml([m.dose, m.freq, m.notes].filter(Boolean).join(' — '))}</td>
          <td>${Utils.escapeHtml(m.duration || '—')}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">لا توجد أدوية مسجّلة</td></tr>';
    const orders = data.orders.length
      ? `<p class="sheet-line">🧪 الفحوصات المطلوبة: ${Utils.escapeHtml(data.orders.map((o) => `${ORDER_TYPES[o.type] || ''} ${o.text}`).join(' — '))}</p>`
      : '';
    return `
      ${sheetHeaderHtml('روشتة طبية', patient, doctor, visit, vitals.length ? `<span>${Utils.escapeHtml(vitals.join(' · '))}</span>` : '')}
      <h3 class="sheet-title">Rx</h3>
      <table class="rx-print-table">
        <thead><tr><th>#</th><th>الدواء</th><th>الشكل</th><th>الجرعة والتكرار</th><th>المدة</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${orders}
      ${data.advice ? `<p class="sheet-line">📝 التوصيات: ${Utils.escapeHtml(data.advice)}</p>` : ''}
      ${data.followUpDate ? `<p class="sheet-line">📅 موعد المتابعة: ${Utils.escapeHtml(Utils.formatArabicDate(data.followUpDate))}</p>` : ''}
      <p class="sheet-sign">توقيع الطبيب: ${Utils.escapeHtml(doctor ? doctor.name : '')}</p>`;
  }

  function buildReportSheet() {
    const visit = visitState.visit;
    const data = collectVisitData();
    const patient = patientOf(visit.patientId);
    const doctor = doctorOf(visit.doctorId);
    const v = data.vitals;
    const vitalsRows = [
      ['الضغط', v.bpSys && v.bpDia ? `${v.bpSys}/${v.bpDia}` : '—'],
      ['النبض', v.pulse || '—'], ['الحرارة', v.temp || '—'], ['سكر الدم', v.sugar || '—'],
      ['الوزن', v.weight || '—'], ['الطول', v.height || '—'],
      ['مؤشر كتلة الجسم', bmiText(v).replace('مؤشر كتلة الجسم (BMI): ', '') || '—']
    ];
    return `
      ${sheetHeaderHtml('تقرير زيارة طبية', patient, doctor, visit, `<span>رقم الحجز: ${Utils.escapeHtml((visit.appointment && visit.appointment.code) || visit.appointmentId)}</span>`)}
      <h3 class="sheet-title">العلامات الحيوية</h3>
      <table class="rx-print-table">
        <tbody>${vitalsRows.map(([k, val]) => `<tr><th>${Utils.escapeHtml(k)}</th><td>${Utils.escapeHtml(val)}</td></tr>`).join('')}</tbody>
      </table>
      <h3 class="sheet-title">الشكوى وتاريخ المرض</h3>
      <p class="sheet-line">${Utils.escapeHtml(data.complaint || '—')}</p>
      <p class="sheet-line">${Utils.escapeHtml(data.history || '—')}</p>
      <h3 class="sheet-title">الفحص الإكلينيكي</h3>
      <p class="sheet-line">${Utils.escapeHtml(data.examination || '—')}</p>
      <h3 class="sheet-title">التشخيص</h3>
      <p class="sheet-line">${Utils.escapeHtml(data.diagnosis || '—')}${data.icd ? ` (ICD: ${Utils.escapeHtml(data.icd)})` : ''}${data.severity ? ` — الخطورة: ${Utils.escapeHtml(data.severity)}` : ''}</p>
      <h3 class="sheet-title">الروشتة</h3>
      <ul class="sheet-list">${data.prescription.length
        ? data.prescription.map((m) => `<li>${Utils.escapeHtml([m.name, m.dose, m.freq, m.duration].filter(Boolean).join(' — '))}</li>`).join('')
        : '<li>لا توجد أدوية مسجّلة</li>'}</ul>
      ${data.orders.length ? `<h3 class="sheet-title">الفحوصات المطلوبة</h3><ul class="sheet-list">${data.orders.map((o) => `<li>${Utils.escapeHtml(`${ORDER_TYPES[o.type] || ''} ${o.text}`)}</li>`).join('')}</ul>` : ''}
      ${data.advice ? `<h3 class="sheet-title">التوصيات</h3><p class="sheet-line">${Utils.escapeHtml(data.advice)}</p>` : ''}
      <p class="sheet-sign">توقيع الطبيب: ${Utils.escapeHtml(doctor ? doctor.name : '')}</p>`;
  }

  function buildSickLeaveSheet() {
    const visit = visitState.visit;
    const data = collectVisitData();
    const patient = patientOf(visit.patientId);
    const doctor = doctorOf(visit.doctorId);
    return `
      ${sheetHeaderHtml('شهادة إجازة مرضية', patient, doctor, visit, '')}
      <p class="sheet-line">تشهد العيادة بأن المريض المذكور أعلاه قد حضر للكشف بتاريخ
        ${Utils.escapeHtml(Utils.formatArabicDate(visit.date))}، والتشخيص:
        ${Utils.escapeHtml(data.diagnosis || '—')}.</p>
      <p class="sheet-line big">ويحتاج إلى راحة لمدة <strong>${Utils.escapeHtml(String(data.sickLeaveDays || 1))}</strong> يوم/أيام.</p>
      <p class="sheet-line">${Utils.escapeHtml(data.advice || '')}</p>
      <p class="sheet-sign">توقيع وخاتم الطبيب: ${Utils.escapeHtml(doctor ? doctor.name : '')}</p>`;
  }

  /** طباعة أي ورقة: يُبنى المحتوى ثم يُطبع ثم يُخفى بعد الطباعة */
  function printSheet(id, bodyId, builder, bodyClass) {
    syncTables();
    const body = $(bodyId);
    if (body) body.innerHTML = builder();
    const sheet = $(id);
    if (sheet) sheet.hidden = false;
    document.body.classList.add('printing-card', bodyClass);
    window.print();
  }

  /* ---------- تحميل الزيارة في النموذج ---------- */
  function fillVisitForm() {
    const v = visitState.visit;
    const vitals = v.vitals || {};
    setInput('vBpSys', vitals.bpSys); setInput('vBpDia', vitals.bpDia);
    setInput('vPulse', vitals.pulse); setInput('vTemp', vitals.temp);
    setInput('vSugar', vitals.sugar); setInput('vWeight', vitals.weight);
    setInput('vHeight', vitals.height);
    setInput('vComplaint', v.complaint); setInput('vHistory', v.history);
    setInput('vExamination', v.examination); setInput('vDiagnosis', v.diagnosis);
    setInput('vIcd', v.icd); setInput('vSeverity', v.severity);
    setInput('vAdvice', v.advice); setInput('vSickLeave', v.sickLeaveDays || '');
    setInput('followUpDate', v.followUpDate || '');
    visitState.prescription = (v.prescription || []).map((m) => ({ ...m }));
    visitState.orders = (v.orders || []).map((o) => ({ ...o }));
    renderMedRows();
    renderOrderRows();
    updateBmi();
    renderFollowUpSlots();
  }

  /** أوقات دوام الطبيب في اليوم المختار للمتابعة (مع حالة كل وقت) */
  function renderFollowUpSlots() {
    const wrap = $('followUpSlots');
    if (!wrap) return;
    const date = inputValue('followUpDate');
    visitState.followUpTime = null;
    if (!date) {
      wrap.innerHTML = '<p class="muted">اختر تاريخ المتابعة لعرض الأوقات المتاحة</p>';
      return;
    }
    const doctor = doctorOf(visitState.visit.doctorId);
    if (!doctor || !doctor.workDays.includes(Utils.dayOfWeek(date))) {
      wrap.innerHTML = '<p class="muted">الطبيب لا يعمل في هذا اليوم — اختر يومًا آخر</p>';
      return;
    }
    const slots = Appointments.slotsFor(doctor, date, {});
    wrap.innerHTML = `
      <div class="slot-grid">
        ${slots.map((s) => `
          <button type="button" class="slot-btn ${s.taken ? 'is-taken' : ''}" data-time="${s.time}"
            ${s.taken ? 'disabled' : ''} title="${s.taken ? 'محجوز' : 'متاح'}">
            ${Utils.to12h(s.time)}
          </button>`).join('')}
      </div>`;
  }

  /* ---------- التبويبات الداخلية ---------- */
  function activatePanel(name) {
    document.querySelectorAll('[data-vtab]').forEach((btn) => {
      const active = btn.dataset.vtab === name;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-vpanel]').forEach((panel) => {
      panel.hidden = panel.dataset.vpanel !== name;
    });
  }

  function bindTabs() {
    document.querySelectorAll('[data-vtab]').forEach((btn) => {
      btn.addEventListener('click', () => activatePanel(btn.dataset.vtab));
    });
  }

  /* ---------- أحداث الروشتة والفحوصات ---------- */
  function bindRxEvents() {
    const addMed = $('addMedBtn');
    if (addMed) addMed.addEventListener('click', () => {
      syncTables();
      visitState.prescription.push({ name: '', form: '', dose: '', freq: '', duration: '', notes: '' });
      renderMedRows();
      const rows = document.querySelectorAll('#rxBody tr');
      const last = rows[rows.length - 1];
      const input = last && last.querySelector('[data-field="name"]');
      if (input) input.focus();
    });

    const template = $('rxTemplate');
    if (template) template.addEventListener('change', () => {
      const key = template.value;
      if (!key || !RX_PRESETS[key]) return;
      syncTables();
      visitState.prescription = visitState.prescription.concat(RX_PRESETS[key].map((m) => ({ ...m })));
      renderMedRows();
      template.value = '';
      activatePanel('rx');
      Utils.showToast('تمت إضافة قالب الروشتة 💊');
    });

    const rxBody = $('rxBody');
    if (rxBody) rxBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="del-med"]');
      if (!btn) return;
      syncTables();
      visitState.prescription.splice(Number(btn.dataset.index), 1);
      renderMedRows();
    });

    const addOrder = $('addOrderBtn');
    if (addOrder) addOrder.addEventListener('click', () => {
      syncTables();
      visitState.orders.push({ type: 'lab', text: '' });
      renderOrderRows();
    });

    const ordersBody = $('ordersBody');
    if (ordersBody) ordersBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="del-order"]');
      if (!btn) return;
      syncTables();
      visitState.orders.splice(Number(btn.dataset.index), 1);
      renderOrderRows();
    });
  }

  /* ---------- حفظ / إتمام / متابعة / طباعة ---------- */
  function saveDraft(silent) {
    syncTables();
    const res = Visits.save(visitState.id, collectVisitData());
    if (!res.ok) { Utils.showToast(res.reason, 'error'); return false; }
    visitState.visit = res.visit;
    renderVisitHeader();
    renderSummaryPanel();
    if (!silent) Utils.showToast('تم حفظ مسودة الزيارة 💾');
    return true;
  }

  function setVisitReadOnly(readOnly) {
    document.querySelectorAll('#visitForm input, #visitForm select, #visitForm textarea, #visitForm button')
      .forEach((el) => { el.disabled = readOnly; });
    ['startVisitBtn', 'saveDraftBtn', 'finishVisitBtn', 'addMedBtn', 'addOrderBtn', 'createFollowUpBtn']
      .forEach((id) => { const el = $(id); if (el) el.disabled = readOnly; });
  }

  function bindVisitActions() {
    const startBtn = $('startVisitBtn');
    if (startBtn) startBtn.addEventListener('click', () => {
      const res = Visits.start(visitState.id);
      if (!res.ok) { Utils.showToast(res.reason, 'error'); return; }
      visitState.visit = res.visit;
      visitState.finished = false;
      renderVisitHeader();
      renderSummaryPanel();
      Utils.showToast('بدأ الكشف 🩺');
    });

    const saveBtn = $('saveDraftBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveDraft(false));

    const finishBtn = $('finishVisitBtn');
    if (finishBtn) finishBtn.addEventListener('click', () => {
      if (visitState.finished) { Utils.showToast('هذه الزيارة مكتملة بالفعل', 'error'); return; }
      const data = collectVisitData();
      if (!data.diagnosis && !data.prescription.length) {
        if (!confirm('لم تُسجّل تشخيصًا ولا أدوية. إتمام الزيارة كما هي؟')) return;
      }
      const res = Visits.finish(visitState.id, data);
      if (!res.ok) { Utils.showToast(res.reason, 'error'); return; }
      visitState.visit = res.visit;
      visitState.finished = true;
      Utils.showToast('تم إتمام الزيارة وتحويل الموعد إلى «تمت الزيارة» ✅');
      renderVisitHeader();
      renderSummaryPanel();
      setVisitReadOnly(true);
      const followUp = inputValue('followUpDate');
      if (followUp) {
        if (!visitState.followUpTime && $('followUpSlots') && $('followUpSlots').querySelector('.slot-btn')) {
          Utils.showToast('اختر وقتًا لموعد المتابعة ثم اضغط «حجز المتابعة»', 'error');
        }
      }
    });

    const followUpBtn = $('createFollowUpBtn');
    if (followUpBtn) followUpBtn.addEventListener('click', () => {
      const date = inputValue('followUpDate');
      if (!date) { Utils.showToast('اختر تاريخ المتابعة أولًا', 'error'); return; }
      if (!visitState.followUpTime) { Utils.showToast('اختر وقتًا متاحًا للمتابعة', 'error'); return; }
      const res = Visits.createFollowUp(visitState.id, date, visitState.followUpTime);
      if (!res.ok) { Utils.showToast(res.reason, 'error'); return; }
      Utils.showToast(`تم حجز متابعة ${Utils.formatArabicDate(date)} — ${Utils.to12h(visitState.followUpTime)} ✅`);
      renderFollowUpSlots();
    });

    const rxBtn = $('printRxBtn');
    if (rxBtn) rxBtn.addEventListener('click', () => printSheet('printRx', 'printRxBody', buildRxSheet, 'printing-rx'));

    const reportBtn = $('printReportBtn');
    if (reportBtn) reportBtn.addEventListener('click', () => printSheet('printReport', 'printReportBody', buildReportSheet, 'printing-report'));

    const sickBtn = $('printSickLeaveBtn');
    if (sickBtn) sickBtn.addEventListener('click', () => {
      const days = Number(inputValue('vSickLeave') || 0);
      if (!days) { Utils.showToast('حدّد عدد أيام الإجازة المرضية أولًا', 'error'); return; }
      printSheet('printSickLeave', 'printSickLeaveBody', buildSickLeaveSheet, 'printing-sickleave');
    });

    const followDate = $('followUpDate');
    if (followDate) followDate.addEventListener('change', renderFollowUpSlots);

    const slotsWrap = $('followUpSlots');
    if (slotsWrap) slotsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.slot-btn');
      if (!btn || btn.disabled) return;
      slotsWrap.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      visitState.followUpTime = btn.dataset.time;
    });
  }

  /* ---------- شاشة الكشف: التحميل والتهيئة ---------- */
  function renderVisitEmpty(message) {
    const empty = $('visitEmpty');
    const shell = $('visitShell');
    const p = $('visitEmptyText');
    if (empty) empty.hidden = false;
    if (shell) shell.hidden = true;
    if (p) p.textContent = message;
  }

  function loadVisitShell() {
    const visit = Store.findById(Store.KEYS.VISITS, visitState.id);
    if (!visit) {
      renderVisitEmpty('لم يُعثر على زيارة بهذا الرقم — تأكد من الرابط أو اختر مريضًا من لوحة الطبيب');
      return false;
    }
    if (!Session.isDoctor(visit.doctorId)) {
      renderVisitEmpty('هذه الزيارة مسجّلة على طبيب آخر — لا يمكن عرضها من حسابك');
      return false;
    }
    const appt = Appointments.find(visit.appointmentId);
    visitState.visit = { ...visit, appointment: appt || null };
    visitState.finished = visit.queueStatus === 'done';

    const empty = $('visitEmpty');
    const shell = $('visitShell');
    if (empty) empty.hidden = true;
    if (shell) shell.hidden = false;

    setInput('visitIdHidden', visitState.id);
    renderVisitHeader();
    renderSummaryPanel();
    fillVisitForm();

    const title = $('visitPageTitle');
    const patient = patientOf(visit.patientId);
    if (title) title.textContent = `🩺 كشف: ${patient ? patient.name : visit.appointmentId}`;

    if (visitState.finished) {
      Utils.showToast('هذه الزيارة مكتملة — العرض للقراءة فقط', 'error');
      setVisitReadOnly(true);
    }
    return true;
  }

  function initVisit() {
    visitState.id = currentVisitId();
    if (!visitState.id) {
      renderVisitEmpty('لم يُحدَّد رقم الزيارة — افتح الشاشة من قائمة الطبيب أو من التحويلات');
      return;
    }
    if (!loadVisitShell()) return;

    bindTabs();
    bindRxEvents();
    bindVisitActions();
    renderMedicineCatalog();

    ['vWeight', 'vHeight'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('input', updateBmi);
    });

    document.querySelectorAll('#visitForm input, #visitForm textarea').forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') e.preventDefault();
      });
    });
  }

  /* ============================================================
     التشغيل — تهيئة الصفحة الحالية فقط
     ============================================================ */
  afterPrintCleanup();

  if (page === 'doctor-dashboard') {
    const doctor = initDoctorSession('doctorLoginGate', 'doctorContent', 'doctorUserName');
    if (doctor) initDoctorDashboard(doctor);
    else {
      const form = $('doctorLoginForm');
      if (form) form.addEventListener('submit', () => {
        const current = Session.currentDoctor();
        if (current) initDoctorDashboard(current);
      });
    }
  } else if (page === 'doctor-visit') {
    const doctor = initDoctorSession('doctorLoginGate', 'doctorContent', 'doctorUserName');
    if (doctor) initVisit();
    else {
      const form = $('doctorLoginForm');
      if (form) form.addEventListener('submit', () => {
        if (Session.currentDoctor()) initVisit();
      });
    }
  }
})();
