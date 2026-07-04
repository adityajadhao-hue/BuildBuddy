/**
 * ABI for BuildAttestationRegistry contract.
 * Generated from Foundry compilation output.
 */
export const REGISTRY_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_oracle', type: 'address' }],
  },
  {
    type: 'function',
    name: 'trustedOracle',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
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
    type: 'function',
    name: 'getBuild',
    inputs: [
      { name: 'dev', type: 'address' },
      { name: 'repoHash', type: 'bytes32' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'commitHash', type: 'bytes32' },
          { name: 'parentCommitHash', type: 'bytes32' },
          { name: 'attestationHash', type: 'bytes32' },
          { name: 'repoHash', type: 'bytes32' },
          { name: 'ipfsCidHash', type: 'bytes32' },
          { name: 'confidenceScore', type: 'uint16' },
          { name: 'status', type: 'uint8' },
          { name: 'dirtyTree', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLatestBuild',
    inputs: [
      { name: 'dev', type: 'address' },
      { name: 'repoHash', type: 'bytes32' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'commitHash', type: 'bytes32' },
          { name: 'parentCommitHash', type: 'bytes32' },
          { name: 'attestationHash', type: 'bytes32' },
          { name: 'repoHash', type: 'bytes32' },
          { name: 'ipfsCidHash', type: 'bytes32' },
          { name: 'confidenceScore', type: 'uint16' },
          { name: 'status', type: 'uint8' },
          { name: 'dirtyTree', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'submitBuild',
    inputs: [
      { name: 'dev', type: 'address' },
      {
        name: 'rec',
        type: 'tuple',
        components: [
          { name: 'commitHash', type: 'bytes32' },
          { name: 'parentCommitHash', type: 'bytes32' },
          { name: 'attestationHash', type: 'bytes32' },
          { name: 'repoHash', type: 'bytes32' },
          { name: 'ipfsCidHash', type: 'bytes32' },
          { name: 'confidenceScore', type: 'uint16' },
          { name: 'status', type: 'uint8' },
          { name: 'dirtyTree', type: 'bool' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
      { name: 'trivialDiff', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'linkGithub',
    inputs: [
      { name: 'dev', type: 'address' },
      { name: 'handle', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOracle',
    inputs: [{ name: 'newOracle', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getDailyBuildCount',
    inputs: [
      { name: 'dev', type: 'address' },
      { name: 'repoHash', type: 'bytes32' },
      { name: 'day', type: 'uint256' },
    ],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
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
    name: 'IdentityLinked',
    inputs: [
      { name: 'dev', type: 'address', indexed: true },
      { name: 'githubHandle', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OracleTransferred',
    inputs: [
      { name: 'previousOracle', type: 'address', indexed: true },
      { name: 'newOracle', type: 'address', indexed: true },
    ],
  },
  {
    type: 'error',
    name: 'NotOracle',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
] as const;

/**
 * ABI for BountyGate contract.
 */
export const BOUNTYGATE_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_registry', type: 'address' },
      { name: '_requiredScore', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'registry',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
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
