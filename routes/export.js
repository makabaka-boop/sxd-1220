const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { generateExportData, filterTrialBatches } = require('../utils/analytics');

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
        'responsiblePersonName', 'productionDate', 'status', 'experimentRecordCount', 'reviewRecordCount', 'createdAt'];
      csvContent = convertToCSV(batches, headers);
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
      const { getPendingRetestBatches } = require('../utils/analytics');
      const data = getPendingRetestBatches();
      const headers = ['trialBatchId', 'batchNumber', 'formulaCode', 'packagingTypeName', 
        'observationConditionName', 'responsiblePersonName', 'status', 'retestCycleName', 'intervalDays',
        'lastRecordDate', 'scheduledRetestDate', 'daysUntilDue', 'isOverdue', 'overdueDays', 'isUrgent'];
      csvContent = convertToCSV(data, headers);
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
        { url: '/api/export/csv', description: '全量CSV导出(多Sheet)' }
      ]
    }
  };
  res.json(summary);
});

module.exports = router;
