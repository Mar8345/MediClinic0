/* president.js — لوحة الإدارة المحلية، بلا Backend أو مصادقة خادمية */
'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => Utils.escapeHtml(String(value == null ? '' : value));
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  let editingDoctor = null;
  let editingStaff = null;

  function toast(message, type = 'success') { Utils.showToast(message, type); }
  function branch(id) { return (CLINIC.branches || []).find((item) => item.id === id) || null; }
  function doctor(id) { return Doctors.find(id); }
  function statusLabel(item) { return item.archived ? 'مؤرشف' : item.status === 'pending' ? 'بانتظار الاعتماد' : item.status === 'rejected' ? 'مرفوض' : item.active === false ? 'معطل' : 'نشط'; }
  function statusClass(item) { return item.archived ? 'badge-muted' : item.status === 'pending' ? 'badge-warning' : item.status === 'rejected' ? 'badge-danger' : item.active === false ? 'badge-danger' : 'badge-success'; }

  function applyAuth(loggedIn) {
    $('loginGate').hidden = loggedIn;
    $('presidentContent').hidden = !loggedIn;
    if (loggedIn) renderAll();
  }

  function initAuth() {
    $('logoutBtn').addEventListener('click', () => { Session.logout(); applyAuth(false); });
    $('loginForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const result = Session.loginPresident($('loginUser').value, $('loginPin').value);
      if (!result.ok) { toast(result.reason, 'error'); return; }
      toast(`مرحبًا ${result.account.name}`);
      applyAuth(true);
    });
    $('refreshBtn').addEventListener('click', renderAll);
    applyAuth(Session.isPresident());
  }

  function renderStats() {
    const doctors = Doctors.list().filter((item) => item.active !== false);
    const staff = Staff.list().filter((item) => item.active !== false);
    $('statDoctors').textContent = doctors.length;
    $('statStaff').textContent = staff.length;
    $('statPatients').textContent = Store.getAll(Store.KEYS.PATIENTS).length;
    $('statAppointments').textContent = Store.getAll(Store.KEYS.APPOINTMENTS).length;
    $('statVisits').textContent = Store.getAll(Store.KEYS.VISITS).length;
    $('statBranches').textContent = Branches.list().length;
  }

  function fillBranches() {
    const select = $('doctorBranch');
    select.innerHTML = Branches.list().map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    $('doctorDays').innerHTML = days.map((label, index) => `<label class="chip"><input type="checkbox" value="${index}"> ${label}</label>`).join('');
  }

  function renderDoctors() {
    const body = $('doctorsBody');
    const list = Doctors.list({ includeArchived: true });
    $('emptyDoctors').hidden = list.length > 0;
    body.innerHTML = list.map((item) => {
      const first = (item.locations || [])[0];
      const workDays = (item.workDays || []).map((day) => days[day]).join('، ') || 'غير محدد';
      const pendingAction = item.status === 'pending' ? `<button class="btn btn-sm btn-primary" data-action="approve-doctor" data-id="${esc(item.id)}">تعيين واعتماد</button>` : '';
      return `<tr><td data-label="الطبيب">${esc(item.avatar || '👨‍⚕️')} ${esc(item.name)}<span class="cell-sub">${esc(item.phone || '—')}</span></td><td data-label="التخصص">${esc(item.specialty)}</td><td data-label="الحساب"><code dir="ltr">${esc(item.email || '—')}</code></td><td data-label="الفرع والجدول">${esc(branch(first && first.branchId)?.name || '—')}<span class="cell-sub">${esc(workDays)} · ${esc(item.startHour ?? '—')}-${esc(item.endHour ?? '—')}</span></td><td data-label="الحالة"><span class="badge ${statusClass(item)}">${statusLabel(item)}</span></td><td class="no-print" data-label="إجراءات"><div class="row-actions">${pendingAction}<button class="btn btn-sm btn-outline" data-action="edit-doctor" data-id="${esc(item.id)}">تعديل</button>${item.archived ? `<button class="btn btn-sm btn-success" data-action="restore-doctor" data-id="${esc(item.id)}">استرجاع</button>` : `<button class="btn btn-sm btn-danger" data-action="archive-doctor" data-id="${esc(item.id)}">أرشفة</button>`}</div></td></tr>`;
    }).join('');
  }

  function resetDoctorForm() {
    editingDoctor = null;
    $('doctorForm').reset();
    $('doctorId').value = '';
    $('doctorStart').value = 9; $('doctorEnd').value = 16; $('doctorSlot').value = 30;
    [...$('doctorDays').querySelectorAll('input')].forEach((input) => { input.checked = false; });
    $('doctorForm').hidden = true;
  }

  function openDoctorForm(item = null) {
    editingDoctor = item;
    $('doctorForm').hidden = false;
    $('doctorId').value = item ? item.id : '';
    $('doctorName').value = item ? item.name : '';
    $('doctorSpecialty').value = item ? item.specialty : '';
    $('doctorEmail').value = item ? item.email || '' : '';
    $('doctorPhone').value = item ? item.phone || '' : '';
    const location = item && item.locations && item.locations[0];
    $('doctorBranch').value = location ? location.branchId : (Branches.list()[0] || {}).id || '';
    $('doctorRoom').value = location ? location.room || '' : '';
    $('doctorStart').value = item && item.startHour != null ? item.startHour : 9;
    $('doctorEnd').value = item && item.endHour != null ? item.endHour : 16;
    $('doctorSlot').value = item && item.slotMinutes != null ? item.slotMinutes : 30;
    [...$('doctorDays').querySelectorAll('input')].forEach((input) => { input.checked = !!(item && (item.workDays || []).includes(Number(input.value))); });
    $('doctorForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function saveDoctor(event) {
    event.preventDefault();
    const selectedDays = [...$('doctorDays').querySelectorAll('input:checked')].map((input) => Number(input.value));
    if (!selectedDays.length) { toast('اختر يوم عمل واحدًا على الأقل', 'error'); return; }
    const startHour = Number($('doctorStart').value); const endHour = Number($('doctorEnd').value);
    if (!(endHour > startHour)) { toast('نهاية العمل يجب أن تكون بعد البداية', 'error'); return; }
    const existing = editingDoctor || {};
    if (existing.status === 'pending') {
      const approval = Doctors.approve(existing.id, { branchId: $('doctorBranch').value, room: $('doctorRoom').value.trim(), startHour, endHour, slotMinutes: Number($('doctorSlot').value) || 30, workDays: selectedDays });
      if (!approval.ok) { toast(approval.reason, 'error'); return; }
      toast('تم تعيين الطبيب واعتماد الحساب'); resetDoctorForm(); renderAll(); return;
    }
    const result = Doctors.upsert({
      id: $('doctorId').value || undefined, name: $('doctorName').value, specialty: $('doctorSpecialty').value, email: $('doctorEmail').value.trim(),
      phone: $('doctorPhone').value.trim(), avatar: existing.avatar || '👨‍⚕️', bio: existing.bio || '',
      startHour, endHour, slotMinutes: Number($('doctorSlot').value) || 30, workDays: selectedDays,
      locations: [{ branchId: $('doctorBranch').value, room: $('doctorRoom').value.trim(), days: selectedDays }]
    });
    if (!result.ok) { toast(result.reason, 'error'); return; }
    toast('تم حفظ بيانات الطبيب'); resetDoctorForm(); renderAll();
  }

  function renderStaff() {
    const all = Staff.list({ includeArchived: true });
    const pending = all.filter((item) => item.status === 'pending' && !item.archived);
    $('emptyPendingStaff').hidden = pending.length > 0;
    $('pendingStaffBody').innerHTML = pending.map((item) => `<tr><td data-label="الاسم">${esc(item.name)}</td><td data-label="البريد"><code dir="ltr">${esc(item.email || '—')}</code></td><td data-label="الهاتف">${esc(item.phone || '—')}</td><td data-label="تاريخ الطلب">${esc(item.createdAt ? new Date(item.createdAt).toLocaleString('ar-EG') : '—')}</td><td data-label="الحالة"><span class="badge ${statusClass(item)}">${statusLabel(item)}</span></td><td class="no-print" data-label="إجراء"><div class="row-actions"><button class="btn btn-sm btn-success" data-action="approve-staff" data-id="${esc(item.id)}">اعتماد</button><button class="btn btn-sm btn-danger" data-action="reject-staff" data-id="${esc(item.id)}">رفض</button></div></td></tr>`).join('');
    $('staffBody').innerHTML = all.map((item) => `<tr><td data-label="الاسم">${esc(item.name)}</td><td data-label="اسم المستخدم / البريد"><code dir="ltr">${esc(item.user || item.email || '—')}</code>${item.user && item.email ? `<span class="cell-sub">${esc(item.email)}</span>` : ''}</td><td data-label="الدور">سكرتير</td><td data-label="الحالة"><span class="badge ${statusClass(item)}">${statusLabel(item)}</span></td><td class="no-print" data-label="إجراءات"><div class="row-actions">${item.status === 'pending' ? `<button class="btn btn-sm btn-success" data-action="approve-staff" data-id="${esc(item.id)}">اعتماد</button>` : ''}<button class="btn btn-sm btn-outline" data-action="edit-staff" data-id="${esc(item.id)}">تعديل</button>${item.archived ? `<button class="btn btn-sm btn-success" data-action="restore-staff" data-id="${esc(item.id)}">استرجاع</button>` : `<button class="btn btn-sm btn-danger" data-action="archive-staff" data-id="${esc(item.id)}">أرشفة</button>`}</div></td></tr>`).join('');
  }

  function resetStaffForm() { editingStaff = null; $('staffForm').reset(); $('staffId').value = ''; $('staffForm').hidden = true; }
  function openStaffForm(item = null) { editingStaff = item; $('staffForm').hidden = false; $('staffId').value = item ? item.id : ''; $('staffName').value = item ? item.name : ''; $('staffUser').value = item ? item.user : ''; $('staffPin').value = item ? item.pin : ''; $('staffForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function saveStaff(event) {
    event.preventDefault();
    const result = Staff.upsert({ id: $('staffId').value || undefined, name: $('staffName').value, user: $('staffUser').value, pin: $('staffPin').value });
    if (!result.ok) { toast(result.reason, 'error'); return; }
    toast('تم حفظ حساب السكرتير'); resetStaffForm(); renderAll();
  }

  function renderOperations() {
    $('branchesList').innerHTML = Branches.list().map((item) => `<div class="summary-row"><dt>${esc(item.name)}</dt><dd>${esc(item.address)}<span class="cell-sub">${esc(item.phone)}</span></dd><button class="btn btn-sm btn-outline" data-action="edit-branch" data-id="${esc(item.id)}">تعديل</button></div>`).join('');
    const doctors = Doctors.list({ includeArchived: true });
    const appointments = Store.getAll(Store.KEYS.APPOINTMENTS).slice().sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 8);
    $('appointmentsBody').innerHTML = appointments.map((item) => `<tr><td data-label="المريض">${esc(item.patientName)}</td><td data-label="الطبيب">${esc(doctor(item.doctorId)?.name || '—')}</td><td data-label="التاريخ">${esc(item.date)} · ${esc(item.time)}</td><td data-label="الحالة">${esc(Appointments.statusMeta(item.status).label)}</td></tr>`).join('');
    const patients = Store.getAll(Store.KEYS.PATIENTS);
    const allAppointments = Store.getAll(Store.KEYS.APPOINTMENTS);
    $('patientsBody').innerHTML = patients.map((patient) => { const mine = allAppointments.filter((item) => item.patientId === patient.id); const last = mine.slice().sort((a, b) => b.date.localeCompare(a.date))[0]; return `<tr><td data-label="المريض">${esc(patient.name)}</td><td data-label="الهاتف">${esc(patient.phone)}</td><td data-label="عدد المواعيد">${mine.length}</td><td data-label="آخر موعد">${esc(last ? `${last.date} · ${last.time}` : '—')}</td></tr>`; }).join('');
  }

  function confirmAction(message, callback) { if (window.confirm(`${message}\n\nسيتم تعطيل السجل وأرشفته، ولن يتم حذف البيانات المرتبطة.`)) callback(); }
  function handleAction(action, id) {
    if (action === 'edit-branch') openBranchForm(Branches.find(id));
    if (action === 'edit-doctor') openDoctorForm(Doctors.find(id));
    if (action === 'approve-doctor') openDoctorForm(Doctors.find(id));
    if (action === 'edit-staff') openStaffForm(Staff.find(id));
    if (action === 'approve-staff') { const result = Staff.approve(id); toast(result.ok ? 'تم اعتماد حساب السكرتير' : result.reason, result.ok ? 'success' : 'error'); if (result.ok) renderAll(); }
    if (action === 'reject-staff') { const result = Staff.reject(id); toast(result.ok ? 'تم رفض طلب السكرتير' : result.reason, result.ok ? 'success' : 'error'); if (result.ok) renderAll(); }
    if (action === 'archive-doctor') confirmAction('هل تريد أرشفة الطبيب؟', () => { const result = Doctors.archive(id); toast(result.ok ? 'تمت أرشفة الطبيب' : result.reason, result.ok ? 'success' : 'error'); renderAll(); });
    if (action === 'restore-doctor') { const result = Doctors.restore(id); toast(result.ok ? 'تم استرجاع الطبيب' : result.reason, result.ok ? 'success' : 'error'); renderAll(); }
    if (action === 'archive-staff') confirmAction('هل تريد أرشفة حساب السكرتير؟', () => { const result = Staff.archive(id); toast(result.ok ? 'تمت أرشفة الحساب' : result.reason, result.ok ? 'success' : 'error'); renderAll(); });
    if (action === 'restore-staff') { const result = Staff.restore(id); toast(result.ok ? 'تم استرجاع الحساب' : result.reason, result.ok ? 'success' : 'error'); renderAll(); }
  }

  function openBranchForm(item) {
    const name = window.prompt('اسم الفرع', item ? item.name : '');
    if (name === null) return;
    const address = window.prompt('عنوان الفرع', item ? item.address : '');
    if (address === null) return;
    const phone = window.prompt('هاتف الفرع', item ? item.phone : '');
    if (phone === null) return;
    const mapsUrl = window.prompt('رابط الخريطة (اختياري)', item ? item.mapsUrl || '' : '') || '';
    const result = Branches.upsert({ id: item && item.id, name, address, phone, mapsUrl });
    toast(result.ok ? 'تم تحديث بيانات الفرع' : result.reason, result.ok ? 'success' : 'error');
    if (result.ok) { fillBranches(); renderAll(); }
  }

  function exportReport() {
    const doctors = Doctors.list({ includeArchived: true });
    const rows = Store.getAll(Store.KEYS.APPOINTMENTS).map((item) => [item.code, item.patientName, doctor(item.doctorId)?.name || '', item.date, item.time, Appointments.statusMeta(item.status).label]);
    Export.download('clinic-admin-report.csv', Export.csvContent(['رقم الحجز', 'المريض', 'الطبيب', 'التاريخ', 'الوقت', 'الحالة'], rows));
    toast(`تم تصدير ${rows.length} موعدًا`);
  }

  function renderAll() { renderStats(); renderDoctors(); renderStaff(); renderOperations(); }
  function bindEvents() {
    fillBranches(); $('newDoctorBtn').addEventListener('click', () => openDoctorForm()); $('cancelDoctorBtn').addEventListener('click', resetDoctorForm); $('doctorForm').addEventListener('submit', saveDoctor);
    $('newStaffBtn').addEventListener('click', () => openStaffForm()); $('cancelStaffBtn').addEventListener('click', resetStaffForm); $('staffForm').addEventListener('submit', saveStaff); $('exportBtn').addEventListener('click', exportReport);
    document.addEventListener('click', (event) => { const button = event.target.closest('[data-action]'); if (button) handleAction(button.dataset.action, button.dataset.id); });
  }

  bindEvents(); initAuth();
})();
