import { createPublicClient, http, keccak256, toHex } from 'viem';
import { getEnv } from '../config/env.js';
import { REGISTRY_ABI } from './abi.js';
import { monadTestnet } from './monad.js';

function getClient() {
  const env = getEnv();
  return createPublicClient({
    chain: monadTestnet,
    transport: http(env.MONAD_RPC_URL),
  });
}

export async function getDevScore(wallet: `0x${string}`) {
  const env = getEnv();
  const client = getClient();
  const score = await client.readContract({
    address: env.REGISTRY_CONTRACT_ADDRESS as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: 'scoreOf',
    args: [wallet],
  });
  return { wallet, score: Number(score) };
}

export async function getBuildHistory(wallet: `0x${string}`, repoHash: `0x${string}`) {
  const env = getEnv();
  const client = getClient();

  const count = (await client.readContract({
    address: env.REGISTRY_CONTRACT_ADDRESS as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: 'getBuildCount',
    args: [wallet, repoHash],
  })) as bigint;

  const builds = [];
  for (let i = 0; i < Number(count); i++) {
    const build = (await client.readContract({
      address: env.REGISTRY_CONTRACT_ADDRESS as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'getBuild',
      args: [wallet, repoHash, BigInt(i)],
    })) as {
      commitHash: string;
      parentCommitHash: string;
      attestationHash: string;
      repoHash: string;
      ipfsCidHash: string;
      confidenceScore: number;
      status: number;
      dirtyTree: boolean;
      timestamp: bigint;
    };

    builds.push({
      commitHash: build.commitHash,
      parentCommitHash: build.parentCommitHash,
      attestationHash: build.attestationHash,
      repoHash: build.repoHash,
      ipfsCidHash: build.ipfsCidHash,
      confidenceScore: Number(build.confidenceScore),
      status: Number(build.status),
      dirtyTree: build.dirtyTree,
      timestamp: Number(build.timestamp),
    });
  }

  return builds;
}

export function computeRepoHash(repoUrl: string): `0x${string}` {
  return keccak256(toHex(repoUrl));
}
