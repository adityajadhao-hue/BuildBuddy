import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getEnv } from '../config/env.js';
import { REGISTRY_ABI } from './abi.js';
import { monadTestnet } from './monad.js';

function getOracleClient() {
  const env = getEnv();
  const account = privateKeyToAccount(env.ORACLE_PRIVATE_KEY as `0x${string}`);

  return createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(env.MONAD_RPC_URL),
  });
}

export interface BuildRecordInput {
  commitHash: `0x${string}`;
  parentCommitHash: `0x${string}`;
  attestationHash: `0x${string}`;
  repoHash: `0x${string}`;
  ipfsCidHash: `0x${string}`;
  confidenceScore: number;
  status: number; // 0=fail, 1=pass, 2=flagged
  dirtyTree: boolean;
  timestamp: bigint;
}

export async function submitBuildOnChain(
  dev: `0x${string}`,
  record: BuildRecordInput,
  trivialDiff: boolean,
): Promise<`0x${string}`> {
  const env = getEnv();
  const client = getOracleClient();

  const hash = await client.writeContract({
    address: env.REGISTRY_CONTRACT_ADDRESS as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: 'submitBuild',
    args: [dev, record, trivialDiff],
  });

  return hash;
}

export async function linkGithubOnChain(
  dev: `0x${string}`,
  githubHandle: string,
): Promise<`0x${string}`> {
  const env = getEnv();
  const client = getOracleClient();

  const hash = await client.writeContract({
    address: env.REGISTRY_CONTRACT_ADDRESS as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: 'linkGithub',
    args: [dev, githubHandle],
  });

  return hash;
}
