const bcrypt = require('bcryptjs');
const { ROLES, STATUS } = require('../config');

const store = {
  users: [],
  formulas: [],
  rawMaterialBatches: [],
  packagingTypes: [],
  observationConditions: [],
  responsiblePersons: [],
  retestCycles: [],
  trialBatches: [],
  experimentRecords: [],
  reviewRecords: [],
  retestPlans: [],
  nextId: {
    user: 1,
    formula: 1,
    rawMaterialBatch: 1,
    packagingType: 1,
    observationCondition: 1,
    responsiblePerson: 1,
    retestCycle: 1,
    trialBatch: 1,
    experimentRecord: 1,
    reviewRecord: 1,
    retestPlan: 1
  }
};

function initDefaultData() {
  const salt = bcrypt.genSaltSync(10);
  store.users.push(
    { id: store.nextId.user++, username: 'admin', password: bcrypt.hashSync('admin123', salt), role: ROLES.ADMIN, name: '系统管理员', createdAt: new Date().toISOString() },
    { id: store.nextId.user++, username: 'exp01', password: bcrypt.hashSync('exp123', salt), role: ROLES.EXPERIMENTER, name: '实验员张三', createdAt: new Date().toISOString() },
    { id: store.nextId.user++, username: 'exp02', password: bcrypt.hashSync('exp123', salt), role: ROLES.EXPERIMENTER, name: '实验员李四', createdAt: new Date().toISOString() },
    { id: store.nextId.user++, username: 'rev01', password: bcrypt.hashSync('rev123', salt), role: ROLES.REVIEWER, name: '复核员王五', createdAt: new Date().toISOString() },
    { id: store.nextId.user++, username: 'rev02', password: bcrypt.hashSync('rev123', salt), role: ROLES.REVIEWER, name: '复核员赵六', createdAt: new Date().toISOString() }
  );

  store.formulas.push(
    { id: store.nextId.formula++, code: 'FM-2026-001', name: '保湿精华液配方A', description: '透明质酸保湿体系', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.formula++, code: 'FM-2026-002', name: '抗皱面霜配方B', description: '视黄醇抗皱体系', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.formula++, code: 'FM-2026-003', name: '洁面乳配方C', description: '温和氨基酸表面活性剂体系', createdBy: 1, createdAt: new Date().toISOString() }
  );

  store.rawMaterialBatches.push(
    { id: store.nextId.rawMaterialBatch++, code: 'RM-HA-2601', materialName: '透明质酸钠', supplier: '华熙生物', arrivalDate: '2026-01-15', expiryDate: '2028-01-14', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.rawMaterialBatch++, code: 'RM-RET-2602', materialName: '视黄醇棕榈酸酯', supplier: 'DSM', arrivalDate: '2026-02-10', expiryDate: '2027-02-09', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.rawMaterialBatch++, code: 'RM-AA-2603', materialName: '月桂酰谷氨酸钠', supplier: '味之素', arrivalDate: '2026-03-05', expiryDate: '2027-03-04', createdBy: 1, createdAt: new Date().toISOString() }
  );

  store.packagingTypes.push(
    { id: store.nextId.packagingType++, code: 'PK-BTL-001', name: 'PET透明滴瓶30ml', material: 'PET', volume: '30ml', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.packagingType++, code: 'PK-JAR-002', name: '膏霜罐50g', material: 'PP', volume: '50g', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.packagingType++, code: 'PK-TUB-003', name: '软管洁面120g', material: 'PE', volume: '120g', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.packagingType++, code: 'PK-BTL-004', name: '玻璃滴管瓶15ml', material: '玻璃', volume: '15ml', createdBy: 1, createdAt: new Date().toISOString() }
  );

  store.observationConditions.push(
    { id: store.nextId.observationCondition++, code: 'COND-RT', name: '常温存储', temperature: '25°C', humidity: '60%RH', description: '标准室温条件', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.observationCondition++, code: 'COND-HT', name: '高温加速', temperature: '45°C', humidity: '75%RH', description: '加速稳定性测试', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.observationCondition++, code: 'COND-LT', name: '低温冻融', temperature: '-5°C', humidity: '—', description: '低温循环测试', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.observationCondition++, code: 'COND-LIGHT', name: '光照测试', temperature: '25°C', humidity: '60%RH', description: '4500lux光照稳定性', createdBy: 1, createdAt: new Date().toISOString() }
  );

  store.responsiblePersons.push(
    { id: store.nextId.responsiblePerson++, code: 'RP-001', name: '张三', department: '研发部', position: '高级实验员', userId: 2, createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.responsiblePerson++, code: 'RP-002', name: '李四', department: '研发部', position: '实验员', userId: 3, createdBy: 1, createdAt: new Date().toISOString() }
  );

  store.retestCycles.push(
    { id: store.nextId.retestCycle++, code: 'CYC-WEEKLY', name: '每周检测', intervalDays: 7, description: '每周进行一次稳定性检测', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.retestCycle++, code: 'CYC-BIWEEKLY', name: '双周检测', intervalDays: 14, description: '每两周进行一次稳定性检测', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.retestCycle++, code: 'CYC-MONTHLY', name: '每月检测', intervalDays: 30, description: '每月进行一次稳定性检测', createdBy: 1, createdAt: new Date().toISOString() },
    { id: store.nextId.retestCycle++, code: 'CYC-QUARTERLY', name: '季度检测', intervalDays: 90, description: '每季度进行一次稳定性检测', createdBy: 1, createdAt: new Date().toISOString() }
  );

  const now = new Date();
  const isoDate = (daysOffset = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().split('T')[0];
  };

  store.trialBatches.push(
    {
      id: store.nextId.trialBatch++,
      formulaId: 1,
      formulaCode: 'FM-2026-001',
      batchNumber: 'TR-001',
      rawMaterialBatchIds: [1],
      packagingTypeId: 1,
      packagingTypeName: 'PET透明滴瓶30ml',
      observationConditionId: 1,
      observationConditionName: '常温存储',
      responsiblePersonId: 1,
      responsiblePersonName: '张三',
      retestCycleId: 1,
      retestCycleDays: 7,
      productionDate: isoDate(-14),
      status: STATUS.OBSERVING,
      createdBy: 1,
      createdAt: isoDate(-14),
      updatedAt: isoDate(-14)
    },
    {
      id: store.nextId.trialBatch++,
      formulaId: 1,
      formulaCode: 'FM-2026-001',
      batchNumber: 'TR-002',
      rawMaterialBatchIds: [1],
      packagingTypeId: 4,
      packagingTypeName: '玻璃滴管瓶15ml',
      observationConditionId: 2,
      observationConditionName: '高温加速',
      responsiblePersonId: 1,
      responsiblePersonName: '张三',
      retestCycleId: 2,
      retestCycleDays: 14,
      productionDate: isoDate(-21),
      status: STATUS.PENDING_RETEST,
      createdBy: 1,
      createdAt: isoDate(-21),
      updatedAt: isoDate(-7)
    },
    {
      id: store.nextId.trialBatch++,
      formulaId: 2,
      formulaCode: 'FM-2026-002',
      batchNumber: 'TR-003',
      rawMaterialBatchIds: [2],
      packagingTypeId: 2,
      packagingTypeName: '膏霜罐50g',
      observationConditionId: 1,
      observationConditionName: '常温存储',
      responsiblePersonId: 2,
      responsiblePersonName: '李四',
      retestCycleId: 2,
      retestCycleDays: 14,
      productionDate: isoDate(-7),
      status: STATUS.PENDING_PREP,
      createdBy: 1,
      createdAt: isoDate(-7),
      updatedAt: isoDate(-7)
    },
    {
      id: store.nextId.trialBatch++,
      formulaId: 3,
      formulaCode: 'FM-2026-003',
      batchNumber: 'TR-004',
      rawMaterialBatchIds: [3],
      packagingTypeId: 3,
      packagingTypeName: '软管洁面120g',
      observationConditionId: 1,
      observationConditionName: '常温存储',
      responsiblePersonId: 2,
      responsiblePersonName: '李四',
      retestCycleId: 3,
      retestCycleDays: 30,
      productionDate: isoDate(-30),
      status: STATUS.ABNORMAL_FOLLOWUP,
      createdBy: 1,
      createdAt: isoDate(-30),
      updatedAt: isoDate(-3)
    },
    {
      id: store.nextId.trialBatch++,
      formulaId: 2,
      formulaCode: 'FM-2026-002',
      batchNumber: 'TR-005',
      rawMaterialBatchIds: [2],
      packagingTypeId: 2,
      packagingTypeName: '膏霜罐50g',
      observationConditionId: 2,
      observationConditionName: '高温加速',
      responsiblePersonId: 1,
      responsiblePersonName: '张三',
      retestCycleId: 1,
      retestCycleDays: 7,
      productionDate: isoDate(-60),
      status: STATUS.READY_SCALEUP,
      createdBy: 1,
      createdAt: isoDate(-60),
      updatedAt: isoDate(-1)
    }
  );

  store.experimentRecords.push(
    {
      id: store.nextId.experimentRecord++,
      trialBatchId: 1,
      trialBatchNumber: 'TR-001',
      recordDate: isoDate(-14),
      samplePrepared: true,
      appearance: '澄清透明液体，色泽均匀',
      viscosity: 1250,
      viscosityUnit: 'cP',
      odor: '轻微特征气味，无异常',
      pH: 6.2,
      packagingCompatibility: '良好，无渗漏',
      abnormalLevel: '正常',
      suggestedAction: '继续观察',
      experimenterId: 2,
      experimenterName: '张三',
      remarks: '初始检测，各项指标正常',
      createdAt: isoDate(-14)
    },
    {
      id: store.nextId.experimentRecord++,
      trialBatchId: 1,
      trialBatchNumber: 'TR-001',
      recordDate: isoDate(-7),
      samplePrepared: false,
      appearance: '澄清透明液体，色泽均匀',
      viscosity: 1280,
      viscosityUnit: 'cP',
      odor: '轻微特征气味，无异常',
      pH: 6.1,
      packagingCompatibility: '良好，无渗漏',
      abnormalLevel: '正常',
      suggestedAction: '继续观察',
      experimenterId: 2,
      experimenterName: '张三',
      remarks: '一周后复测，稳定性良好',
      createdAt: isoDate(-7)
    },
    {
      id: store.nextId.experimentRecord++,
      trialBatchId: 2,
      trialBatchNumber: 'TR-002',
      recordDate: isoDate(-21),
      samplePrepared: true,
      appearance: '澄清透明液体',
      viscosity: 1300,
      viscosityUnit: 'cP',
      odor: '正常',
      pH: 6.0,
      packagingCompatibility: '密封良好',
      abnormalLevel: '正常',
      suggestedAction: '继续观察',
      experimenterId: 2,
      experimenterName: '张三',
      remarks: '初始检测',
      createdAt: isoDate(-21)
    },
    {
      id: store.nextId.experimentRecord++,
      trialBatchId: 4,
      trialBatchNumber: 'TR-004',
      recordDate: isoDate(-30),
      samplePrepared: true,
      appearance: '白色乳液，均匀细腻',
      viscosity: 8500,
      viscosityUnit: 'cP',
      odor: '正常特征气味',
      pH: 5.8,
      packagingCompatibility: '良好',
      abnormalLevel: '正常',
      suggestedAction: '继续观察',
      experimenterId: 3,
      experimenterName: '李四',
      remarks: '初始检测',
      createdAt: isoDate(-30)
    },
    {
      id: store.nextId.experimentRecord++,
      trialBatchId: 4,
      trialBatchNumber: 'TR-004',
      recordDate: isoDate(-3),
      samplePrepared: false,
      appearance: '轻微分层现象，底部有沉淀',
      viscosity: null,
      viscosityUnit: 'cP',
      odor: '略带酸味，气味异常',
      pH: 5.2,
      packagingCompatibility: '管尾有轻微渗出',
      abnormalLevel: '中等',
      suggestedAction: '需复测并评估配方稳定性',
      experimenterId: 3,
      experimenterName: '李四',
      remarks: '发现异常，已标记待复测',
      createdAt: isoDate(-3)
    }
  );

  store.reviewRecords.push(
    {
      id: store.nextId.reviewRecord++,
      trialBatchId: 5,
      trialBatchNumber: 'TR-005',
      retestDate: isoDate(-1),
      retestResult: '通过',
      appearanceStable: true,
      viscosityDeviation: 3.5,
      odorNormal: true,
      riskLevel: '低风险',
      releaseRecommendation: '建议放大生产',
      reviewerId: 4,
      reviewerName: '王五',
      remarks: '经多轮稳定性测试，各项指标均在合格范围内，可进入放大阶段',
      createdAt: isoDate(-1)
    }
  );

  const { RETEST_PLAN_STATUS } = require('../config');

  store.retestPlans.push(
    {
      id: store.nextId.retestPlan++,
      trialBatchId: 1,
      trialBatchNumber: 'TR-001',
      sourceType: 'experiment',
      sourceRecordId: 2,
      originalPlanDate: isoDate(0),
      currentPlanDate: isoDate(0),
      status: RETEST_PLAN_STATUS.PENDING,
      extensionCount: 0,
      extensionReason: '',
      lastHandlerId: null,
      lastHandlerName: '',
      lastHandledAt: null,
      remarks: '',
      actions: [
        { type: 'created', handlerId: 2, handlerName: '张三', handledAt: isoDate(-7) + 'T08:00:00.000Z', fromStatus: null, toStatus: RETEST_PLAN_STATUS.PENDING, planDate: isoDate(0), reason: '', remarks: '' }
      ],
      createdAt: isoDate(-7) + 'T08:00:00.000Z'
    },
    {
      id: store.nextId.retestPlan++,
      trialBatchId: 2,
      trialBatchNumber: 'TR-002',
      sourceType: 'experiment',
      sourceRecordId: 3,
      originalPlanDate: isoDate(-7),
      currentPlanDate: isoDate(-3),
      status: RETEST_PLAN_STATUS.EXTENDED,
      extensionCount: 1,
      extensionReason: '实验设备维护，延期复测',
      lastHandlerId: 2,
      lastHandlerName: '张三',
      lastHandledAt: isoDate(-5) + 'T10:00:00.000Z',
      remarks: '',
      actions: [
        { type: 'created', handlerId: 2, handlerName: '张三', handledAt: isoDate(-21) + 'T08:00:00.000Z', fromStatus: null, toStatus: RETEST_PLAN_STATUS.PENDING, planDate: isoDate(-7), reason: '', remarks: '' },
        { type: 'extended', handlerId: 2, handlerName: '张三', handledAt: isoDate(-5) + 'T10:00:00.000Z', fromStatus: RETEST_PLAN_STATUS.PENDING, toStatus: RETEST_PLAN_STATUS.EXTENDED, prevPlanDate: isoDate(-7), planDate: isoDate(-3), reason: '实验设备维护，延期复测', remarks: '' }
      ],
      createdAt: isoDate(-21) + 'T08:00:00.000Z'
    },
    {
      id: store.nextId.retestPlan++,
      trialBatchId: 3,
      trialBatchNumber: 'TR-003',
      sourceType: 'creation',
      sourceRecordId: null,
      originalPlanDate: isoDate(7),
      currentPlanDate: isoDate(7),
      status: RETEST_PLAN_STATUS.CONFIRMED,
      extensionCount: 0,
      extensionReason: '',
      lastHandlerId: 3,
      lastHandlerName: '李四',
      lastHandledAt: isoDate(-6) + 'T09:00:00.000Z',
      remarks: '已确认样品制备完成后复测',
      actions: [
        { type: 'created', handlerId: 1, handlerName: '系统管理员', handledAt: isoDate(-7) + 'T08:00:00.000Z', fromStatus: null, toStatus: RETEST_PLAN_STATUS.PENDING, planDate: isoDate(7), reason: '', remarks: '' },
        { type: 'confirmed', handlerId: 3, handlerName: '李四', handledAt: isoDate(-6) + 'T09:00:00.000Z', fromStatus: RETEST_PLAN_STATUS.PENDING, toStatus: RETEST_PLAN_STATUS.CONFIRMED, planDate: isoDate(7), reason: '', remarks: '已确认样品制备完成后复测' }
      ],
      createdAt: isoDate(-7) + 'T08:00:00.000Z'
    },
    {
      id: store.nextId.retestPlan++,
      trialBatchId: 4,
      trialBatchNumber: 'TR-004',
      sourceType: 'experiment',
      sourceRecordId: 5,
      originalPlanDate: isoDate(11),
      currentPlanDate: isoDate(11),
      status: RETEST_PLAN_STATUS.PENDING,
      extensionCount: 0,
      extensionReason: '',
      lastHandlerId: null,
      lastHandlerName: '',
      lastHandledAt: null,
      remarks: '发现异常后需安排复测',
      actions: [
        { type: 'created', handlerId: 3, handlerName: '李四', handledAt: isoDate(-3) + 'T08:00:00.000Z', fromStatus: null, toStatus: RETEST_PLAN_STATUS.PENDING, planDate: isoDate(11), reason: '', remarks: '发现异常后需安排复测' }
      ],
      createdAt: isoDate(-3) + 'T08:00:00.000Z'
    },
    {
      id: store.nextId.retestPlan++,
      trialBatchId: 5,
      trialBatchNumber: 'TR-005',
      sourceType: 'review',
      sourceRecordId: 1,
      originalPlanDate: isoDate(-1),
      currentPlanDate: isoDate(-1),
      status: RETEST_PLAN_STATUS.COMPLETED,
      extensionCount: 0,
      extensionReason: '',
      lastHandlerId: 4,
      lastHandlerName: '王五',
      lastHandledAt: isoDate(-1) + 'T10:00:00.000Z',
      remarks: '复核完成，结论通过',
      actions: [
        { type: 'created', handlerId: 4, handlerName: '王五', handledAt: isoDate(-8) + 'T08:00:00.000Z', fromStatus: null, toStatus: RETEST_PLAN_STATUS.PENDING, planDate: isoDate(-1), reason: '', remarks: '' },
        { type: 'completed', handlerId: 4, handlerName: '王五', handledAt: isoDate(-1) + 'T10:00:00.000Z', fromStatus: RETEST_PLAN_STATUS.PENDING, toStatus: RETEST_PLAN_STATUS.COMPLETED, planDate: isoDate(-1), reason: '', remarks: '复核完成，结论通过' }
      ],
      createdAt: isoDate(-8) + 'T08:00:00.000Z'
    }
  );
}

initDefaultData();

module.exports = store;
