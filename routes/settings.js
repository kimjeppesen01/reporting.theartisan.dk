const router = require('express').Router();
const billy = require('../services/billyService');

router.get('/', async (req, res) => {
  const token = process.env.BILLY_API_TOKEN || '';
  const masked = token.length > 6
    ? '••••••' + token.slice(-6)
    : token || '(not set)';

  let orgName = null;
  let connectionError = null;

  if (token) {
    try {
      const org = await billy.getOrganisation();
      orgName = org.name;
    } catch (err) {
      connectionError = 'Could not connect to Billy API: ' + err.message;
    }
  }

  res.render('settings', {
    masked,
    orgName,
    connectionError,
    noToken: req.query.error === 'no_token'
  });
});

module.exports = router;
