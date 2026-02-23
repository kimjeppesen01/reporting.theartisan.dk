const router = require('express').Router();

router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

module.exports = router;
