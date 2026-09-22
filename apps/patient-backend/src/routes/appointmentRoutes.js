const router = require('express').Router();
const { requireAuth } = require('@clinic/common');
const c = require('../controllers/patientController');
router.use(requireAuth('PATIENT'));
router.post('/book', c.bookAppointment);
router.get('/', c.appointments);
module.exports = router;
