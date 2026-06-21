const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../data/store');
const { generateToken, authenticate, requireAdmin } = require('../middleware/auth');
const { ROLES } = require('../config');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }

  const user = store.users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ message: '用户名或密码错误' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: '用户名或密码错误' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    }
  });
});

router.get('/me', authenticate, (req, res) => {
  const user = store.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: '用户不存在' });
  }
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    createdAt: user.createdAt
  });
});

router.get('/users', authenticate, requireAdmin, (req, res) => {
  const users = store.users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    name: u.name,
    createdAt: u.createdAt
  }));
  res.json(users);
});

router.post('/users', authenticate, requireAdmin, (req, res) => {
  const { username, password, role, name } = req.body;
  
  if (!username || !password || !role || !name) {
    return res.status(400).json({ message: '用户名、密码、角色、姓名为必填项' });
  }

  const validRoles = Object.values(ROLES);
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: '无效的角色，可选值: ' + validRoles.join(', ') });
  }

  if (store.users.some(u => u.username === username)) {
    return res.status(400).json({ message: '用户名已存在' });
  }

  const salt = bcrypt.genSaltSync(10);
  const user = {
    id: store.nextId.user++,
    username,
    password: bcrypt.hashSync(password, salt),
    role,
    name,
    createdAt: new Date().toISOString()
  };
  store.users.push(user);

  res.status(201).json({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    createdAt: user.createdAt
  });
});

router.put('/users/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const user = store.users.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ message: '用户不存在' });
  }

  const { password, role, name } = req.body;
  if (name) user.name = name;
  if (role) {
    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: '无效的角色' });
    }
    user.role = role;
  }
  if (password) {
    const salt = bcrypt.genSaltSync(10);
    user.password = bcrypt.hashSync(password, salt);
  }

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name
  });
});

router.delete('/users/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ message: '不能删除当前登录用户' });
  }
  const idx = store.users.findIndex(u => u.id === id);
  if (idx === -1) {
    return res.status(404).json({ message: '用户不存在' });
  }
  store.users.splice(idx, 1);
  res.json({ message: '删除成功' });
});

module.exports = router;
