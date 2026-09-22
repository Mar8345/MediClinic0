/* doctor-profile.js — بروفايل الطبيب ومواعيده */
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const escape = (value) => Utils.escapeHtml(value ?? '—');
  const locationText = (doctor, date) => Clinic.locationText(Clinic.locationForDate(doctor, date)) || '—';
  const badge = (status) => { const meta = Appointments.statusMeta(status); return `<span class="badge ${meta.badge}">${escape(meta.label)}</span>`; };

  function renderEditForm(doctor) {
    $('doctorProfilePhone').value = doctor.phone || '';
    $('doctorProfileBio').value = doctor.bio || '';
    $('doctorProfileSlot').value = doctor.slotMinutes || 30;
    $('doctorProfileStart').value = doctor.startHour ?? 9;
    $('doctorProfileEnd').value = doctor.endHour ?? 16;
    $('doctorProfileDays').innerHTML = DAYS.map((label, index) => `<label class="chip"><input type="checkbox" value="${index}" ${(doctor.workDays || []).includes(index) ? 'checked' : ''}> ${label}</label>`).join('');
  }

  function render(doctor) {
    const today = Utils.todayISO();
    const apptStats = Appointments.statsForDoctor(doctor.id);
    const visitStats = Visits.statsForDoctor(doctor.id);
    const upcoming = Store.getAll(Store.KEYS.APPOINTMENTS).filter((a) => a.doctorId === doctor.id && Appointments.ACTIVE.includes(a.status) && a.date >= today).sort(Utils.byDateTime).slice(0, 12);
    $('doctorUserName').textContent = `👨‍⚕️ ${doctor.name}`;
    $('profileMeta').textContent = `${doctor.specialty} · ملف مهني ومواعيد الطبيب`;
    $('profileCard').innerHTML = `<div class="profile-avatar" aria-hidden="true">${escape(doctor.avatar || '👨‍⚕️')}</div><div class="profile-info"><h2>${escape(doctor.name)}</h2><div class="profile-meta"><span>🩺 التخصص: ${escape(doctor.specialty)}</span><span>📞 <b dir="ltr">${escape(doctor.phone)}</b></span><span>✅ الحساب نشط</span></div><p class="doctor-bio">${escape(doctor.bio || 'لم يضف الطبيب سيرته الذاتية بعد.')}</p></div>`;
    $('statUpcoming').textContent = apptStats.upcoming;
    $('statPatients').textContent = apptStats.patients;
    $('statPending').textContent = apptStats.pending;
    $('statCompleted').textContent = apptStats.completed;
    $('statVisits').textContent = visitStats.total;
    const locations = (doctor.locations || []).map((loc) => `<li>${escape(Clinic.locationText(loc))} — ${escape((loc.days || []).map((day) => Utils.dayNames[day]).join('، '))}</li>`).join('');
    $('workDetails').innerHTML = `<div><strong>أماكن العمل</strong><ul>${locations || '<li>غير محدد</li>'}</ul></div><div><strong>ساعات العمل</strong><p>${escape(`${doctor.startHour}:00 — ${doctor.endHour}:00`)} · مدة الموعد ${escape(doctor.slotMinutes)} دقيقة</p></div>`;
    $('upcomingAppointments').innerHTML = upcoming.map((a) => `<tr><td data-label="المريض">${escape(a.patientName)}</td><td data-label="التاريخ والوقت">${escape(Utils.formatArabicDate(a.date, false))} · ${escape(Utils.to12h(a.time))}</td><td data-label="المكان">${escape(locationText(doctor, a.date))}</td><td data-label="الحالة">${badge(a.status)}${a.cancelReason ? `<span class="cell-sub">سبب الاعتذار: ${escape(a.cancelReason)}</span>` : ''}</td><td class="no-print" data-label="إجراء">${['pending', 'approved'].includes(a.status) ? `<button type="button" class="btn btn-outline btn-sm" data-doctor-cancel="${escape(a.id)}">⛔ اعتذار عن الموعد</button>` : '<span class="cell-sub">—</span>'}</td></tr>`).join('');
    $('emptyAppointments').hidden = upcoming.length > 0;
    renderEditForm(doctor);
  }

  const doctor = Session.currentDoctor();
  if (!doctor) {
    window.location.href = '../patient-login.html';
    return;
  } else {
    $('profileContent').hidden = false;
    render(doctor);
  }
  $('doctorProfileForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const days = [...$('doctorProfileDays').querySelectorAll('input:checked')].map((input) => Number(input.value));
    const result = Doctors.updateProfile(doctor.id, {
      phone: $('doctorProfilePhone').value,
      bio: $('doctorProfileBio').value,
      workDays: days,
      startHour: $('doctorProfileStart').value,
      endHour: $('doctorProfileEnd').value,
      slotMinutes: $('doctorProfileSlot').value
    });
    $('doctorProfileError').textContent = result.ok ? '' : result.reason;
    if (!result.ok) { Utils.showToast(result.reason, 'error'); return; }
    Utils.showToast('تم تحديث ملف الطبيب');
    render(result.item);
  });
  $('upcomingAppointments').addEventListener('click', (event) => {
    const button = event.target.closest('[data-doctor-cancel]');
    if (!button) return;
    const appointment = Appointments.find(button.dataset.doctorCancel);
    if (!appointment) return;
    const reason = window.prompt('اكتب سبب الاعتذار عن الموعد:');
    if (reason === null) return;
    const result = Appointments.cancelByDoctor(appointment.id, doctor.id, reason);
    if (!result.ok) { Utils.showToast(result.reason, 'error'); return; }
    Utils.showToast('تم تسجيل اعتذار الطبيب عن الموعد');
    render(Session.currentDoctor());
  });
  $('doctorLogoutBtn').addEventListener('click', () => { Session.logout(); window.location.href = '../index.html'; });
})();
