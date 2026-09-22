/* ============================================================
   data.js — البيانات الابتدائية (Mock Data)
   تُزرع في localStorage مرة واحدة فقط عند أول تشغيل (عبر storage.js)
   ملاحظة: تواريخ المواعيد التجريبية تُحسب ديناميكيًا (غدًا / بعد غد)
   الحالات المتاحة للموعد:
   pending | approved | rejected | completed | cancelled
   ============================================================ */
'use strict';

/** معلومات العيادة وفروعها — تُستخدم لعرض «مكان الطبيب» عند الحجز وفي لوحات النظام */
const CLINIC = {
  name: 'عيادة الشفاء الطبية',
  branches: [
    {
      id: 'br-main',
      name: 'الفرع الرئيسي',
      address: '١٥ شارع الجمهورية — المنصورة',
      phone: '0100 000 0000',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=15+El+Gomhoreya+St+Mansoura'
    },
    {
      id: 'br-mashaya',
      name: 'فرع المشاية',
      address: '٧ شارع الجيش — المشاية السفلية، المنصورة',
      phone: '0100 000 0001',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=7+El+Geish+St+Mansoura'
    },
    {
      id: 'br-talkha',
      name: 'فرع طلخا',
      address: '٢٢ شارع بورسعيد — طلخا',
      phone: '0100 000 0002',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=22+Port+Said+St+Talkha'
    }
  ]
};

/** طاقم الاستقبال — بيانات دخول تجريبية (واجهة فقط، لا مصادقة حقيقية في نسخة Vanilla) */
const MOCK_STAFF = {
  id: 'staff-1',
  name: 'أ. منى السيد',
  user: 'secretary',
  pin: '1234',
  email: 'secretary@clinic.com',
  password: '1234',
  role: 'secretary',
  status: 'active',
  active: true,
  archived: false
};

/** حساب الإدارة التجريبي — واجهة محلية فقط بلا مصادقة خادمية */
const MOCK_PRESIDENT = {
  email: 'president@president.com',
  pin: '123456',
  name: 'رئيس العيادة'
};

/** الأطباء — أيام العمل 0=الأحد حتى 6=السبت
 *  locations: أماكن عمل الطبيب — عند تعدد الفروع تُحدَّد أيام العمل لكل فرع (days)
 *  والواجهة تعرض الفرع تلقائيًا حسب تاريخ الموعد (عبر Clinic.locationForDate)
 */
const MOCK_DOCTORS = [
  {
    id: 'doc-1',
    name: 'د. أحمد الشريف',
    email: 'ahmed.sherif@clinic.com',
    specialty: 'طب أسرة',
    avatar: '👨‍⚕️',
    bio: 'استشاري طب الأسرة — خبرة 15 عامًا في الطب الباطني',
    phone: '0100 000 0000',
    locations: [
      { branchId: 'br-main', room: 'عيادة 101 — الدور الأول', days: [0, 1, 2, 3, 4] }
    ],
    workDays: [0, 1, 2, 3, 4],
    startHour: 9,
    endHour: 16,
    slotMinutes: 30
  },
  {
    id: 'doc-2',
    name: 'د. سارة محمود',
    email: 'sara.mahmoud@clinic.com',
    specialty: 'أطفال',
    avatar: '👩‍⚕️',
    bio: 'أخصائية طب الأطفال وحديثي الولادة',
    phone: '0100 000 0001',
    locations: [
      { branchId: 'br-main', room: 'عيادة الأطفال 102 — الدور الأرضي', days: [0, 2, 4] }
    ],
    workDays: [0, 2, 4],
    startHour: 10,
    endHour: 15,
    slotMinutes: 30
  },
  {
    id: 'doc-3',
    name: 'د. محمد عبد الله',
    email: 'mohamed.abdullah@clinic.com',
    specialty: 'عظام',
    avatar: '🦴',
    bio: 'استشاري جراحة العظام والمفاصل',
    phone: '0100 000 0002',
    locations: [
      { branchId: 'br-mashaya', room: 'عيادة 203 — الدور الثاني', days: [1] },
      { branchId: 'br-main', room: 'عيادة 103 — الدور الأول', days: [3] }
    ],
    workDays: [1, 3],
    startHour: 11,
    endHour: 17,
    slotMinutes: 45
  },
  {
    id: 'doc-4',
    name: 'د. لينا كمال',
    email: 'lina.kamal@clinic.com',
    specialty: 'جلدية',
    avatar: '🧑‍⚕️',
    bio: 'أخصائية الأمراض الجلدية والتجميل',
    phone: '0100 000 0003',
    locations: [
      { branchId: 'br-talkha', room: 'عيادة 305 — الدور الثالث', days: [0, 1, 2, 3, 4] }
    ],
    workDays: [0, 1, 2, 3, 4],
    startHour: 9,
    endHour: 13,
    slotMinutes: 30
  }
];

/** مرضى ابتدائيون (5 مرضى للعرض في لوحة السكرتير) */
const MOCK_PATIENTS = [
  {
    id: 'pat-1',
    nationalId: '29001011234567',
    name: 'كريم حسن علي',
    phone: '01012345678',
    age: 30,
    gender: 'male'
  },
  {
    id: 'pat-2',
    nationalId: '28505129876543',
    name: 'منى سعيد إبراهيم',
    phone: '01123456789',
    age: 41,
    gender: 'female'
  },
  {
    id: 'pat-3',
    nationalId: '31912056543218',
    name: 'سلمى إبراهيم مصطفى',
    phone: '01234567890',
    age: 7,
    gender: 'female'
  },
  {
    id: 'pat-4',
    nationalId: '29103081122334',
    name: 'هدى عبد الرحمن',
    phone: '01098765432',
    age: 35,
    gender: 'female'
  },
  {
    id: 'pat-5',
    nationalId: '26807015566778',
    name: 'يوسف الطاهر',
    phone: '01187654321',
    age: 58,
    gender: 'male'
  }
];

/**
 * مواعيد ابتدائية — تُبنى ديناميكيًا من جدول SEED_PLAN:
 *  - minOffset: أقل عدد أيام من اليوم، ويُزاح تلقائيًا لأول يوم يعمل فيه الطبيب فعليًا
 *  - slotIndex: فهرس الوقت ضمن أوقات دوام الطبيب (يُستبدل بأول وقت فارغ إن كان محجوزًا)
 *  - wanted: الحالة المقصودة، وتُصحَّح تلقائيًا إذا وقع الموعد في الماضي
 * النتيجة: مواعيد دائمًا صالحة (يوم عمل صحيح + وقت ضمن الدوام + فرع اليوم الصحيح + بلا تعارض)
 */
const SEED_PLAN = [
  { id: 'apt-1',  code: 'APT-1001', doctorId: 'doc-1', patientIndex: 0, minOffset: 0, slotIndex: 1, reason: 'متابعة ضغط الدم',     wanted: 'completed' },
  { id: 'apt-2',  code: 'APT-1002', doctorId: 'doc-2', patientIndex: 2, minOffset: 0, slotIndex: 2, reason: 'حساسية موسمية',       wanted: 'completed' },
  { id: 'apt-3',  code: 'APT-1003', doctorId: 'doc-4', patientIndex: 3, minOffset: 0, slotIndex: 3, reason: 'فحص جلدي دوري',       wanted: 'cancelled' },
  { id: 'apt-4',  code: 'APT-1004', doctorId: 'doc-1', patientIndex: 1, minOffset: 1, slotIndex: 5, reason: 'متابعة سكر',          wanted: 'approved' },
  { id: 'apt-5',  code: 'APT-1005', doctorId: 'doc-3', patientIndex: 4, minOffset: 1, slotIndex: 2, reason: 'آلام الركبة',         wanted: 'approved' },
  { id: 'apt-6',  code: 'APT-1006', doctorId: 'doc-2', patientIndex: 0, minOffset: 2, slotIndex: 0, reason: 'كحة مستمرة',          wanted: 'pending' },
  { id: 'apt-7',  code: 'APT-1007', doctorId: 'doc-1', patientIndex: 3, minOffset: 2, slotIndex: 7, reason: 'مراجعة نتائج تحاليل', wanted: 'pending' },
  { id: 'apt-8',  code: 'APT-1008', doctorId: 'doc-4', patientIndex: 1, minOffset: 2, slotIndex: 1, reason: 'حبوب جلدية',          wanted: 'pending' },
  { id: 'apt-9',  code: 'APT-1009', doctorId: 'doc-3', patientIndex: 4, minOffset: 3, slotIndex: 1, reason: 'شد عضلي',             wanted: 'pending' },
  { id: 'apt-10', code: 'APT-1010', doctorId: 'doc-1', patientIndex: 2, minOffset: 3, slotIndex: 3, reason: 'إسهال ونزلة معوية',   wanted: 'approved' },
  { id: 'apt-11', code: 'APT-1011', doctorId: 'doc-2', patientIndex: 3, minOffset: 4, slotIndex: 4, reason: 'شكوى عامة',           wanted: 'rejected' },
  { id: 'apt-12', code: 'APT-1012', doctorId: 'doc-1', patientIndex: 4, minOffset: 7, slotIndex: 6, reason: 'مراجعة نتائج أشعة',   wanted: 'pending' }
];

function buildSeedAppointments() {
  const doctors = (typeof Store !== 'undefined' && Store.KEYS)
    ? Store.getAll(Store.KEYS.DOCTORS)
    : MOCK_DOCTORS;
  const todayIso = (typeof Utils !== 'undefined') ? Utils.todayISO() : null;
  if (!todayIso) return [];
  const usedSlots = new Set();
  const getDoctor = (id) => doctors.find((d) => d.id === id) || null;

  /** أول يوم عمل للطبيب ابتداءً من minOffset */
  function workdayFor(doctor, minOffset) {
    for (let i = minOffset; i <= minOffset + 13; i++) {
      const iso = Utils.addDaysISO(todayIso, i);
      if (doctor.workDays.includes(Utils.dayOfWeek(iso))) return iso;
    }
    return null;
  }

  /** اختيار يوم + وقت صالحين (مع اشتراط المستقبل للحالات pending/approved) */
  function pickSlot(doctor, plan, needsFuture) {
    let offset = plan.minOffset;
    for (let attempt = 0; attempt < 15; attempt++) {
      const date = workdayFor(doctor, offset);
      if (!date) return null;
      const free = Appointments.slotsFor(doctor, date)
        .filter((s) => !s.taken && !usedSlots.has(`${doctor.id}|${date}|${s.time}`))
        .filter((s) => !needsFuture || !Appointments.isPastDateTime(date, s.time));
      if (free.length) {
        const slot = free[Math.min(plan.slotIndex, free.length - 1)];
        usedSlots.add(`${doctor.id}|${date}|${slot.time}`);
        return { date, time: slot.time };
      }
      offset += 1;
    }
    return null;
  }

  /** تصحيح الحالة حسب الوقيت المنقضي/القادم */
  function finalizeStatus(wanted, date, time) {
    if (Appointments.isPastDateTime(date, time)) {
      return (wanted === 'pending' || wanted === 'approved') ? 'completed' : wanted;
    }
    return wanted === 'completed' ? 'approved' : wanted;
  }

  /** بناء سجل حالة مبدئي واقعي */
  function historyFor(status, createdAt) {
    const steps = [{ status: 'pending', by: 'patient', at: createdAt }];
    if (status === 'pending') return steps;
    if (status === 'rejected' || status === 'cancelled') {
      steps.push({ status, by: 'secretary', at: createdAt });
      return steps;
    }
    steps.push({ status: 'approved', by: 'secretary', at: createdAt });
    if (status === 'completed') {
      steps.push({ status: 'checkedIn', by: 'secretary', at: createdAt });
      steps.push({ status: 'completed', by: 'secretary', at: createdAt });
    }
    return steps;
  }

  return SEED_PLAN.map((plan) => {
    const doctor = getDoctor(plan.doctorId);
    const patient = MOCK_PATIENTS[plan.patientIndex] || MOCK_PATIENTS[0];
    if (!doctor) return null;
    const needsFuture = ['pending', 'approved', 'rejected'].includes(plan.wanted);
    const picked = pickSlot(doctor, plan, needsFuture);
    if (!picked) return null;
    const status = finalizeStatus(plan.wanted, picked.date, picked.time);
    const createdAt = new Date().toISOString();
    return {
      id: plan.id,
      code: plan.code,
      doctorId: plan.doctorId,
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone,
      date: picked.date,
      time: picked.time,
      reason: plan.reason,
      status,
      source: 'patient',
      createdAt,
      history: historyFor(status, createdAt)
    };
  }).filter(Boolean);
}

/** الرقم السري التجريبي الموحّد لدخول الأطباء (واجهة فقط) */
const MOCK_DOCTOR_PIN = '123456';

/** كتالوج أدوية للإكمال السريع في الروشتة (اسم / شكل / جرعة / تكرار شائع) */
const MOCK_MEDICINES = [
  { name: 'باراسيتامول 500 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'كل 8 ساعات' },
  { name: 'إيبوبروفين 400 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'كل 12 ساعة بعد الأكل' },
  { name: 'أموكسيسيلين 500 مجم', form: 'كبسول', dose: 'كبسولة واحدة', freq: 'كل 8 ساعات' },
  { name: 'أوجمنتين 625 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'كل 12 ساعة' },
  { name: 'أزيثرومايسين 500 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'مرة يوميًا' },
  { name: 'لوراتادين 10 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'مرة يوميًا مساءً' },
  { name: 'أوميبرازول 20 مجم', form: 'كبسول', dose: 'كبسولة واحدة', freq: 'مرة يوميًا قبل الفطار' },
  { name: 'فيتامين د 1000 وحدة', form: 'أقراص', dose: 'قرص واحد', freq: 'مرة يوميًا' },
  { name: 'حديد + حمض الفوليك', form: 'أقراص', dose: 'قرص واحد', freq: 'مرة يوميًا بعد الغداء' },
  { name: 'محلول ملح للأنف', form: 'بخاخ', dose: 'رشتان', freq: '3 مرات يوميًا' }
];

/**
 * زيارات تجريبية مكتملة (تُستخدم لعرض «الزيارات السابقة» فورًا).
 * تُبنى ديناميكيًا من أيام عمل الطبيب الفعلية حتى تبقى دائمًا صالحة.
 * كل زيارة مرتبطة بموعد ابتدائي موجود (apt-1 / apt-2 / apt-3).
 */
const SEED_VISITS = [
  {
    id: 'vis-1',
    appointmentId: 'apt-1',
    doctorId: 'doc-1',
    patientIndex: 0,
    diagnosis: 'ارتفاع ضغط الدم — المرحلة الأولى',
    icd: 'I10',
    severity: 'متوسطة',
    vitals: { bpSys: '145', bpDia: '92', pulse: '88', temp: '36.8', sugar: '110', weight: '84', height: '176' },
    complaint: 'صداع متكرر ودوخة صباحًا',
    examination: 'ضغط مرتفع، القلب والرئة سليمان',
    prescription: [
      { name: 'أملوديبين 5 مجم', form: 'أقراص', dose: 'قرص واحد', freq: 'مرة يوميًا صباحًا', duration: 'شهر', notes: '' }
    ],
    orders: [{ type: 'lab', text: 'تحليل سكر تراكمي + وظائف كلى' }],
    advice: 'تقليل الملح — مشي 30 دقيقة يوميًا',
    sickLeaveDays: 0,
    queueStatus: 'done'
  },
  {
    id: 'vis-2',
    appointmentId: 'apt-2',
    doctorId: 'doc-2',
    patientIndex: 2,
    diagnosis: 'حساسية موسمية',
    icd: 'J30.2',
    severity: 'خفيفة',
    vitals: { bpSys: '', bpDia: '', pulse: '110', temp: '37.1', sugar: '', weight: '22', height: '118' },
    complaint: 'عطس ورشح وحكة بالعين',
    examination: 'احتقان بالأنف، الصدر سليم',
    prescription: [
      { name: 'لوراتادين 10 مجم', form: 'أقراص', dose: 'نصف قرص', freq: 'مرة يوميًا مساءً', duration: 'أسبوعان', notes: '' },
      { name: 'محلول ملح للأنف', form: 'بخاخ', dose: 'رشتان', freq: '3 مرات يوميًا', duration: 'أسبوعان', notes: '' }
    ],
    orders: [],
    advice: 'تجنب الأتربة والعطور',
    sickLeaveDays: 0,
    queueStatus: 'done'
  }
];

function buildSeedVisits() {
  const doctors = (typeof Store !== 'undefined' && Store.KEYS)
    ? Store.getAll(Store.KEYS.DOCTORS)
    : MOCK_DOCTORS;
  const appointments = (typeof Store !== 'undefined' && Store.KEYS)
    ? Store.getAll(Store.KEYS.APPOINTMENTS)
    : [];
  if (!doctors.length) return [];
  return SEED_VISITS.map((plan, i) => {
    const appt = appointments.find((a) => a.id === plan.appointmentId) || {};
    const doctor = doctors.find((d) => d.id === plan.doctorId) || doctors[0];
    const patient = MOCK_PATIENTS[plan.patientIndex] || MOCK_PATIENTS[0];
    /* تاريخ مضى: أول يوم عمل سابق للطبيب حتى لا تظهر في قائمة اليوم */
    let date = Utils.todayISO();
    for (let back = 1; back <= 13; back++) {
      const iso = Utils.addDaysISO(Utils.todayISO(), -back);
      if (doctor.workDays.includes(Utils.dayOfWeek(iso))) { date = iso; break; }
    }
    const finishedAt = `${date}T${appt.time || '12:00'}:00`;
    return {
      id: plan.id,
      appointmentId: plan.appointmentId,
      patientId: patient.id,
      doctorId: doctor.id,
      date,
      time: appt.time || '12:00',
      queueStatus: 'done',
      priority: 'normal',
      secretaryNote: '',
      referredAt: finishedAt,
      referredBy: 'secretary',
      startedAt: finishedAt,
      finishedAt,
      finishedBy: 'doctor',
      vitals: plan.vitals,
      complaint: plan.complaint,
      history: '',
      examination: plan.examination,
      diagnosis: plan.diagnosis,
      icd: plan.icd,
      severity: plan.severity,
      prescription: plan.prescription,
      orders: plan.orders,
      advice: plan.advice,
      sickLeaveDays: plan.sickLeaveDays,
      createdAt: finishedAt,
      updatedAt: finishedAt
    };
  }).filter((v, i, all) => all.findIndex((x) => x.id === v.id) === i);
}

/** الزيارات والروشتات — تُزرع من buildSeedVisits (دمج بالـ id كباقي البيانات) */
const MOCK_VISITS = [];
