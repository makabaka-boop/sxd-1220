const express = require('express');
const store = require('../data/store');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { STATUS, ABNORMAL_LEVELS, RETEST_PLAN_STATUS } = require('../config');
const { validateDuplicateTrialBatch } = require('../utils/validators');
const { filterTrialBatches, enrichTrialBatch, buildLifecycleTimeline, getPendingBatches, createRetestPlan, getRetestPlansByBatch, confirmRetestPlan, extendRetestPlan, completeRetestPlan, getRetestPlanCategoryStats } = require('../utils/analytics');

const router = express.Router();

const VALID_STATUSES = Object.values(STATUS);

router.get('/trial-batches', authenticate, (req, res) => {
  const results = filterTrialBatches(req.query);
  res.json({
    total: results.length,
    data: results
  });
});

router.get('/trial-batches/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const batch = store.trialBatches.find(b => b.id === id);
  if (!batch) return res.status(404).json({ message: '试制批号不存在' });
  
  const records = store.experimentRecords
    .filter(r => r.trialBatchId === id)
    .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));
  
  const reviews = store.reviewRecords
    .filter(r => r.trialBatchId === id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const lifecycleTimeline = buildLifecycleTimeline(id);

  res.json({
    ...enrichTrialBatch(batch),
    experimentRecords: records,
    reviewRecords: reviews,
    lifecycleTimeline
  });
});

router.post('/trial-batches', authenticate, (req, res) => {
  const {
    formulaId, batchNumber, rawMaterialBatchIds, packagingTypeId,
    observationConditionId, responsiblePersonId, retestCycleId,
    productionDate, status, remarks
  } = req.body;

  if (!formulaId || !batchNumber || !packagingTypeId || !observationConditionId || !responsiblePersonId || !retestCycleId) {
    return res.status(400).json({ message: '配方、试制批号、包材类型、观察条件、责任人、复测周期为必填项' });
  }

  const dupCheck = validateDuplicateTrialBatch(parseInt(formulaId), batchNumber);
  if (!dupCheck.valid) {
    return res.status(400).json({ message: dupCheck.message });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: '无效状态，可选值: ' + VALID_STATUSES.join(', ') });
  }

  const formula = store.formulas.find(f => f.id === parseInt(formulaId));
  const packaging = store.packagingTypes.find(p => p.id === parseInt(packagingTypeId));
  const condition = store.observationConditions.find(o => o.id === parseInt(observationConditionId));
  const responsible = store.responsiblePersons.find(r => r.id === parseInt(responsiblePersonId));
  const cycle = store.retestCycles.find(c => c.id === parseInt(retestCycleId));

  if (!formula) return res.status(400).json({ message: '配方不存在' });
  if (!packaging) return res.status(400).json({ message: '包材类型不存在' });
  if (!condition) return res.status(400).json({ message: '观察条件不存在' });
  if (!responsible) return res.status(400).json({ message: '责任人不存在' });
  if (!cycle) return res.status(400).json({ message: '复测周期不存在' });

  const now = new Date().toISOString();
  const batch = {
    id: store.nextId.trialBatch++,
    formulaId: parseInt(formulaId),
    formulaCode: formula.code,
    batchNumber,
    rawMaterialBatchIds: rawMaterialBatchIds || [],
    packagingTypeId: parseInt(packagingTypeId),
    packagingTypeName: packaging.name,
    observationConditionId: parseInt(observationConditionId),
    observationConditionName: condition.name,
    responsiblePersonId: parseInt(responsiblePersonId),
    responsiblePersonName: responsible.name,
    retestCycleId: parseInt(retestCycleId),
    retestCycleDays: cycle.intervalDays,
    productionDate: productionDate || new Date().toISOString().split('T')[0],
    status: status || STATUS.PENDING_PREP,
    remarks: remarks || '',
    createdBy: req.user.id,
    createdAt: now,
    updatedAt: now
  };

  store.trialBatches.push(batch);

  const creator = store.users.find(u => u.id === req.user.id);
  const retestPlan = createRetestPlan(
    batch, 
    'creation', 
    null, 
    batch.productionDate, 
    req.user.id, 
    creator ? creator.name : ''
  );

  res.status(201).json(enrichTrialBatch(batch));
});

router.put('/trial-batches/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const batch = store.trialBatches.find(b => b.id === id);
  if (!batch) return res.status(404).json({ message: '试制批号不存在' });

  const {
    formulaId, batchNumber, rawMaterialBatchIds, packagingTypeId,
    observationConditionId, responsiblePersonId, retestCycleId,
    productionDate, status, remarks
  } = req.body;

  if (formulaId || batchNumber) {
    const effectiveFormulaId = formulaId ? parseInt(formulaId) : batch.formulaId;
    const effectiveBatchNumber = batchNumber || batch.batchNumber;
    const dupCheck = validateDuplicateTrialBatch(effectiveFormulaId, effectiveBatchNumber, id);
    if (!dupCheck.valid) {
      return res.status(400).json({ message: dupCheck.message });
    }
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: '无效状态，可选值: ' + VALID_STATUSES.join(', ') });
  }

  if (formulaId) {
    const formula = store.formulas.find(f => f.id === parseInt(formulaId));
    if (!formula) return res.status(400).json({ message: '配方不存在' });
    batch.formulaId = parseInt(formulaId);
    batch.formulaCode = formula.code;
  }
  if (batchNumber) batch.batchNumber = batchNumber;
  if (rawMaterialBatchIds) batch.rawMaterialBatchIds = rawMaterialBatchIds;
  if (packagingTypeId) {
    const p = store.packagingTypes.find(x => x.id === parseInt(packagingTypeId));
    if (!p) return res.status(400).json({ message: '包材类型不存在' });
    batch.packagingTypeId = parseInt(packagingTypeId);
    batch.packagingTypeName = p.name;
  }
  if (observationConditionId) {
    const o = store.observationConditions.find(x => x.id === parseInt(observationConditionId));
    if (!o) return res.status(400).json({ message: '观察条件不存在' });
    batch.observationConditionId = parseInt(observationConditionId);
    batch.observationConditionName = o.name;
  }
  if (responsiblePersonId) {
    const r = store.responsiblePersons.find(x => x.id === parseInt(responsiblePersonId));
    if (!r) return res.status(400).json({ message: '责任人不存在' });
    batch.responsiblePersonId = parseInt(responsiblePersonId);
    batch.responsiblePersonName = r.name;
  }
  if (retestCycleId) {
    const c = store.retestCycles.find(x => x.id === parseInt(retestCycleId));
    if (!c) return res.status(400).json({ message: '复测周期不存在' });
    batch.retestCycleId = parseInt(retestCycleId);
    batch.retestCycleDays = c.intervalDays;
  }
  if (productionDate) batch.productionDate = productionDate;
  if (status) batch.status = status;
  if (remarks !== undefined) batch.remarks = remarks;
  
  batch.updatedAt = new Date().toISOString();
  res.json(enrichTrialBatch(batch));
});

router.patch('/trial-batches/:id/status', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const batch = store.trialBatches.find(b => b.id === id);
  if (!batch) return res.status(404).json({ message: '试制批号不存在' });

  const { status } = req.body;
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: '无效状态，可选值: ' + VALID_STATUSES.join(', ') });
  }

  batch.status = status;
  batch.updatedAt = new Date().toISOString();
  res.json({ id: batch.id, status: batch.status, updatedAt: batch.updatedAt });
});

router.delete('/trial-batches/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = store.trialBatches.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ message: '试制批号不存在' });
  
  store.experimentRecords = store.experimentRecords.filter(r => r.trialBatchId !== id);
  store.reviewRecords = store.reviewRecords.filter(r => r.trialBatchId !== id);
  store.trialBatches.splice(idx, 1);
  
  res.json({ message: '删除成功，已同步删除关联的实验记录和复核记录' });
});

router.get('/pending-batches', authenticate, (req, res) => {
  const result = getPendingBatches(req.query);
  res.json(result);
});

router.get('/statuses', authenticate, (req, res) => {
  res.json({
    statuses: VALID_STATUSES,
    abnormalLevels: ABNORMAL_LEVELS,
    retestPlanStatuses: Object.values(RETEST_PLAN_STATUS)
  });
});

router.get('/trial-batches/:id/retest-plans', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const batch = store.trialBatches.find(b => b.id === id);
  if (!batch) return res.status(404).json({ message: '试制批号不存在' });

  const plans = getRetestPlansByBatch(id);
  res.json({
    total: plans.length,
    data: plans
  });
});

router.post('/retest-plans/:planId/confirm', authenticate, (req, res) => {
  const planId = parseInt(req.params.planId);
  const { remarks } = req.body;

  const plan = store.retestPlans.find(p => p.id === planId);
  if (!plan) return res.status(404).json({ message: '复测计划不存在' });

  const batch = store.trialBatches.find(b => b.id === plan.trialBatchId);
  if (!batch) return res.status(404).json({ message: '关联的试制批号不存在' });

  const rp = store.responsiblePersons.find(r => r.id === batch.responsiblePersonId);
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && (!rp || rp.userId !== req.user.id)) {
    return res.status(403).json({ message: '权限不足，只有该批次责任人或管理员可确认复测计划' });
  }

  const handler = store.users.find(u => u.id === req.user.id);
  const result = confirmRetestPlan(
    planId, 
    req.user.id, 
    handler ? handler.name : '',
    remarks || ''
  );

  if (!result.success) {
    return res.status(400).json({ message: result.message });
  }

  res.json(result.data);
});

router.post('/retest-plans/:planId/extend', authenticate, (req, res) => {
  const planId = parseInt(req.params.planId);
  const { newPlanDate, extensionReason, remarks } = req.body;

  if (!newPlanDate) {
    return res.status(400).json({ message: '新的计划日期不能为空' });
  }
  if (!extensionReason || extensionReason.trim() === '') {
    return res.status(400).json({ message: '延期原因不能为空' });
  }

  const plan = store.retestPlans.find(p => p.id === planId);
  if (!plan) return res.status(404).json({ message: '复测计划不存在' });

  const batch = store.trialBatches.find(b => b.id === plan.trialBatchId);
  if (!batch) return res.status(404).json({ message: '关联的试制批号不存在' });

  const rp = store.responsiblePersons.find(r => r.id === batch.responsiblePersonId);
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && (!rp || rp.userId !== req.user.id)) {
    return res.status(403).json({ message: '权限不足，只有该批次责任人或管理员可延期复测计划' });
  }

  const handler = store.users.find(u => u.id === req.user.id);
  const result = extendRetestPlan(
    planId,
    newPlanDate,
    extensionReason,
    req.user.id,
    handler ? handler.name : '',
    remarks || ''
  );

  if (!result.success) {
    return res.status(400).json({ message: result.message });
  }

  res.json(result.data);
});

router.get('/retest-plan-stats', authenticate, (req, res) => {
  const stats = getRetestPlanCategoryStats();
  res.json(stats);
});

module.exports = router;
