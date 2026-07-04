import { requestChallenge, verifyIdentity } from '../client/api.js';

export const linkGithubTool = {
  name: 'link-github',
  description:
    'Link a GitHub identity to a wallet address via challenge-response. First generates a nonce, then instructs the user to create a public GitHub Gist containing the nonce. After confirmation, verifies and links the identity on-chain.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      walletAddress: {
        type: 'string',
        description: 'Ethereum wallet address (0x-prefixed)',
      },
      githubHandle: {
        type: 'string',
        description: 'GitHub username to link',
      },
      verify: {
        type: 'boolean',
        description: 'Set to true to verify after creating the gist. First call without this to get the nonce.',
        default: false,
      },
    },
    required: ['walletAddress', 'githubHandle'],
  },
};

export async function handleLinkGithub(args: {
  walletAddress: string;
  githubHandle: string;
  verify?: boolean;
}) {
  if (args.verify) {
    // Step 2: Verify the gist
    const result = await verifyIdentity(args.walletAddress, args.githubHandle);

    if (result.verified) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `✅ GitHub identity verified and linked on-chain!\n\nHandle: ${args.githubHandle}\nWallet: ${args.walletAddress}\nTX Hash: ${result.txHash}\nExplorer: https://testnet.monadexplorer.com/tx/${result.txHash}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Verification failed: ${result.reason}\n\nMake sure your public gist titled "buildbuddy-verify" contains the exact nonce.`,
          },
        ],
      };
    }
  }

  // Step 1: Request challenge
  const challenge = await requestChallenge(args.walletAddress, args.githubHandle);

  let text = `**GitHub Identity Challenge**\n\n`;
  text += `To link **${args.githubHandle}** to wallet ${args.walletAddress}:\n\n`;
  text += `1. Create a **public** GitHub Gist\n`;
  text += `2. Title/filename: \`buildbuddy-verify\`\n`;
  text += `3. Content: \`${challenge.nonce}\`\n`;
  text += `4. Save the gist\n`;
  text += `5. Call this tool again with \`verify: true\`\n\n`;
  text += `Nonce expires in ${challenge.expiresIn} seconds.\n`;
  text += `\nDirect link to create gist: https://gist.github.com`;

  return {
    content: [{ type: 'text' as const, text }],
  };
}
