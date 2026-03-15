import express from 'express';
import { authUwaba } from '../middleware/authUwaba.js';
import { startWarmer, stopWarmer, getWarmerStatus } from '../controllers/warmerController.js';

const router = express.Router();

router.use(authUwaba);

router.get('/status', (req, res) => {
  try {
    const data = getWarmerStatus();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Warmer status error' });
  }
});

router.post('/start', (req, res) => {
  try {
    const result = startWarmer();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Warmer start error' });
  }
});

router.post('/stop', (req, res) => {
  try {
    const result = stopWarmer();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e?.message || 'Warmer stop error' });
  }
});

export default router;
