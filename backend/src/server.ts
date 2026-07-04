import { config } from 'dotenv';
config(); // Load .env file

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { validateEnv, getEnv } from './config/env.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createJob, getJob } from './jobs/jobStore.js';
import { processVerification } from './jobs/verifyWorker.js';
import { getDevScore, getBuildHistory } from './chain/read.js';

// ─── Validate environment ───────────────────────────────────────────────────

validateEnv();
const env = getEnv();

// ─── Express App ────────────────────────────────────────────────────────────

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// ─── Health Check ───────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'buildbuddy-backend-mvp',
    timestamp: new Date().toISOString(),
  });
});

// ─── POST /verify ───────────────────────────────────────────────────────────

const verifySchema = z.object({
  repoUrl: z.string().url(),
  commitHash: z.string().regex(/^[a-f0-9]{7,40}$/),
  branch: z.string().min(1).default('main'),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

app.post('/verify', authMiddleware, async (req, res) => {
  try {
    const body = verifySchema.parse(req.body);
    const jobId = uuidv4();

    await createJob({
      id: jobId,
      repoUrl: body.repoUrl,
      commitHash: body.commitHash,
      branch: body.branch,
      walletAddress: body.walletAddress,
    });

    // Process in background (no Redis queue — just fire and forget)
    processVerification({
      jobId,
      repoUrl: body.repoUrl,
      commitHash: body.commitHash,
      branch: body.branch,
      walletAddress: body.walletAddress,
    }).catch((err) => console.error('Background verification error:', err));

    res.status(202).json({
      jobId,
      status: 'pending',
      message: 'Verification started. Poll GET /jobs/:id for status.',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    throw err;
  }
});

// ─── GET /jobs/:id ──────────────────────────────────────────────────────────

app.get('/jobs/:id', authMiddleware, async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

// ─── GET /dev/:wallet/score ─────────────────────────────────────────────────

app.get('/dev/:wallet/score', authMiddleware, async (req, res) => {
  try {
    const data = await getDevScore(req.params.wallet as `0x${string}`);
    res.json(data);
  } catch (err) {
    console.error('Score read error:', err);
    res.status(502).json({ error: 'Failed to read on-chain data' });
  }
});

// ─── GET /dev/:wallet/builds/:repoHash ──────────────────────────────────────

app.get('/dev/:wallet/builds/:repoHash', authMiddleware, async (req, res) => {
  try {
    const builds = await getBuildHistory(
      req.params.wallet as `0x${string}`,
      req.params.repoHash as `0x${string}`,
    );
    res.json({ builds });
  } catch (err) {
    console.error('Build history read error:', err);
    res.status(502).json({ error: 'Failed to read on-chain data' });
  }
});

// ─── Error Handler ──────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start ──────────────────────────────────────────────────────────────────

app.listen(env.PORT, () => {
  console.log(`\n  BuildBuddy MVP Backend`);
  console.log(`  ─────────────────────`);
  console.log(`  Running on: http://localhost:${env.PORT}`);
  console.log(`  Health:     http://localhost:${env.PORT}/health`);
  console.log(`  Chain:      Monad Testnet (10143)\n`);
});

export default app;
