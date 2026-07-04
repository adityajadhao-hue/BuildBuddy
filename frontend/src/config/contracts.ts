/**
 * Contract addresses and ABIs for frontend reads.
 */

export const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const BOUNTYGATE_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTYGATE_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'scoreOf',
    inputs: [{ name: 'dev', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'streakOf',
    inputs: [
      { name: 'dev', type: 'address' },
      { name: 'repoHash', type: 'bytes32' },
    ],
    outputs: [{ type: 'uint32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'githubOf',
    inputs: [{ name: 'dev', type: 'address' }],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBuildCount',
    inputs: [
      { name: 'dev', type: 'address' },
      { name: 'repoHash', type: 'bytes32' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ScoreUpdated',
    inputs: [
      { name: 'dev', type: 'address', indexed: true },
      { name: 'newScore', type: 'uint256', indexed: false },
      { name: 'repoStreak', type: 'uint32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BuildSubmitted',
    inputs: [
      { name: 'dev', type: 'address', indexed: true },
      { name: 'repoHash', type: 'bytes32', indexed: true },
      { name: 'index', type: 'uint256', indexed: false },
      { name: 'status', type: 'uint8', indexed: false },
      { name: 'attestationHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

export const BOUNTYGATE_ABI = [
  {
    type: 'function',
    name: 'requiredScore',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isEligible',
    inputs: [{ name: 'dev', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'claimBounty',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimedBy',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'BountyClaimed',
    inputs: [
      { name: 'dev', type: 'address', indexed: true },
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
    ],
  },
] as const;
