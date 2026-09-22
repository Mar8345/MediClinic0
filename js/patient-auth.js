/* patient-auth.js — بوابة الدخول الموحدة + Signup للمريض */
'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const requestedDoctorId = params.get('doctorId') || Session.selectedDoctorId();
  let mode = 'login';

  function setError(inputId, errorId, message) {
    const input = $(inputId); const error = $(errorId);
    if (input) input.classList.toggle('is-invalid', !!message);
    if (error) error.textContent = message || '';
  }
  function emailValid(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value); }
  function signupRole() { return document.querySelector('input[name="signupRole"]:checked')?.value || 'patient'; }

  function updateSignupRole() {
    const isDoctor = signupRole() === 'doctor';
    const isSecretary = signupRole() === 'secretary';
    document.querySelectorAll('.doctor-signup-only').forEach((el) => { el.hidden = !isDoctor; });
    document.querySelectorAll('.secretary-signup-only').forEach((el) => { el.hidden = !isSecretary; });
    document.querySelectorAll('.patient-signup-only').forEach((el) => { el.hidden = isDoctor || isSecretary; });
    $('signupHelp').textContent = isDoctor
      ? 'سيُرسل طلب الطبيب إلى President للمراجعة وتحديد الفرع والجدول قبل تفعيل الحساب.'
      : isSecretary
        ? 'سيُرسل طلب تسجيل السكرتير إلى الرئيس للمراجعة. لن تتمكن من الدخول قبل اعتماد الحساب.'
        : 'إذا كان لديك ملف قديم، استخدم نفس الهاتف والرقم القومي لتحديثه دون إنشاء ملف مكرر.';
  }

  function validateLogin() {
    let valid = true;
    const identifier = $('authIdentifier').value.trim(); const password = $('authPassword').value;
    if (identifier.length < 3) { setError('authIdentifier', 'authIdentifierError', 'أدخل البريد الإلكتروني أو اسم المستخدم'); valid = false; } else setError('authIdentifier', 'authIdentifierError', '');
    if (password.length < 4) { setError('authPassword', 'authPasswordError', 'أدخل رقمًا سريًا صحيحًا (4 أحرف على الأقل)'); valid = false; } else setError('authPassword', 'authPasswordError', '');
    return valid;
  }

  function validateSignup() {
    let valid = true;
    const checks = [
      ['authName', 'authNameError', $('authName').value.trim().length >= 3, 'اكتب الاسم بالكامل'],
      ['authEmailSignup', 'authEmailSignupError', emailValid($('authEmailSignup').value.trim()), 'أدخل بريدًا إلكترونيًا صحيحًا'],
      ['authPasswordSignup', 'authPasswordSignupError', $('authPasswordSignup').value.length >= 6, 'الرقم السري يجب أن يكون 6 أحرف على الأقل'],
      ['authPhone', 'authPhoneError', /^01[0125]\d{8}$/.test($('authPhone').value.trim()), 'أدخل رقم هاتف صحيح']
    ];
    if (signupRole() === 'doctor') checks.push(['authSpecialty', 'authSpecialtyError', $('authSpecialty').value.trim().length >= 2, 'اكتب تخصص الطبيب']);
    else if (signupRole() === 'patient') checks.push(
      ['authNationalId', 'authNationalIdError', /^\d{10,14}$/.test($('authNationalId').value.trim()), 'أدخل رقمًا قوميًّا صحيحًا'],
      ['authAge', 'authAgeError', Number.isFinite(Number($('authAge').value)) && Number($('authAge').value) >= 0 && Number($('authAge').value) <= 120, 'أدخل عمرًا صحيحًا'],
      ['authGender', 'authGenderError', !!$('authGender').value, 'اختر النوع']
    );
    checks.forEach(([input, error, passes, message]) => { if (!passes) valid = false; setError(input, error, passes ? '' : message); });
    return valid;
  }

  function setMode(nextMode) {
    mode = nextMode;
    const isLogin = mode === 'login';
    $('loginTab').classList.toggle('is-active', isLogin); $('signupTab').classList.toggle('is-active', !isLogin);
    $('loginTab').setAttribute('aria-selected', String(isLogin)); $('signupTab').setAttribute('aria-selected', String(!isLogin));
    $('loginPanel').hidden = !isLogin; $('signupPanel').hidden = isLogin;
    $('authSubmit').textContent = isLogin ? 'دخول' : 'إنشاء الحساب';
  }

  function setSubmitting(isSubmitting) {
    const button = $('authSubmit');
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? 'جارٍ التحقق…' : (mode === 'login' ? 'دخول' : 'إنشاء الحساب');
  }

  function renderDoctorDemoAccounts() {
    const container = $('doctorDemoAccounts');
    if (!container) return;
    container.innerHTML = Doctors.list().filter((doctor) => doctor.active !== false && !doctor.archived).map((doctor) => `
      <div class="doctor-demo-account">
        <span><b>${Utils.escapeHtml(doctor.name)}</b><small>${Utils.escapeHtml(doctor.specialty)} · <code dir="ltr">${Utils.escapeHtml(doctor.email || '—')}</code> · الرقم: <code dir="ltr">123456</code></small></span>
        <button type="button" class="btn btn-outline btn-sm" data-copy-email="${Utils.escapeHtml(doctor.email || '')}">نسخ البريد</button>
      </div>`).join('');
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy-email]');
      if (!button) return;
      const email = button.dataset.copyEmail;
      try {
        await navigator.clipboard.writeText(email);
        button.textContent = 'تم النسخ';
        setTimeout(() => { button.textContent = 'نسخ البريد'; }, 1400);
      } catch {
        Utils.showToast(`البريد: ${email}`, 'info');
      }
    });
  }

  $('loginTab').addEventListener('click', () => setMode('login'));
  $('signupTab').addEventListener('click', () => setMode('signup'));
  $('patientAuthForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (mode === 'login') {
      if (!validateLogin()) return;
      setSubmitting(true);
      const result = Session.loginUnified($('authIdentifier').value.trim(), $('authPassword').value);
      if (!result.ok) { setSubmitting(false); setError('authPassword', 'authPasswordError', result.reason); return; }
      if (requestedDoctorId) Session.setSelectedDoctor(requestedDoctorId);
      window.location.href = result.redirect;
      return;
    }
    if (!validateSignup()) return;
    setSubmitting(true);
    const result = signupRole() === 'doctor'
      ? Session.signupDoctor({ name: $('authName').value.trim(), email: $('authEmailSignup').value.trim(), password: $('authPasswordSignup').value, phone: $('authPhone').value.trim(), specialty: $('authSpecialty').value.trim() })
      : signupRole() === 'secretary'
        ? Session.signupSecretary({ name: $('authName').value.trim(), email: $('authEmailSignup').value.trim(), password: $('authPasswordSignup').value, phone: $('authPhone').value.trim() })
        : Session.signupPatient({ name: $('authName').value.trim(), email: $('authEmailSignup').value.trim(), password: $('authPasswordSignup').value, phone: $('authPhone').value.trim(), nationalId: $('authNationalId').value.trim(), age: Number($('authAge').value), gender: $('authGender').value });
    if (!result.ok) { setSubmitting(false); setError('authEmailSignup', 'authEmailSignupError', result.reason); return; }
    if (signupRole() === 'doctor' || signupRole() === 'secretary') {
      setSubmitting(false);
      Utils.showToast(signupRole() === 'doctor' ? 'تم إرسال طلب الطبيب إلى الرئيس للمراجعة' : 'تم إرسال طلب السكرتير إلى الرئيس للمراجعة', 'success');
      setMode('login');
      return;
    }
    if (requestedDoctorId) Session.setSelectedDoctor(requestedDoctorId);
    window.location.href = 'profile.html';
  });

  renderDoctorDemoAccounts();
  document.querySelectorAll('input[name="signupRole"]').forEach((input) => input.addEventListener('change', updateSignupRole));
  updateSignupRole();

  const doctor = requestedDoctorId ? Store.findById(Store.KEYS.DOCTORS, requestedDoctorId) : null;
  if (doctor && doctor.active !== false && !doctor.archived) $('selectedDoctorText').textContent = `أنت تستكمل مع ${doctor.name} — ${doctor.specialty}. بعد الدخول ستفتح صفحة البروفايل.`;
})();
