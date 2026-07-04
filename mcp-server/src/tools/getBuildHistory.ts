import { getBuildHistory as fetchBuildHistory } from '../client/api.js';
import { keccak256, toHex } from 'viem';

export const getBuildHistoryTool = {
  name: 'get-build-history',
  description: 'Get the build attestation history for a wallet and repository. Returns all on-chain build records with their status, test counts, and timestamps.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      walletAddress: {
        type: 'string',
        description: 'Ethereum wallet address (0x-prefixed)',
      },
      repoUrl: {
        type: 'string',
        description: 'Repository URL (e.g., https://github.com/user/repo)',
      },
    },
    required: ['walletAddress', 'repoUrl'],
  },
};

export async function handleGetBuildHistory(args: { walletAddress: string; repoUrl: string }) {
  const repoHash = keccak256(toHex(args.repoUrl));
  const data = await fetchBuildHistory(args.walletAddress, repoHash);

  if (!data.builds || data.builds.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `No builds found for ${args.repoUrl} (wallet: ${args.walletAddress})`,
        },
      ],
    };
  }

  let text = `**Build History** — ${args.repoUrl}\n\n`;
  text += `Wallet: ${args.walletAddress}\n`;
  text += `Total builds: ${data.builds.length}\n\n`;

  for (const build of data.builds as Array<{
    commitHash: string;
    status: number;
    confidenceScore: number;
    timestamp: number;
  }>) {
    const statusLabel = build.status === 1 ? '✅ Pass' : build.status === 2 ? '🚩 Flagged' : '❌ Fail';
    const date = new Date(build.timestamp * 1000).toISOString();
    text += `${statusLabel} | ${build.commitHash.slice(0, 10)}... | ${date}\n`;
  }

  return {
    content: [{ type: 'text' as const, text }],
  };
}
