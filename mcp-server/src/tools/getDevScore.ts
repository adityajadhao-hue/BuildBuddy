import { getDevScore as fetchDevScore } from '../client/api.js';

export const getDevScoreTool = {
  name: 'get-dev-score',
  description: 'Query the on-chain builder score for a wallet address. Returns the aggregate score across all repositories.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      walletAddress: {
        type: 'string',
        description: 'Ethereum wallet address (0x-prefixed, 40 hex chars)',
      },
    },
    required: ['walletAddress'],
  },
};

export async function handleGetDevScore(args: { walletAddress: string }) {
  const data = await fetchDevScore(args.walletAddress);

  let text = `**Developer Score**\n\n`;
  text += `Wallet: ${data.wallet}\n`;
  text += `Score: ${data.score}\n\n`;

  if (data.score === 0) {
    text += `No verified builds yet. Use verify-build to submit your first attestation.\n`;
  } else if (data.score < 500) {
    text += `Keep building! You need 500+ to unlock BountyGate rewards.\n`;
  } else {
    text += `You're eligible for BountyGate bounties (requires 500+).\n`;
  }

  return {
    content: [{ type: 'text' as const, text }],
  };
}
