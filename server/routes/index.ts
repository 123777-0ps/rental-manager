import { Router } from 'express';
import apiRouter from './api';

const router = Router();

// API 路由
router.use(apiRouter);

// 健康检查接口
router.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    env: process.env.COZE_PROJECT_ENV,
    timestamp: new Date().toISOString(),
  });
});

export default router;
