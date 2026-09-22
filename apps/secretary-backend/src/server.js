const { createApp, errorHandler } = require('@clinic/common');
const routes = require('./routes/secretaryRoutes');
const app = createApp('secretary-backend');
app.use('/api/secretary', routes);
app.use(errorHandler);
const port = Number(process.env.PORT || 4003);
app.listen(port, () => console.log(`Secretary backend listening on http://localhost:${port}`));
