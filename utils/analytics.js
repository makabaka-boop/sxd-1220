const store = require('../data/store');
const { STATUS } = require('../config');

function filterTrialBatches(filters = {}) {
  let results = [...store.trialBatches];

  if (filters.formulaId) {
    results = results.filter(b => b.formulaId === parseInt(filters.formulaId));
  }
  if (filters.formulaCode) {
    results = results.filter(b => b.formulaCode.includes(filters.formulaCode));
  }
  if (filters.rawMaterialBatchId) {
    const rmId = parseInt(filters.rawMaterialBatchId);
    results = results.filter(b => b.rawMaterialBatchIds && b.rawMaterialBatchIds.includes(rmId));
  }
  if (filters.packagingTypeId) {
    results = results.filter(b => b.packagingTypeId === parseInt(filters.packagingTypeId));
  }
  if (filters.responsiblePersonId) {
    results = results.filter(b => b.responsiblePersonId === parseInt(filters.responsiblePersonId));
  }
  if (filters.status) {
    results = results.filter(b => b.status === filters.status);
  }
  if (filters.abnormalLevel) {
    const batchIds = store.experimentRecords
      .filter(r => r.abnormalLevel === filters.abnormalLevel)
      .map(r => r.trialBatchId);
    results = results.filter(b => batchIds.includes(b.id));
  }
  if (filters.startDate) {
    results = results.filter(b => b.productionDate >= filters.startDate);
  }
  if (filters.endDate) {
    results = results.filter(b => b.productionDate <= filters.endDate);
  }
  if (filters.observationConditionId) {
    results = results.filter(b => b.observationConditionId === parseInt(filters.observationConditionId));
  }

  return results.map(b => enrichTrialBatch(b));
}

function enrichTrialBatch(batch) {
  const records = store.experimentRecords
    .filter(r => r.trialBatchId === batch.id)
    .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));
  
  const reviews = store.reviewRecords.filter(r => r.trialBatchId === batch.id);
  
  const latestAbnormal = records.find(r => ['中等', '严重', '致命'].includes(r.abnormalLevel));

  return {
    ...batch,
    experimentRecordCount: records.length,
    latestRecord: records[0] || null,
    reviewRecordCount: reviews.length,
    latestReview: reviews[reviews.length - 1] || null,
    latestAbnormalLevel: latestAbnormal ? latestAbnormal.abnormalLevel : null
  };
}

function getHighRiskPackaging() {
  const packagingStats = {};
  const abnormalLevels = ['中等', '严重', '致命'];

  store.trialBatches.forEach(batch => {
    const pkgId = batch.packagingTypeId;
    if (!packagingStats[pkgId]) {
      packagingStats[pkgId] = {
        packagingTypeId: pkgId,
        packagingTypeName: batch.packagingTypeName,
        packagingTypeCode: null,
        material: null,
        totalBatches: 0,
        abnormalBatches: 0,
        totalRecords: 0,
        abnormalRecords: 0,
        abnormalDetails: [],
        affectedFormulas: new Set()
      };
    }
    packagingStats[pkgId].totalBatches++;

    const pkg = store.packagingTypes.find(p => p.id === pkgId);
    if (pkg) {
      packagingStats[pkgId].packagingTypeCode = pkg.code;
      packagingStats[pkgId].material = pkg.material;
    }
  });

  store.experimentRecords.forEach(rec => {
    const batch = store.trialBatches.find(b => b.id === rec.trialBatchId);
    if (!batch) return;
    const pkgId = batch.packagingTypeId;
    if (!packagingStats[pkgId]) return;

    packagingStats[pkgId].totalRecords++;
    packagingStats[pkgId].affectedFormulas.add(batch.formulaCode);

    if (abnormalLevels.includes(rec.abnormalLevel)) {
      packagingStats[pkgId].abnormalRecords++;
      if (!packagingStats[pkgId].abnormalDetails.some(d => d.batchNumber === batch.batchNumber)) {
        packagingStats[pkgId].abnormalBatches++;
      }
      packagingStats[pkgId].abnormalDetails.push({
        batchNumber: batch.batchNumber,
        formulaCode: batch.formulaCode,
        recordDate: rec.recordDate,
        abnormalLevel: rec.abnormalLevel,
        appearance: rec.appearance,
        odor: rec.odor,
        packagingCompatibility: rec.packagingCompatibility
      });
    }
  });

  return Object.values(packagingStats)
    .map(p => ({
      ...p,
      affectedFormulas: Array.from(p.affectedFormulas),
      batchAbnormalRate: p.totalBatches > 0 ? (p.abnormalBatches / p.totalBatches * 100).toFixed(1) + '%' : '0%',
      riskScore: p.abnormalBatches * 10 + p.abnormalRecords
    }))
    .filter(p => p.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore);
}

function getPendingRetestBatches() {
  const now = new Date();
  const pending = [];

  store.trialBatches.forEach(batch => {
    if (batch.status === STATUS.SUSPENDED || batch.status === STATUS.READY_SCALEUP) return;

    const cycle = store.retestCycles.find(c => c.id === batch.retestCycleId);
    const records = store.experimentRecords
      .filter(r => r.trialBatchId === batch.id)
      .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));

    let lastDate, lastType;
    if (records.length > 0) {
      lastDate = new Date(records[0].recordDate);
      lastType = '最近检测';
    } else if (batch.productionDate) {
      lastDate = new Date(batch.productionDate);
      lastType = '生产日期';
    } else {
      return;
    }

    if (!cycle) return;

    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + cycle.intervalDays);
    
    const daysUntilDue = Math.ceil((nextDate - now) / (1000 * 60 * 60 * 24));
    const isOverdue = daysUntilDue < 0;
    const isUrgent = daysUntilDue <= 3 && !isOverdue;

    if (isOverdue || isUrgent || batch.status === STATUS.PENDING_RETEST) {
      pending.push({
        trialBatchId: batch.id,
        batchNumber: batch.batchNumber,
        formulaCode: batch.formulaCode,
        packagingTypeName: batch.packagingTypeName,
        observationConditionName: batch.observationConditionName,
        responsiblePersonName: batch.responsiblePersonName,
        status: batch.status,
        retestCycleName: cycle.name,
        intervalDays: cycle.intervalDays,
        lastRecordDate: lastDate.toISOString().split('T')[0],
        lastRecordType: lastType,
        scheduledRetestDate: nextDate.toISOString().split('T')[0],
        daysUntilDue,
        isOverdue,
        isUrgent,
        overdueDays: isOverdue ? Math.abs(daysUntilDue) : 0,
        latestRecord: records[0] || null
      });
    }
  });

  return pending.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

function getStabilityTrend(groupBy = 'formula') {
  const trendData = {};

  store.experimentRecords.forEach(rec => {
    const batch = store.trialBatches.find(b => b.id === rec.trialBatchId);
    if (!batch) return;

    let key, label;
    if (groupBy === 'formula') {
      key = batch.formulaId;
      label = batch.formulaCode;
    } else if (groupBy === 'packaging') {
      key = batch.packagingTypeId;
      label = batch.packagingTypeName;
    } else if (groupBy === 'condition') {
      key = batch.observationConditionId;
      label = batch.observationConditionName;
    } else {
      key = batch.responsiblePersonId;
      label = batch.responsiblePersonName;
    }

    if (!key) return;

    if (!trendData[key]) {
      trendData[key] = {
        groupKey: key,
        groupLabel: label,
        totalRecords: 0,
        normalCount: 0,
        mildCount: 0,
        mediumCount: 0,
        seriousCount: 0,
        fatalCount: 0,
        byDate: {},
        batchNumbers: new Set(),
        viscosityTrend: []
      };
    }

    trendData[key].totalRecords++;
    trendData[key].batchNumbers.add(batch.batchNumber);
    
    const dateKey = rec.recordDate;
    if (!trendData[key].byDate[dateKey]) {
      trendData[key].byDate[dateKey] = { normal: 0, abnormal: 0 };
    }

    switch (rec.abnormalLevel) {
      case '正常':
        trendData[key].normalCount++;
        trendData[key].byDate[dateKey].normal++;
        break;
      case '轻微':
        trendData[key].mildCount++;
        trendData[key].byDate[dateKey].abnormal++;
        break;
      case '中等':
        trendData[key].mediumCount++;
        trendData[key].byDate[dateKey].abnormal++;
        break;
      case '严重':
        trendData[key].seriousCount++;
        trendData[key].byDate[dateKey].abnormal++;
        break;
      case '致命':
        trendData[key].fatalCount++;
        trendData[key].byDate[dateKey].abnormal++;
        break;
    }

    if (rec.viscosity !== null && rec.viscosity !== undefined) {
      trendData[key].viscosityTrend.push({
        date: rec.recordDate,
        batchNumber: batch.batchNumber,
        viscosity: rec.viscosity
      });
    }
  });

  return Object.values(trendData).map(t => {
    const abnormalCount = t.mediumCount + t.seriousCount + t.fatalCount;
    const totalAbnormal = t.mildCount + abnormalCount;
    const stabilityRate = t.totalRecords > 0 
      ? (t.normalCount / t.totalRecords * 100).toFixed(1) + '%' 
      : '0%';
    const seriousRate = abnormalCount > 0 
      ? (abnormalCount / t.totalRecords * 100).toFixed(1) + '%' 
      : '0%';

    const timeline = Object.entries(t.byDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        normal: data.normal,
        abnormal: data.abnormal,
        total: data.normal + data.abnormal
      }));

    return {
      groupKey: t.groupKey,
      groupLabel: t.groupLabel,
      totalRecords: t.totalRecords,
      affectedBatches: t.batchNumbers.size,
      stabilityRate,
      seriousAbnormalRate: seriousRate,
      levelBreakdown: {
        normal: t.normalCount,
        mild: t.mildCount,
        medium: t.mediumCount,
        serious: t.seriousCount,
        fatal: t.fatalCount
      },
      timeline,
      viscosityTrend: t.viscosityTrend.sort((a, b) => a.date.localeCompare(b.date))
    };
  }).sort((a, b) => parseFloat(a.stabilityRate) - parseFloat(b.stabilityRate));
}

function generateExportData(type = 'full') {
  const exportData = {
    exportedAt: new Date().toISOString(),
    type,
    baseConfigurations: {
      users: store.users.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name, createdAt: u.createdAt })),
      formulas: store.formulas,
      rawMaterialBatches: store.rawMaterialBatches,
      packagingTypes: store.packagingTypes,
      observationConditions: store.observationConditions,
      responsiblePersons: store.responsiblePersons,
      retestCycles: store.retestCycles
    },
    trialBatches: store.trialBatches.map(b => ({
      ...b,
      records: store.experimentRecords.filter(r => r.trialBatchId === b.id),
      reviews: store.reviewRecords.filter(r => r.trialBatchId === b.id)
    })),
    analysis: {
      highRiskPackaging: getHighRiskPackaging(),
      pendingRetestBatches: getPendingRetestBatches(),
      stabilityTrendByFormula: getStabilityTrend('formula'),
      stabilityTrendByPackaging: getStabilityTrend('packaging')
    }
  };

  return exportData;
}

module.exports = {
  filterTrialBatches,
  enrichTrialBatch,
  getHighRiskPackaging,
  getPendingRetestBatches,
  getStabilityTrend,
  generateExportData
};
