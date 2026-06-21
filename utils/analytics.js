const store = require('../data/store');
const { STATUS } = require('../config');

const SERIOUS_ABNORMAL_LEVELS = ['中等', '严重', '致命'];
const CONCLUSIVE_RETEST_RESULTS = ['通过', '有条件通过', '不通过'];

function isAbnormalRecordResolved(abnormalRecord, reviews) {
  if (!abnormalRecord || !SERIOUS_ABNORMAL_LEVELS.includes(abnormalRecord.abnormalLevel)) {
    return true;
  }
  const abnormalDate = new Date(abnormalRecord.recordDate);
  return reviews.some(r => {
    if (!CONCLUSIVE_RETEST_RESULTS.includes(r.retestResult)) return false;
    const reviewDate = new Date(r.retestDate || r.createdAt);
    return reviewDate >= abnormalDate;
  });
}

function findUnreviewedAbnormals(records, reviews) {
  const seriousRecords = records
    .filter(r => SERIOUS_ABNORMAL_LEVELS.includes(r.abnormalLevel))
    .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));
  return seriousRecords.filter(rec => !isAbnormalRecordResolved(rec, reviews));
}

function hasUnresolvedAbnormal(records, reviews) {
  return findUnreviewedAbnormals(records, reviews).length > 0;
}

function buildStatusHistory(batch, records, reviews) {
  const history = [];
  history.push({
    date: (batch.createdAt || batch.productionDate || '').split('T')[0],
    from: null,
    to: batch.status,
    reason: '批次建档，初始状态',
    eventType: 'creation'
  });

  const events = [];
  records.forEach(r => {
    events.push({
      date: new Date(r.recordDate),
      type: 'experiment',
      ref: r,
      rawRecordDate: r.recordDate
    });
  });
  reviews.forEach(r => {
    events.push({
      date: new Date(r.retestDate || r.createdAt),
      type: 'review',
      ref: r,
      rawRecordDate: r.retestDate || r.createdAt
    });
  });
  events.sort((a, b) => a.date - b.date);

  let currentStatus = history[0].to;

  events.forEach(evt => {
    let newStatus = currentStatus;
    let reason = '';

    if (evt.type === 'experiment') {
      const r = evt.ref;
      if (SERIOUS_ABNORMAL_LEVELS.includes(r.abnormalLevel)) {
        newStatus = STATUS.ABNORMAL_FOLLOWUP;
        reason = `实验检测到${r.abnormalLevel}异常，进入异常跟进`;
      } else if (currentStatus === STATUS.PENDING_PREP && r.samplePrepared === true) {
        newStatus = STATUS.OBSERVING;
        reason = '首次样品制备完成，进入观察阶段';
      } else if (currentStatus === STATUS.PENDING_RETEST) {
        newStatus = STATUS.OBSERVING;
        reason = '复测完成，返回观察阶段';
      }
    } else if (evt.type === 'review') {
      const r = evt.ref;
      if (!CONCLUSIVE_RETEST_RESULTS.includes(r.retestResult)) {
        reason = `复核记录(${r.retestResult})暂未给出明确结论，状态保持`;
      } else if (r.releaseRecommendation === '建议放大生产' && r.retestResult === '通过') {
        newStatus = STATUS.READY_SCALEUP;
        reason = '复核通过，建议放大生产';
      } else if (r.releaseRecommendation === '建议暂停' || r.releaseRecommendation === '建议终止') {
        newStatus = STATUS.SUSPENDED;
        reason = `复核建议${r.releaseRecommendation === '建议暂停' ? '暂停' : '终止'}`;
      } else if (r.releaseRecommendation === '需改进后继续' || r.retestResult === '有条件通过') {
        newStatus = STATUS.PENDING_RETEST;
        reason = `复核结论：${r.releaseRecommendation}，需复测`;
      } else if (currentStatus === STATUS.ABNORMAL_FOLLOWUP) {
        newStatus = STATUS.OBSERVING;
        reason = '异常复核完成，返回观察阶段';
      }
    }

    if (newStatus !== currentStatus) {
      history.push({
        date: evt.rawRecordDate,
        from: currentStatus,
        to: newStatus,
        reason: reason || (evt.type === 'experiment' ? '实验记录提交' : '复核记录提交'),
        eventType: evt.type,
        relatedRecordId: evt.ref.id
      });
      currentStatus = newStatus;
    } else if (reason && history[history.length - 1].reason !== reason) {
      history.push({
        date: evt.rawRecordDate,
        from: currentStatus,
        to: currentStatus,
        reason,
        eventType: evt.type,
        note: '状态未变',
        relatedRecordId: evt.ref.id
      });
    }
  });

  if (history[history.length - 1].to !== batch.status) {
    history.push({
      date: (batch.updatedAt || '').split('T')[0] || new Date().toISOString().split('T')[0],
      from: history[history.length - 1].to,
      to: batch.status,
      reason: '状态被手动调整',
      eventType: 'manual'
    });
  }

  return history;
}

function calculateNextRetestDate(batch, records) {
  const cycle = store.retestCycles.find(c => c.id === batch.retestCycleId);
  if (!cycle) return null;

  let baseDate;
  if (records && records.length > 0) {
    baseDate = new Date(records[0].recordDate);
  } else if (batch.productionDate) {
    baseDate = new Date(batch.productionDate);
  } else {
    return null;
  }

  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + cycle.intervalDays);
  return nextDate.toISOString().split('T')[0];
}

function calculateRetestStatus(batch, records) {
  const now = new Date();
  const nextDateStr = calculateNextRetestDate(batch, records);
  if (!nextDateStr) return { isOverdue: false, isUrgent: false, daysUntilDue: null, overdueDays: 0 };

  const nextDate = new Date(nextDateStr);
  const daysUntilDue = Math.ceil((nextDate - now) / (1000 * 60 * 60 * 24));
  const isOverdue = daysUntilDue < 0;
  const isUrgent = daysUntilDue <= 3 && !isOverdue;

  return {
    isOverdue,
    isUrgent,
    daysUntilDue,
    overdueDays: isOverdue ? Math.abs(daysUntilDue) : 0
  };
}

function determineCurrentAction(batch, records, reviews, retestStatus) {
  if (batch.status === STATUS.SUSPENDED) {
    return { action: '已暂停', priority: 'low', description: '该批次已暂停观察，无需处理' };
  }
  if (batch.status === STATUS.READY_SCALEUP) {
    return { action: '可放大生产', priority: 'low', description: '该批次稳定性验证通过，可进入放大生产阶段' };
  }

  const unreviewedAbnormals = findUnreviewedAbnormals(records, reviews);
  const unresolvedCount = unreviewedAbnormals.length;

  if (batch.status === STATUS.ABNORMAL_FOLLOWUP || unresolvedCount > 0) {
    const highestLevel = unreviewedAbnormals.length > 0
      ? unreviewedAbnormals[0].abnormalLevel
      : '未确认';
    return { 
      action: '异常跟进，待复核', 
      priority: 'high', 
      description: `存在${unresolvedCount}条${highestLevel}异常未闭环，需复核员给出明确结论(通过/有条件通过/不通过)` 
    };
  }

  if (batch.status === STATUS.PENDING_PREP) {
    return { action: '待制样', priority: 'medium', description: '批次已建档，待实验员制备样品并开始首次观察' };
  }

  if (retestStatus.isOverdue) {
    return { 
      action: '复测超期，请尽快检测', 
      priority: 'high', 
      description: `已超期${retestStatus.overdueDays}天，请立即安排复测` 
    };
  }

  if (retestStatus.isUrgent) {
    return { 
      action: '临近复测，准备检测', 
      priority: 'medium', 
      description: `还有${retestStatus.daysUntilDue}天到复测日期，请提前准备样品` 
    };
  }

  if (batch.status === STATUS.PENDING_RETEST) {
    return { action: '待复测', priority: 'medium', description: '按计划需进行复测，请安排检测' };
  }

  return { action: '观察中', priority: 'low', description: '批次处于正常观察周期内，定期跟踪即可' };
}

function assessRiskLevel(batch, records, reviews, retestStatus) {
  let riskScore = 0;
  const riskFactors = [];

  const unreviewedAbnormals = findUnreviewedAbnormals(records, reviews);
  if (unreviewedAbnormals.length > 0) {
    const levelScores = { '中等': 2, '严重': 3, '致命': 5 };
    const maxScore = unreviewedAbnormals.reduce((max, r) => {
      return Math.max(max, levelScores[r.abnormalLevel] || 0);
    }, 0);
    riskScore += maxScore;
    const levels = [...new Set(unreviewedAbnormals.map(r => r.abnormalLevel))].join('、');
    riskFactors.push(`未闭环异常(${unreviewedAbnormals.length}条): ${levels}`);
    riskScore += 2;
    riskFactors.push('异常未闭环');
  }

  if (retestStatus.isOverdue) {
    riskScore += Math.min(3, Math.floor(retestStatus.overdueDays / 7) + 1);
    riskFactors.push(`复测超期${retestStatus.overdueDays}天`);
  } else if (retestStatus.isUrgent) {
    riskScore += 1;
    riskFactors.push('临近复测日期');
  }

  if (batch.status === STATUS.ABNORMAL_FOLLOWUP && unreviewedAbnormals.length === 0) {
    riskScore += 1;
    riskFactors.push('异常跟进状态(待复核记录补充)');
  }

  let riskLevel;
  if (riskScore >= 6) riskLevel = '极高风险';
  else if (riskScore >= 4) riskLevel = '高风险';
  else if (riskScore >= 2) riskLevel = '中风险';
  else riskLevel = '低风险';

  return {
    riskLevel,
    riskScore,
    riskFactors
  };
}

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
  
  const reviews = store.reviewRecords
    .filter(r => r.trialBatchId === batch.id)
    .sort((a, b) => new Date(b.retestDate || b.createdAt) - new Date(a.retestDate || a.createdAt));
  
  const unresolvedAbnormals = findUnreviewedAbnormals(records, reviews);
  const latestAbnormal = records.find(r => SERIOUS_ABNORMAL_LEVELS.includes(r.abnormalLevel));
  const nextRetestDate = calculateNextRetestDate(batch, records);
  const retestStatus = calculateRetestStatus(batch, records);
  const currentAction = determineCurrentAction(batch, records, reviews, retestStatus);
  const riskAssessment = assessRiskLevel(batch, records, reviews, retestStatus);
  const statusHistory = buildStatusHistory(batch, records, reviews);
  const retestPlanInfo = enrichTrialBatchWithRetestPlan(batch);

  const cycle = store.retestCycles.find(c => c.id === batch.retestCycleId);

  return {
    ...batch,
    experimentRecordCount: records.length,
    latestRecord: records[0] || null,
    reviewRecordCount: reviews.length,
    latestReview: reviews[0] || null,
    latestAbnormalLevel: latestAbnormal ? latestAbnormal.abnormalLevel : null,
    unresolvedAbnormalCount: unresolvedAbnormals.length,
    unresolvedAbnormals,
    statusHistory,
    nextRetestDate,
    retestStatus,
    currentAction,
    riskAssessment,
    retestCycleName: cycle ? cycle.name : null,
    retestPlan: retestPlanInfo.retestPlan,
    retestPlanHistory: retestPlanInfo.retestPlanHistory,
    retestPlanCount: retestPlanInfo.retestPlanCount
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

function buildLifecycleTimeline(batchId) {
  const batch = store.trialBatches.find(b => b.id === batchId);
  if (!batch) return [];

  const timeline = [];

  const records = store.experimentRecords
    .filter(r => r.trialBatchId === batchId)
    .sort((a, b) => new Date(a.recordDate) - new Date(b.recordDate));

  const reviews = store.reviewRecords
    .filter(r => r.trialBatchId === batchId)
    .sort((a, b) => new Date(a.retestDate || a.createdAt) - new Date(b.retestDate || b.createdAt));

  timeline.push({
    type: 'creation',
    title: '批次建档',
    date: batch.createdAt ? batch.createdAt.split('T')[0] : batch.productionDate,
    description: `试制批号 ${batch.batchNumber} 建档完成，初始状态: ${batch.status}`,
    details: {
      formulaCode: batch.formulaCode,
      packagingTypeName: batch.packagingTypeName,
      observationConditionName: batch.observationConditionName,
      responsiblePersonName: batch.responsiblePersonName,
      productionDate: batch.productionDate,
      initialStatus: batch.status
    },
    status: 'completed'
  });

  records.forEach((rec, idx) => {
    const isInitial = idx === 0;
    timeline.push({
      type: 'experiment',
      title: isInitial ? '首次观察记录' : '复测/观察记录',
      date: rec.recordDate,
      description: `${rec.experimenterName} 提交实验记录，异常等级: ${rec.abnormalLevel}`,
      details: {
        recordId: rec.id,
        abnormalLevel: rec.abnormalLevel,
        suggestedAction: rec.suggestedAction,
        appearance: rec.appearance,
        viscosity: rec.viscosity,
        pH: rec.pH,
        samplePrepared: rec.samplePrepared,
        experimenterName: rec.experimenterName
      },
      status: 'completed'
    });

    if (SERIOUS_ABNORMAL_LEVELS.includes(rec.abnormalLevel)) {
      const resolved = isAbnormalRecordResolved(rec, reviews);
      const resolvingReview = reviews.find(r => {
        if (!CONCLUSIVE_RETEST_RESULTS.includes(r.retestResult)) return false;
        return new Date(r.retestDate || r.createdAt) >= new Date(rec.recordDate);
      });
      timeline.push({
        type: 'abnormal',
        title: resolved ? `异常已闭环(${rec.abnormalLevel})` : `异常待处理(${rec.abnormalLevel})`,
        date: rec.recordDate,
        description: resolved 
          ? `检测到${rec.abnormalLevel}异常，已被${resolvingReview ? resolvingReview.reviewerName : '复核'}闭环处理`
          : `检测到${rec.abnormalLevel}异常: ${rec.suggestedAction || '需复核员给出明确结论(通过/有条件通过/不通过)'}`,
        details: {
          abnormalLevel: rec.abnormalLevel,
          relatedRecordId: rec.id,
          suggestedAction: rec.suggestedAction,
          resolved,
          resolvedBy: resolvingReview ? resolvingReview.reviewerName : null,
          resolvedAt: resolvingReview ? (resolvingReview.retestDate || resolvingReview.createdAt) : null,
          resolution: resolvingReview ? `${resolvingReview.retestResult} - ${resolvingReview.releaseRecommendation}` : null
        },
        status: resolved ? 'resolved' : 'pending_review'
      });
    }
  });

  reviews.forEach(rev => {
    const isConclusive = CONCLUSIVE_RETEST_RESULTS.includes(rev.retestResult);
    timeline.push({
      type: 'review',
      title: isConclusive ? '复核结论' : '复核记录(待补充结论)',
      date: rev.retestDate,
      description: isConclusive
        ? `${rev.reviewerName} 复核，结果: ${rev.retestResult}，建议: ${rev.releaseRecommendation}`
        : `${rev.reviewerName} 暂存复核记录，结果: ${rev.retestResult}(需补充明确结论)`,
      details: {
        reviewId: rev.id,
        retestResult: rev.retestResult,
        riskLevel: rev.riskLevel,
        releaseRecommendation: rev.releaseRecommendation,
        appearanceStable: rev.appearanceStable,
        viscosityDeviation: rev.viscosityDeviation,
        odorNormal: rev.odorNormal,
        reviewerName: rev.reviewerName,
        isConclusive
      },
      status: isConclusive ? 'completed' : 'incomplete'
    });
  });

  const statusHistory = buildStatusHistory(batch, records, reviews);
  let seq = 0;
  statusHistory.forEach(h => {
    if (h.from !== h.to || h.eventType === 'manual') {
      seq++;
      timeline.push({
        type: 'status_change',
        title: `状态变更 #${seq}`,
        date: h.date,
        description: `${h.from ? h.from + ' → ' : ''}${h.to} · ${h.reason}${h.note ? ' (' + h.note + ')' : ''}`,
        details: {
          from: h.from,
          to: h.to,
          reason: h.reason,
          eventType: h.eventType,
          relatedRecordId: h.relatedRecordId || null
        },
        status: h.to === batch.status ? 'current' : 'completed'
      });
    }
  });

  timeline.push({
    type: 'status',
    title: '当前状态',
    date: batch.updatedAt ? batch.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
    description: `批次当前状态: ${batch.status}`,
    details: {
      currentStatus: batch.status,
      lastUpdatedAt: batch.updatedAt,
      unresolvedAbnormalCount: findUnreviewedAbnormals(records, reviews).length
    },
    status: 'current'
  });

  const enriched = enrichTrialBatch(batch);
  if (enriched.nextRetestDate && batch.status !== STATUS.SUSPENDED && batch.status !== STATUS.READY_SCALEUP) {
    timeline.push({
      type: 'scheduled',
      title: '下一次复测',
      date: enriched.nextRetestDate,
      description: `计划复测日期: ${enriched.nextRetestDate}`,
      details: {
        nextRetestDate: enriched.nextRetestDate,
        retestCycleName: enriched.retestCycleName,
        daysUntilDue: enriched.retestStatus.daysUntilDue,
        isOverdue: enriched.retestStatus.isOverdue,
        isUrgent: enriched.retestStatus.isUrgent
      },
      status: enriched.retestStatus.isOverdue ? 'overdue' : 'upcoming'
    });
  }

  const { RETEST_PLAN_STATUS } = require('../config');
  const retestPlans = getRetestPlansByBatch(batchId);
  retestPlans.forEach(plan => {
    const sourceTypeNames = {
      creation: '批次建档',
      experiment: '实验记录提交',
      review: '复核记录提交'
    };
    
    timeline.push({
      type: 'retest_plan_created',
      title: '复测计划生成',
      date: plan.createdAt ? plan.createdAt.split('T')[0] : plan.originalPlanDate,
      description: `复测计划已生成，来源: ${sourceTypeNames[plan.sourceType] || plan.sourceType}，原计划日期: ${plan.originalPlanDate}`,
      details: {
        planId: plan.id,
        sourceType: plan.sourceType,
        sourceTypeLabel: sourceTypeNames[plan.sourceType] || plan.sourceType,
        sourceRecordId: plan.sourceRecordId,
        originalPlanDate: plan.originalPlanDate,
        currentPlanDate: plan.currentPlanDate,
        extensionCount: plan.extensionCount,
        createdAt: plan.createdAt,
        status: plan.status
      },
      status: plan.status === RETEST_PLAN_STATUS.COMPLETED ? 'completed' : 'active'
    });

    if (plan.status === RETEST_PLAN_STATUS.CONFIRMED && plan.lastHandledAt) {
      timeline.push({
        type: 'retest_plan_confirmed',
        title: '复测计划已确认',
        date: plan.lastHandledAt.split('T')[0],
        description: `${plan.lastHandlerName || '责任人'} 确认了复测计划，当前计划日期: ${plan.currentPlanDate}`,
        details: {
          planId: plan.id,
          confirmedBy: plan.lastHandlerName,
          confirmedById: plan.lastHandlerId,
          confirmedAt: plan.lastHandledAt,
          planDate: plan.currentPlanDate,
          remarks: plan.remarks
        },
        status: 'completed'
      });
    }

    if (plan.status === RETEST_PLAN_STATUS.EXTENDED && plan.lastHandledAt) {
      timeline.push({
        type: 'retest_plan_extended',
        title: '复测计划已延期',
        date: plan.lastHandledAt.split('T')[0],
        description: `${plan.lastHandlerName || '责任人'} 将复测计划延期至 ${plan.currentPlanDate}，延期原因: ${plan.extensionReason}`,
        details: {
          planId: plan.id,
          extendedBy: plan.lastHandlerName,
          extendedById: plan.lastHandlerId,
          extendedAt: plan.lastHandledAt,
          originalPlanDate: plan.originalPlanDate,
          newPlanDate: plan.currentPlanDate,
          extensionCount: plan.extensionCount,
          extensionReason: plan.extensionReason,
          remarks: plan.remarks
        },
        status: 'completed'
      });
    }

    if (plan.status === RETEST_PLAN_STATUS.COMPLETED && plan.lastHandledAt) {
      timeline.push({
        type: 'retest_plan_completed',
        title: '复测计划已完成',
        date: plan.lastHandledAt.split('T')[0],
        description: `${plan.lastHandlerName || '责任人'} 完成了复测计划，${plan.remarks || '已提交相关记录'}`,
        details: {
          planId: plan.id,
          completedBy: plan.lastHandlerName,
          completedById: plan.lastHandlerId,
          completedAt: plan.lastHandledAt,
          remarks: plan.remarks
        },
        status: 'completed'
      });
    }
  });

  timeline.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
    const typeOrder = { 
      creation: 0, 
      status_change: 1, 
      experiment: 2, 
      abnormal: 3, 
      review: 4, 
      retest_plan_created: 5,
      retest_plan_confirmed: 6,
      retest_plan_extended: 7,
      retest_plan_completed: 8,
      status: 9, 
      scheduled: 10 
    };
    return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
  });

  return timeline.map((item, idx) => ({ ...item, id: idx + 1 }));
}

function getPendingBatches(filters = {}) {
  const { RETEST_PLAN_CATEGORY } = require('../config');
  let results = [...store.trialBatches];

  if (filters.responsiblePersonId) {
    results = results.filter(b => b.responsiblePersonId === parseInt(filters.responsiblePersonId));
  }
  if (filters.formulaId) {
    results = results.filter(b => b.formulaId === parseInt(filters.formulaId));
  }
  if (filters.packagingTypeId) {
    results = results.filter(b => b.packagingTypeId === parseInt(filters.packagingTypeId));
  }
  if (filters.observationConditionId) {
    results = results.filter(b => b.observationConditionId === parseInt(filters.observationConditionId));
  }
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    results = results.filter(b => statuses.includes(b.status));
  }

  if (filters.riskLevel) {
    results = results.filter(b => {
      const enriched = enrichTrialBatch(b);
      return enriched.riskAssessment.riskLevel === filters.riskLevel;
    });
  }

  if (filters.hasUnreviewedAbnormal === 'true') {
    results = results.filter(b => {
      const records = store.experimentRecords.filter(r => r.trialBatchId === b.id);
      const reviews = store.reviewRecords.filter(r => r.trialBatchId === b.id);
      return hasUnresolvedAbnormal(records, reviews);
    });
  }

  if (filters.isOverdue === 'true') {
    results = results.filter(b => {
      const enriched = enrichTrialBatch(b);
      return enriched.retestStatus.isOverdue;
    });
  }

  if (filters.retestCategory) {
    results = results.filter(b => {
      const plans = getRetestPlansByBatch(b.id);
      const { RETEST_PLAN_STATUS } = require('../config');
      const activePlan = plans.find(p => 
        p.status === RETEST_PLAN_STATUS.PENDING 
        || p.status === RETEST_PLAN_STATUS.CONFIRMED 
        || p.status === RETEST_PLAN_STATUS.EXTENDED
      );
      if (!activePlan) return false;
      const category = categorizeRetestPlan(activePlan);
      return category === filters.retestCategory;
    });
  }

  const enrichedResults = results.map(b => enrichTrialBatch(b));

  if (filters.sortBy) {
    const sortOrder = filters.sortOrder === 'desc' ? -1 : 1;
    enrichedResults.sort((a, b) => {
      switch (filters.sortBy) {
        case 'nextRetestDate':
          const dateA = a.nextRetestDate ? new Date(a.nextRetestDate) : new Date(9999, 11, 31);
          const dateB = b.nextRetestDate ? new Date(b.nextRetestDate) : new Date(9999, 11, 31);
          return (dateA - dateB) * sortOrder;
        case 'riskScore':
          return (a.riskAssessment.riskScore - b.riskAssessment.riskScore) * sortOrder;
        case 'status':
          return a.status.localeCompare(b.status) * sortOrder;
        default:
          return 0;
      }
    });
  } else {
    enrichedResults.sort((a, b) => b.riskAssessment.riskScore - a.riskAssessment.riskScore);
  }

  const statusGroups = {};
  Object.values(STATUS).forEach(s => {
    statusGroups[s] = enrichedResults.filter(b => b.status === s).length;
  });

  const riskGroups = {
    '极高风险': 0,
    '高风险': 0,
    '中风险': 0,
    '低风险': 0
  };
  enrichedResults.forEach(b => {
    if (riskGroups[b.riskAssessment.riskLevel] !== undefined) {
      riskGroups[b.riskAssessment.riskLevel]++;
    }
  });

  const retestCategoryGroups = {
    [RETEST_PLAN_CATEGORY.OVERDUE]: 0,
    [RETEST_PLAN_CATEGORY.UPCOMING]: 0,
    [RETEST_PLAN_CATEGORY.NORMAL]: 0
  };
  enrichedResults.forEach(b => {
    if (b.retestPlan && b.retestPlan.category) {
      retestCategoryGroups[b.retestPlan.category]++;
    }
  });

  return {
    total: enrichedResults.length,
    data: enrichedResults,
    statusDistribution: statusGroups,
    riskDistribution: riskGroups,
    retestCategoryDistribution: retestCategoryGroups,
    overdueCount: enrichedResults.filter(b => b.retestStatus.isOverdue).length,
    unreviewedAbnormalCount: enrichedResults.filter(b => b.unresolvedAbnormalCount > 0).length
  };
}

function getBatchClosureOverview() {
  const overview = {};

  store.trialBatches.forEach(batch => {
    const rpId = batch.responsiblePersonId;
    if (!rpId) return;

    if (!overview[rpId]) {
      overview[rpId] = {
        responsiblePersonId: rpId,
        responsiblePersonName: batch.responsiblePersonName,
        totalBatches: 0,
        pendingCount: 0,
        pendingPrep: 0,
        observing: 0,
        pendingRetest: 0,
        abnormalFollowup: 0,
        readyScaleup: 0,
        suspended: 0,
        overdueRetestCount: 0,
        unreviewedAbnormalCount: 0,
        highRiskPackagingBatchCount: 0,
        highRiskBatches: []
      };
    }

    const enriched = enrichTrialBatch(batch);
    overview[rpId].totalBatches++;

    switch (batch.status) {
      case STATUS.PENDING_PREP:
        overview[rpId].pendingPrep++;
        overview[rpId].pendingCount++;
        break;
      case STATUS.OBSERVING:
        overview[rpId].observing++;
        if (enriched.retestStatus.isOverdue || enriched.retestStatus.isUrgent) {
          overview[rpId].pendingCount++;
        }
        break;
      case STATUS.PENDING_RETEST:
        overview[rpId].pendingRetest++;
        overview[rpId].pendingCount++;
        break;
      case STATUS.ABNORMAL_FOLLOWUP:
        overview[rpId].abnormalFollowup++;
        overview[rpId].pendingCount++;
        break;
      case STATUS.READY_SCALEUP:
        overview[rpId].readyScaleup++;
        break;
      case STATUS.SUSPENDED:
        overview[rpId].suspended++;
        break;
    }

    if (enriched.retestStatus.isOverdue) {
      overview[rpId].overdueRetestCount++;
    }

    if (enriched.unresolvedAbnormalCount > 0) {
      overview[rpId].unreviewedAbnormalCount++;
    }

    if (enriched.riskAssessment.riskScore >= 4) {
      overview[rpId].highRiskPackagingBatchCount++;
      overview[rpId].highRiskBatches.push({
        batchNumber: batch.batchNumber,
        formulaCode: batch.formulaCode,
        packagingTypeName: batch.packagingTypeName,
        status: batch.status,
        riskLevel: enriched.riskAssessment.riskLevel,
        riskScore: enriched.riskAssessment.riskScore,
        nextRetestDate: enriched.nextRetestDate
      });
    }
  });

  const result = Object.values(overview).map(rp => ({
    ...rp,
    closureRate: rp.totalBatches > 0 
      ? (((rp.readyScaleup + rp.suspended) / rp.totalBatches) * 100).toFixed(1) + '%'
      : '0%'
  }));

  result.sort((a, b) => b.pendingCount - a.pendingCount);

  const summary = {
    totalResponsiblePersons: result.length,
    totalBatches: result.reduce((sum, r) => sum + r.totalBatches, 0),
    totalPending: result.reduce((sum, r) => sum + r.pendingCount, 0),
    totalOverdue: result.reduce((sum, r) => sum + r.overdueRetestCount, 0),
    totalUnreviewedAbnormal: result.reduce((sum, r) => sum + r.unreviewedAbnormalCount, 0),
    totalHighRiskBatches: result.reduce((sum, r) => sum + r.highRiskPackagingBatchCount, 0)
  };

  return {
    summary,
    byResponsiblePerson: result
  };
}

function generateDashboardExportData() {
  const closureOverview = getBatchClosureOverview();
  const retestPlanStats = getRetestPlanStatsByResponsiblePerson();
  const retestCategoryStats = getRetestPlanCategoryStats();
  const pendingBatches = getPendingBatches({});
  
  const highRiskPackaging = getHighRiskPackaging();
  const highRiskPkgIds = highRiskPackaging.filter(p => p.riskScore >= 10).map(p => p.packagingTypeId);

  const batchTimelines = {};
  store.trialBatches.forEach(b => {
    batchTimelines[b.id] = buildLifecycleTimeline(b.id);
  });

  const mergedClosure = closureOverview.byResponsiblePerson.map(rp => {
    const retestStat = retestPlanStats.find(r => r.responsiblePersonId === rp.responsiblePersonId);
    return {
      ...rp,
      pendingRetestCount: retestStat ? retestStat.pendingRetestCount : 0,
      retestOverdueCount: retestStat ? retestStat.overdueCount : 0,
      retestExtendedCount: retestStat ? retestStat.extendedCount : 0,
      retestCompletedCount: retestStat ? retestStat.completedCount : 0,
      totalRetestPlanCount: retestStat ? retestStat.totalPlanCount : 0
    };
  });

  return {
    exportedAt: new Date().toISOString(),
    module: '批次稳定性跟踪看板',
    closureOverview: {
      summary: {
        ...closureOverview.summary,
        totalPendingRetest: retestPlanStats.reduce((sum, r) => sum + r.pendingRetestCount, 0),
        totalRetestOverdue: retestPlanStats.reduce((sum, r) => sum + r.overdueCount, 0),
        totalRetestExtended: retestPlanStats.reduce((sum, r) => sum + r.extendedCount, 0)
      },
      byResponsiblePerson: mergedClosure
    },
    retestPlanStats: retestCategoryStats,
    retestPlanByResponsible: retestPlanStats,
    pendingBatches: {
      total: pendingBatches.total,
      statusDistribution: pendingBatches.statusDistribution,
      riskDistribution: pendingBatches.riskDistribution,
      retestCategoryDistribution: pendingBatches.retestCategoryDistribution,
      overdueCount: pendingBatches.overdueCount,
      unreviewedAbnormalCount: pendingBatches.unreviewedAbnormalCount,
      batches: pendingBatches.data.map(b => ({
        id: b.id,
        batchNumber: b.batchNumber,
        formulaCode: b.formulaCode,
        packagingTypeName: b.packagingTypeName,
        observationConditionName: b.observationConditionName,
        responsiblePersonName: b.responsiblePersonName,
        status: b.status,
        nextRetestDate: b.nextRetestDate,
        riskLevel: b.riskAssessment.riskLevel,
        currentAction: b.currentAction.action,
        currentActionPriority: b.currentAction.priority,
        retestPlanStatus: b.retestPlan ? b.retestPlan.status : '',
        retestPlanCategory: b.retestPlan ? b.retestPlan.category : '',
        retestOriginalPlanDate: b.retestPlan ? b.retestPlan.originalPlanDate : '',
        retestCurrentPlanDate: b.retestPlan ? b.retestPlan.currentPlanDate : '',
        retestExtensionCount: b.retestPlan ? b.retestPlan.extensionCount : 0,
        retestExtensionReason: b.retestPlan ? b.retestPlan.extensionReason : '',
        retestLastHandlerName: b.retestPlan ? b.retestPlan.lastHandlerName : '',
        retestLastHandledAt: b.retestPlan ? b.retestPlan.lastHandledAt : ''
      }))
    },
    highRiskPackaging: highRiskPackaging.slice(0, 10),
    batchTimelines
  };
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
      reviews: store.reviewRecords.filter(r => r.trialBatchId === b.id),
      retestPlans: getRetestPlansByBatch(b.id)
    })),
    retestPlans: store.retestPlans,
    analysis: {
      highRiskPackaging: getHighRiskPackaging(),
      pendingRetestBatches: getPendingRetestBatches(),
      stabilityTrendByFormula: getStabilityTrend('formula'),
      stabilityTrendByPackaging: getStabilityTrend('packaging'),
      batchClosureOverview: getBatchClosureOverview(),
      retestPlanStats: getRetestPlanCategoryStats(),
      retestPlanByResponsible: getRetestPlanStatsByResponsiblePerson()
    },
    dashboard: generateDashboardExportData()
  };

  return exportData;
}

function createRetestPlan(batch, sourceType, sourceRecordId, baseDateStr, handlerId = null, handlerName = '') {
  const { RETEST_PLAN_STATUS } = require('../config');
  const cycle = store.retestCycles.find(c => c.id === batch.retestCycleId);
  if (!cycle) return null;

  const baseDate = new Date(baseDateStr);
  const planDate = new Date(baseDate);
  planDate.setDate(planDate.getDate() + cycle.intervalDays);
  const planDateStr = planDate.toISOString().split('T')[0];

  const existingPending = store.retestPlans.find(
    p => p.trialBatchId === batch.id 
      && (p.status === RETEST_PLAN_STATUS.PENDING || p.status === RETEST_PLAN_STATUS.CONFIRMED || p.status === RETEST_PLAN_STATUS.EXTENDED)
  );
  if (existingPending) {
    return existingPending;
  }

  const plan = {
    id: store.nextId.retestPlan++,
    trialBatchId: batch.id,
    trialBatchNumber: batch.batchNumber,
    sourceType,
    sourceRecordId,
    originalPlanDate: planDateStr,
    currentPlanDate: planDateStr,
    status: RETEST_PLAN_STATUS.PENDING,
    extensionCount: 0,
    extensionReason: '',
    lastHandlerId: handlerId,
    lastHandlerName: handlerName,
    lastHandledAt: handlerId ? new Date().toISOString() : null,
    remarks: '',
    createdAt: new Date().toISOString()
  };

  store.retestPlans.push(plan);
  return plan;
}

function getRetestPlansByBatch(batchId) {
  return store.retestPlans
    .filter(p => p.trialBatchId === batchId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getLatestRetestPlan(batchId) {
  const plans = getRetestPlansByBatch(batchId);
  return plans.length > 0 ? plans[0] : null;
}

function categorizeRetestPlan(plan) {
  const { RETEST_PLAN_CATEGORY, RETEST_PLAN_STATUS } = require('../config');
  const now = new Date();
  const planDate = new Date(plan.currentPlanDate);
  const daysUntilDue = Math.ceil((planDate - now) / (1000 * 60 * 60 * 24));

  if (plan.status === RETEST_PLAN_STATUS.COMPLETED || plan.status === RETEST_PLAN_STATUS.CANCELLED) {
    return null;
  }

  if (daysUntilDue < 0) {
    return RETEST_PLAN_CATEGORY.OVERDUE;
  } else if (daysUntilDue <= 3) {
    return RETEST_PLAN_CATEGORY.UPCOMING;
  } else {
    return RETEST_PLAN_CATEGORY.NORMAL;
  }
}

function confirmRetestPlan(planId, handlerId, handlerName, remarks = '') {
  const { RETEST_PLAN_STATUS } = require('../config');
  const plan = store.retestPlans.find(p => p.id === planId);
  if (!plan) return { success: false, message: '复测计划不存在' };

  plan.status = RETEST_PLAN_STATUS.CONFIRMED;
  plan.lastHandlerId = handlerId;
  plan.lastHandlerName = handlerName;
  plan.lastHandledAt = new Date().toISOString();
  if (remarks) plan.remarks = remarks;

  return { success: true, data: plan };
}

function extendRetestPlan(planId, newPlanDate, extensionReason, handlerId, handlerName, remarks = '') {
  const { RETEST_PLAN_STATUS } = require('../config');
  const plan = store.retestPlans.find(p => p.id === planId);
  if (!plan) return { success: false, message: '复测计划不存在' };

  if (!newPlanDate) return { success: false, message: '新的计划日期不能为空' };
  if (!extensionReason || extensionReason.trim() === '') {
    return { success: false, message: '延期原因不能为空' };
  }

  const newDate = new Date(newPlanDate);
  const currentDate = new Date(plan.currentPlanDate);
  if (newDate <= currentDate) {
    return { success: false, message: '新的计划日期必须晚于当前计划日期' };
  }

  plan.status = RETEST_PLAN_STATUS.EXTENDED;
  plan.currentPlanDate = newPlanDate;
  plan.extensionCount = (plan.extensionCount || 0) + 1;
  plan.extensionReason = extensionReason;
  plan.lastHandlerId = handlerId;
  plan.lastHandlerName = handlerName;
  plan.lastHandledAt = new Date().toISOString();
  if (remarks) plan.remarks = remarks;

  return { success: true, data: plan };
}

function completeRetestPlan(batchId, handlerId, handlerName, remarks = '') {
  const { RETEST_PLAN_STATUS } = require('../config');
  const activePlans = store.retestPlans.filter(
    p => p.trialBatchId === batchId 
      && (p.status === RETEST_PLAN_STATUS.PENDING || p.status === RETEST_PLAN_STATUS.CONFIRMED || p.status === RETEST_PLAN_STATUS.EXTENDED)
  );

  activePlans.forEach(plan => {
    plan.status = RETEST_PLAN_STATUS.COMPLETED;
    plan.lastHandlerId = handlerId;
    plan.lastHandlerName = handlerName;
    plan.lastHandledAt = new Date().toISOString();
    if (remarks) plan.remarks = remarks;
  });

  return activePlans;
}

function getRetestPlanCategoryStats() {
  const { RETEST_PLAN_CATEGORY, RETEST_PLAN_STATUS } = require('../config');
  const stats = {
    [RETEST_PLAN_CATEGORY.OVERDUE]: 0,
    [RETEST_PLAN_CATEGORY.UPCOMING]: 0,
    [RETEST_PLAN_CATEGORY.NORMAL]: 0,
    total: 0,
    completed: 0,
    extended: 0
  };

  store.retestPlans.forEach(plan => {
    if (plan.status === RETEST_PLAN_STATUS.COMPLETED) {
      stats.completed++;
      return;
    }
    if (plan.status === RETEST_PLAN_STATUS.EXTENDED) {
      stats.extended++;
    }
    const category = categorizeRetestPlan(plan);
    if (category) {
      stats[category]++;
      stats.total++;
    }
  });

  return stats;
}

function enrichTrialBatchWithRetestPlan(batch) {
  const { RETEST_PLAN_CATEGORY } = require('../config');
  const latestPlan = getLatestRetestPlan(batch.id);
  const allPlans = getRetestPlansByBatch(batch.id);
  const activePlan = allPlans.find(p => {
    const { RETEST_PLAN_STATUS } = require('../config');
    return p.status === RETEST_PLAN_STATUS.PENDING 
      || p.status === RETEST_PLAN_STATUS.CONFIRMED 
      || p.status === RETEST_PLAN_STATUS.EXTENDED;
  });

  let retestPlanInfo = null;
  if (activePlan) {
    const category = categorizeRetestPlan(activePlan);
    const now = new Date();
    const planDate = new Date(activePlan.currentPlanDate);
    const daysUntilDue = Math.ceil((planDate - now) / (1000 * 60 * 60 * 24));

    retestPlanInfo = {
      planId: activePlan.id,
      status: activePlan.status,
      category,
      originalPlanDate: activePlan.originalPlanDate,
      currentPlanDate: activePlan.currentPlanDate,
      extensionCount: activePlan.extensionCount,
      extensionReason: activePlan.extensionReason,
      lastHandlerId: activePlan.lastHandlerId,
      lastHandlerName: activePlan.lastHandlerName,
      lastHandledAt: activePlan.lastHandledAt,
      daysUntilDue,
      overdueDays: daysUntilDue < 0 ? Math.abs(daysUntilDue) : 0,
      sourceType: activePlan.sourceType,
      remarks: activePlan.remarks
    };
  }

  return {
    retestPlan: retestPlanInfo,
    retestPlanHistory: allPlans,
    retestPlanCount: allPlans.length
  };
}

function getRetestPlanStatsByResponsiblePerson() {
  const { RETEST_PLAN_STATUS, RETEST_PLAN_CATEGORY } = require('../config');
  const stats = {};

  store.trialBatches.forEach(batch => {
    const rpId = batch.responsiblePersonId;
    if (!rpId) return;

    if (!stats[rpId]) {
      stats[rpId] = {
        responsiblePersonId: rpId,
        responsiblePersonName: batch.responsiblePersonName,
        pendingRetestCount: 0,
        overdueCount: 0,
        extendedCount: 0,
        completedCount: 0,
        totalPlanCount: 0,
        batches: []
      };
    }

    const plans = getRetestPlansByBatch(batch.id);
    stats[rpId].totalPlanCount += plans.length;

    plans.forEach(plan => {
      if (plan.status === RETEST_PLAN_STATUS.COMPLETED) {
        stats[rpId].completedCount++;
      } else if (plan.status === RETEST_PLAN_STATUS.EXTENDED) {
        stats[rpId].extendedCount++;
      }
      
      const category = categorizeRetestPlan(plan);
      if (category === RETEST_PLAN_CATEGORY.OVERDUE) {
        stats[rpId].overdueCount++;
        stats[rpId].pendingRetestCount++;
      } else if (category === RETEST_PLAN_CATEGORY.UPCOMING || category === RETEST_PLAN_CATEGORY.NORMAL) {
        stats[rpId].pendingRetestCount++;
      }
    });

    if (plans.length > 0) {
      stats[rpId].batches.push({
        batchNumber: batch.batchNumber,
        formulaCode: batch.formulaCode,
        status: batch.status
      });
    }
  });

  return Object.values(stats).sort((a, b) => b.overdueCount - a.overdueCount);
}

module.exports = {
  calculateNextRetestDate,
  calculateRetestStatus,
  determineCurrentAction,
  assessRiskLevel,
  filterTrialBatches,
  enrichTrialBatch,
  getHighRiskPackaging,
  getPendingRetestBatches,
  getStabilityTrend,
  buildLifecycleTimeline,
  getPendingBatches,
  getBatchClosureOverview,
  generateDashboardExportData,
  generateExportData,
  createRetestPlan,
  getRetestPlansByBatch,
  getLatestRetestPlan,
  categorizeRetestPlan,
  confirmRetestPlan,
  extendRetestPlan,
  completeRetestPlan,
  getRetestPlanCategoryStats,
  enrichTrialBatchWithRetestPlan,
  getRetestPlanStatsByResponsiblePerson
};
