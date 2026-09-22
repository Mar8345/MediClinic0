const { createApp, errorHandler } = require('@clinic/common');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const app = createApp('patient-backend');
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use(errorHandler);
const port = Number(process.env.PORT || 4002);
app.listen(port, () => console.log(`Patient backend listening on http://localhost:${port}`));
