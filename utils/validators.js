const store = require('../data/store');
const { STATUS, ABNORMAL_LEVELS } = require('../config');

function validateDuplicateTrialBatch(formulaId, batchNumber, excludeId = null) {
  const exists = store.trialBatches.find(b => 
    b.formulaId === formulaId && 
    b.batchNumber === batchNumber &&
    (excludeId === null || b.id !== excludeId)
  );
  if (exists) {
    return { valid: false, message: `同一配方(${exists.formulaCode})的试制批号(${batchNumber})已存在，不可重复建档` };
  }
  return { valid: true };
}

function detectPackagingAbnormalCluster() {
  const packagingRecords = {};
  const abnormalLevels = ['中等', '严重', '致命'];

  store.experimentRecords.forEach(rec => {
    const batch = store.trialBatches.find(b => b.id === rec.trialBatchId);
    if (!batch || !abnormalLevels.includes(rec.abnormalLevel)) return;
    const pkgId = batch.packagingTypeId;
    if (!packagingRecords[pkgId]) {
      packagingRecords[pkgId] = {
        packagingTypeId: pkgId,
        packagingTypeName: batch.packagingTypeName,
        abnormalBatchCount: 0,
        abnormalRecordCount: 0,
        totalBatchCount: 0,
        abnormalBatches: []
      };
    }
    packagingRecords[pkgId].abnormalRecordCount++;
    if (!packagingRecords[pkgId].abnormalBatches.some(b => b.batchNumber === batch.batchNumber)) {
      packagingRecords[pkgId].abnormalBatches.push({
        batchNumber: batch.batchNumber,
        formulaCode: batch.formulaCode,
        abnormalLevel: rec.abnormalLevel
      });
    }
  });

  store.trialBatches.forEach(batch => {
    const pkgId = batch.packagingTypeId;
    if (packagingRecords[pkgId]) {
      packagingRecords[pkgId].totalBatchCount++;
    }
  });

  const highRisk = Object.values(packagingRecords)
    .map(p => {
      p.abnormalBatchCount = p.abnormalBatches.length;
      return p;
    })
    .filter(p => p.abnormalBatchCount >= 2 || (p.totalBatchCount > 0 && p.abnormalBatchCount / p.totalBatchCount >= 0.3))
    .map(p => ({
      ...p,
      riskRate: p.totalBatchCount > 0 ? (p.abnormalBatchCount / p.totalBatchCount * 100).toFixed(1) + '%' : 'N/A'
    }))
    .sort((a, b) => b.abnormalBatchCount - a.abnormalBatchCount);

  return {
    detected: highRisk.length > 0,
    highRiskPackaging: highRisk,
    warning: highRisk.length > 0 
      ? `发现${highRisk.length}种包材存在异常集中情况，请关注包材相容性` 
      : '未发现包材异常集中'
  };
}

function detectRetestOverdue() {
  const overdueList = [];
  const now = new Date();

  store.trialBatches.forEach(batch => {
    if (batch.status === STATUS.SUSPENDED || batch.status === STATUS.READY_SCALEUP) return;
    
    const cycle = store.retestCycles.find(c => c.id === batch.retestCycleId);
    if (!cycle) return;

    const records = store.experimentRecords
      .filter(r => r.trialBatchId === batch.id)
      .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));

    if (records.length === 0 && batch.productionDate) {
      const prodDate = new Date(batch.productionDate);
      const daysSinceProd = Math.floor((now - prodDate) / (1000 * 60 * 60 * 24));
      if (daysSinceProd > cycle.intervalDays) {
        overdueList.push({
          trialBatchId: batch.id,
          batchNumber: batch.batchNumber,
          formulaCode: batch.formulaCode,
          lastRecordDate: batch.productionDate,
          intervalDays: cycle.intervalDays,
          overdueDays: daysSinceProd - cycle.intervalDays,
          status: batch.status
        });
      }
      return;
    }

    if (records.length > 0) {
      const lastRecord = records[0];
      const lastDate = new Date(lastRecord.recordDate);
      const daysSinceLast = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      if (daysSinceLast > cycle.intervalDays) {
        overdueList.push({
          trialBatchId: batch.id,
          batchNumber: batch.batchNumber,
          formulaCode: batch.formulaCode,
          lastRecordDate: lastRecord.recordDate,
          intervalDays: cycle.intervalDays,
          overdueDays: daysSinceLast - cycle.intervalDays,
          status: batch.status
        });
      }
    }
  });

  return {
    detected: overdueList.length > 0,
    overdueBatches: overdueList,
    warning: overdueList.length > 0
      ? `发现${overdueList.length}个批号复测超期，请尽快安排检测`
      : '暂无复测超期批号'
  };
}

function detectMissingKeyReadings() {
  const missingList = [];

  store.experimentRecords.forEach(rec => {
    const batch = store.trialBatches.find(b => b.id === rec.trialBatchId);
    if (!batch) return;

    const missing = [];
    if (rec.samplePrepared === false) {
      if (rec.viscosity === null || rec.viscosity === undefined || rec.viscosity === '') {
        missing.push('黏度读数');
      }
      if (!rec.appearance || rec.appearance.trim() === '') {
        missing.push('外观记录');
      }
      if (!rec.odor || rec.odor.trim() === '') {
        missing.push('气味备注');
      }
      if (!rec.packagingCompatibility || rec.packagingCompatibility.trim() === '') {
        missing.push('包材相容性');
      }
    }

    if (missing.length > 0) {
      missingList.push({
        recordId: rec.id,
        trialBatchId: batch.id,
        batchNumber: batch.batchNumber,
        formulaCode: batch.formulaCode,
        recordDate: rec.recordDate,
        missingFields: missing
      });
    }
  });

  return {
    detected: missingList.length > 0,
    missingRecords: missingList,
    warning: missingList.length > 0
      ? `发现${missingList.length}条记录存在关键读数缺失`
      : '所有记录关键读数完整'
  };
}

function detectAbnormalWithoutConclusion() {
  const pendingList = [];
  const seriousLevels = ['中等', '严重', '致命'];

  store.trialBatches.forEach(batch => {
    const hasSeriousAbnormal = store.experimentRecords.some(r => 
      r.trialBatchId === batch.id && seriousLevels.includes(r.abnormalLevel)
    );
    if (!hasSeriousAbnormal) return;

    const hasReview = store.reviewRecords.some(r => r.trialBatchId === batch.id);
    
    if (!hasReview && batch.status !== STATUS.READY_SCALEUP && batch.status !== STATUS.SUSPENDED) {
      const abnormalRecords = store.experimentRecords
        .filter(r => r.trialBatchId === batch.id && seriousLevels.includes(r.abnormalLevel))
        .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));

      const latest = abnormalRecords[0];
      const daysSinceAbnormal = Math.floor((new Date() - new Date(latest.recordDate)) / (1000 * 60 * 60 * 24));

      pendingList.push({
        trialBatchId: batch.id,
        batchNumber: batch.batchNumber,
        formulaCode: batch.formulaCode,
        latestAbnormalDate: latest.recordDate,
        latestAbnormalLevel: latest.abnormalLevel,
        suggestedAction: latest.suggestedAction,
        daysSinceAbnormal,
        status: batch.status
      });
    }
  });

  return {
    detected: pendingList.length > 0,
    pendingConclusion: pendingList,
    warning: pendingList.length > 0
      ? `发现${pendingList.length}个异常批号无复核结论`
      : '所有异常批号均有结论'
  };
}

function detectResponsibleBacklog() {
  const backlog = {};

  store.trialBatches.forEach(batch => {
    if (batch.status === STATUS.SUSPENDED || batch.status === STATUS.READY_SCALEUP) return;
    
    const rpId = batch.responsiblePersonId;
    if (!rpId) return;

    if (!backlog[rpId]) {
      backlog[rpId] = {
        responsiblePersonId: rpId,
        responsiblePersonName: batch.responsiblePersonName,
        totalBatches: 0,
        pendingRetest: 0,
        abnormalFollowup: 0,
        pendingPrep: 0,
        batches: []
      };
    }

    backlog[rpId].totalBatches++;
    backlog[rpId].batches.push({ batchNumber: batch.batchNumber, status: batch.status });

    if (batch.status === STATUS.PENDING_RETEST) backlog[rpId].pendingRetest++;
    if (batch.status === STATUS.ABNORMAL_FOLLOWUP) backlog[rpId].abnormalFollowup++;
    if (batch.status === STATUS.PENDING_PREP) backlog[rpId].pendingPrep++;
  });

  const highBacklog = Object.values(backlog)
    .filter(b => b.totalBatches >= 3 || b.abnormalFollowup >= 1 || b.pendingRetest >= 2)
    .map(b => ({
      ...b,
      urgencyLevel: (b.abnormalFollowup * 3 + b.pendingRetest * 2 + b.pendingPrep)
    }))
    .sort((a, b) => b.urgencyLevel - a.urgencyLevel);

  return {
    detected: highBacklog.length > 0,
    backlogResponsibles: highBacklog,
    warning: highBacklog.length > 0
      ? `发现${highBacklog.length}位责任人存在任务积压`
      : '所有责任人均无明显任务积压'
  };
}

function runAllValidations() {
  return {
    duplicateBatch: { valid: true, message: '重复建档校验在创建时执行' },
    packagingAbnormalCluster: detectPackagingAbnormalCluster(),
    retestOverdue: detectRetestOverdue(),
    missingKeyReadings: detectMissingKeyReadings(),
    abnormalWithoutConclusion: detectAbnormalWithoutConclusion(),
    responsibleBacklog: detectResponsibleBacklog(),
    runAt: new Date().toISOString()
  };
}

module.exports = {
  validateDuplicateTrialBatch,
  detectPackagingAbnormalCluster,
  detectRetestOverdue,
  detectMissingKeyReadings,
  detectAbnormalWithoutConclusion,
  detectResponsibleBacklog,
  runAllValidations
};
