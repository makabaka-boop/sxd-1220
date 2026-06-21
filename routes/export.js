const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { generateExportData, filterTrialBatches, generateDashboardExportData, getBatchClosureOverview, getPendingBatches, buildLifecycleTimeline } = require('../utils/analytics');

const router = express.Router();

function convertToCSV(data, headers) {
  const headerLine = headers.join(',');
  const lines = data.map(row => {
    return headers.map(h => {
      let val = row[h] !== undefined ? row[h] : '';
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('\n') || val.includes('"')) {
        val = `"${val}"`;
      }
      return val;
    }).join(',');
  });
  return '\uFEFF' + headerLine + '\n' + lines.join('\n');
}

router.get('/export/json', authenticate, (req, res) => {
  const exportData = generateExportData(req.query.type || 'full');
  const fileName = `cosmetics-stability-export-${new Date().toISOString().split('T')[0]}.json`;
  
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(JSON.stringify(exportData, null, 2));
});

router.get('/export/csv', authenticate, (req, res) => {
  const { section } = req.query;
  const store = require('../data/store');
  const date = new Date().toISOString().split('T')[0];
  let csvContent = '';
  let fileName = '';

  switch (section) {
    case 'trial-batches': {
      const batches = filterTrialBatches(req.query);
      const headers = ['id', 'formulaCode', 'batchNumber', 'packagingTypeName', 'observationConditionName', 
        'responsiblePersonName', 'productionDate', 'status', 'experimentRecordCount', 'reviewRecordCount', 
        'retestPlanStatus', 'retestPlanCategory', 'retestIsPendingApproval', 'retestOriginalPlanDate', 
        'retestCurrentPlanDate', 'retestPendingExtensionNewDate', 'retestPendingExtensionReason', 
        'retestPendingExtensionApplicant', 'retestPendingExtensionAppliedAt', 
        'retestExtensionCount', 'retestExtensionReason', 'retestLastHandlerName', 'retestLastHandledAt', 
        'retestApprovalRemarks', 'retestRejectReason', 'createdAt'];
      const enrichedData = batches.map(b => ({
        ...b,
        retestPlanStatus: b.retestPlan ? b.retestPlan.status : '',
        retestPlanCategory: b.retestPlan ? b.retestPlan.category : '',
        retestIsPendingApproval: b.retestPlan ? (b.retestPlan.isPendingApproval ? '是' : '否') : '否',
        retestOriginalPlanDate: b.retestPlan ? b.retestPlan.originalPlanDate : '',
        retestCurrentPlanDate: b.retestPlan ? b.retestPlan.currentPlanDate : '',
        retestPendingExtensionNewDate: b.retestPlan ? b.retestPlan.pendingExtensionNewDate || '' : '',
        retestPendingExtensionReason: b.retestPlan ? b.retestPlan.pendingExtensionReason || '' : '',
        retestPendingExtensionApplicant: b.retestPlan ? b.retestPlan.pendingExtensionApplicantName || '' : '',
        retestPendingExtensionAppliedAt: b.retestPlan ? b.retestPlan.pendingExtensionAppliedAt || '' : '',
        retestExtensionCount: b.retestPlan ? b.retestPlan.extensionCount : 0,
        retestExtensionReason: b.retestPlan ? b.retestPlan.extensionReason : '',
        retestLastHandlerName: b.retestPlan ? b.retestPlan.lastHandlerName : '',
        retestLastHandledAt: b.retestPlan ? b.retestPlan.lastHandledAt : '',
        retestApprovalRemarks: b.retestPlan ? b.retestPlan.approvalRemarks || '' : '',
        retestRejectReason: b.retestPlan ? b.retestPlan.rejectReason || '' : ''
      }));
      csvContent = convertToCSV(enrichedData, headers);
      fileName = `trial-batches-${date}.csv`;
      break;
    }
    case 'experiment-records': {
      const records = [...store.experimentRecords].sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));
      const headers = ['id', 'trialBatchNumber', 'recordDate', 'samplePrepared', 'appearance', 'viscosity', 
        'viscosityUnit', 'odor', 'pH', 'packagingCompatibility', 'abnormalLevel', 'suggestedAction', 
        'experimenterName', 'remarks', 'createdAt'];
      csvContent = convertToCSV(records, headers);
      fileName = `experiment-records-${date}.csv`;
      break;
    }
    case 'review-records': {
      const records = [...store.reviewRecords].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const headers = ['id', 'trialBatchNumber', 'retestDate', 'retestResult', 'appearanceStable', 
        'viscosityDeviation', 'odorNormal', 'riskLevel', 'releaseRecommendation', 'reviewerName', 'remarks', 'createdAt'];
      csvContent = convertToCSV(records, headers);
      fileName = `review-records-${date}.csv`;
      break;
    }
    case 'high-risk-packaging': {
      const { getHighRiskPackaging } = require('../utils/analytics');
      const data = getHighRiskPackaging();
      const flattened = data.map(p => ({
        packagingTypeId: p.packagingTypeId,
        packagingTypeCode: p.packagingTypeCode || '',
        packagingTypeName: p.packagingTypeName,
        material: p.material || '',
        totalBatches: p.totalBatches,
        abnormalBatches: p.abnormalBatches,
        abnormalRecords: p.abnormalRecords,
        batchAbnormalRate: p.batchAbnormalRate,
        riskScore: p.riskScore,
        affectedFormulas: (p.affectedFormulas || []).join('; ')
      }));
      const headers = ['packagingTypeId', 'packagingTypeCode', 'packagingTypeName', 'material', 
        'totalBatches', 'abnormalBatches', 'abnormalRecords', 'batchAbnormalRate', 'riskScore', 'affectedFormulas'];
      csvContent = convertToCSV(flattened, headers);
      fileName = `high-risk-packaging-${date}.csv`;
      break;
    }
    case 'pending-retest': {
      const { getPendingRetestBatches, getRetestPlansByBatch } = require('../utils/analytics');
      const data = getPendingRetestBatches();
      const headers = ['trialBatchId', 'batchNumber', 'formulaCode', 'packagingTypeName', 
        'observationConditionName', 'responsiblePersonName', 'status', 'retestCycleName', 'intervalDays',
        'lastRecordDate', 'scheduledRetestDate', 'daysUntilDue', 'isOverdue', 'overdueDays', 'isUrgent',
        'retestPlanStatus', 'retestPlanCategory', 'retestIsPendingApproval', 'retestOriginalPlanDate', 
        'retestCurrentPlanDate', 'retestPendingExtensionNewDate', 'retestPendingExtensionReason',
        'retestPendingExtensionApplicant', 'retestPendingExtensionAppliedAt',
        'retestExtensionCount', 'retestExtensionReason', 'retestLastHandlerName', 'retestLastHandledAt',
        'retestApprovalRemarks', 'retestRejectReason'];
      const enrichedData = data.map(d => {
        const plans = getRetestPlansByBatch(d.trialBatchId);
        const activePlan = plans.find(p => {
          const { RETEST_PLAN_STATUS } = require('../config');
          return p.status === RETEST_PLAN_STATUS.PENDING 
            || p.status === RETEST_PLAN_STATUS.CONFIRMED 
            || p.status === RETEST_PLAN_STATUS.EXTENDED
            || p.status === RETEST_PLAN_STATUS.PENDING_EXTENSION_APPROVAL;
        });
        const isPendingApproval = activePlan ? activePlan.status === RETEST_PLAN_STATUS.PENDING_EXTENSION_APPROVAL : false;
        return {
          ...d,
          retestPlanStatus: activePlan ? activePlan.status : '',
          retestPlanCategory: activePlan && !isPendingApproval ? (() => {
            const { categorizeRetestPlan } = require('../utils/analytics');
            return categorizeRetestPlan(activePlan) || '';
          })() : '',
          retestIsPendingApproval: isPendingApproval ? '是' : '否',
          retestOriginalPlanDate: activePlan ? activePlan.originalPlanDate : '',
          retestCurrentPlanDate: activePlan ? activePlan.currentPlanDate : '',
          retestPendingExtensionNewDate: activePlan ? activePlan.pendingExtensionNewDate || '' : '',
          retestPendingExtensionReason: activePlan ? activePlan.pendingExtensionReason || '' : '',
          retestPendingExtensionApplicant: activePlan ? activePlan.pendingExtensionApplicantName || '' : '',
          retestPendingExtensionAppliedAt: activePlan ? activePlan.pendingExtensionAppliedAt || '' : '',
          retestExtensionCount: activePlan ? activePlan.extensionCount : 0,
          retestExtensionReason: activePlan ? activePlan.extensionReason : '',
          retestLastHandlerName: activePlan ? activePlan.lastHandlerName : '',
          retestLastHandledAt: activePlan ? activePlan.lastHandledAt : '',
          retestApprovalRemarks: activePlan ? activePlan.approvalRemarks || '' : '',
          retestRejectReason: activePlan ? activePlan.rejectReason || '' : ''
        };
      });
      csvContent = convertToCSV(enrichedData, headers);
      fileName = `pending-retest-${date}.csv`;
      break;
    }
    default: {
      const sections = [
        { title: '======= 配方列表 =======', data: store.formulas, headers: ['id', 'code', 'name', 'description', 'createdAt'] },
        { title: '\n\n======= 试制批号列表 =======', data: filterTrialBatches(req.query), 
          headers: ['id', 'formulaCode', 'batchNumber', 'packagingTypeName', 'observationConditionName', 'responsiblePersonName', 'productionDate', 'status', 'createdAt'] },
        { title: '\n\n======= 实验记录列表 =======', data: [...store.experimentRecords].sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate)), 
          headers: ['id', 'trialBatchNumber', 'recordDate', 'samplePrepared', 'appearance', 'viscosity', 'abnormalLevel', 'suggestedAction', 'experimenterName'] },
        { title: '\n\n======= 复核记录列表 =======', data: [...store.reviewRecords].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), 
          headers: ['id', 'trialBatchNumber', 'retestDate', 'retestResult', 'riskLevel', 'releaseRecommendation', 'reviewerName'] }
      ];
      csvContent = '\uFEFF';
      sections.forEach(s => {
        csvContent += s.title + '\n';
        csvContent += convertToCSV(s.data, s.headers).replace(/^\uFEFF/, '');
      });
      fileName = `full-export-${date}.csv`;
    }
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csvContent);
});

router.get('/export/dashboard/json', authenticate, (req, res) => {
  const dashboardData = generateDashboardExportData();
  const fileName = `batch-tracking-dashboard-${new Date().toISOString().split('T')[0]}.json`;
  
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(JSON.stringify(dashboardData, null, 2));
});

router.get('/export/dashboard/csv', authenticate, (req, res) => {
  const store = require('../data/store');
  const date = new Date().toISOString().split('T')[0];
  const { section } = req.query;
  let csvContent = '';
  let fileName = '';

  const sections = [];

  if (!section || section === 'closure-overview') {
    const closure = getBatchClosureOverview();
    const { getRetestPlanStatsByResponsiblePerson } = require('../utils/analytics');
    const retestPlanStats = getRetestPlanStatsByResponsiblePerson();
    const data = closure.byResponsiblePerson.map(rp => {
      const retestStat = retestPlanStats.find(r => r.responsiblePersonId === rp.responsiblePersonId);
      return {
      responsiblePersonName: rp.responsiblePersonName,
      totalBatches: rp.totalBatches,
      pendingCount: rp.pendingCount,
      pendingPrep: rp.pendingPrep,
      observing: rp.observing,
      pendingRetest: rp.pendingRetest,
      abnormalFollowup: rp.abnormalFollowup,
      readyScaleup: rp.readyScaleup,
      suspended: rp.suspended,
      overdueRetestCount: rp.overdueRetestCount,
      unreviewedAbnormalCount: rp.unreviewedAbnormalCount,
      highRiskPackagingBatchCount: rp.highRiskPackagingBatchCount,
      closureRate: rp.closureRate,
      retestPendingCount: retestStat ? retestStat.pendingRetestCount : 0,
      retestOverdueCount: retestStat ? retestStat.overdueCount : 0,
      retestExtendedCount: retestStat ? retestStat.extendedCount : 0,
      retestPendingApprovalCount: retestStat ? retestStat.pendingApprovalCount : 0,
      retestCompletedCount: retestStat ? retestStat.completedCount : 0
    };
    });
    const headers = ['责任人', '总批次数', '待处理数', '待制样', '观察中', '待复测', '异常跟进', 
      '可放大', '暂停', '复测超期数', '异常未复核数', '高风险批次数', '闭环率',
      '复测计划待处理数', '复测计划超期数', '复测计划延期数', '待延期审批数', '复测计划完成数'];
    const cnHeaders = ['responsiblePersonName', 'totalBatches', 'pendingCount', 'pendingPrep', 
      'observing', 'pendingRetest', 'abnormalFollowup', 'readyScaleup', 'suspended', 
      'overdueRetestCount', 'unreviewedAbnormalCount', 'highRiskPackagingBatchCount', 'closureRate',
      'retestPendingCount', 'retestOverdueCount', 'retestExtendedCount', 'retestPendingApprovalCount', 'retestCompletedCount'];
    const renamedData = data.map(item => {
      const renamed = {};
      cnHeaders.forEach((h, i) => { renamed[headers[i]] = item[h]; });
      return renamed;
    });
    sections.push({ title: '======= 批次闭环概览 =======', data: renamedData, headers });
  }

  if (!section || section === 'pending-batches') {
    const pending = getPendingBatches({});
    const data = pending.data.map(b => ({
      batchNumber: b.batchNumber,
      formulaCode: b.formulaCode,
      packagingTypeName: b.packagingTypeName,
      observationConditionName: b.observationConditionName,
      responsiblePersonName: b.responsiblePersonName,
      status: b.status,
      nextRetestDate: b.nextRetestDate || '',
      isOverdue: b.retestStatus.isOverdue ? '是' : '否',
      overdueDays: b.retestStatus.overdueDays,
      riskLevel: b.riskAssessment.riskLevel,
      currentAction: b.currentAction.action,
      priority: b.currentAction.priority,
      retestPlanStatus: b.retestPlan ? b.retestPlan.status : '',
      retestPlanCategory: b.retestPlan ? b.retestPlan.category : '',
      retestIsPendingApproval: b.retestPlan ? (b.retestPlan.isPendingApproval ? '是' : '否') : '否',
      retestOriginalPlanDate: b.retestPlan ? b.retestPlan.originalPlanDate : '',
      retestCurrentPlanDate: b.retestPlan ? b.retestPlan.currentPlanDate : '',
      retestPendingExtensionNewDate: b.retestPlan ? b.retestPlan.pendingExtensionNewDate || '' : '',
      retestPendingExtensionReason: b.retestPlan ? b.retestPlan.pendingExtensionReason || '' : '',
      retestPendingExtensionApplicant: b.retestPlan ? b.retestPlan.pendingExtensionApplicantName || '' : '',
      retestPendingExtensionAppliedAt: b.retestPlan ? b.retestPlan.pendingExtensionAppliedAt || '' : '',
      retestExtensionCount: b.retestPlan ? b.retestPlan.extensionCount : 0,
      retestExtensionReason: b.retestPlan ? b.retestPlan.extensionReason : '',
      retestLastHandlerName: b.retestPlan ? b.retestPlan.lastHandlerName : '',
      retestLastHandledAt: b.retestPlan ? b.retestPlan.lastHandledAt : '',
      retestApprovalRemarks: b.retestPlan ? b.retestPlan.approvalRemarks || '' : '',
      retestRejectReason: b.retestPlan ? b.retestPlan.rejectReason || '' : ''
    }));
    const headers = ['试制批号', '配方', '包材类型', '观察条件', '责任人', '当前状态', 
      '下次复测日期', '是否超期', '超期天数', '风险等级', '当前处理动作', '优先级',
      '复测计划状态', '复测分类', '是否待延期审批', '原计划日期', '当前计划日期', 
      '申请延期日期', '延期原因', '申请人', '申请时间',
      '延期次数', '历史延期原因', '最近处理人', '最近处理时间',
      '审批备注', '驳回原因'];
    const cnKeys = ['batchNumber', 'formulaCode', 'packagingTypeName', 'observationConditionName',
      'responsiblePersonName', 'status', 'nextRetestDate', 'isOverdue', 'overdueDays',
      'riskLevel', 'currentAction', 'priority',
      'retestPlanStatus', 'retestPlanCategory', 'retestIsPendingApproval',
      'retestOriginalPlanDate', 'retestCurrentPlanDate',
      'retestPendingExtensionNewDate', 'retestPendingExtensionReason',
      'retestPendingExtensionApplicant', 'retestPendingExtensionAppliedAt',
      'retestExtensionCount', 'retestExtensionReason', 'retestLastHandlerName', 'retestLastHandledAt',
      'retestApprovalRemarks', 'retestRejectReason'];
    const renamedData = data.map(item => {
      const renamed = {};
      cnKeys.forEach((k, i) => { renamed[headers[i]] = item[k]; });
      return renamed;
    });
    sections.push({ title: '\n\n======= 待处理批次列表 =======', data: renamedData, headers });
  }

  if (!section || section === 'batch-timeline') {
    const storeLocal = require('../data/store');
    const allTimelineItems = [];
    storeLocal.trialBatches.forEach(batch => {
      const timeline = buildLifecycleTimeline(batch.id);
      timeline.forEach(item => {
        allTimelineItems.push({
          batchNumber: batch.batchNumber,
          formulaCode: batch.formulaCode,
          itemType: item.type,
          title: item.title,
          date: item.date,
          description: item.description,
          status: item.status
        });
      });
    });
    const headers = ['试制批号', '配方', '事件类型', '事件标题', '日期', '描述', '状态'];
    const cnKeys = ['batchNumber', 'formulaCode', 'itemType', 'title', 'date', 'description', 'status'];
    const renamedData = allTimelineItems.map(item => {
      const renamed = {};
      cnKeys.forEach((k, i) => { renamed[headers[i]] = item[k]; });
      return renamed;
    });
    sections.push({ title: '\n\n======= 批次生命周期时间线 =======', data: renamedData, headers });
  }

  csvContent = '\uFEFF';
  sections.forEach(s => {
    csvContent += s.title + '\n';
    csvContent += convertToCSV(s.data, s.headers).replace(/^\uFEFF/, '');
  });
  fileName = `dashboard-export-${date}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csvContent);
});

router.get('/export/summary', authenticate, (req, res) => {
  const store = require('../data/store');
  const summary = {
    exportedAt: new Date().toISOString(),
    statistics: {
      formulas: store.formulas.length,
      rawMaterialBatches: store.rawMaterialBatches.length,
      packagingTypes: store.packagingTypes.length,
      observationConditions: store.observationConditions.length,
      responsiblePersons: store.responsiblePersons.length,
      retestCycles: store.retestCycles.length,
      trialBatches: store.trialBatches.length,
      experimentRecords: store.experimentRecords.length,
      reviewRecords: store.reviewRecords.length,
      users: store.users.length
    },
    sections: {
      jsonExport: { url: '/api/export/json?type=full', description: '完整JSON格式导出' },
      csvExports: [
        { url: '/api/export/csv?section=trial-batches', description: '试制批号CSV导出' },
        { url: '/api/export/csv?section=experiment-records', description: '实验记录CSV导出' },
        { url: '/api/export/csv?section=review-records', description: '复核记录CSV导出' },
        { url: '/api/export/csv?section=high-risk-packaging', description: '高风险包材CSV导出' },
        { url: '/api/export/csv?section=pending-retest', description: '待复测批号CSV导出' },
        { url: '/api/export/csv', description: '全量CSV导出(多Sheet)' },
        { url: '/api/export/dashboard/json', description: '批次稳定性跟踪看板JSON导出' },
        { url: '/api/export/dashboard/csv', description: '批次稳定性跟踪看板CSV导出' }
      ]
    }
  };
  res.json(summary);
});

module.exports = router;
