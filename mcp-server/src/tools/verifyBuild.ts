import { submitVerification, pollJobUntilComplete } from '../client/api.js';

export const verifyBuildTool = {
  name: 'verify-build',
  description:
    'Submit a repository for build verification. Clones the repo at the specified commit, runs tests in a sandboxed environment, and creates an on-chain attestation on Monad testnet. Returns the full verification result including test counts, score awarded, and transaction hash.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      repoUrl: {
        type: 'string',
        description: 'HTTPS URL of the GitHub/GitLab repository (e.g., https://github.com/user/repo)',
      },
      commitHash: {
        type: 'string',
        description: 'Git commit hash to verify (7-40 hex characters)',
      },
      branch: {
        type: 'string',
        description: 'Branch name (defaults to "main")',
        default: 'main',
      },
      walletAddress: {
        type: 'string',
        description: 'Ethereum wallet address to receive the attestation (0x-prefixed, 40 hex chars)',
      },
    },
    required: ['repoUrl', 'commitHash', 'walletAddress'],
  },
};

export async function handleVerifyBuild(args: {
  repoUrl: string;
  commitHash: string;
  branch?: string;
  walletAddress: string;
}) {
  // Submit the verification job
  const submitResult = await submitVerification({
    repoUrl: args.repoUrl,
    commitHash: args.commitHash,
    branch: args.branch || 'main',
    walletAddress: args.walletAddress,
  });

  // Poll until complete
  const finalStatus = await pollJobUntilComplete(submitResult.jobId);

  if (finalStatus.status === 'failed') {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Verification failed: ${finalStatus.error || 'Unknown error'}\n\nJob ID: ${submitResult.jobId}`,
        },
      ],
    };
  }

  const result = finalStatus.result!;
  const statusEmoji = result.status === 'pass' ? '✅' : result.status === 'flagged' ? '🚩' : '❌';

  let text = `${statusEmoji} Build Verification Complete\n\n`;
  text += `**Status:** ${result.status.toUpperCase()}\n`;
  text += `**Repository:** ${args.repoUrl}\n`;
  text += `**Commit:** ${args.commitHash}\n`;
  text += `**Framework:** ${result.frameworkDetected}\n\n`;
  text += `**Test Results:**\n`;
  text += `  Passed: ${result.testsPassed}\n`;
  text += `  Failed: ${result.testsFailed}\n`;
  text += `  Skipped: ${result.testsSkipped}\n`;
  text += `  Duration: ${result.durationMs}ms\n\n`;
  text += `**Score Awarded:** ${result.scoreAwarded}\n`;
  text += `**Trivial Diff:** ${result.trivialDiff ? 'Yes (0 points)' : 'No'}\n`;

  if (result.flagReason) {
    text += `**Flag Reason:** ${result.flagReason}\n`;
  }

  text += `\n**On-Chain:**\n`;
  text += `  TX Hash: ${result.txHash}\n`;
  text += `  Attestation: ${result.attestationHash}\n`;
  text += `  IPFS CID: ${result.ipfsCid}\n`;
  text += `  Explorer: https://testnet.monadexplorer.com/tx/${result.txHash}\n`;

  return {
    content: [{ type: 'text' as const, text }],
  };
}
