const express = require('express');
const store = require('../data/store');
const { authenticate, requireReviewer } = require('../middleware/auth');
const { STATUS } = require('../config');

const router = express.Router();

const RISK_LEVELS = ['低风险', '中风险', '高风险', '极高风险'];
const RETEST_RESULTS = ['通过', '有条件通过', '不通过', '需进一步检测'];
const RELEASE_RECOMMENDATIONS = ['建议放大生产', '条件放行', '建议暂停', '建议终止', '需改进后继续'];

router.get('/review-records', authenticate, (req, res) => {
  let records = [...store.reviewRecords];
  
  if (req.query.trialBatchId) {
    records = records.filter(r => r.trialBatchId === parseInt(req.query.trialBatchId));
  }
  if (req.query.reviewerId) {
    records = records.filter(r => r.reviewerId === parseInt(req.query.reviewerId));
  }
  if (req.query.riskLevel) {
    records = records.filter(r => r.riskLevel === req.query.riskLevel);
  }
  if (req.query.retestResult) {
    records = records.filter(r => r.retestResult === req.query.retestResult);
  }

  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ total: records.length, data: records });
});

router.get('/review-records/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const record = store.reviewRecords.find(r => r.id === id);
  if (!record) return res.status(404).json({ message: '复核记录不存在' });
  
  const batch = store.trialBatches.find(b => b.id === record.trialBatchId);
  const relatedRecords = store.experimentRecords.filter(r => r.trialBatchId === record.trialBatchId);
  
  res.json({
    ...record,
    trialBatch: batch || null,
    relatedExperimentRecords: relatedRecords
  });
});

router.post('/review-records', authenticate, requireReviewer, (req, res) => {
  const {
    trialBatchId, retestDate, retestResult, appearanceStable,
    viscosityDeviation, odorNormal, riskLevel, releaseRecommendation, remarks
  } = req.body;

  if (!trialBatchId) {
    return res.status(400).json({ message: '试制批号ID为必填项' });
  }

  const batch = store.trialBatches.find(b => b.id === parseInt(trialBatchId));
  if (!batch) return res.status(400).json({ message: '试制批号不存在' });

  if (retestResult && !RETEST_RESULTS.includes(retestResult)) {
    return res.status(400).json({ message: '复测结果无效，可选值: ' + RETEST_RESULTS.join(', ') });
  }
  if (riskLevel && !RISK_LEVELS.includes(riskLevel)) {
    return res.status(400).json({ message: '风险等级无效，可选值: ' + RISK_LEVELS.join(', ') });
  }
  if (releaseRecommendation && !RELEASE_RECOMMENDATIONS.includes(releaseRecommendation)) {
    return res.status(400).json({ message: '放行建议无效，可选值: ' + RELEASE_RECOMMENDATIONS.join(', ') });
  }

  const reviewer = store.users.find(u => u.id === req.user.id);

  const record = {
    id: store.nextId.reviewRecord++,
    trialBatchId: parseInt(trialBatchId),
    trialBatchNumber: batch.batchNumber,
    retestDate: retestDate || new Date().toISOString().split('T')[0],
    retestResult: retestResult || '需进一步检测',
    appearanceStable: appearanceStable === false ? false : true,
    viscosityDeviation: viscosityDeviation !== undefined ? parseFloat(viscosityDeviation) : null,
    odorNormal: odorNormal === false ? false : true,
    riskLevel: riskLevel || '中风险',
    releaseRecommendation: releaseRecommendation || '需改进后继续',
    reviewerId: req.user.id,
    reviewerName: reviewer ? reviewer.name : req.user.name,
    remarks: remarks || '',
    createdAt: new Date().toISOString()
  };

  store.reviewRecords.push(record);

  if (releaseRecommendation === '建议放大生产' && retestResult === '通过') {
    batch.status = STATUS.READY_SCALEUP;
  } else if (releaseRecommendation === '建议暂停' || releaseRecommendation === '建议终止') {
    batch.status = STATUS.SUSPENDED;
  } else if (releaseRecommendation === '需改进后继续' || retestResult === '有条件通过') {
    batch.status = STATUS.PENDING_RETEST;
  } else if (batch.status === STATUS.ABNORMAL_FOLLOWUP) {
    batch.status = STATUS.OBSERVING;
  }
  batch.updatedAt = new Date().toISOString();

  res.status(201).json({ ...record, updatedBatchStatus: batch.status });
});

router.put('/review-records/:id', authenticate, requireReviewer, (req, res) => {
  const id = parseInt(req.params.id);
  const record = store.reviewRecords.find(r => r.id === id);
  if (!record) return res.status(404).json({ message: '复核记录不存在' });

  if (record.reviewerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: '只能修改自己创建的复核记录' });
  }

  const {
    retestDate, retestResult, appearanceStable,
    viscosityDeviation, odorNormal, riskLevel, releaseRecommendation, remarks
  } = req.body;

  if (retestResult && !RETEST_RESULTS.includes(retestResult)) {
    return res.status(400).json({ message: '复测结果无效' });
  }
  if (riskLevel && !RISK_LEVELS.includes(riskLevel)) {
    return res.status(400).json({ message: '风险等级无效' });
  }
  if (releaseRecommendation && !RELEASE_RECOMMENDATIONS.includes(releaseRecommendation)) {
    return res.status(400).json({ message: '放行建议无效' });
  }

  if (retestDate) record.retestDate = retestDate;
  if (retestResult) record.retestResult = retestResult;
  if (appearanceStable !== undefined) record.appearanceStable = appearanceStable;
  if (viscosityDeviation !== undefined) record.viscosityDeviation = viscosityDeviation !== '' ? parseFloat(viscosityDeviation) : null;
  if (odorNormal !== undefined) record.odorNormal = odorNormal;
  if (riskLevel) record.riskLevel = riskLevel;
  if (releaseRecommendation) record.releaseRecommendation = releaseRecommendation;
  if (remarks !== undefined) record.remarks = remarks;

  const batch = store.trialBatches.find(b => b.id === record.trialBatchId);
  if (batch) {
    const effResult = record.retestResult;
    const effRec = record.releaseRecommendation;
    if (effRec === '建议放大生产' && effResult === '通过') {
      batch.status = STATUS.READY_SCALEUP;
    } else if (effRec === '建议暂停' || effRec === '建议终止') {
      batch.status = STATUS.SUSPENDED;
    } else if (effRec === '需改进后继续' || effResult === '有条件通过') {
      batch.status = STATUS.PENDING_RETEST;
    } else if (batch.status === STATUS.ABNORMAL_FOLLOWUP) {
      batch.status = STATUS.OBSERVING;
    }
    batch.updatedAt = new Date().toISOString();
    res.json({ ...record, updatedBatchStatus: batch.status });
  } else {
    res.json(record);
  }
});

router.delete('/review-records/:id', authenticate, requireReviewer, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = store.reviewRecords.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ message: '复核记录不存在' });

  const record = store.reviewRecords[idx];
  if (record.reviewerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: '只能删除自己创建的复核记录' });
  }

  store.reviewRecords.splice(idx, 1);
  res.json({ message: '删除成功' });
});

router.get('/options', authenticate, (req, res) => {
  res.json({
    riskLevels: RISK_LEVELS,
    retestResults: RETEST_RESULTS,
    releaseRecommendations: RELEASE_RECOMMENDATIONS
  });
});

module.exports = router;
