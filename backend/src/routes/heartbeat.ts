import { Router } from 'express';
import { HeartbeatRegistry } from '../services/HeartbeatRegistry';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();
const registry = HeartbeatRegistry.getInstance();

// Public endpoint: modules can POST heartbeats without auth (internal only)
router.post('/beat', (req, res) => {
	try {
		const { moduleId, filePath, processId, service } = req.body || {};
		if (!moduleId || !filePath || !processId) {
			return res.status(400).json({ success: false, error: 'Missing fields' });
		}
		registry.report(String(moduleId), String(filePath), Number(processId), service ? String(service) : undefined);
		return res.json({ success: true });
	} catch (err: any) {
		return res.status(500).json({ success: false, error: err.message });
	}
});

// Admin: summarize activity
router.get('/summary', authenticateAdmin, (req, res) => {
	return res.json({ success: true, data: registry.getSummary() });
});

// Admin: list active records
router.get('/active', authenticateAdmin, (req, res) => {
	return res.json({ success: true, data: registry.getActiveRecords() });
});

export default router;




