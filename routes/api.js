const router = require('express').Router();
const { saveOverride } = require('../utils/categorizer');
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

module.exports = router;
