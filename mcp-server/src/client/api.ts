/**
 * HTTP client for communicating with the BuildBuddy backend.
 * Handles authentication, retries, and error wrapping.
 */

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;

interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

function getConfig(): ApiConfig {
  const baseUrl = process.env.BUILDBUDDY_API_URL || 'http://localhost:3001';
  const apiKey = process.env.BUILDBUDDY_API_KEY || '';

  if (!apiKey) {
    throw new Error('BUILDBUDDY_API_KEY is required. Set it in your environment.');
  }

  return { baseUrl, apiKey };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retries = MAX_RETRIES,
): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      const error = new Error(`API Error ${response.status}: ${errBody}`);
      
      // Retry on 5xx errors
      if (response.status >= 500 && retries > 0) {
        await sleep(1000);
        return request<T>(method, path, body, retries - 1);
      }
      
      throw error;
    }

    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (retries > 0) {
        await sleep(1000);
        return request<T>(method, path, body, retries - 1);
      }
      throw new Error(`Request to ${path} timed out after ${DEFAULT_TIMEOUT}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── API Methods ────────────────────────────────────────────────────────────

export interface VerifyRequest {
  repoUrl: string;
  commitHash: string;
  branch: string;
  walletAddress: string;
}

export interface VerifyResponse {
  jobId: string;
  status: string;
  message: string;
}

export interface JobStatus {
  jobId: string;
  status: string;
  repoUrl: string;
  commitHash: string;
  branch: string;
  walletAddress: string;
  createdAt: string;
  updatedAt: string;
  result: JobResult | null;
  error: string | null;
}

export interface JobResult {
  status: 'pass' | 'fail' | 'flagged';
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  durationMs: number;
  frameworkDetected: string;
  flagReason?: string;
  trivialDiff: boolean;
  scoreAwarded: number;
  attestationHash: string;
  ipfsCid: string;
  txHash: string;
}

export interface ScoreResponse {
  wallet: string;
  score: number;
}

export interface ChallengeResponse {
  nonce: string;
  instructions: string;
  expiresIn: number;
}

export interface IdentityVerifyResponse {
  verified: boolean;
  txHash?: string;
  message?: string;
  reason?: string;
}

export async function submitVerification(data: VerifyRequest): Promise<VerifyResponse> {
  return request<VerifyResponse>('POST', '/verify', data);
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return request<JobStatus>('GET', `/jobs/${jobId}`);
}

export async function getDevScore(wallet: string): Promise<ScoreResponse> {
  return request<ScoreResponse>('GET', `/dev/${wallet}/score`);
}

export async function getBuildHistory(wallet: string, repoHash: string): Promise<{ builds: unknown[] }> {
  return request<{ builds: unknown[] }>('GET', `/dev/${wallet}/builds/${repoHash}`);
}

export async function requestChallenge(wallet: string, githubHandle: string): Promise<ChallengeResponse> {
  return request<ChallengeResponse>('POST', '/identity/challenge', { wallet, githubHandle });
}

export async function verifyIdentity(wallet: string, githubHandle: string): Promise<IdentityVerifyResponse> {
  return request<IdentityVerifyResponse>('POST', '/identity/verify', { wallet, githubHandle });
}

// ─── Polling ────────────────────────────────────────────────────────────────

/**
 * Poll a job until it reaches a terminal state.
 */
export async function pollJobUntilComplete(
  jobId: string,
  intervalMs = 3000,
  maxAttempts = 100,
): Promise<JobStatus> {
  const terminalStates = ['completed', 'failed'];

  for (let i = 0; i < maxAttempts; i++) {
    const status = await getJobStatus(jobId);

    if (terminalStates.includes(status.status)) {
      return status;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Job ${jobId} did not complete within ${maxAttempts * intervalMs / 1000}s`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
