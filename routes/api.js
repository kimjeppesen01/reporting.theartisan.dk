const router = require('express').Router();
const { saveOverride } = require('../utils/categorizer');
const { loadAllocations, saveAllocations } = require('../utils/labourService');
const mapping = require('../config/mapping');

// POST /api/categorize — save a manual category override for a bill line
router.post('/categorize', (req, res) => {
  const { billLineId, category } = req.body;

  if (!billLineId || !category) {
    return res.status(400).json({ error: 'billLineId and category are required' });
  }

  const validCategories = mapping.allCategories;
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: 'Invalid category', valid: validCategories });
  }

  try {
    saveOverride(billLineId, category);
    res.json({ ok: true, billLineId, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/labour — save labour allocation percentages + deduction
router.post('/labour', (req, res) => {
  const { tabs, roles, deduction } = req.body;

  if (tabs) {
    const sum = Object.values(tabs).reduce((s, v) => s + Number(v), 0);
    if (Math.abs(sum - 100) > 0.5) {
      return res.status(400).json({ error: 'Tab percentages must sum to 100%', got: sum });
    }
  }

  if (roles) {
    for (const [tabKey, roleMap] of Object.entries(roles)) {
      const sum = Object.values(roleMap).reduce((s, v) => s + Number(v), 0);
      if (Math.abs(sum - 100) > 0.5) {
        return res.status(400).json({ error: `Roles for ${tabKey} must sum to 100%`, got: sum });
      }
    }
  }

  try {
    const current = loadAllocations();
    const updated = {
      tabs: tabs
        ? Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, Number(v)]))
        : current.tabs,
      roles: roles
        ? Object.fromEntries(Object.entries(roles).map(([tk, rm]) => [
            tk,
            Object.fromEntries(Object.entries(rm).map(([rk, rv]) => [rk, Number(rv)]))
          ]))
        : current.roles,
      deduction: deduction !== undefined ? Math.max(0, Number(deduction)) : current.deduction,
    };
    saveAllocations(updated);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
