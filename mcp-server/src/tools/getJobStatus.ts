import { getJobStatus as fetchJobStatus } from '../client/api.js';

export const getJobStatusTool = {
  name: 'get-job-status',
  description: 'Check the status of a pending verification job. Use this to poll for results if verify-build was interrupted or to check a previously submitted job.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      jobId: {
        type: 'string',
        description: 'The job ID returned by verify-build (UUID format)',
      },
    },
    required: ['jobId'],
  },
};

export async function handleGetJobStatus(args: { jobId: string }) {
  const status = await fetchJobStatus(args.jobId);

  let text = `**Job Status:** ${status.status}\n\n`;
  text += `**Job ID:** ${status.jobId}\n`;
  text += `**Repository:** ${status.repoUrl}\n`;
  text += `**Commit:** ${status.commitHash}\n`;
  text += `**Branch:** ${status.branch}\n`;
  text += `**Wallet:** ${status.walletAddress}\n`;
  text += `**Created:** ${status.createdAt}\n`;
  text += `**Updated:** ${status.updatedAt}\n`;

  if (status.error) {
    text += `\n**Error:** ${status.error}\n`;
  }

  if (status.result) {
    const r = status.result;
    text += `\n**Result:**\n`;
    text += `  Status: ${r.status}\n`;
    text += `  Tests: ${r.testsPassed} passed, ${r.testsFailed} failed\n`;
    text += `  Score: ${r.scoreAwarded}\n`;
    text += `  TX: ${r.txHash}\n`;
  }

  return {
    content: [{ type: 'text' as const, text }],
  };
}
