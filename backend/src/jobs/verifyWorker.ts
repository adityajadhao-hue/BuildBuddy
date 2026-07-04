/**
 * Simplified Verification Worker — MVP (no Fly.io, no Redis)
 *
 * Runs verification directly on the backend machine:
 * 1. Clone repo at commit
 * 2. Read manifest → derive test command
 * 3. Run tests locally
 * 4. Parse output through 3-layer pipeline
 * 5. Submit attestation on-chain
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { keccak256, toHex } from 'viem';
import { updateJob, type JobResult } from './jobStore.js';
import { parseTestOutput } from '../agent/parseOrchestrator.js';
import { analyzeDiff } from '../verify/diffAnalysis.js';
import { submitBuildOnChain, type BuildRecordInput } from '../chain/submit.js';

const execAsync = promisify(exec);

interface VerifyJobData {
  jobId: string;
  repoUrl: string;
  commitHash: string;
  branch: string;
  walletAddress: string;
}

const TIMEOUT_MS = 5 * 60 * 1000; // 5 min

/**
 * Process a verification job (called directly, no queue needed).
 */
export async function processVerification(data: VerifyJobData): Promise<void> {
  const { jobId, repoUrl, commitHash, branch, walletAddress } = data;
  let workDir = '';

  try {
    // ─── Stage 1: Clone ───────────────────────────────────────────────────────
    await updateJob(jobId, { status: 'cloning' });

    workDir = await mkdtemp(path.join(tmpdir(), 'buildbuddy-'));

    await execAsync(
      `git clone --depth=50 --branch ${branch} ${repoUrl} .`,
      { cwd: workDir, timeout: 60000 },
    );

    await execAsync(
      `git checkout ${commitHash}`,
      { cwd: workDir, timeout: 10000 },
    );

    // ─── Stage 2: Detect framework ───────────────────────────────────────────
    await updateJob(jobId, { status: 'testing' });

    let testCmd = '';
    let framework = 'unknown';

    try {
      const pkgRaw = await readFile(path.join(workDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      const testScript = pkg?.scripts?.test;

      if (testScript && !testScript.includes('no test specified')) {
        if (testScript.includes('jest')) {
          framework = 'jest';
          testCmd = 'npx jest --json --outputFile=/tmp/test-results.json 2>&1 || true';
        } else if (testScript.includes('vitest')) {
          framework = 'vitest';
          testCmd = 'npx vitest run --reporter=json 2>&1 || true';
        } else {
          framework = 'npm-test';
          testCmd = 'npm test 2>&1 || true';
        }
      }
    } catch {
      // No package.json
    }

    if (!testCmd) {
      try {
        await readFile(path.join(workDir, 'foundry.toml'), 'utf-8');
        framework = 'foundry';
        testCmd = 'forge test --json 2>&1 || true';
      } catch {
        // not foundry
      }
    }

    if (!testCmd) {
      await updateJob(jobId, {
        status: 'failed',
        error: 'Could not derive test command from project manifest',
      });
      return;
    }

    // ─── Stage 3: Install deps & run tests ────────────────────────────────────
    await updateJob(jobId, { status: 'installing' });

    // Install deps
    try {
      await execAsync('npm ci --prefer-offline || npm install', {
        cwd: workDir,
        timeout: 120000,
      });
    } catch {
      // Some projects may not need install
    }

    await updateJob(jobId, { status: 'testing' });

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    const startTime = Date.now();

    try {
      const result = await execAsync(testCmd, {
        cwd: workDir,
        timeout: TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; code?: number };
      stdout = execErr.stdout || '';
      stderr = execErr.stderr || '';
      exitCode = execErr.code || 1;
    }

    const durationMs = Date.now() - startTime;

    // ─── Stage 4: Parse output ────────────────────────────────────────────────
    await updateJob(jobId, { status: 'parsing' });

    const parseResult = parseTestOutput({
      exitCode,
      stdout,
      stderr,
      framework,
    });

    // ─── Stage 5: Diff analysis ───────────────────────────────────────────────
    let diffContent = '';
    try {
      const diffResult = await execAsync('git diff HEAD~1 HEAD', {
        cwd: workDir,
        timeout: 10000,
        maxBuffer: 5 * 1024 * 1024,
      });
      diffContent = diffResult.stdout;
    } catch {
      // First commit or no parent
    }

    const diffAnalysis = analyzeDiff(diffContent);

    // ─── Stage 6: Submit on-chain ─────────────────────────────────────────────
    await updateJob(jobId, { status: 'attesting' });

    let finalStatus = parseResult.status;
    const flagReason = parseResult.flagReason;

    // Build attestation
    const repoHash = keccak256(toHex(repoUrl));
    const attestationData = JSON.stringify({
      version: '1.0',
      wallet: walletAddress,
      repo: repoUrl,
      commit: commitHash,
      framework,
      tests_passed: parseResult.testsPassed,
      tests_failed: parseResult.testsFailed,
      status: finalStatus,
      timestamp: new Date().toISOString(),
    });
    const attestationHash = keccak256(toHex(attestationData));
    const commitBytes = padToBytes32(commitHash);

    const buildRecord: BuildRecordInput = {
      commitHash: commitBytes,
      parentCommitHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      attestationHash: attestationHash as `0x${string}`,
      repoHash: repoHash as `0x${string}`,
      ipfsCidHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      confidenceScore: parseResult.confidenceScore,
      status: finalStatus,
      dirtyTree: false,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };

    let txHash = '0x0' as `0x${string}`;
    try {
      txHash = await submitBuildOnChain(
        walletAddress as `0x${string}`,
        buildRecord,
        diffAnalysis.trivialDiff,
      );
    } catch (err) {
      console.error('Chain submission failed:', err);
      // Still mark as complete — just no on-chain attestation
    }

    // ─── Done ─────────────────────────────────────────────────────────────────
    const scoreEstimate = finalStatus === 1 && !diffAnalysis.trivialDiff ? 110 : finalStatus === 2 ? -25 : 0;

    const result: JobResult = {
      status: finalStatus === 1 ? 'pass' : finalStatus === 2 ? 'flagged' : 'fail',
      testsPassed: parseResult.testsPassed,
      testsFailed: parseResult.testsFailed,
      testsSkipped: parseResult.testsSkipped,
      durationMs,
      frameworkDetected: framework,
      flagReason: flagReason ?? undefined,
      trivialDiff: diffAnalysis.trivialDiff,
      scoreAwarded: scoreEstimate,
      attestationHash,
      ipfsCid: 'local-mvp', // No IPFS in free MVP
      txHash: txHash as string,
    };

    await updateJob(jobId, { status: 'completed', result });
  } catch (err) {
    console.error(`Verification error for job ${jobId}:`, err);
    await updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  } finally {
    // Cleanup temp dir
    if (workDir) {
      try {
        await rm(workDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

function padToBytes32(hex: string): `0x${string}` {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return `0x${clean.padStart(64, '0')}` as `0x${string}`;
}
