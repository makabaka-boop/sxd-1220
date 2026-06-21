const express = require('express');
const { authenticate } = require('../middleware/auth');
const { runAllValidations, detectPackagingAbnormalCluster, detectRetestOverdue, detectMissingKeyReadings, detectAbnormalWithoutConclusion, detectResponsibleBacklog } = require('../utils/validators');
const { getHighRiskPackaging, getPendingRetestBatches, getStabilityTrend } = require('../utils/analytics');

const router = express.Router();

router.get('/validations', authenticate, (req, res) => {
  const result = runAllValidations();
  res.json(result);
});

router.get('/validations/packaging-abnormal-cluster', authenticate, (req, res) => {
  res.json(detectPackagingAbnormalCluster());
});

router.get('/validations/retest-overdue', authenticate, (req, res) => {
  res.json(detectRetestOverdue());
});

router.get('/validations/missing-readings', authenticate, (req, res) => {
  res.json(detectMissingKeyReadings());
});

router.get('/validations/abnormal-no-conclusion', authenticate, (req, res) => {
  res.json(detectAbnormalWithoutConclusion());
});

router.get('/validations/responsible-backlog', authenticate, (req, res) => {
  res.json(detectResponsibleBacklog());
});

router.get('/high-risk-packaging', authenticate, (req, res) => {
  const result = getHighRiskPackaging();
  res.json({
    total: result.length,
    data: result
  });
});

router.get('/pending-retest-batches', authenticate, (req, res) => {
  const result = getPendingRetestBatches();
  const summary = {
    total: result.length,
    overdue: result.filter(r => r.isOverdue).length,
    urgent: result.filter(r => r.isUrgent && !r.isOverdue).length,
    normal: result.filter(r => !r.isOverdue && !r.isUrgent).length
  };
  res.json({
    summary,
    data: result
  });
});

router.get('/stability-trend', authenticate, (req, res) => {
  const groupBy = req.query.groupBy || 'formula';
  const validGroups = ['formula', 'packaging', 'condition', 'responsible'];
  if (!validGroups.includes(groupBy)) {
    return res.status(400).json({ message: 'groupBy参数无效，可选值: ' + validGroups.join(', ') });
  }
  const result = getStabilityTrend(groupBy);
  res.json({
    groupBy,
    total: result.length,
    data: result
  });
});

router.get('/dashboard', authenticate, (req, res) => {
  const store = require('../data/store');
  const { STATUS } = require('../config');

  const batchStatusCount = {};
  Object.values(STATUS).forEach(s => {
    batchStatusCount[s] = 0;
  });
  store.trialBatches.forEach(b => {
    batchStatusCount[b.status] = (batchStatusCount[b.status] || 0) + 1;
  });

  const abnormalLevelCount = {};
  store.experimentRecords.forEach(r => {
    abnormalLevelCount[r.abnormalLevel] = (abnormalLevelCount[r.abnormalLevel] || 0) + 1;
  });

  const riskLevelCount = {};
  store.reviewRecords.forEach(r => {
    riskLevelCount[r.riskLevel] = (riskLevelCount[r.riskLevel] || 0) + 1;
  });

  const validations = runAllValidations();
  const pendingRetest = getPendingRetestBatches();

  res.json({
    summary: {
      totalFormulas: store.formulas.length,
      totalTrialBatches: store.trialBatches.length,
      totalExperimentRecords: store.experimentRecords.length,
      totalReviewRecords: store.reviewRecords.length,
      totalPackagingTypes: store.packagingTypes.length,
      totalResponsiblePersons: store.responsiblePersons.length
    },
    batchStatusDistribution: batchStatusCount,
    abnormalLevelDistribution: abnormalLevelCount,
    riskLevelDistribution: riskLevelCount,
    alerts: {
      retestOverdue: validations.retestOverdue.detected ? validations.retestOverdue.overdueBatches.length : 0,
      packagingAbnormalCluster: validations.packagingAbnormalCluster.detected ? validations.packagingAbnormalCluster.highRiskPackaging.length : 0,
      missingReadings: validations.missingKeyReadings.detected ? validations.missingKeyReadings.missingRecords.length : 0,
      abnormalNoConclusion: validations.abnormalWithoutConclusion.detected ? validations.abnormalWithoutConclusion.pendingConclusion.length : 0,
      responsibleBacklog: validations.responsibleBacklog.detected ? validations.responsibleBacklog.backlogResponsibles.length : 0,
      pendingRetestCount: pendingRetest.filter(r => r.isOverdue || r.isUrgent).length
    },
    topHighRiskPackaging: getHighRiskPackaging().slice(0, 5),
    urgentPendingRetest: pendingRetest.slice(0, 10)
  });
});

module.exports = router;
