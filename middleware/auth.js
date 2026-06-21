const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN, ROLES } = require('../config');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: '令牌无效或已过期' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足，需要以下角色之一: ' + roles.join(', ') });
    }
    next();
  };
}

const requireAdmin = requireRoles(ROLES.ADMIN);
const requireExperimenter = requireRoles(ROLES.EXPERIMENTER, ROLES.ADMIN);
const requireReviewer = requireRoles(ROLES.REVIEWER, ROLES.ADMIN);

module.exports = {
  generateToken,
  authenticate,
  requireRoles,
  requireAdmin,
  requireExperimenter,
  requireReviewer
};
