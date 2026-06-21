const express = require('express');
const store = require('../data/store');
const { authenticate, requireExperimenter } = require('../middleware/auth');
const { STATUS, ABNORMAL_LEVELS } = require('../config');
const { enrichTrialBatch, calculateNextRetestDate, determineCurrentAction, assessRiskLevel, calculateRetestStatus, createRetestPlan, completeRetestPlan } = require('../utils/analytics');

const router = express.Router();

router.get('/experiment-records', authenticate, (req, res) => {
  let records = [...store.experimentRecords];
  
  if (req.query.trialBatchId) {
    records = records.filter(r => r.trialBatchId === parseInt(req.query.trialBatchId));
  }
  if (req.query.experimenterId) {
    records = records.filter(r => r.experimenterId === parseInt(req.query.experimenterId));
  }
  if (req.query.abnormalLevel) {
    records = records.filter(r => r.abnormalLevel === req.query.abnormalLevel);
  }
  if (req.query.startDate) {
    records = records.filter(r => r.recordDate >= req.query.startDate);
  }
  if (req.query.endDate) {
    records = records.filter(r => r.recordDate <= req.query.endDate);
  }

  records.sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));
  res.json({ total: records.length, data: records });
});

router.get('/experiment-records/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const record = store.experimentRecords.find(r => r.id === id);
  if (!record) return res.status(404).json({ message: '实验记录不存在' });
  
  const batch = store.trialBatches.find(b => b.id === record.trialBatchId);
  res.json({ ...record, trialBatch: batch || null });
});

router.post('/experiment-records', authenticate, requireExperimenter, (req, res) => {
  const {
    trialBatchId, recordDate, samplePrepared, appearance, viscosity, viscosityUnit,
    odor, pH, packagingCompatibility, abnormalLevel, suggestedAction, remarks
  } = req.body;

  if (!trialBatchId) {
    return res.status(400).json({ message: '试制批号ID为必填项' });
  }

  const batch = store.trialBatches.find(b => b.id === parseInt(trialBatchId));
  if (!batch) return res.status(400).json({ message: '试制批号不存在' });

  if (abnormalLevel && !ABNORMAL_LEVELS.includes(abnormalLevel)) {
    return res.status(400).json({ message: '异常等级无效，可选值: ' + ABNORMAL_LEVELS.join(', ') });
  }

  const experimenter = store.users.find(u => u.id === req.user.id);
  
  const record = {
    id: store.nextId.experimentRecord++,
    trialBatchId: parseInt(trialBatchId),
    trialBatchNumber: batch.batchNumber,
    recordDate: recordDate || new Date().toISOString().split('T')[0],
    samplePrepared: samplePrepared === true ? true : false,
    appearance: appearance || '',
    viscosity: viscosity !== undefined && viscosity !== '' ? parseFloat(viscosity) : null,
    viscosityUnit: viscosityUnit || 'cP',
    odor: odor || '',
    pH: pH !== undefined && pH !== '' ? parseFloat(pH) : null,
    packagingCompatibility: packagingCompatibility || '',
    abnormalLevel: abnormalLevel || '正常',
    suggestedAction: suggestedAction || '',
    experimenterId: req.user.id,
    experimenterName: experimenter ? experimenter.name : req.user.name,
    remarks: remarks || '',
    createdAt: new Date().toISOString()
  };

  store.experimentRecords.push(record);

  const seriousLevels = ['中等', '严重', '致命'];
  if (seriousLevels.includes(abnormalLevel)) {
    batch.status = STATUS.ABNORMAL_FOLLOWUP;
  } else if (batch.status === STATUS.PENDING_PREP && samplePrepared === true) {
    batch.status = STATUS.OBSERVING;
  } else if (batch.status === STATUS.PENDING_RETEST) {
    batch.status = STATUS.OBSERVING;
  }
  batch.updatedAt = new Date().toISOString();

  completeRetestPlan(batch.id, req.user.id, experimenter ? experimenter.name : '', `实验记录已提交: ${recordDate}`);
  createRetestPlan(
    batch, 
    'experiment', 
    record.id, 
    record.recordDate, 
    req.user.id, 
    experimenter ? experimenter.name : ''
  );

  const allRecords = store.experimentRecords
    .filter(r => r.trialBatchId === batch.id)
    .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));
  const allReviews = store.reviewRecords.filter(r => r.trialBatchId === batch.id);
  const nextRetestDate = calculateNextRetestDate(batch, allRecords);
  const retestStatus = calculateRetestStatus(batch, allRecords);
  const currentAction = determineCurrentAction(batch, allRecords, allReviews, retestStatus);
  const riskAssessment = assessRiskLevel(batch, allRecords, allReviews, retestStatus);

  res.status(201).json({ 
    ...record, 
    updatedBatch: {
      id: batch.id,
      status: batch.status,
      nextRetestDate,
      retestStatus,
      currentAction,
      riskAssessment,
      updatedAt: batch.updatedAt
    }
  });
});

router.put('/experiment-records/:id', authenticate, requireExperimenter, (req, res) => {
  const id = parseInt(req.params.id);
  const record = store.experimentRecords.find(r => r.id === id);
  if (!record) return res.status(404).json({ message: '实验记录不存在' });

  if (record.experimenterId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: '只能修改自己创建的记录' });
  }

  const {
    recordDate, samplePrepared, appearance, viscosity, viscosityUnit,
    odor, pH, packagingCompatibility, abnormalLevel, suggestedAction, remarks
  } = req.body;

  if (abnormalLevel && !ABNORMAL_LEVELS.includes(abnormalLevel)) {
    return res.status(400).json({ message: '异常等级无效' });
  }

  if (recordDate) record.recordDate = recordDate;
  if (samplePrepared !== undefined) record.samplePrepared = samplePrepared;
  if (appearance !== undefined) record.appearance = appearance;
  if (viscosity !== undefined) record.viscosity = viscosity !== '' ? parseFloat(viscosity) : null;
  if (viscosityUnit !== undefined) record.viscosityUnit = viscosityUnit;
  if (odor !== undefined) record.odor = odor;
  if (pH !== undefined) record.pH = pH !== '' ? parseFloat(pH) : null;
  if (packagingCompatibility !== undefined) record.packagingCompatibility = packagingCompatibility;
  if (abnormalLevel) record.abnormalLevel = abnormalLevel;
  if (suggestedAction !== undefined) record.suggestedAction = suggestedAction;
  if (remarks !== undefined) record.remarks = remarks;

  res.json(record);
});

router.delete('/experiment-records/:id', authenticate, requireExperimenter, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = store.experimentRecords.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ message: '实验记录不存在' });

  const record = store.experimentRecords[idx];
  if (record.experimenterId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: '只能删除自己创建的记录' });
  }

  store.experimentRecords.splice(idx, 1);
  res.json({ message: '删除成功' });
});

module.exports = router;
