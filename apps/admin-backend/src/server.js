const { createApp, errorHandler } = require('@clinic/common');
const routes = require('./routes/adminRoutes');
const app = createApp('admin-backend');
app.use('/api/admin', routes);
app.use(errorHandler);
const port = Number(process.env.PORT || 4004);
app.listen(port, () => console.log(`Admin backend listening on http://localhost:${port}`));
