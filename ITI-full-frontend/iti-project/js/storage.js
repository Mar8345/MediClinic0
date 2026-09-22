/* ============================================================
   storage.js — طبقة التخزين (localStorage) + أدوات مشتركة
   تُحمَّل في كل الصفحات بعد data.js وقبل سكربت الصفحة نفسها
   ============================================================ */
'use strict';

/* ---------- أدوات مساعدة مشتركة (Utils) ---------- */
const Utils = {
  pad2: (n) => String(n).padStart(2, '0'),

  /** تاريخ اليوم بصيغة YYYY-MM-DD (توقيت محلي) */
  todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${this.pad2(d.getMonth() + 1)}-${this.pad2(d.getDate())}`;
  },

  /** إضافة أيام إلى تاريخ ISO */
  addDaysISO(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${this.pad2(dt.getMonth() + 1)}-${this.pad2(dt.getDate())}`;
  },

  dayNames: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  monthNames: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
               'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],

  /** تحويل ISO إلى نص عربي: "الأحد 15 يونيو 2026" */
  formatArabicDate(iso, withDay = true) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const base = `${d} ${this.monthNames[m - 1]} ${y}`;
    return withDay ? `${this.dayNames[dt.getDay()]} ${base}` : base;
  },

  /** تحويل "14:30" إلى "02:30 م" */
  to12h(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const period = h < 12 ? 'ص' : 'م';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${this.pad2(h12)}:${this.pad2(m)} ${period}`;
  },

  /** حماية من XSS عند إدراج نص المستخدم داخل innerHTML */
  escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },

  uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  },

  /** يوم الأسبوع (0=الأحد حتى 6=السبت) من تاريخ ISO */
  dayOfWeek(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  },

  /** مقارنة موعدين بالتاريخ والوقت (للاستخدام في sort) */
  byDateTime(a, b) {
    return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
  },

  /** إشعار Toast موحد لكل الصفحات */
  showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('is-visible'), 10);
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
};

/* ---------- قواعد التحقق المشتركة (Validators) ----------
   تُستخدم في صفحة الحجز وفي لوحة السكرتير بلا تكرار */
const Validators = {
  fullName: (v) => v.trim().length >= 3 || 'اكتب الاسم بالكامل (3 أحرف على الأقل)',
  nationalId: (v) => /^\d{10,14}$/.test(v.trim()) || 'أدخل رقمًا قوميًا صحيحًا (10–14 رقمًا)',
  phone: (v) => /^01[0125]\d{8}$/.test(v.trim()) || 'أدخل رقم موبايل صحيح (11 رقمًا يبدأ بـ 01)',
  age: (v) => (v !== '' && +v >= 0 && +v <= 120) || 'أدخل عمرًا صحيحًا (0–120)',
  gender: (v) => v !== '' || 'اختر النوع',
  reason: (v) => v.trim().length >= 5 || 'اكتب سبب الزيارة (5 أحرف على الأقل)'
};

/* ---------- فروع العيادة وأماكن الأطباء (Clinic) ---------- */
const Clinic = {
  list() {
    if (typeof Store !== 'undefined' && Store.KEYS && Store.read(Store.KEYS.BRANCHES)) return Store.getAll(Store.KEYS.BRANCHES);
    return (typeof CLINIC !== 'undefined') ? CLINIC.branches : [];
  },

  branch(id) {
    return this.list().find((b) => b.id === id) || null;
  },

  /** مكان عمل الطبيب في تاريخ محدد — يدعم تعدد الفروع حسب اليوم */
  locationForDate(doctor, iso) {
    const locs = doctor && doctor.locations ? doctor.locations : [];
    if (!locs.length) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return locs.find((l) => (l.days || []).includes(dow)) || locs[0];
  },

  /** «فرع — عيادة» بصيغة قصيرة */
  locationText(loc) {
    if (!loc) return '';
    const branch = this.branch(loc.branchId);
    return branch ? `${branch.name} — ${loc.room}` : (loc.room || '');
  }
};

/* ---------- منطق المواعيد المشترك (Appointments) ----------
   يُستخدم في صفحة الحجز وسيُعاد استخدامه في لوحة السكرتير */
const Appointments = {
  STATUSES: {
    pending:   { label: 'قيد المراجعة', badge: 'badge-warning' },
    approved:  { label: 'مؤكد',         badge: 'badge-success' },
    checkedIn: { label: 'في الاستقبال', badge: 'badge-info' },
    completed: { label: 'تمت الزيارة',  badge: 'badge-primary' },
    cancelled: { label: 'ملغى',         badge: 'badge-muted' },
    rejected:  { label: 'مرفوض',        badge: 'badge-danger' },
    noShow:    { label: 'لم يحضر',      badge: 'badge-muted' }
  },

  statusMeta(status) {
    return this.STATUSES[status] || { label: status || 'غير معروف', badge: 'badge-muted' };
  },

  /** الحالات التي تشغل فعلًا وقت الطبيب */
  ACTIVE: ['pending', 'approved', 'checkedIn'],

  /** الانتقالات المسموحة لحماية دورة الموعد عند استدعاء الطبقة مباشرة */
  TRANSITIONS: {
    pending: ['approved', 'rejected', 'cancelled'],
    approved: ['checkedIn', 'cancelled', 'noShow', 'completed'],
    checkedIn: ['completed', 'cancelled', 'noShow'],
    completed: [],
    cancelled: [],
    rejected: [],
    noShow: []
  },

  /** هل تاريخ/وقت الموعد مضى؟ */
  isPastDateTime(iso, time) {
    const todayIso = Utils.todayISO();
    if (iso < todayIso) return true;
    if (iso > todayIso) return false;
    const [h, m] = String(time).split(':').map(Number);
    const now = new Date();
    return h * 60 + m <= now.getHours() * 60 + now.getMinutes();
  },

  /** الأوقات المشغولة لطبيب معيّن في يوم معيّن (مع إمكانية استثناء موعد عند التأجيل) */
  takenSlots(doctorId, date, opts = {}) {
    return Store.getAll(Store.KEYS.APPOINTMENTS)
      .filter((a) => a.doctorId === doctorId && a.date === date
                  && this.ACTIVE.includes(a.status)
                  && a.id !== opts.excludeId)
      .map((a) => a.time);
  },

  /** جميع أوقات دوام الطبيب في يوم معيّن مع حالة كل وقت (مستخدمة في لوحة السكرتير) */
  slotsFor(doctor, date, opts = {}) {
    const taken = this.takenSlots(doctor.id, date, opts);
    const slots = [];
    for (let m = doctor.startHour * 60;
         m + doctor.slotMinutes <= doctor.endHour * 60;
         m += doctor.slotMinutes) {
      const time = `${Utils.pad2(Math.floor(m / 60))}:${Utils.pad2(m % 60)}`;
      slots.push({ time, taken: taken.includes(time) });
    }
    return slots;
  },

  /** الرقم التالي لرقم الحجز بصيغة APT-xxxx */
  nextCode() {
    const nums = Store.getAll(Store.KEYS.APPOINTMENTS)
      .map((a) => Number(String(a.code || '').replace(/\D/g, '')))
      .filter(Boolean);
    return `APT-${(nums.length ? Math.max(...nums) : 1000) + 1}`;
  },

  /* ============================================================
     عمليات تغيير الحالة (Mutations) — من طبقة التخزين فقط
     لكي تكون قابلة للاختبار بدون DOM
     ============================================================ */
  find(id) {
    return Store.findById(Store.KEYS.APPOINTMENTS, id);
  },

  /** تغيير حالة موعد مع تسجيل الخطوة في سجل الحالة (history) */
  changeStatus(id, status, opts = {}) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (appt.status === status) return { ok: false, reason: 'الموعد بهذه الحالة بالفعل' };
    if (!Object.prototype.hasOwnProperty.call(this.STATUSES, status)) {
      return { ok: false, reason: 'حالة الموعد غير معروفة' };
    }
    if (!(this.TRANSITIONS[appt.status] || []).includes(status)) {
      return { ok: false, reason: `لا يمكن نقل الموعد من «${this.statusMeta(appt.status).label}» إلى «${this.statusMeta(status).label}»` };
    }
    const actor = opts.actor || 'secretary';
    const now = new Date().toISOString();
    const patch = {
      status,
      reviewedBy: actor,
      reviewedAt: now,
      history: (appt.history || []).concat([{
        status,
        by: actor,
        at: now,
        ...(opts.reason ? { reason: opts.reason } : {})
      }])
    };
    if (status === 'rejected' && opts.reason) patch.rejectReason = opts.reason;
    if (status === 'cancelled' && opts.reason) patch.cancelReason = opts.reason;
    if (status === 'checkedIn') patch.checkedInAt = now;
    return { ok: true, appt: Store.update(Store.KEYS.APPOINTMENTS, id, patch) };
  },

  approve(id) {
    const res = this.changeStatus(id, 'approved');
    if (res.ok) Referrals.autoSend(id);
    return res;
  },

  reject(id, reason) {
    if (!reason || reason.trim().length < 3) {
      return { ok: false, reason: 'اكتب سبب الرفض (3 أحرف على الأقل)' };
    }
    return this.changeStatus(id, 'rejected', { reason: reason.trim() });
  },

  complete(id) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (appt.status !== 'checkedIn') {
      return { ok: false, reason: 'إتمام الموعد متاح بعد تسجيل الحضور فقط' };
    }
    return this.changeStatus(id, 'completed');
  },

  checkIn(id) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (appt.status !== 'approved') {
      return { ok: false, reason: 'تسجيل الحضور متاح للمواعيد المؤكدة فقط' };
    }
    return this.changeStatus(id, 'checkedIn');
  },

  noShow(id) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (!['approved', 'checkedIn'].includes(appt.status)) {
      return { ok: false, reason: 'تسجيل عدم الحضور متاح للمواعيد المؤكدة أو الحاضرة فقط' };
    }
    return this.changeStatus(id, 'noShow');
  },

  cancel(id, reason) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (!['pending', 'approved', 'checkedIn'].includes(appt.status)) {
      return { ok: false, reason: 'لا يمكن إلغاء هذا الموعد بعد انتهاء حالته' };
    }
    return this.changeStatus(id, 'cancelled', { reason: (reason || 'إلغاء من السكرتير') });
  },

  /**
   * إلغاء المريض لموعدِه بنفسه: يشترط الملكية + أن يكون pending/approved.
   * يُسجَّل في السجل باسم المريض (actor: 'patient').
   */
  cancelByPatient(id, patientId) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (appt.patientId !== patientId) return { ok: false, reason: 'هذا الموعد ليس ضمن حجوزاتك' };
    if (!['pending', 'approved'].includes(appt.status)) {
      return { ok: false, reason: 'لا يمكن إلغاء هذا الموعد (تمت مراجعته بالفعل)' };
    }
    if (this.isPastDateTime(appt.date, appt.time)) {
      return { ok: false, reason: 'لا يمكن إلغاء موعد انقضى وقته' };
    }
    return this.changeStatus(id, 'cancelled', {
      reason: 'إلغاء بطلب المريض',
      actor: 'patient'
    });
  },

  cancelByDoctor(id, doctorId, reason) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (appt.doctorId !== doctorId) return { ok: false, reason: 'لا يمكنك تعديل موعد طبيب آخر' };
    if (!['pending', 'approved'].includes(appt.status)) return { ok: false, reason: 'الاعتذار متاح للمواعيد المعلقة أو المؤكدة فقط' };
    if (this.isPastDateTime(appt.date, appt.time)) return { ok: false, reason: 'لا يمكن الاعتذار عن موعد انقضى وقته' };
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 3) return { ok: false, reason: 'اكتب سبب الاعتذار (3 أحرف على الأقل)' };
    return this.changeStatus(id, 'cancelled', { reason: cleanReason, actor: `doctor:${doctorId}` });
  },

  /** تأجيل: فحص دوام الطبيب + الماضي + التعارض (مع استثناء الموعد نفسه) */
  reschedule(id, date, time) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (!['pending', 'approved'].includes(appt.status)) {
      return { ok: false, reason: 'التأجيل متاح للمواعيد المعلّقة أو المؤكدة فقط' };
    }
    const doctor = Store.findById(Store.KEYS.DOCTORS, appt.doctorId);
    if (!doctor) return { ok: false, reason: 'الطبيب غير موجود' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { ok: false, reason: 'اختر تاريخًا صحيحًا' };
    if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return { ok: false, reason: 'اختر وقتًا صحيحًا' };
    if (!doctor.workDays.includes(Utils.dayOfWeek(date))) {
      return { ok: false, reason: 'الطبيب لا يعمل في هذا اليوم' };
    }
    if (this.isPastDateTime(date, time)) return { ok: false, reason: 'لا يمكن التأجيل إلى وقت مضى' };
    if (this.takenSlots(appt.doctorId, date, { excludeId: id }).includes(time)) {
      return { ok: false, reason: 'هذا الوقت محجوز بالفعل — اختر وقتًا آخر' };
    }
    const now = new Date().toISOString();
    const updated = Store.update(Store.KEYS.APPOINTMENTS, id, {
      date,
      time,
      history: (appt.history || []).concat([{
        status: appt.status,
        by: 'secretary',
        at: now,
        note: `تأجيل إلى ${date} ${time}`
      }])
    });
    return { ok: true, appt: updated };
  },

  remove(id) {
    const appt = this.find(id);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    const linkedVisit = Store.getAll(Store.KEYS.VISITS).find((visit) => visit.appointmentId === id);
    if (linkedVisit) {
      return { ok: false, reason: 'لا يمكن حذف موعد مرتبط بسجل زيارة — احتفظ به لأغراض التوثيق' };
    }
    Store.remove(Store.KEYS.APPOINTMENTS, id);
    return { ok: true };
  },

  /* ============================================================
     استعلامات اللوحة
     ============================================================ */

  /** قائمة الاستقبال والانتظار: مؤكد + في الاستقبال لليوم مرتبة بالوقت */
  waitingList(dateIso) {
    const day = dateIso || Utils.todayISO();
    return Store.getAll(Store.KEYS.APPOINTMENTS)
      .filter((a) => a.date === day && ['approved', 'checkedIn'].includes(a.status))
      .sort((a, b) => a.time.localeCompare(b.time));
  },

  /** إحصاءات اللوحة */
  stats() {
    const all = Store.getAll(Store.KEYS.APPOINTMENTS);
    const today = Utils.todayISO();
    const todays = all.filter((a) => a.date === today);
    return {
      today: todays.length,
      todayActive: todays.filter((a) => this.ACTIVE.includes(a.status)).length,
      pending: all.filter((a) => a.status === 'pending').length,
      approvedToday: todays.filter((a) => ['approved', 'checkedIn'].includes(a.status)).length,
      rejected: all.filter((a) => a.status === 'rejected').length,
      cancelled: all.filter((a) => a.status === 'cancelled').length,
      total: all.length,
      patients: Store.getAll(Store.KEYS.PATIENTS).length,
      occupancy: this.occupancyFor(today)
    };
  },

  statsForPatient(patientId) {
    const today = Utils.todayISO();
    const mine = Store.getAll(Store.KEYS.APPOINTMENTS).filter((a) => a.patientId === patientId);
    return {
      total: mine.length,
      upcoming: mine.filter((a) => this.ACTIVE.includes(a.status) && a.date >= today).length,
      pending: mine.filter((a) => a.status === 'pending').length,
      approved: mine.filter((a) => ['approved', 'checkedIn'].includes(a.status)).length,
      completed: mine.filter((a) => a.status === 'completed').length,
      rejected: mine.filter((a) => ['rejected', 'cancelled', 'noShow'].includes(a.status)).length
    };
  },

  statsForDoctor(doctorId) {
    const today = Utils.todayISO();
    const mine = Store.getAll(Store.KEYS.APPOINTMENTS).filter((a) => a.doctorId === doctorId);
    return {
      total: mine.length,
      upcoming: mine.filter((a) => this.ACTIVE.includes(a.status) && a.date >= today).length,
      today: mine.filter((a) => a.date === today).length,
      pending: mine.filter((a) => a.status === 'pending').length,
      completed: mine.filter((a) => a.status === 'completed').length,
      patients: new Set(mine.map((a) => a.patientId).filter(Boolean)).size
    };
  },

  statsForClinic() {
    const all = Store.getAll(Store.KEYS.APPOINTMENTS);
    const byStatus = (status) => all.filter((a) => a.status === status).length;
    return {
      total: all.length,
      pending: byStatus('pending'),
      approved: byStatus('approved'),
      checkedIn: byStatus('checkedIn'),
      completed: byStatus('completed'),
      rejected: byStatus('rejected'),
      cancelled: byStatus('cancelled'),
      noShow: byStatus('noShow')
    };
  },

  /** نسبة إشغال اليوم = المواعيد الفعالة ÷ إجمالي أوقات الأطباء العاملين */
  occupancyFor(dateIso) {
    const working = Store.getAll(Store.KEYS.DOCTORS)
      .filter((d) => d.workDays.includes(Utils.dayOfWeek(dateIso)));
    const capacity = working.reduce((sum, d) => sum + this.slotsFor(d, dateIso).length, 0);
    const booked = Store.getAll(Store.KEYS.APPOINTMENTS)
      .filter((a) => a.date === dateIso && this.ACTIVE.includes(a.status)).length;
    return capacity ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
  },

  /** فلترة موحّدة: بحث + حالة + طبيب + تاريخ (اليوم/غدًا/أسبوع/تاريخ محدد) */
  filter(list, f = {}) {
    const q = String(f.q || '').trim().toLowerCase();
    return list.filter((a) => {
      if (f.status && f.status !== 'all' && a.status !== f.status) return false;
      if (f.doctorId && f.doctorId !== 'all' && a.doctorId !== f.doctorId) return false;
      if (f.date === 'today' && a.date !== Utils.todayISO()) return false;
      if (f.date === 'tomorrow' && a.date !== Utils.addDaysISO(Utils.todayISO(), 1)) return false;
      if (f.date === 'week') {
        const from = Utils.todayISO();
        const to = Utils.addDaysISO(from, 7);
        if (a.date < from || a.date > to) return false;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || '')) && a.date !== f.date) return false;
      if (q) {
        const hay = `${a.code || ''} ${a.patientName || ''} ${a.patientPhone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  /** ترتيب: datetime | patient | doctor */
  sort(list, key = 'datetime', dir = 'asc') {
    const mul = dir === 'desc' ? -1 : 1;
    const doctorName = (id) => {
      const d = Store.findById(Store.KEYS.DOCTORS, id);
      return d ? d.name : '';
    };
    const value = (a) => (key === 'doctor'
      ? doctorName(a.doctorId)
      : key === 'patient' ? (a.patientName || '')
      : `${a.date} ${a.time}`);
    return [...list].sort((a, b) => value(a).localeCompare(value(b), 'ar') * mul);
  },

  /** مواعيد الأسبوع القادم (للرسم البياني الأعمدة) */
  weeklyUpcoming() {
    const today = Utils.todayISO();
    const all = Store.getAll(Store.KEYS.APPOINTMENTS);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const iso = Utils.addDaysISO(today, i);
      const day = all.filter((a) => a.date === iso);
      out.push({
        date: iso,
        pending: day.filter((a) => a.status === 'pending').length,
        active: day.filter((a) => ['approved', 'checkedIn'].includes(a.status)).length
      });
    }
    return out;
  },

  /** توزيع الحالات (للرسم الدائري) */
  statusCounts(list) {
    const counts = {};
    (list || Store.getAll(Store.KEYS.APPOINTMENTS)).forEach((a) => {
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
    return counts;
  }
};

/* ---------- طبقة التخزين (Store) — CRUD موحّد فوق localStorage ---------- */
const Store = {
  KEYS: {
    DOCTORS: 'clinic_doctors',
    STAFF: 'clinic_staff',
    BRANCHES: 'clinic_branches',
    PATIENTS: 'clinic_patients',
    APPOINTMENTS: 'clinic_appointments',
    VISITS: 'clinic_visits'
  },

  read(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  },

  write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  /**
   * تهيئة: زرع البيانات الابتدائية «تفزيليًا» (merge by id)
   * - لا يُلمس أي بيان أنشأه المستخدم (مواعيد/مرضى جدد يبقون كما هم)
   * - يضيف العناصر الابتدائية الجديدة فقط عند ترقية النسخة
   * - يرقّي الأطباء القدامى ببيانات الأماكن الجديدة (phone / locations)
   */
  init() {
    this.upsertBranches();
    this.upsertDoctors();
    this.upsertStaff();
    this.mergeById(this.KEYS.PATIENTS, MOCK_PATIENTS);
    this.mergeById(this.KEYS.APPOINTMENTS, buildSeedAppointments());
    this.mergeById(this.KEYS.VISITS, buildSeedVisits());
  },

  /** يضيف عناصر الـ Mock غير الموجودة فقط (بالاعتماد على id) */
  mergeById(key, seed) {
    const existing = this.read(key);
    if (existing === null) { this.write(key, seed); return; }
    const known = new Set(existing.map((item) => item.id));
    const added = seed.filter((item) => !known.has(item.id));
    if (added.length) this.write(key, existing.concat(added));
  },

  /** الأطباء: إضافة الجدد + ترقية القدامى ببيانات الأماكن دون فقدان أي تعديل محلي */
  upsertDoctors() {
    const existing = this.read(this.KEYS.DOCTORS);
    if (existing === null) {
      this.write(this.KEYS.DOCTORS, MOCK_DOCTORS.map((doctor) => ({ ...JSON.parse(JSON.stringify(doctor)), active: true, archived: false, status: 'active', password: doctor.password || '123456' })));
      return;
    }
    let changed = false;
    MOCK_DOCTORS.forEach((mock) => {
      const index = existing.findIndex((d) => d.id === mock.id);
      if (index === -1) {
        existing.push({ ...JSON.parse(JSON.stringify(mock)), active: true, archived: false, status: 'active', password: '123456' });
        changed = true;
      } else if (!existing[index].email || !existing[index].locations || existing[index].active === undefined || existing[index].archived === undefined || !existing[index].status || !existing[index].password) {
        existing[index] = { ...existing[index], email: existing[index].email || mock.email, phone: existing[index].phone || mock.phone, locations: existing[index].locations || mock.locations, active: existing[index].active !== false, archived: !!existing[index].archived, status: existing[index].status || (existing[index].active === false ? 'pending' : 'active'), password: existing[index].password || '123456' };
        changed = true;
      }
    });
    if (changed) this.write(this.KEYS.DOCTORS, existing);
  },

  /** السكرتارية: ترقية الحساب القديم إلى قائمة قابلة للإدارة دون فقدانه */
  upsertStaff() {
    const existing = this.read(this.KEYS.STAFF);
    const seed = [{ ...MOCK_STAFF }];
    if (existing === null) { this.write(this.KEYS.STAFF, seed); return; }
    let changed = false;
    seed.forEach((mock) => {
      const index = existing.findIndex((s) => s.id === mock.id || s.user === mock.user);
      if (index === -1) {
        existing.push(mock);
        changed = true;
      } else {
        const next = { ...existing[index], id: existing[index].id || mock.id, role: 'secretary', email: existing[index].email || mock.email, password: existing[index].password || existing[index].pin || mock.password, status: existing[index].status || (existing[index].active === false ? 'pending' : 'active'), active: existing[index].active !== false, archived: !!existing[index].archived };
        if (JSON.stringify(next) !== JSON.stringify(existing[index])) { existing[index] = next; changed = true; }
      }
    });
    if (changed) this.write(this.KEYS.STAFF, existing);
  },

  upsertBranches() {
    const existing = this.read(this.KEYS.BRANCHES);
    if (existing === null) { this.write(this.KEYS.BRANCHES, JSON.parse(JSON.stringify(CLINIC.branches || []))); return; }
    let changed = false;
    (CLINIC.branches || []).forEach((mock) => {
      if (!existing.some((branch) => branch.id === mock.id)) { existing.push(JSON.parse(JSON.stringify(mock))); changed = true; }
    });
    if (changed) this.write(this.KEYS.BRANCHES, existing);
  },

  getAll(key) { return this.read(key) || []; },

  saveAll(key, list) { this.write(key, list); },

  findById(key, id) { return this.getAll(key).find((item) => item.id === id) || null; },

  insert(key, item) {
    const list = this.getAll(key);
    list.push(item);
    this.saveAll(key, list);
    return item;
  },

  update(key, id, patch) {
    const list = this.getAll(key);
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...patch };
    this.saveAll(key, list);
    return list[index];
  },

  remove(key, id) {
    this.saveAll(key, this.getAll(key).filter((item) => item.id !== id));
  }
};

/* ---------- إدارة الحسابات والأطباء للرئيس ---------- */
const Staff = {
  list(options = {}) {
    const includeArchived = !!options.includeArchived;
    return Store.getAll(Store.KEYS.STAFF).filter((item) => includeArchived || !item.archived);
  },

  find(id) { return Store.findById(Store.KEYS.STAFF, id); },

  findByEmail(email, options = {}) {
    const clean = String(email || '').trim().toLowerCase();
    return this.list({ includeArchived: !!options.includeArchived }).find((item) => String(item.email || '').toLowerCase() === clean) || null;
  },

  upsert(input) {
    const value = input || {};
    const name = String(value.name || '').trim();
    const user = String(value.user || '').trim();
    const pin = String(value.pin || '').trim();
    if (!name || !user || !pin) return { ok: false, reason: 'الاسم واسم المستخدم والرقم السري مطلوبة' };
    if (user === 'president') return { ok: false, reason: 'اسم المستخدم محجوز للإدارة' };
    const list = Store.getAll(Store.KEYS.STAFF);
    const duplicate = list.find((item) => item.user === user && item.id !== value.id);
    if (duplicate) return { ok: false, reason: 'اسم المستخدم مستخدم بالفعل' };
    const current = value.id ? this.find(value.id) || {} : {};
    const item = {
      ...current,
      id: value.id || `staff-${Date.now()}`,
      name, user, pin, role: 'secretary',
      email: String(value.email || current.email || '').trim().toLowerCase() || undefined,
      status: 'active',
      active: value.active !== false,
      archived: !!value.archived,
      updatedAt: new Date().toISOString()
    };
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index === -1) list.push(item); else list[index] = { ...list[index], ...item };
    Store.saveAll(Store.KEYS.STAFF, list);
    return { ok: true, item };
  },

  createPending(input = {}) {
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    const phone = String(input.phone || '').trim();
    if (name.length < 3) return { ok: false, reason: 'اكتب اسم السكرتير بالكامل' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, reason: 'أدخل بريدًا إلكترونيًا صحيحًا' };
    if (password.length < 6) return { ok: false, reason: 'الرقم السري يجب أن يكون 6 أحرف على الأقل' };
    if (!/^01[0125]\d{8}$/.test(phone)) return { ok: false, reason: 'أدخل رقم هاتف صحيح' };
    if (this.findByEmail(email, { includeArchived: true })) return { ok: false, reason: 'البريد الإلكتروني مستخدم بالفعل' };
    const item = { id: Utils.uid('staff'), name, email, password, phone, user: '', pin: '', role: 'secretary', status: 'pending', active: false, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    Store.insert(Store.KEYS.STAFF, item);
    return { ok: true, item };
  },

  approve(id) {
    const item = this.find(id);
    if (!item || item.archived) return { ok: false, reason: 'طلب السكرتير غير موجود' };
    const updated = Store.update(Store.KEYS.STAFF, id, { active: true, archived: false, status: 'active', updatedAt: new Date().toISOString() });
    return updated ? { ok: true, item: updated } : { ok: false, reason: 'تعذر اعتماد الحساب' };
  },

  reject(id) {
    const item = this.find(id);
    if (!item || item.archived) return { ok: false, reason: 'طلب السكرتير غير موجود' };
    const updated = Store.update(Store.KEYS.STAFF, id, { active: false, status: 'rejected', updatedAt: new Date().toISOString() });
    return updated ? { ok: true, item: updated } : { ok: false, reason: 'تعذر رفض الطلب' };
  },

  archive(id) {
    const item = this.find(id);
    if (!item) return { ok: false, reason: 'حساب السكرتير غير موجود' };
    const updated = Store.update(Store.KEYS.STAFF, id, { active: false, archived: true, status: 'archived', updatedAt: new Date().toISOString() });
    return updated ? { ok: true, item: updated } : { ok: false, reason: 'تعذر أرشفة الحساب' };
  },

  restore(id) {
    const item = this.find(id);
    if (!item) return { ok: false, reason: 'حساب السكرتير غير موجود' };
    const updated = Store.update(Store.KEYS.STAFF, id, { active: true, archived: false, status: 'active', updatedAt: new Date().toISOString() });
    return updated ? { ok: true, item: updated } : { ok: false, reason: 'تعذر استرجاع الحساب' };
  }
};

const Doctors = {
  list(options = {}) {
    const includeArchived = !!options.includeArchived;
    return Store.getAll(Store.KEYS.DOCTORS).filter((item) => includeArchived || !item.archived);
  },

  find(id) { return Store.findById(Store.KEYS.DOCTORS, id); },

  findByEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    return this.list().find((doctor) => !doctor.archived && doctor.active !== false
      && String(doctor.email || '').toLowerCase() === clean) || null;
  },

  findAnyByEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    return this.list({ includeArchived: true }).find((doctor) => !doctor.archived
      && String(doctor.email || '').toLowerCase() === clean) || null;
  },

  upsert(input) {
    const value = input || {};
    const name = String(value.name || '').trim();
    const specialty = String(value.specialty || '').trim();
    if (!name || !specialty) return { ok: false, reason: 'اسم الطبيب والتخصص مطلوبان' };
    const current = value.id ? this.find(value.id) : null;
    const item = {
      ...(current || {}), ...value,
      id: value.id || `doc-${Date.now()}`,
      name, specialty,
      locations: Array.isArray(value.locations) ? value.locations : (current && current.locations) || [],
      workDays: Array.isArray(value.workDays) ? value.workDays : (current && current.workDays) || [],
      active: value.active !== false,
      archived: !!value.archived,
      status: value.status || (value.active === false ? 'pending' : 'active'),
      updatedAt: new Date().toISOString()
    };
    const list = Store.getAll(Store.KEYS.DOCTORS);
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index === -1) list.push(item); else list[index] = item;
    Store.saveAll(Store.KEYS.DOCTORS, list);
    return { ok: true, item };
  },

  updateProfile(doctorId, input = {}) {
    const current = this.find(doctorId);
    if (!current || current.archived || current.active === false) return { ok: false, reason: 'حساب الطبيب غير متاح' };
    const phone = String(input.phone || '').trim();
    const bio = String(input.bio || '').trim();
    const workDays = Array.isArray(input.workDays) ? [...new Set(input.workDays.map(Number).filter((day) => day >= 0 && day <= 6))] : current.workDays || [];
    const startHour = Number(input.startHour);
    const endHour = Number(input.endHour);
    const slotMinutes = Number(input.slotMinutes);
    if (!phone) return { ok: false, reason: 'رقم الهاتف مطلوب' };
    if (bio.length > 1000) return { ok: false, reason: 'السيرة الذاتية يجب ألا تتجاوز 1000 حرف' };
    if (!workDays.length) return { ok: false, reason: 'اختر يوم عمل واحدًا على الأقل' };
    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23 || !Number.isInteger(endHour) || endHour <= startHour || endHour > 24) return { ok: false, reason: 'ساعات العمل غير صحيحة' };
    if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 180) return { ok: false, reason: 'مدة الموعد يجب أن تكون بين 15 و180 دقيقة' };
    const sourceLocations = current.locations || [];
    const locations = sourceLocations.map((location) => ({ ...location, days: workDays.filter((day) => (location.days || []).includes(day)) }));
    const firstLocation = locations[0];
    if (firstLocation) {
      const assignedDays = new Set(locations.flatMap((location) => location.days || []));
      firstLocation.days = [...new Set([...(firstLocation.days || []), ...workDays.filter((day) => !assignedDays.has(day))])];
    }
    const updated = Store.update(Store.KEYS.DOCTORS, doctorId, { phone, bio, workDays, startHour, endHour, slotMinutes, locations, updatedAt: new Date().toISOString() });
    return updated ? { ok: true, item: updated } : { ok: false, reason: 'تعذر تحديث ملف الطبيب' };
  },

  createPending(input) {
    const value = input || {};
    const name = String(value.name || '').trim();
    const specialty = String(value.specialty || '').trim();
    const email = String(value.email || '').trim().toLowerCase();
    const password = String(value.password || '');
    const phone = String(value.phone || '').trim();
    if (name.length < 3 || !specialty) return { ok: false, reason: 'اسم الطبيب والتخصص مطلوبان' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, reason: 'أدخل بريدًا إلكترونيًا صحيحًا' };
    if (password.length < 6) return { ok: false, reason: 'الرقم السري يجب أن يكون 6 أحرف على الأقل' };
    if (!phone) return { ok: false, reason: 'رقم الهاتف مطلوب' };
    if (this.findAnyByEmail(email)) return { ok: false, reason: 'البريد الإلكتروني مستخدم بالفعل' };
    const item = { id: `doc-${Date.now()}`, name, email, password, phone, specialty, avatar: '👨‍⚕️', bio: '', locations: [], workDays: [], active: false, archived: false, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    Store.insert(Store.KEYS.DOCTORS, item);
    return { ok: true, item };
  },

  approve(id, assignment = {}) {
    const current = this.find(id);
    if (!current || current.archived) return { ok: false, reason: 'طلب الطبيب غير موجود' };
    if (!assignment.branchId || !Array.isArray(assignment.workDays) || !assignment.workDays.length) return { ok: false, reason: 'اختر الفرع ويوم عمل واحدًا على الأقل' };
    const updated = Store.update(Store.KEYS.DOCTORS, id, {
      active: true, archived: false, status: 'active',
      workDays: assignment.workDays,
      startHour: Number(assignment.startHour), endHour: Number(assignment.endHour), slotMinutes: Number(assignment.slotMinutes) || 30,
      locations: [{ branchId: assignment.branchId, room: String(assignment.room || '').trim(), days: assignment.workDays }],
      updatedAt: new Date().toISOString()
    });
    return updated ? { ok: true, item: updated } : { ok: false, reason: 'تعذر اعتماد الطبيب' };
  },

  archive(id) {
    const item = this.find(id);
    if (!item) return { ok: false, reason: 'الطبيب غير موجود' };
    const updated = Store.update(Store.KEYS.DOCTORS, id, { active: false, archived: true, status: 'archived', updatedAt: new Date().toISOString() });
    return updated ? { ok: true, item: updated } : { ok: false, reason: 'تعذر أرشفة الطبيب' };
  },

  restore(id) {
    const item = this.find(id);
    if (!item) return { ok: false, reason: 'الطبيب غير موجود' };
    const updated = Store.update(Store.KEYS.DOCTORS, id, { active: true, archived: false, status: 'active', updatedAt: new Date().toISOString() });
    return updated ? { ok: true, item: updated } : { ok: false, reason: 'تعذر استرجاع الطبيب' };
  }
};

const Branches = {
  list() { return Store.getAll(Store.KEYS.BRANCHES); },
  find(id) { return Store.findById(Store.KEYS.BRANCHES, id); },
  upsert(input) {
    const value = input || {};
    const name = String(value.name || '').trim();
    const address = String(value.address || '').trim();
    const phone = String(value.phone || '').trim();
    if (!name || !address || !phone) return { ok: false, reason: 'اسم الفرع والعنوان والهاتف مطلوبة' };
    const item = { id: value.id || `br-${Date.now()}`, name, address, phone, mapsUrl: String(value.mapsUrl || '').trim() };
    const list = this.list(); const index = list.findIndex((entry) => entry.id === item.id);
    if (index === -1) list.push(item); else list[index] = { ...list[index], ...item };
    Store.saveAll(Store.KEYS.BRANCHES, list);
    return { ok: true, item };
  }
};

/* ============================================================
   عمليات المرضى المشتركة (Patients)
   ============================================================ */
/* ============================================================
   التحويل إلى الطبيب + قائمة الانتظار (Referrals)
   كل تحويل = سجل زيارة بحالة طابور waiting/inRoom/done
   ============================================================ */
const Referrals = {
  /** تحويل موعد إلى قائمة الطبيب (إنشاء سجل زيارة بحالة waiting) */
  send(appointmentId, opts = {}) {
    const appt = Appointments.find(appointmentId);
    if (!appt) return { ok: false, reason: 'الموعد غير موجود' };
    if (!['approved', 'checkedIn'].includes(appt.status)) {
      return { ok: false, reason: 'التحويل متاح للمواعيد المؤكدة أو المسجّل حضورها فقط' };
    }
    const existing = this.findByAppointment(appointmentId);
    if (existing && ['waiting', 'inRoom'].includes(existing.queueStatus)) {
      return { ok: false, reason: 'هذا الموعد محوَّل للطبيب بالفعل' };
    }
    const now = new Date().toISOString();
    const visit = Store.insert(Store.KEYS.VISITS, {
      id: Utils.uid('vis'),
      appointmentId: appt.id,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      date: appt.date,
      time: appt.time,
      queueStatus: 'waiting',
      priority: opts.priority || 'normal',
      secretaryNote: opts.note || '',
      referredAt: now,
      referredBy: 'secretary',
      complaint: appt.reason || '',
      createdAt: now,
      updatedAt: now
    });
    Store.update(Store.KEYS.APPOINTMENTS, appt.id, { referredAt: now, visitId: visit.id });
    return { ok: true, visit };
  },

  /** تحويل تلقائي يُستدعى لحظة الموافقة على الحجز */
  autoSend(appointmentId) {
    const appt = Appointments.find(appointmentId);
    if (!appt || !['approved', 'checkedIn'].includes(appt.status)) return { ok: false };
    const existing = this.findByAppointment(appointmentId);
    if (existing && ['waiting', 'inRoom'].includes(existing.queueStatus)) {
      return { ok: true, visit: existing, already: true };
    }
    return this.send(appointmentId, {});
  },

  /** سحب التحويل — مسموح فقط قبل بدء الطبيب الكشف */
  recall(visitId) {
    const visit = Store.findById(Store.KEYS.VISITS, visitId);
    if (!visit) return { ok: false, reason: 'التحويل غير موجود' };
    if (visit.queueStatus !== 'waiting') {
      return { ok: false, reason: 'لا يمكن السحب بعد بدء الطبيب الكشف' };
    }
    Store.update(Store.KEYS.APPOINTMENTS, visit.appointmentId, { referredAt: null, visitId: null });
    Store.remove(Store.KEYS.VISITS, visitId);
    return { ok: true };
  },

  setPriority(visitId, priority) {
    const visit = Store.findById(Store.KEYS.VISITS, visitId);
    if (!visit) return { ok: false, reason: 'التحويل غير موجود' };
    if (visit.queueStatus === 'done') return { ok: false, reason: 'لا يمكن تعديل زيارة مكتملة' };
    const now = new Date().toISOString();
    return { ok: true, visit: Store.update(Store.KEYS.VISITS, visitId, { priority, updatedAt: now }) };
  },

  setNote(visitId, note) {
    const visit = Store.findById(Store.KEYS.VISITS, visitId);
    if (!visit) return { ok: false, reason: 'التحويل غير موجود' };
    const now = new Date().toISOString();
    return { ok: true, visit: Store.update(Store.KEYS.VISITS, visitId, { secretaryNote: String(note || ''), updatedAt: now }) };
  },

  /** أحدث تحويل مرتبط بموعد (قد تتعدد الحلقات) */
  findByAppointment(appointmentId) {
    const list = Store.getAll(Store.KEYS.VISITS).filter((v) => v.appointmentId === appointmentId);
    return list.length ? list[list.length - 1] : null;
  },

  /** قائمة الطبيب: أولوية (عاجل أولًا) ثم التاريخ والوقت */
  list({ doctorId, queueStatus, date, q } = {}) {
    const query = String(q || '').trim().toLowerCase();
    const rank = { urgent: 0, normal: 1 };
    return Store.getAll(Store.KEYS.VISITS)
      .map((v) => ({ ...v, appointment: Appointments.find(v.appointmentId) }))
      .filter((v) => {
        if (doctorId && v.doctorId !== doctorId) return false;
        if (queueStatus && queueStatus !== 'all' && v.queueStatus !== queueStatus) return false;
        if (date && v.date !== date) return false;
        if (query) {
          const a = v.appointment || {};
          const hay = `${a.code || ''} ${a.patientName || ''}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => ((rank[a.priority] ?? 1) - (rank[b.priority] ?? 1))
        || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  },

  /** إحصاءات قائمة الطبيب ليوم */
  stats(dateIso) {
    const day = dateIso || Utils.todayISO();
    const all = Store.getAll(Store.KEYS.VISITS).filter((v) => v.date === day);
    return {
      waiting: all.filter((v) => v.queueStatus === 'waiting').length,
      inRoom: all.filter((v) => v.queueStatus === 'inRoom').length,
      done: all.filter((v) => v.queueStatus === 'done').length,
      urgent: all.filter((v) => v.priority === 'urgent' && v.queueStatus !== 'done').length,
      total: all.length
    };
  },

  /** توليد زيارات للمواعيد المؤكدة/الحضور التي بلا تحويل (ترقية بيانات قديمة) */
  syncMissing() {
    let created = 0;
    Store.getAll(Store.KEYS.APPOINTMENTS)
      .filter((a) => ['approved', 'checkedIn'].includes(a.status) && !this.findByAppointment(a.id))
      .forEach((a) => { const r = this.send(a.id, {}); if (r.ok) created += 1; });
    return { ok: true, created };
  }
};

/* ============================================================
   ملف الزيارة الطبية (Visits)
   دورة الطابور: waiting → inRoom → done
   الإتمام يحوّل الموعد إلى completed تلقائيًا
   ============================================================ */
const Visits = {
  /** إجمالي مدة الزيارة بالدقائق — تُستخدم للمتوسطات فقط */
  durationMin(visit) {
    if (!visit.startedAt || !visit.finishedAt) return null;
    const ms = new Date(visit.finishedAt).getTime() - new Date(visit.startedAt).getTime();
    return ms >= 0 ? Math.round(ms / 60000) : null;
  },

  /** بدء الكشف: الطابور → داخل الكشف */
  start(visitId) {
    const visit = Store.findById(Store.KEYS.VISITS, visitId);
    if (!visit) return { ok: false, reason: 'الزيارة غير موجودة' };
    if (visit.queueStatus === 'done') return { ok: false, reason: 'الزيارة مكتملة بالفعل' };
    if (visit.queueStatus === 'inRoom') return { ok: true, visit, already: true };
    const appointment = Appointments.find(visit.appointmentId);
    if (!appointment || !['approved', 'checkedIn'].includes(appointment.status)) {
      return { ok: false, reason: 'لا يمكن بدء كشف لموعد غير مؤكد أو غير حاضر' };
    }
    const now = new Date().toISOString();
    return {
      ok: true,
      visit: Store.update(Store.KEYS.VISITS, visitId, { queueStatus: 'inRoom', startedAt: now, updatedAt: now })
    };
  },

  /** حفظ بيانات الزيارة (مسودة أو نهائية) بدون تغيير الطابور */
  save(visitId, data = {}) {
    const visit = Store.findById(Store.KEYS.VISITS, visitId);
    if (!visit) return { ok: false, reason: 'الزيارة غير موجودة' };
    if (visit.queueStatus === 'done') return { ok: false, reason: 'لا يمكن تعديل زيارة مكتملة' };
    const now = new Date().toISOString();
    const allowed = [
      'vitals', 'complaint', 'history', 'examination', 'diagnosis', 'icd', 'severity',
      'prescription', 'orders', 'advice', 'sickLeaveDays', 'followUpDate'
    ];
    const patch = { updatedAt: now };
    allowed.forEach((key) => { if (data[key] !== undefined) patch[key] = data[key]; });
    return { ok: true, visit: Store.update(Store.KEYS.VISITS, visitId, patch) };
  },

  /** إتمام الزيارة: الطابور → مكتملة + الموعد → تمت الزيارة */
  finish(visitId, data = {}) {
    const visit = Store.findById(Store.KEYS.VISITS, visitId);
    if (!visit) return { ok: false, reason: 'الزيارة غير موجودة' };
    if (visit.queueStatus === 'done') return { ok: false, reason: 'الزيارة مكتملة بالفعل' };
    if (visit.queueStatus !== 'inRoom') {
      return { ok: false, reason: 'ابدأ الكشف أولًا قبل إتمام الزيارة' };
    }
    const appointment = Appointments.find(visit.appointmentId);
    if (!appointment || !['approved', 'checkedIn'].includes(appointment.status)) {
      return { ok: false, reason: 'لا يمكن إتمام زيارة مرتبطة بموعد غير نشط' };
    }
    const saveRes = this.save(visitId, data);
    if (!saveRes.ok) return saveRes;
    const now = new Date().toISOString();
    const done = Store.update(Store.KEYS.VISITS, visitId, {
      queueStatus: 'done',
      finishedAt: now,
      updatedAt: now,
      finishedBy: 'doctor'
    });
    const statusRes = Appointments.changeStatus(visit.appointmentId, 'completed', {
      reason: 'تمت الزيارة والكشف',
      actor: 'doctor'
    });
    if (!statusRes.ok) return statusRes;
    return { ok: true, visit: done };
  },

  /** سجل زيارات مريض (الأحدث أولًا) */
  historyForPatient(patientId) {
    return Store.getAll(Store.KEYS.VISITS)
      .filter((v) => v.patientId === patientId)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  },

  statsForDoctor(doctorId) {
    const list = Store.getAll(Store.KEYS.VISITS).filter((v) => v.doctorId === doctorId);
    return {
      total: list.length,
      waiting: list.filter((v) => v.queueStatus === 'waiting').length,
      inRoom: list.filter((v) => v.queueStatus === 'inRoom').length,
      done: list.filter((v) => v.queueStatus === 'done').length,
      patients: new Set(list.map((v) => v.patientId).filter(Boolean)).size
    };
  },

  /** أكثر التشخيصات شيوعًا لدى طبيب (للودجة) */
  topDiagnoses(doctorId, limit = 5) {
    const counts = {};
    Store.getAll(Store.KEYS.VISITS)
      .filter((v) => v.doctorId === doctorId && v.diagnosis)
      .forEach((v) => { counts[v.diagnosis] = (counts[v.diagnosis] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([diagnosis, count]) => ({ diagnosis, count }));
  },

  /** متوسط مدة الكشف لطبيب اليوم بالدقائق */
  avgDuration(doctorId, dateIso) {
    const list = Store.getAll(Store.KEYS.VISITS)
      .filter((v) => v.doctorId === doctorId && v.queueStatus === 'done'
        && (!dateIso || v.date === dateIso))
      .map((v) => this.durationMin(v))
      .filter((n) => n !== null);
    if (!list.length) return null;
    return Math.round(list.reduce((s, n) => s + n, 0) / list.length);
  },

  /** إنشاء موعد متابعة: فحص دوام الطبيب + التعارض + الماضي */
  createFollowUp(visitId, date, time) {
    const visit = Store.findById(Store.KEYS.VISITS, visitId);
    if (!visit) return { ok: false, reason: 'الزيارة غير موجودة' };
    const doctor = Store.findById(Store.KEYS.DOCTORS, visit.doctorId);
    if (!doctor) return { ok: false, reason: 'الطبيب غير موجود' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { ok: false, reason: 'اختر تاريخًا صحيحًا للمتابعة' };
    if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return { ok: false, reason: 'اختر وقتًا صحيحًا للمتابعة' };
    if (!doctor.workDays.includes(Utils.dayOfWeek(date))) {
      return { ok: false, reason: 'الطبيب لا يعمل في هذا اليوم' };
    }
    if (Appointments.isPastDateTime(date, time)) return { ok: false, reason: 'لا يمكن حجز متابعة في وقت مضى' };
    if (Appointments.takenSlots(visit.doctorId, date, {}).includes(time)) {
      return { ok: false, reason: 'هذا الوقت محجوز بالفعل — اختر وقتًا آخر' };
    }
    const patient = Store.findById(Store.KEYS.PATIENTS, visit.patientId);
    const now = new Date().toISOString();
    const appt = Store.insert(Store.KEYS.APPOINTMENTS, {
      id: Utils.uid('apt'),
      code: Appointments.nextCode(),
      doctorId: visit.doctorId,
      patientId: visit.patientId,
      patientName: patient ? patient.name : (visit.patientName || ''),
      patientPhone: patient ? patient.phone : (visit.patientPhone || ''),
      date,
      time,
      reason: `متابعة زيارة ${visit.date}`,
      status: 'approved',
      source: 'doctor',
      createdAt: now,
      history: [{ status: 'approved', by: 'doctor', at: now, note: 'موعد متابعة من الطبيب' }]
    });
    Store.update(Store.KEYS.VISITS, visitId, { followUpApptId: appt.id, updatedAt: now });
    return { ok: true, appointment: appt };
  }
};

const Patients = {
  /** كل مريض مع إحصاءاته: عدد المواعيد، الفعّالة، القادم، الأخير */
  withStats() {
    const appts = Store.getAll(Store.KEYS.APPOINTMENTS);
    const today = Utils.todayISO();
    return Store.getAll(Store.KEYS.PATIENTS).map((p) => {
      const mine = appts
        .filter((a) => a.patientId === p.id)
        .sort((a, b) => Utils.byDateTime(a, b));
      return {
        ...p,
        count: mine.length,
        activeCount: mine.filter((a) => Appointments.ACTIVE.includes(a.status)).length,
        upcoming: mine.find((a) => Appointments.ACTIVE.includes(a.status) && a.date >= today) || null,
        last: mine[mine.length - 1] || null
      };
    });
  },

  findByPhone(phone) {
    const clean = String(phone || '').trim();
    return Store.getAll(Store.KEYS.PATIENTS).find((p) => p.phone === clean) || null;
  },

  findByNationalId(nationalId) {
    const clean = String(nationalId || '').trim();
    return Store.getAll(Store.KEYS.PATIENTS).find((p) => p.nationalId === clean) || null;
  },

  findByEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    return Store.getAll(Store.KEYS.PATIENTS).find((p) => String(p.email || '').toLowerCase() === clean) || null;
  },

  /** إضافة أو تحديث مريض (بالاعتماد على id أو رقم الموبايل) */
  upsert(data) {
    const existing = data.id
      ? Store.findById(Store.KEYS.PATIENTS, data.id)
      : this.findByPhone(data.phone);
    if (existing) {
      const { id, ...rest } = data;
      return { ok: true, isNew: false, patient: Store.update(Store.KEYS.PATIENTS, existing.id, rest) };
    }
    return {
      ok: true,
      isNew: true,
      patient: Store.insert(Store.KEYS.PATIENTS, { id: Utils.uid('pat'), ...data })
    };
  },

  /** حذف مُقيَّد: يُمنع مع وجود مواعيد فعّالة أو مواعيد في السجل */
  removeSafe(id) {
    const mine = Store.getAll(Store.KEYS.APPOINTMENTS).filter((a) => a.patientId === id);
    if (!mine.length) {
      Store.remove(Store.KEYS.PATIENTS, id);
      return { ok: true };
    }
    const active = mine.filter((a) => Appointments.ACTIVE.includes(a.status)).length;
    return {
      ok: false,
      reason: active
        ? `لا يمكن حذف المريض: لديه ${active} موعدًا فعّالًا — ألغِها أولًا`
        : `لا يمكن حذف المريض: لديه ${mine.length} موعدًا في السجل — احذف مواعيده أولًا`
    };
  }
};

/* ============================================================
   جلسة الدخول التجريبية (Session) — واجهة فقط، لا مصادقة حقيقية
   في بيئة Vanilla/localStorage بلا سيرفر
   ============================================================ */
const Session = {
  KEY: 'clinic_role',
  SELECTED_DOCTOR_KEY: 'clinic_selected_doctor',

  staff() {
    return Store.getAll(Store.KEYS.STAFF).find((item) => item.user === 'secretary' && item.active !== false && !item.archived)
      || ((typeof MOCK_STAFF !== 'undefined') ? MOCK_STAFF : { name: 'السكرتير', user: 'secretary', pin: '1234' });
  },

  login(name, pin) {
    const staff = Store.getAll(Store.KEYS.STAFF).find((item) =>
      item.user === String(name || '').trim() && item.role === 'secretary' && item.status !== 'pending' && item.status !== 'rejected' && item.active !== false && !item.archived
      && String(pin || '') === String(item.pin || '')
    );
    if (!staff) return false;
    sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'secretary', staffId: staff.id, at: new Date().toISOString() }));
    return true;
  },

  loginSecretaryByEmail(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const candidate = Staff.findByEmail(cleanEmail, { includeArchived: true });
    if (!candidate) return { ok: false, reason: 'بريد السكرتير أو الرقم السري غير صحيح' };
    if (candidate.status === 'pending') return { ok: false, reason: 'حساب السكرتير بانتظار موافقة الرئيس' };
    if (candidate.status === 'rejected') return { ok: false, reason: 'تم رفض طلب تسجيل السكرتير من الرئيس' };
    if (candidate.active === false || candidate.archived) return { ok: false, reason: 'حساب السكرتير غير متاح حاليًا' };
    if (String(password || '') !== String(candidate.password || '')) return { ok: false, reason: 'بريد السكرتير أو الرقم السري غير صحيح' };
    sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'secretary', staffId: candidate.id, at: new Date().toISOString() }));
    return { ok: true, staff: candidate };
  },

  loginPresident(email, pin) {
    const account = typeof MOCK_PRESIDENT !== 'undefined'
      ? MOCK_PRESIDENT
      : { email: 'president@president.com', pin: '123456', name: 'رئيس العيادة' };
    const identifier = String(email || '').trim().toLowerCase();
    const validIdentifiers = [account.email, 'president.com'].filter(Boolean).map((value) => String(value).toLowerCase());
    if (!validIdentifiers.includes(identifier) || String(pin || '') !== account.pin) {
      return { ok: false, reason: 'بيانات دخول الرئيس غير صحيحة' };
    }
    sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'president', at: new Date().toISOString() }));
    return { ok: true, account: { name: account.name, email: account.email } };
  },

  loginDoctorByEmail(email, pin) {
    const candidate = Doctors.findAnyByEmail(email);
    if (candidate && (candidate.status === 'pending' || candidate.active === false)) {
      return { ok: false, reason: 'حساب الطبيب بانتظار اعتماد President' };
    }
    const doctor = Doctors.findByEmail(email);
    const expected = doctor && doctor.password ? doctor.password : (typeof MOCK_DOCTOR_PIN !== 'undefined' ? MOCK_DOCTOR_PIN : '123456');
    if (!doctor || String(pin || '') !== expected) {
      return { ok: false, reason: 'بريد الطبيب أو الرقم السري غير صحيح' };
    }
    sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'doctor', doctorId: doctor.id, at: new Date().toISOString() }));
    return { ok: true, doctor };
  },

  /** دخول موحّد للحسابات الإدارية والمرضى من البوابة العامة */
  loginUnified(identifier, password) {
    const value = String(identifier || '').trim();
    const pin = String(password || '');
    if (!value || !pin) return { ok: false, reason: 'أدخل معرف الدخول والرقم السري' };

    // لا نسمح بتسرب الدور السابق عند فشل أو تغيير الحساب.
    this.logout();

    const president = this.loginPresident(value, pin);
    if (president.ok) return { ok: true, role: 'president', redirect: 'president/dashboard.html', account: president.account };

    if (this.login(value, pin)) {
      return { ok: true, role: 'secretary', redirect: 'secretary/dashboard.html' };
    }

    const secretary = this.loginSecretaryByEmail(value, pin);
    if (secretary.ok) return { ok: true, role: 'secretary', redirect: 'secretary/dashboard.html', staff: secretary.staff };
    if (secretary.reason !== 'بريد السكرتير أو الرقم السري غير صحيح') return secretary;

    const doctor = this.loginDoctorByEmail(value, pin);
    if (doctor.ok) return { ok: true, role: 'doctor', redirect: 'doctor/dashboard.html', doctor: doctor.doctor };
    if (doctor.reason === 'حساب الطبيب بانتظار اعتماد President') return doctor;

    const patient = this.loginPatientByCredentials(value, pin);
    if (patient.ok) return { ok: true, role: 'patient', redirect: 'profile.html', patient: patient.patient };

    this.logout();
    return { ok: false, reason: 'بيانات الدخول غير صحيحة أو الحساب غير موجود' };
  },

  isPresident() { return this.is('president'); },

  /**
   * دخول المريض برقم الهاتف (+ الرقم القومي اختياريًا).
   * دخول تجريبي للواجهة فقط — لا توجد مصادقة حقيقية في نسخة Vanilla.
   */
  loginPatient(phone, nationalId = '') {
    const cleanPhone = String(phone || '').trim();
    const cleanNid = String(nationalId || '').trim();
    const patient = Patients.findByPhone(cleanPhone);
    if (!patient) return { ok: false, reason: 'لا يوجد ملف مسجّل بهذا الرقم — احجز موعدًا أولًا لإنشاء ملفك' };
    if (cleanNid && patient.nationalId !== cleanNid) {
      return { ok: false, reason: 'الرقم القومي لا يطابق الرقم المسجّل لهذا الهاتف' };
    }
    sessionStorage.setItem(this.KEY, JSON.stringify({
      role: 'patient',
      patientId: patient.id,
      at: new Date().toISOString()
    }));
    return { ok: true, patient };
  },

  /** دخول أو إنشاء ملف مريض من بوابة المريض الجديدة */
  loginOrRegisterPatient(data = {}) {
    const phone = String(data.phone || '').trim();
    const nationalId = String(data.nationalId || '').trim();
    const existingByPhone = Patients.findByPhone(phone);
    const existingByNationalId = Patients.findByNationalId(nationalId);
    if (existingByPhone && existingByPhone.nationalId !== nationalId) {
      return { ok: false, reason: 'الرقم القومي لا يطابق ملف المريض بهذا الهاتف' };
    }
    if (existingByNationalId && (!existingByPhone || existingByNationalId.id !== existingByPhone.id)) {
      return { ok: false, reason: 'الرقم القومي مرتبط بملف مريض آخر' };
    }
    if (existingByPhone) {
      sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'patient', patientId: existingByPhone.id, at: new Date().toISOString() }));
      return { ok: true, isNew: false, patient: existingByPhone };
    }
    if (!data.name || data.age === undefined || !data.gender) {
      return { ok: false, needsRegistration: true, reason: 'أكمل بيانات الملف لإنشاء حساب المريض' };
    }
    const saved = Patients.upsert({
      name: String(data.name).trim(), nationalId, phone,
      age: Number(data.age), gender: data.gender
    });
    if (!saved.ok || !saved.patient) return { ok: false, reason: 'تعذر إنشاء ملف المريض' };
    sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'patient', patientId: saved.patient.id, at: new Date().toISOString() }));
    return { ok: true, isNew: true, patient: saved.patient };
  },

  loginPatientByCredentials(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const patient = Patients.findByEmail(cleanEmail);
    if (!patient || String(patient.password || '') !== String(password || '')) {
      return { ok: false, reason: 'البريد الإلكتروني أو الرقم السري غير صحيح' };
    }
    sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'patient', patientId: patient.id, at: new Date().toISOString() }));
    return { ok: true, isNew: false, patient };
  },

  signupPatient(data = {}) {
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, reason: 'أدخل بريدًا إلكترونيًا صحيحًا' };
    if (password.length < 6) return { ok: false, reason: 'الرقم السري يجب أن يكون 6 أحرف على الأقل' };
    const byEmail = Patients.findByEmail(email);
    const byPhone = Patients.findByPhone(data.phone);
    const byNationalId = Patients.findByNationalId(data.nationalId);
    if (byEmail && (!byPhone || byEmail.id !== byPhone.id) && (!byNationalId || byEmail.id !== byNationalId.id)) {
      return { ok: false, reason: 'البريد الإلكتروني مستخدم بالفعل' };
    }
    if (byPhone && byNationalId && byPhone.id !== byNationalId.id) {
      return { ok: false, reason: 'الهاتف والرقم القومي مرتبطان بملفين مختلفين' };
    }
    if (byPhone && byPhone.nationalId && byPhone.nationalId !== String(data.nationalId || '').trim()) {
      return { ok: false, reason: 'رقم الهاتف مرتبط برقم قومي مختلف' };
    }
    if (byNationalId && byNationalId.phone && byNationalId.phone !== String(data.phone || '').trim()) {
      return { ok: false, reason: 'الرقم القومي مرتبط برقم هاتف مختلف' };
    }
    const existing = byEmail || byPhone || byNationalId;
    const payload = {
      name: String(data.name || '').trim(), email, password,
      phone: String(data.phone || '').trim(), nationalId: String(data.nationalId || '').trim(),
      age: Number(data.age), gender: data.gender
    };
    if (existing) {
      const saved = Patients.upsert({ id: existing.id, ...payload });
      sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'patient', patientId: existing.id, at: new Date().toISOString() }));
      return { ok: true, isNew: false, patient: saved.patient };
    }
    const saved = Patients.upsert(payload);
    sessionStorage.setItem(this.KEY, JSON.stringify({ role: 'patient', patientId: saved.patient.id, at: new Date().toISOString() }));
    return { ok: true, isNew: true, patient: saved.patient };
  },

  signupDoctor(data = {}) {
    this.logout();
    const result = Doctors.createPending(data);
    if (!result.ok) return result;
    return { ok: true, isNew: true, pending: true, doctor: result.item };
  },

  signupSecretary(data = {}) {
    this.logout();
    const result = Staff.createPending(data);
    if (!result.ok) return result;
    return { ok: true, isNew: true, pending: true, staff: result.item };
  },

  setSelectedDoctor(doctorId) {
    const doctor = Store.findById(Store.KEYS.DOCTORS, doctorId);
    if (!doctor || doctor.active === false || doctor.archived) return { ok: false, reason: 'الطبيب غير متاح حاليًا' };
    sessionStorage.setItem(this.SELECTED_DOCTOR_KEY, doctor.id);
    return { ok: true, doctor };
  },

  selectedDoctorId() { return sessionStorage.getItem(this.SELECTED_DOCTOR_KEY) || ''; },

  clearSelectedDoctor() { sessionStorage.removeItem(this.SELECTED_DOCTOR_KEY); },

  /** بيانات المريض المسجّل دخوله (أو null) */
  currentPatient() {
    const session = this.get();
    if (!session || session.role !== 'patient') return null;
    return Store.findById(Store.KEYS.PATIENTS, session.patientId) || null;
  },

  currentStaff() {
    const session = this.get();
    if (!session || session.role !== 'secretary') return null;
    const staff = Store.findById(Store.KEYS.STAFF, session.staffId);
    return staff && staff.status !== 'pending' && staff.status !== 'rejected' && staff.active !== false && !staff.archived ? staff : null;
  },

  /**
   * دخول الطبيب: اختيار الطبيب من القائمة + رقم سري تجريبي موحّد.
   * دخول تجريبي للواجهة فقط — لا توجد مصادقة حقيقية في نسخة Vanilla.
   */
  loginDoctor(doctorId, pin) {
    const doctor = Store.findById(Store.KEYS.DOCTORS, doctorId);
    if (!doctor) return { ok: false, reason: 'اختر الطبيب من القائمة' };
    if (doctor.active === false || doctor.archived || doctor.status === 'pending') return { ok: false, reason: 'حساب الطبيب بانتظار اعتماد President' };
    const expected = doctor.password || (typeof MOCK_DOCTOR_PIN !== 'undefined' ? MOCK_DOCTOR_PIN : '123456');
    if (String(pin || '') !== expected) return { ok: false, reason: 'الرقم السري غير صحيح' };
    sessionStorage.setItem(this.KEY, JSON.stringify({
      role: 'doctor',
      doctorId: doctor.id,
      at: new Date().toISOString()
    }));
    return { ok: true, doctor };
  },

  /** بيانات الطبيب المسجّل دخوله (أو null) */
  currentDoctor() {
    const session = this.get();
    if (!session || session.role !== 'doctor') return null;
    const doctor = Store.findById(Store.KEYS.DOCTORS, session.doctorId);
    return doctor && doctor.active !== false && !doctor.archived && doctor.status !== 'pending' ? doctor : null;
  },

  /** هل الجلسة الحالية لطبيب معيّن؟ (عزل الأطباء عن بعضهم) */
  isDoctor(doctorId) {
    const session = this.get();
    return !!session && session.role === 'doctor'
      && (!doctorId || session.doctorId === doctorId);
  },

  get() {
    try { return JSON.parse(sessionStorage.getItem(this.KEY)); }
    catch { return null; }
  },

  is(role) {
    const session = this.get();
    return !!session && session.role === role;
  },

  logout() { sessionStorage.removeItem(this.KEY); }
};

/* ============================================================
   تصدير CSV — Vanilla خالص (بدون مكتبات)
   ============================================================ */
const Export = {
  /** بناء محتوى CSV مع BOM لتظهر العربية سليمة في Excel */
  csvContent(headers, rows) {
    const esc = (cell) => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`;
    return '\uFEFF' + [headers].concat(rows).map((r) => r.map(esc).join(',')).join('\r\n');
  },

  download(filename, content, mime = 'text/csv;charset=utf-8;') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 400);
  }
};

/* ============================================================
   إعادة زرع البيانات التجريبية
   ============================================================ */
const Seed = {
  reset() {
    Object.keys(Store.KEYS).forEach((key) => localStorage.removeItem(Store.KEYS[key]));
    Store.init();
  }
};

/* زرع البيانات فور تحميل السكربت */
Store.init();
