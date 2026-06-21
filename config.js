module.exports = {
  PORT: 8149,
  JWT_SECRET: 'cosmetics-stability-tracker-secret-key-2026',
  JWT_EXPIRES_IN: '24h',
  ROLES: {
    ADMIN: 'admin',
    EXPERIMENTER: 'experimenter',
    REVIEWER: 'reviewer'
  },
  STATUS: {
    PENDING_PREP: '待制样',
    OBSERVING: '观察中',
    PENDING_RETEST: '待复测',
    ABNORMAL_FOLLOWUP: '异常跟进',
    READY_SCALEUP: '可放大',
    SUSPENDED: '暂停'
  },
  ABNORMAL_LEVELS: ['正常', '轻微', '中等', '严重', '致命']
};
