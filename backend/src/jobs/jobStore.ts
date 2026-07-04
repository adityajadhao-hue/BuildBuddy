/**
 * In-memory job store — no Redis required for MVP.
 * Jobs expire after 1 hour.
 */

export interface JobData {
  id: string;
  status: 'pending' | 'cloning' | 'installing' | 'testing' | 'parsing' | 'verifying' | 'attesting' | 'completed' | 'failed';
  repoUrl: string;
  commitHash: string;
  branch: string;
  walletAddress: string;
  createdAt: string;
  updatedAt: string;
  result?: JobResult;
  error?: string;
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

// In-memory store
const jobs = new Map<string, JobData>();

export async function createJob(data: Omit<JobData, 'status' | 'createdAt' | 'updatedAt'>): Promise<JobData> {
  const job: JobData = {
    ...data,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.set(data.id, job);

  // Auto-expire after 1 hour
  setTimeout(() => jobs.delete(data.id), 60 * 60 * 1000);

  return job;
}

export async function updateJob(
  id: string,
  update: Partial<Pick<JobData, 'status' | 'result' | 'error'>>,
): Promise<JobData | null> {
  const job = jobs.get(id);
  if (!job) return null;

  Object.assign(job, update, { updatedAt: new Date().toISOString() });
  jobs.set(id, job);
  return job;
}

export async function getJob(id: string): Promise<JobData | null> {
  return jobs.get(id) || null;
}
