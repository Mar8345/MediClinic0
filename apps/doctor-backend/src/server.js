const { createApp, errorHandler } = require('@clinic/common');
const doctorRoutes = require('./routes/doctorRoutes');
const app = createApp('doctor-backend');
app.use('/api/doctor', doctorRoutes);
app.use(errorHandler);
const port = Number(process.env.PORT || 4001);
app.listen(port, () => console.log(`Doctor backend listening on http://localhost:${port}`));
