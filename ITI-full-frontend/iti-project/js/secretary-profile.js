/* secretary-profile.js — بروفايل السكرتير وإحصاءات العيادة */
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const escape = (value) => Utils.escapeHtml(value ?? '—');
  const formatDate = (date, time) => `${Utils.formatArabicDate(date, false)} · ${Utils.to12h(time)}`;

  function badge(status) {
    const meta = Appointments.statusMeta(status);
    return `<span class="badge ${meta.badge}">${escape(meta.label)}</span>`;
  }

  function render(staff) {
    const stats = Appointments.statsForClinic();
    $('secUserName').textContent = `👤 ${staff.name}`;
    $('profileMeta').textContent = `${staff.user} · حساب سكرتير نشط`;
    $('profileCard').innerHTML = `<div class="profile-avatar" aria-hidden="true">🗂️</div><div class="profile-info"><h2>${escape(staff.name)}</h2><div class="profile-meta"><span>👤 اسم المستخدم: <b dir="ltr">${escape(staff.user)}</b></span><span>🛡️ الدور: السكرتير</span><span>✅ الحالة: نشط</span></div></div>`;
    $('statTotal').textContent = stats.total;
    $('statPending').textContent = stats.pending;
    $('statApproved').textContent = stats.approved + stats.checkedIn;
    $('statCompleted').textContent = stats.completed;
    $('statClosed').textContent = stats.rejected + stats.cancelled + stats.noShow;
    const rows = Store.getAll(Store.KEYS.APPOINTMENTS).sort((a, b) => Utils.byDateTime(b, a)).slice(0, 10);
    $('recentAppointments').innerHTML = rows.map((a) => {
      const doctor = Store.findById(Store.KEYS.DOCTORS, a.doctorId);
      return `<tr><td data-label="المريض">${escape(a.patientName)}</td><td data-label="الطبيب">${escape(doctor ? doctor.name : '—')}</td><td data-label="التاريخ">${escape(formatDate(a.date, a.time))}</td><td data-label="الحالة">${badge(a.status)}</td></tr>`;
    }).join('');
    $('emptyAppointments').hidden = rows.length > 0;
  }

  const staff = Session.currentStaff();
  if (!staff) {
    window.location.href = '../patient-login.html';
    return;
  } else {
    $('profileContent').hidden = false;
    render(staff);
  }
  $('logoutBtn').addEventListener('click', () => { Session.logout(); window.location.href = '../index.html'; });
})();
