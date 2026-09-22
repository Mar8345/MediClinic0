const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? files(full) : [full];
});
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const results = [];
const check = (name, ok, evidence) => results.push({ name, ok: Boolean(ok), evidence });

const appMap = {
  doctor: {
    dir: 'apps/doctor-backend/src',
    endpoints: ['GET /api/doctor/appointments','POST /api/doctor/medical-records','PUT /api/doctor/medical-records/:id','POST /api/doctor/prescriptions','GET /api/doctor/patients/:patientId/medical-history']
  },
  patient: {
    dir: 'apps/patient-backend/src',
    endpoints: ['POST /api/patients/register','GET /api/patients/me','PUT /api/patients/me','GET /api/patients/medical-history','GET /api/patients/prescriptions','POST /api/appointments/book','GET /api/appointments']
  },
  secretary: {
    dir: 'apps/secretary-backend/src',
    endpoints: ['POST /api/secretary/appointments','PUT /api/secretary/appointments/:id','POST /api/secretary/patients/walk-in','GET /api/secretary/queue','PATCH /api/secretary/queue/:id/status','POST /api/secretary/billing','GET /api/secretary/billing/:id']
  },
  admin: {
    dir: 'apps/admin-backend/src',
    endpoints: ['GET /api/admin/analytics','GET /api/admin/staff','POST /api/admin/staff','PUT /api/admin/staff/:id','DELETE /api/admin/staff/:id','GET /api/admin/logs','GET /api/admin/settings','PUT /api/admin/settings']
  }
};

const routeChecks = {
  doctor: [['get','/appointments'],['post','/medical-records'],['put','/medical-records/:id'],['post','/prescriptions'],['get','/patients/:patientId/medical-history']],
  patient: [['post','/register'],['get','/me'],['put','/me'],['get','/medical-history'],['get','/prescriptions']],
  secretary: [['post','/patients/walk-in'],['post','/appointments'],['put','/appointments/:id'],['get','/queue'],['patch','/queue/:id/status'],['post','/billing'],['get','/billing/:id']],
  admin: [['get','/analytics'],['get','/staff'],['post','/staff'],['put','/staff/:id'],['delete','/staff/:id'],['get','/logs'],['get','/settings'],['put','/settings']]
};
for (const [role, cfg] of Object.entries(appMap)) {
  const source = files(path.join(root, cfg.dir)).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  check(`${role}: Express app structure`, source.includes("createApp('"), cfg.dir);
  const checks = routeChecks[role];
  check(`${role}: requested endpoints`, checks.every(([method, route]) => source.includes(`router.${method}('${route}'`) || source.includes(`router.${method}(\"${route}\"`)), cfg.endpoints.join(', '));
}

const schema = read('database/schema.sql');
for (const table of ['users','doctors','patients','appointments','medical_records','prescriptions','billing','audit_logs','system_settings']) {
  check(`database table: ${table}`, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(schema), 'database/schema.sql');
}
check('database constraints/indexes', schema.includes('REFERENCES') && schema.includes('UNIQUE') && schema.includes('CREATE INDEX'), 'database/schema.sql');
check('authentication middleware', read('packages/common/src/middleware.js').includes("startsWith('Bearer ')") && read('packages/common/src/security.js').includes('scryptSync'), 'packages/common/src');
check('role authorization', read('packages/common/src/middleware.js').includes('roles.includes(payload.role)'), 'packages/common/src/middleware.js');
check('error handler', read('packages/common/src/app.js').includes('function errorHandler') && read('packages/common/src/app.js').includes('res.status(status).json'), 'packages/common/src/app.js');
check('README', fs.existsSync(path.join(root,'README.md')), 'README.md');
check('.gitignore excludes secrets/dependencies', read('.gitignore').includes('node_modules/') && read('.gitignore').includes('.env'), '.gitignore');
check('no .env committed', !fs.existsSync(path.join(root,'.env')), '.env absent');
check('no node_modules committed', !fs.existsSync(path.join(root,'node_modules')), 'node_modules absent');

const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.name}\t${r.evidence}`);
console.log(`\nSummary: ${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
