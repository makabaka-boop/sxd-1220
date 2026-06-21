const express = require('express');
const store = require('../data/store');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/formulas', authenticate, (req, res) => {
  res.json(store.formulas);
});

router.post('/formulas', authenticate, requireAdmin, (req, res) => {
  const { code, name, description } = req.body;
  if (!code || !name) {
    return res.status(400).json({ message: '配方编号和名称为必填项' });
  }
  if (store.formulas.some(f => f.code === code)) {
    return res.status(400).json({ message: '配方编号已存在' });
  }
  const formula = {
    id: store.nextId.formula++,
    code,
    name,
    description: description || '',
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };
  store.formulas.push(formula);
  res.status(201).json(formula);
});

router.put('/formulas/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const formula = store.formulas.find(f => f.id === id);
  if (!formula) return res.status(404).json({ message: '配方不存在' });
  
  const { code, name, description } = req.body;
  if (code && code !== formula.code && store.formulas.some(f => f.code === code)) {
    return res.status(400).json({ message: '配方编号已存在' });
  }
  if (code) formula.code = code;
  if (name) formula.name = name;
  if (description !== undefined) formula.description = description;
  
  res.json(formula);
});

router.delete('/formulas/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (store.trialBatches.some(b => b.formulaId === id)) {
    return res.status(400).json({ message: '该配方已关联试制批号，无法删除' });
  }
  const idx = store.formulas.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ message: '配方不存在' });
  store.formulas.splice(idx, 1);
  res.json({ message: '删除成功' });
});

router.get('/raw-material-batches', authenticate, (req, res) => {
  res.json(store.rawMaterialBatches);
});

router.post('/raw-material-batches', authenticate, requireAdmin, (req, res) => {
  const { code, materialName, supplier, arrivalDate, expiryDate } = req.body;
  if (!code || !materialName) {
    return res.status(400).json({ message: '原料批次号和原料名称为必填项' });
  }
  if (store.rawMaterialBatches.some(r => r.code === code)) {
    return res.status(400).json({ message: '原料批次号已存在' });
  }
  const item = {
    id: store.nextId.rawMaterialBatch++,
    code,
    materialName,
    supplier: supplier || '',
    arrivalDate: arrivalDate || '',
    expiryDate: expiryDate || '',
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };
  store.rawMaterialBatches.push(item);
  res.status(201).json(item);
});

router.put('/raw-material-batches/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const item = store.rawMaterialBatches.find(r => r.id === id);
  if (!item) return res.status(404).json({ message: '原料批次不存在' });
  
  const { code, materialName, supplier, arrivalDate, expiryDate } = req.body;
  if (code && code !== item.code && store.rawMaterialBatches.some(r => r.code === code)) {
    return res.status(400).json({ message: '原料批次号已存在' });
  }
  if (code) item.code = code;
  if (materialName) item.materialName = materialName;
  if (supplier !== undefined) item.supplier = supplier;
  if (arrivalDate !== undefined) item.arrivalDate = arrivalDate;
  if (expiryDate !== undefined) item.expiryDate = expiryDate;
  
  res.json(item);
});

router.delete('/raw-material-batches/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (store.trialBatches.some(b => b.rawMaterialBatchIds && b.rawMaterialBatchIds.includes(id))) {
    return res.status(400).json({ message: '该原料批次已关联试制批号，无法删除' });
  }
  const idx = store.rawMaterialBatches.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ message: '原料批次不存在' });
  store.rawMaterialBatches.splice(idx, 1);
  res.json({ message: '删除成功' });
});

router.get('/packaging-types', authenticate, (req, res) => {
  res.json(store.packagingTypes);
});

router.post('/packaging-types', authenticate, requireAdmin, (req, res) => {
  const { code, name, material, volume } = req.body;
  if (!code || !name) {
    return res.status(400).json({ message: '包材编号和名称为必填项' });
  }
  if (store.packagingTypes.some(p => p.code === code)) {
    return res.status(400).json({ message: '包材编号已存在' });
  }
  const item = {
    id: store.nextId.packagingType++,
    code,
    name,
    material: material || '',
    volume: volume || '',
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };
  store.packagingTypes.push(item);
  res.status(201).json(item);
});

router.put('/packaging-types/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const item = store.packagingTypes.find(p => p.id === id);
  if (!item) return res.status(404).json({ message: '包材类型不存在' });
  
  const { code, name, material, volume } = req.body;
  if (code && code !== item.code && store.packagingTypes.some(p => p.code === code)) {
    return res.status(400).json({ message: '包材编号已存在' });
  }
  if (code) item.code = code;
  if (name) item.name = name;
  if (material !== undefined) item.material = material;
  if (volume !== undefined) item.volume = volume;
  
  res.json(item);
});

router.delete('/packaging-types/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (store.trialBatches.some(b => b.packagingTypeId === id)) {
    return res.status(400).json({ message: '该包材类型已关联试制批号，无法删除' });
  }
  const idx = store.packagingTypes.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ message: '包材类型不存在' });
  store.packagingTypes.splice(idx, 1);
  res.json({ message: '删除成功' });
});

router.get('/observation-conditions', authenticate, (req, res) => {
  res.json(store.observationConditions);
});

router.post('/observation-conditions', authenticate, requireAdmin, (req, res) => {
  const { code, name, temperature, humidity, description } = req.body;
  if (!code || !name) {
    return res.status(400).json({ message: '观察条件编号和名称为必填项' });
  }
  if (store.observationConditions.some(o => o.code === code)) {
    return res.status(400).json({ message: '观察条件编号已存在' });
  }
  const item = {
    id: store.nextId.observationCondition++,
    code,
    name,
    temperature: temperature || '',
    humidity: humidity || '',
    description: description || '',
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };
  store.observationConditions.push(item);
  res.status(201).json(item);
});

router.put('/observation-conditions/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const item = store.observationConditions.find(o => o.id === id);
  if (!item) return res.status(404).json({ message: '观察条件不存在' });
  
  const { code, name, temperature, humidity, description } = req.body;
  if (code && code !== item.code && store.observationConditions.some(o => o.code === code)) {
    return res.status(400).json({ message: '观察条件编号已存在' });
  }
  if (code) item.code = code;
  if (name) item.name = name;
  if (temperature !== undefined) item.temperature = temperature;
  if (humidity !== undefined) item.humidity = humidity;
  if (description !== undefined) item.description = description;
  
  res.json(item);
});

router.delete('/observation-conditions/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (store.trialBatches.some(b => b.observationConditionId === id)) {
    return res.status(400).json({ message: '该观察条件已关联试制批号，无法删除' });
  }
  const idx = store.observationConditions.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ message: '观察条件不存在' });
  store.observationConditions.splice(idx, 1);
  res.json({ message: '删除成功' });
});

router.get('/responsible-persons', authenticate, (req, res) => {
  res.json(store.responsiblePersons);
});

router.post('/responsible-persons', authenticate, requireAdmin, (req, res) => {
  const { code, name, department, position, userId } = req.body;
  if (!code || !name) {
    return res.status(400).json({ message: '责任人编号和姓名为必填项' });
  }
  if (store.responsiblePersons.some(r => r.code === code)) {
    return res.status(400).json({ message: '责任人编号已存在' });
  }
  const item = {
    id: store.nextId.responsiblePerson++,
    code,
    name,
    department: department || '',
    position: position || '',
    userId: userId || null,
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };
  store.responsiblePersons.push(item);
  res.status(201).json(item);
});

router.put('/responsible-persons/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const item = store.responsiblePersons.find(r => r.id === id);
  if (!item) return res.status(404).json({ message: '责任人不存在' });
  
  const { code, name, department, position, userId } = req.body;
  if (code && code !== item.code && store.responsiblePersons.some(r => r.code === code)) {
    return res.status(400).json({ message: '责任人编号已存在' });
  }
  if (code) item.code = code;
  if (name) item.name = name;
  if (department !== undefined) item.department = department;
  if (position !== undefined) item.position = position;
  if (userId !== undefined) item.userId = userId;
  
  res.json(item);
});

router.delete('/responsible-persons/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (store.trialBatches.some(b => b.responsiblePersonId === id)) {
    return res.status(400).json({ message: '该责任人已关联试制批号，无法删除' });
  }
  const idx = store.responsiblePersons.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ message: '责任人不存在' });
  store.responsiblePersons.splice(idx, 1);
  res.json({ message: '删除成功' });
});

router.get('/retest-cycles', authenticate, (req, res) => {
  res.json(store.retestCycles);
});

router.post('/retest-cycles', authenticate, requireAdmin, (req, res) => {
  const { code, name, intervalDays, description } = req.body;
  if (!code || !name || !intervalDays) {
    return res.status(400).json({ message: '周期编号、名称、间隔天数为必填项' });
  }
  if (store.retestCycles.some(c => c.code === code)) {
    return res.status(400).json({ message: '复测周期编号已存在' });
  }
  const item = {
    id: store.nextId.retestCycle++,
    code,
    name,
    intervalDays: parseInt(intervalDays),
    description: description || '',
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };
  store.retestCycles.push(item);
  res.status(201).json(item);
});

router.put('/retest-cycles/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const item = store.retestCycles.find(c => c.id === id);
  if (!item) return res.status(404).json({ message: '复测周期不存在' });
  
  const { code, name, intervalDays, description } = req.body;
  if (code && code !== item.code && store.retestCycles.some(c => c.code === code)) {
    return res.status(400).json({ message: '复测周期编号已存在' });
  }
  if (code) item.code = code;
  if (name) item.name = name;
  if (intervalDays !== undefined) item.intervalDays = parseInt(intervalDays);
  if (description !== undefined) item.description = description;
  
  res.json(item);
});

router.delete('/retest-cycles/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (store.trialBatches.some(b => b.retestCycleId === id)) {
    return res.status(400).json({ message: '该复测周期已关联试制批号，无法删除' });
  }
  const idx = store.retestCycles.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ message: '复测周期不存在' });
  store.retestCycles.splice(idx, 1);
  res.json({ message: '删除成功' });
});

module.exports = router;
