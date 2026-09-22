/* home.js — بوابة المرضى: عرض الأطباء النشطين فقط */
'use strict';

(() => {
  const grid = document.getElementById('doctorGrid');
  if (!grid) return;
  const esc = (value) => Utils.escapeHtml(String(value == null ? '' : value));

  function locationHtml(doctor) {
    return (doctor.locations || []).map((loc) => {
      const branch = Clinic.branch(loc.branchId);
      if (!branch) return '';
      const workDays = (loc.days || []).map((day) => Utils.dayNames[day]).join('، ');
      return `<span class="location-line"><b>${esc(branch.name)}</b> — ${esc(loc.room || 'العيادة')}<small>${esc(workDays)}</small></span>`;
    }).join('');
  }

  function render() {
    const doctors = Store.getAll(Store.KEYS.DOCTORS).filter((doctor) => doctor.active !== false && !doctor.archived);
    if (!doctors.length) {
      grid.innerHTML = '<p class="empty-note">لا يوجد أطباء متاحون حاليًا.</p>';
      return;
    }
    grid.innerHTML = doctors.map((doctor) => `
      <article class="doctor-card home-doctor-card">
        <span class="doctor-avatar" aria-hidden="true">د</span>
        <h3 class="doctor-name">${esc(doctor.name)}</h3>
        <span class="badge badge-primary">${esc(doctor.specialty)}</span>
        <p class="doctor-bio">${esc(doctor.bio || 'استشارات ومتابعة طبية.')}</p>
        <div class="doctor-location">${locationHtml(doctor)}</div>
        <p class="doctor-meta">ساعات العمل: ${esc(Utils.to12h(`${Utils.pad2(doctor.startHour)}:00`))} — ${esc(Utils.to12h(`${Utils.pad2(doctor.endHour)}:00`))}</p>
        <button type="button" class="btn btn-primary btn-block" data-doctor-id="${esc(doctor.id)}">اختيار الطبيب</button>
      </article>`).join('');
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-doctor-id]');
    if (!button) return;
    const result = Session.setSelectedDoctor(button.dataset.doctorId);
    if (!result.ok) { Utils.showToast(result.reason, 'error'); return; }
    window.location.href = `patient-login.html?doctorId=${encodeURIComponent(result.doctor.id)}`;
  });

  render();
})();
