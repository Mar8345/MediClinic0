/* ============================================================
   booking.js — منطق حجز المريض (3 خطوات)
   1) اختيار الطبيب  2) اختيار اليوم والوقت  3) بيانات المريض
   ============================================================ */
'use strict';

(function () {
  /* ---------- الحالة الحالية ---------- */
  const state = {
    step: 1,
    doctorId: null,
    date: null,   // YYYY-MM-DD
    time: null,   // HH:MM بنظام 24 ساعة
    specialty: 'all'
  };

  /* ---------- عناصر الصفحة ---------- */
  const els = {
    stepsBar: document.getElementById('stepsBar'),
    stepPanels: {
      1: document.getElementById('step-doctor'),
      2: document.getElementById('step-schedule'),
      3: document.getElementById('step-patient')
    },
    successPanel: document.getElementById('step-success'),
    specialtyFilters: document.getElementById('specialtyFilters'),
    doctorGrid: document.getElementById('doctorGrid'),
    selectedDoctorBar: document.getElementById('selectedDoctorBar'),
    dayLocationBar: document.getElementById('dayLocationBar'),
    dateChips: document.getElementById('dateChips'),
    slotsGrid: document.getElementById('slotsGrid'),
    appointmentSummaryBar: document.getElementById('appointmentSummaryBar'),
    patientForm: document.getElementById('patientForm'),
    confirmModal: document.getElementById('confirmModal'),
    toStep3Btn: document.getElementById('toStep3Btn'),
    confirmSummary: document.getElementById('confirmSummary'),
    confirmBookingBtn: document.getElementById('confirmBookingBtn'),
    cancelConfirmBtn: document.getElementById('cancelConfirmBtn'),
    successCode: document.getElementById('successCode'),
    successSummary: document.getElementById('successSummary'),
    bookAgainBtn: document.getElementById('bookAgainBtn')
  };

  const currentDoctor = () =>
    state.doctorId ? Store.findById(Store.KEYS.DOCTORS, state.doctorId) : null;

  const queryDoctorId = new URLSearchParams(window.location.search).get('doctorId');

  /* ---------- أدوات «مكان الطبيب» (الفروع) ---------- */
  function locationFor(doctor, dateIso) {
    return Clinic.locationForDate(doctor, dateIso || state.date);
  }

  /** صندوق تفاصيل المكان داخل بطاقة الطبيب (خطوة 1) */
  function doctorLocationHtml(doctor) {
    const locs = doctor.locations || [];
    if (!locs.length) return '';

    if (locs.length === 1) {
      const loc = locs[0];
      const branch = Clinic.branch(loc.branchId);
      if (!branch) return '';
      return `
        <div class="doctor-location">
          <span class="location-line">📍 <span>${Utils.escapeHtml(Clinic.locationText(loc))}</span></span>
          <span class="location-line">🏢 <span>${Utils.escapeHtml(branch.address)}</span></span>
          <span class="location-line">📞 <span dir="ltr">${Utils.escapeHtml(doctor.phone || branch.phone)}</span></span>
          <a class="maps-link" href="${Utils.escapeHtml(branch.mapsUrl)}"
             target="_blank" rel="noopener">🗺️ عرض الموقع على الخريطة</a>
        </div>`;
    }

    /* تعدد الفروع: سطر لكل فرع بأيام عمله */
    return `
      <div class="doctor-location">
        ${locs.map((loc) => {
          const branch = Clinic.branch(loc.branchId);
          if (!branch) return '';
          const days = (loc.days || []).map((day) => Utils.dayNames[day]).join('، ');
          return `<span class="location-line">📍 <span>${Utils.escapeHtml(days)}: ${Utils.escapeHtml(Clinic.locationText(loc))}</span></span>`;
        }).join('')}
        <span class="location-note">💡 مكان الموعد يظهر تلقائيًا حسب اليوم الذي تختاره</span>
      </div>`;
  }

  /* ---------- التنقل بين الخطوات ---------- */
  function goTo(step) {
    state.step = step;
    Object.entries(els.stepPanels).forEach(([num, panel]) => {
      const active = Number(num) === step;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    els.stepsBar.querySelectorAll('.step').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-active', n === step);
      li.classList.toggle('is-done', n < step);
    });
    if (step === 2) renderSchedule();
    if (step === 3) renderAppointmentBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* أزرار الرجوع الموجودة في HTML */
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => goTo(Number(btn.dataset.goto)));
  });

  /* ---------- الخطوة 1: الأطباء + تصفية التخصص ---------- */
  function renderSpecialtyFilters() {
    const specialties = [...new Set(Store.getAll(Store.KEYS.DOCTORS)
      .filter((d) => d.active !== false && !d.archived)
      .map((d) => d.specialty))];
    const options = [{ value: 'all', label: 'كل التخصصات' }]
      .concat(specialties.map((s) => ({ value: s, label: s })));
    els.specialtyFilters.innerHTML = options.map((o) => `
      <button type="button" class="chip ${state.specialty === o.value ? 'is-selected' : ''}"
              data-specialty="${Utils.escapeHtml(o.value)}">${Utils.escapeHtml(o.label)}</button>
    `).join('');
  }

  els.specialtyFilters.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.specialty = chip.dataset.specialty;
    renderSpecialtyFilters();
    renderDoctors();
  });

  function workDaysText(doctor) {
    return doctor.workDays.map((d) => Utils.dayNames[d]).join('، ');
  }

  function renderDoctors() {
    const doctors = Store.getAll(Store.KEYS.DOCTORS)
      .filter((d) => d.active !== false && !d.archived)
      .filter((d) => state.specialty === 'all' || d.specialty === state.specialty);

    if (!doctors.length) {
      els.doctorGrid.innerHTML = '<p class="empty-note">لا يوجد أطباء في هذا التخصص حاليًا</p>';
      return;
    }

    els.doctorGrid.innerHTML = doctors.map((d) => `
      <article class="doctor-card ${state.doctorId === d.id ? 'is-selected' : ''}">
        <span class="doctor-avatar" aria-hidden="true">د</span>
        <h3 class="doctor-name">${Utils.escapeHtml(d.name)}</h3>
        <span class="badge badge-primary">${Utils.escapeHtml(d.specialty)}</span>
        <p class="doctor-bio">${Utils.escapeHtml(d.bio)}</p>
        <p class="doctor-meta">🗓️ أيام العمل: ${Utils.escapeHtml(workDaysText(d))}</p>
        <p class="doctor-meta">🕘 من ${Utils.to12h(`${Utils.pad2(d.startHour)}:00`)}
           إلى ${Utils.to12h(`${Utils.pad2(d.endHour)}:00`)}</p>
        ${doctorLocationHtml(d)}
        <button type="button" class="btn btn-primary btn-block" data-doctor="${d.id}">
          ${state.doctorId === d.id ? '✓ تم الاختيار' : 'اختيار هذا الطبيب'}
        </button>
      </article>
    `).join('');
  }

  els.doctorGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-doctor]');
    if (!btn) return;
    const id = btn.dataset.doctor;
    if (state.doctorId !== id) {
      state.doctorId = id;
      state.date = null;
      state.time = null;
    }
    renderDoctors();
    goTo(2);
  });

  /* ---------- الخطوة 2: الأيام والأوقات ---------- */
  /* ملاحظة: منطق الأوقات المشغولة صار مشتركًا في storage.js (Appointments) */
  function takenSlots(doctorId, date) {
    return Appointments.takenSlots(doctorId, date);
  }

  function renderSchedule() {
    const doctor = currentDoctor();
    if (!doctor || doctor.active === false || doctor.archived) {
      Utils.showToast('الطبيب المختار غير متاح حاليًا', 'error');
      goTo(1);
      return;
    }

    els.selectedDoctorBar.innerHTML = `
      <div class="selected-doctor-inner">
        <span class="doctor-avatar sm" aria-hidden="true">د</span>
        <div><strong>${Utils.escapeHtml(doctor.name)}</strong>
        <span class="text-muted"> — ${Utils.escapeHtml(doctor.specialty)}</span></div>
      </div>`;

    /* أيام العمل خلال الأسبوعين القادمين فقط */
    const todayIso = Utils.todayISO();
    const todayDow = new Date().getDay();
    const dates = [];
    for (let i = 0; i <= 13; i++) {
      const iso = Utils.addDaysISO(todayIso, i);
      if (doctor.workDays.includes((todayDow + i) % 7)) dates.push(iso);
    }

    if (!dates.length) {
      els.dateChips.innerHTML = '';
      els.slotsGrid.innerHTML = '<p class="empty-note">لا توجد أيام عمل متاحة خلال الأسبوعين القادمين</p>';
      return;
    }

    if (!state.date || !dates.includes(state.date)) state.date = dates[0];

    els.dateChips.innerHTML = dates.map((iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const selected = iso === state.date;
      return `
        <button type="button" class="chip date-chip ${selected ? 'is-selected' : ''}"
                data-date="${iso}" role="option" aria-selected="${selected}">
          <strong>${Utils.dayNames[dow]}</strong>
          <span>${d} ${Utils.monthNames[m - 1]}</span>
        </button>`;
    }).join('');

    renderDayLocation(doctor);
    renderSlots();
  }

  /* شريط «مكان الموعد في هذا اليوم» — يتحدّث مع تغيير اليوم المختار */
  function renderDayLocation(doctor) {
    if (!els.dayLocationBar) return;
    const loc = locationFor(doctor, state.date);
    const branch = loc && Clinic.branch(loc.branchId);
    if (!loc || !branch) { els.dayLocationBar.hidden = true; return; }
    els.dayLocationBar.hidden = false;
    els.dayLocationBar.innerHTML = `
      <div class="selected-doctor-inner">
        <span aria-hidden="true">📍</span>
        <div><strong>مكان الموعد في هذا اليوم:</strong>
        <span>${Utils.escapeHtml(Clinic.locationText(loc))}</span>
        <span class="text-muted"> — ${Utils.escapeHtml(branch.address)}</span></div>
      </div>`;
  }

  function renderSlots() {
    const doctor = currentDoctor();
    if (!doctor || !state.date) return;

    const taken = new Set(takenSlots(doctor.id, state.date));
    const isToday = state.date === Utils.todayISO();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const slots = [];
    for (let m = doctor.startHour * 60;
         m + doctor.slotMinutes <= doctor.endHour * 60;
         m += doctor.slotMinutes) {
      slots.push(`${Utils.pad2(Math.floor(m / 60))}:${Utils.pad2(m % 60)}`);
    }

    els.slotsGrid.innerHTML = slots.map((time) => {
      const [h, m] = time.split(':').map(Number);
      const isPast = isToday && h * 60 + m <= nowMinutes;
      const disabled = taken.has(time) || isPast;
      const reason = taken.has(time) ? 'محجوز' : isPast ? 'فات وقتها' : '';
      const selected = state.time === time;
      return `
        <button type="button" class="slot ${selected ? 'is-selected' : ''}"
                data-time="${time}" ${disabled ? 'disabled' : ''}
                title="${reason || 'متاح'}">
          ${Utils.to12h(time)}${reason ? `<small>${reason}</small>` : ''}
        </button>`;
    }).join('') || '<p class="empty-note">لا توجد أوقات في هذا اليوم</p>';

    els.toStep3Btn.disabled = !state.time;
  }

  els.dateChips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-date]');
    if (!chip) return;
    state.date = chip.dataset.date;
    state.time = null;
    renderSchedule();
  });

  els.slotsGrid.addEventListener('click', (e) => {
    const slot = e.target.closest('[data-time]');
    if (!slot || slot.disabled) return;
    state.time = slot.dataset.time;
    els.slotsGrid.querySelectorAll('.slot').forEach((s) => {
      s.classList.toggle('is-selected', s === slot);
    });
    els.toStep3Btn.disabled = false;
  });

  els.toStep3Btn.addEventListener('click', () => {
    if (!state.time) {
      Utils.showToast('اختر وقتًا للموعد أولًا', 'info');
      return;
    }
    goTo(3);
  });

  /* ---------- الخطوة 3: بيانات المريض ---------- */
  function renderAppointmentBar() {
    const doctor = currentDoctor();
    if (!doctor || !state.date || !state.time) return;
    els.appointmentSummaryBar.innerHTML = `
      <div class="selected-doctor-inner">
        <span class="doctor-avatar sm" aria-hidden="true">${doctor.avatar}</span>
        <div><strong>${Utils.escapeHtml(doctor.name)}</strong>
        <span class="text-muted"> — ${Utils.escapeHtml(doctor.specialty)}</span></div>
        <span class="badge badge-primary">${Utils.formatArabicDate(state.date)} — ${Utils.to12h(state.time)}</span>
      </div>
      <div class="selected-doctor-inner location-row">
        <span aria-hidden="true">📍</span>
        <span>${Utils.escapeHtml(Clinic.locationText(locationFor(doctor)))}</span>
      </div>`;
  }

  /* قواعد التحقق صارت مشتركة في storage.js (تُستخدم أيضًا في لوحة السكرتير) */
  const validators = Validators;

  function validateField(id) {
    const input = document.getElementById(id);
    const errorEl = document.querySelector(`[data-error-for="${id}"]`);
    const result = validators[id](input.value);
    const ok = result === true;
    input.classList.toggle('is-invalid', !ok);
    errorEl.textContent = ok ? '' : result;
    return ok;
  }

  Object.keys(validators).forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener('blur', () => validateField(id));
    input.addEventListener('input', () => {
      if (input.classList.contains('is-invalid')) validateField(id);
    });
  });

  els.patientForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const allValid = Object.keys(validators).map(validateField).every(Boolean);
    if (!allValid) {
      Utils.showToast('راجع الحقول المطلوبة من فضلك', 'error');
      return;
    }
    openConfirmModal();
  });

  /* ---------- نافذة المراجعة والتأكيد ---------- */
  function summaryRowsHtml() {
    const doctor = currentDoctor();
    const loc = locationFor(doctor);
    const locBranch = loc && Clinic.branch(loc.branchId);
    const genderLabel = document.getElementById('gender').value === 'male' ? 'ذكر' : 'أنثى';
    const rows = [
      ['الطبيب', `${doctor.name} (${doctor.specialty})`],
      ['المكان', Clinic.locationText(loc) + (locBranch ? ` — ${locBranch.address}` : '')],
      ['الموعد', `${Utils.formatArabicDate(state.date)} — ${Utils.to12h(state.time)}`],
      ['الاسم', document.getElementById('fullName').value.trim()],
      ['الرقم القومي', document.getElementById('nationalId').value.trim()],
      ['الموبايل', document.getElementById('phone').value.trim()],
      ['العمر', document.getElementById('age').value],
      ['النوع', genderLabel],
      ['سبب الزيارة', document.getElementById('reason').value.trim()]
    ];
    return rows.map(([k, v]) =>
      `<div class="summary-row"><dt>${k}</dt><dd>${Utils.escapeHtml(v)}</dd></div>`
    ).join('');
  }

  function openConfirmModal() {
    els.confirmSummary.innerHTML = summaryRowsHtml();
    els.confirmModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeConfirmModal() {
    els.confirmModal.hidden = true;
    document.body.style.overflow = '';
  }

  els.cancelConfirmBtn.addEventListener('click', closeConfirmModal);
  els.confirmModal.addEventListener('click', (e) => {
    if (e.target === els.confirmModal) closeConfirmModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.confirmModal.hidden) closeConfirmModal();
  });

  /* ---------- الحفظ النهائي في localStorage ---------- */
  function nextCode() {
    return Appointments.nextCode();
  }

  els.confirmBookingBtn.addEventListener('click', () => {
    /* تحقق نهائي: هل ما زال الوقت متاحًا؟ */
    if (takenSlots(state.doctorId, state.date).includes(state.time)) {
      closeConfirmModal();
      Utils.showToast('عذرًا، تم حجز هذا الوقت للتو — اختر وقتًا آخر', 'error');
      goTo(2);
      return;
    }

    const name = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const nationalId = document.getElementById('nationalId').value.trim();
    const age = Number(document.getElementById('age').value);
    const gender = document.getElementById('gender').value;

    /* إعادة استخدام ملف المريض إذا كان موجودًا بنفس رقم الموبايل */
    let patient = Store.getAll(Store.KEYS.PATIENTS).find((p) => p.phone === phone);
    if (patient) {
      Store.update(Store.KEYS.PATIENTS, patient.id, { name, nationalId, age, gender });
    } else {
      patient = Store.insert(Store.KEYS.PATIENTS, {
        id: Utils.uid('pat'), nationalId, name, phone, age, gender
      });
    }

    const appointment = Store.insert(Store.KEYS.APPOINTMENTS, {
      id: Utils.uid('apt'),
      code: nextCode(),
      doctorId: state.doctorId,
      patientId: patient.id,
      patientName: name,
      patientPhone: phone,
      date: state.date,
      time: state.time,
      reason: document.getElementById('reason').value.trim(),
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    closeConfirmModal();
    showSuccess(appointment);
  });

  function showSuccess(appointment) {
    const doctor = currentDoctor();
    const loc = locationFor(doctor, appointment.date);
    const locBranch = loc && Clinic.branch(loc.branchId);
    Object.values(els.stepPanels).forEach((p) => {
      p.hidden = true;
      p.classList.remove('is-active');
    });
    els.stepsBar.querySelectorAll('.step').forEach((li) => {
      li.classList.add('is-done');
      li.classList.remove('is-active');
    });
    els.successPanel.hidden = false;
    els.successCode.textContent = appointment.code;
    els.successSummary.innerHTML = [
      ['الطبيب', `${doctor.name} — ${doctor.specialty}`],
      ['المكان', Clinic.locationText(loc) + (locBranch ? ` — ${locBranch.address}` : '')],
      ['الموعد', `${Utils.formatArabicDate(appointment.date)} — ${Utils.to12h(appointment.time)}`],
      ['الحالة', 'قيد المراجعة من سكرتيرة العيادة']
    ].map(([k, v]) =>
      `<div class="summary-row"><dt>${k}</dt><dd>${Utils.escapeHtml(v)}</dd></div>`
    ).join('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  els.bookAgainBtn.addEventListener('click', () => {
    state.doctorId = null;
    state.date = null;
    state.time = null;
    els.patientForm.reset();
    document.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    document.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
    renderSpecialtyFilters();
    renderDoctors();
    goTo(1);
  });

  function prefillPatient() {
    const patient = Session.currentPatient();
    if (!patient) return;
    document.getElementById('fullName').value = patient.name || '';
    document.getElementById('nationalId').value = patient.nationalId || '';
    document.getElementById('phone').value = patient.phone || '';
    document.getElementById('age').value = patient.age == null ? '' : patient.age;
    document.getElementById('gender').value = patient.gender || '';
  }

  /* ---------- التشغيل ---------- */
  if (queryDoctorId) {
    const selected = Store.findById(Store.KEYS.DOCTORS, queryDoctorId);
    if (selected && selected.active !== false && !selected.archived) state.doctorId = selected.id;
  }
  prefillPatient();
  renderSpecialtyFilters();
  renderDoctors();
  if (state.doctorId) goTo(2);
})();
