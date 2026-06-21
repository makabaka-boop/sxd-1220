const express = require('express');
const cors = require('cors');
const { PORT, ROLES, STATUS } = require('./config');
const { authenticate } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    name: '化妆品试制批号稳定性跟踪系统',
    version: '1.0.0',
    description: '化妆品研发团队试制批号、稳定性观察、包材适配和复测结论管理系统',
    status: 'running',
    port: PORT,
    time: new Date().toISOString(),
    apiBase: '/api',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        users: 'GET /api/auth/users (admin)',
        createUser: 'POST /api/auth/users (admin)',
        updateUser: 'PUT /api/auth/users/:id (admin)',
        deleteUser: 'DELETE /api/auth/users/:id (admin)'
      },
      admin: {
        formulas: 'GET/POST/PUT/DELETE /api/admin/formulas',
        rawMaterialBatches: 'GET/POST/PUT/DELETE /api/admin/raw-material-batches',
        packagingTypes: 'GET/POST/PUT/DELETE /api/admin/packaging-types',
        observationConditions: 'GET/POST/PUT/DELETE /api/admin/observation-conditions',
        responsiblePersons: 'GET/POST/PUT/DELETE /api/admin/responsible-persons',
        retestCycles: 'GET/POST/PUT/DELETE /api/admin/retest-cycles'
      },
      trialBatches: {
        list: 'GET /api/trial-batches (支持筛选)',
        detail: 'GET /api/trial-batches/:id',
        create: 'POST /api/trial-batches',
        update: 'PUT /api/trial-batches/:id',
        updateStatus: 'PATCH /api/trial-batches/:id/status',
        delete: 'DELETE /api/trial-batches/:id (admin)',
        statuses: 'GET /api/statuses'
      },
      experiment: {
        list: 'GET /api/experiment-records (支持筛选)',
        detail: 'GET /api/experiment-records/:id',
        create: 'POST /api/experiment-records (experimenter)',
        update: 'PUT /api/experiment-records/:id (experimenter)',
        delete: 'DELETE /api/experiment-records/:id (experimenter)'
      },
      review: {
        list: 'GET /api/review-records (支持筛选)',
        detail: 'GET /api/review-records/:id',
        create: 'POST /api/review-records (reviewer)',
        update: 'PUT /api/review-records/:id (reviewer)',
        delete: 'DELETE /api/review-records/:id (reviewer)',
        options: 'GET /api/review-options'
      },
      analytics: {
        dashboard: 'GET /api/analytics/dashboard',
        validations: 'GET /api/analytics/validations',
        packagingAbnormal: 'GET /api/analytics/validations/packaging-abnormal-cluster',
        retestOverdue: 'GET /api/analytics/validations/retest-overdue',
        missingReadings: 'GET /api/analytics/validations/missing-readings',
        abnormalNoConclusion: 'GET /api/analytics/validations/abnormal-no-conclusion',
        responsibleBacklog: 'GET /api/analytics/validations/responsible-backlog',
        highRiskPackaging: 'GET /api/analytics/high-risk-packaging',
        pendingRetestBatches: 'GET /api/analytics/pending-retest-batches',
        stabilityTrend: 'GET /api/analytics/stability-trend?groupBy=formula|packaging|condition|responsible'
      },
      export: {
        summary: 'GET /api/export/summary',
        jsonFull: 'GET /api/export/json?type=full',
        csvTrialBatches: 'GET /api/export/csv?section=trial-batches',
        csvExperiment: 'GET /api/export/csv?section=experiment-records',
        csvReview: 'GET /api/export/csv?section=review-records',
        csvHighRiskPackaging: 'GET /api/export/csv?section=high-risk-packaging',
        csvPendingRetest: 'GET /api/export/csv?section=pending-retest',
        csvFull: 'GET /api/export/csv'
      }
    },
    defaultAccounts: [
      { username: 'admin', password: 'admin123', role: ROLES.ADMIN, name: '系统管理员' },
      { username: 'exp01', password: 'exp123', role: ROLES.EXPERIMENTER, name: '实验员张三' },
      { username: 'exp02', password: 'exp123', role: ROLES.EXPERIMENTER, name: '实验员李四' },
      { username: 'rev01', password: 'rev123', role: ROLES.REVIEWER, name: '复核员王五' },
      { username: 'rev02', password: 'rev123', role: ROLES.REVIEWER, name: '复核员赵六' }
    ],
    statusTypes: Object.values(STATUS)
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/trialBatches'));
app.use('/api', require('./routes/experiment'));
app.use('/api', require('./routes/review'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api', require('./routes/export'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  });
});

app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({
    message: '接口不存在',
    path: req.path,
    method: req.method
  });
});

app.listen(PORT, () => {
  console.log('============================================');
  console.log('  化妆品试制批号稳定性跟踪系统');
  console.log('============================================');
  console.log(`  服务启动成功！端口: ${PORT}`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/api/health`);
  console.log('============================================');
  console.log('  默认账号:');
  console.log('    管理员:  admin / admin123');
  console.log('    实验员:  exp01 / exp123');
  console.log('           exp02 / exp123');
  console.log('    复核员:  rev01 / rev123');
  console.log('           rev02 / rev123');
  console.log('============================================');
});
