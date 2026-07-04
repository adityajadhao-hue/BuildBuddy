'use client';

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import {
  REGISTRY_ADDRESS,
  REGISTRY_ABI,
  BOUNTYGATE_ADDRESS,
  BOUNTYGATE_ABI,
} from '@/config/contracts';

export default function BountyPage() {
  const { address } = useAccount();
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | undefined>();

  const { data: requiredScore } = useReadContract({
    address: BOUNTYGATE_ADDRESS,
    abi: BOUNTYGATE_ABI,
    functionName: 'requiredScore',
  });

  const { data: userScore } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'scoreOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: isEligible } = useReadContract({
    address: BOUNTYGATE_ADDRESS,
    abi: BOUNTYGATE_ABI,
    functionName: 'isEligible',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: claimTxHash,
  });

  const handleClaim = () => {
    writeContract(
      {
        address: BOUNTYGATE_ADDRESS,
        abi: BOUNTYGATE_ABI,
        functionName: 'claimBounty',
        args: [BigInt(0)],
      },
      { onSuccess: (hash) => setClaimTxHash(hash) },
    );
  };

  const scoreNum = Number(userScore || 0);
  const requiredNum = Number(requiredScore || 500);
  const progress = Math.min(100, (scoreNum / requiredNum) * 100);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">BountyGate</h1>
      <p className="text-gray-400 mb-8">
        Bounties gated by build reputation. Only proven builders can claim.
      </p>

      {!address ? (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">Connect wallet to check eligibility</p>
          <ConnectButton />
        </div>
      ) : (
        <>
          {/* Score Progress */}
          <div className="border border-gray-800 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-sm text-gray-400">Your Build Score</p>
                <p className="text-4xl font-bold text-purple-400">{scoreNum}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">Required</p>
                <p className="text-2xl font-bold text-gray-500">{requiredNum}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isEligible ? 'bg-green-500' : 'bg-purple-600'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center gap-2">
              {isEligible ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-green-400 text-sm font-medium">Eligible to claim</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                  <span className="text-gray-400 text-sm">
                    {requiredNum - scoreNum} more points needed
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Bounty Card */}
          <div className="border border-gray-800 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-white font-semibold">Demo Bounty #0</h3>
                <p className="text-sm text-gray-400">Proof-of-Build achievement reward</p>
              </div>
              <span className="text-lg font-bold text-green-400">Free Claim</span>
            </div>

            <button
              onClick={handleClaim}
              disabled={!isEligible || isPending || isConfirming || isSuccess}
              className={`w-full py-3 rounded-lg font-medium transition ${
                isSuccess
                  ? 'bg-green-700 text-green-100'
                  : isEligible
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isPending ? 'Confirm in wallet...' :
               isConfirming ? 'Confirming on-chain...' :
               isSuccess ? 'Claimed!' :
               isEligible ? 'Claim Bounty' : 'Score too low'}
            </button>

            {isSuccess && claimTxHash && (
              <div className="mt-4 bg-green-950/30 border border-green-800 rounded-lg p-4">
                <p className="text-green-400 text-sm font-medium">Bounty claimed successfully!</p>
                <a
                  href={`https://testnet.monadexplorer.com/tx/${claimTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 mt-1 block"
                >
                  View transaction on Monad Explorer
                </a>
              </div>
            )}
          </div>

          {/* Explanation */}
          <div className="border border-gray-800 rounded-lg p-6">
            <h3 className="text-white font-semibold mb-3">How BountyGate Works</h3>
            <div className="space-y-3 text-sm text-gray-400">
              <p>
                <span className="text-white">1.</span> Verify your builds using the Verify page or MCP tool
              </p>
              <p>
                <span className="text-white">2.</span> Each passing build adds to your on-chain score
              </p>
              <p>
                <span className="text-white">3.</span> When your score reaches {requiredNum}, you can claim bounties
              </p>
              <p>
                <span className="text-white">4.</span> The smart contract checks your score directly — no middleman
              </p>
            </div>
            <div className="mt-4 text-xs text-gray-500 bg-gray-900 rounded p-3">
              The BountyGate contract reads <code className="text-purple-400">scoreOf(your_wallet)</code> from
              BuildAttestationRegistry. No admin can override. No resumes. Just proof.
            </div>
          </div>
        </>
      )}
    </main>
  );
}
