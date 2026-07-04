'use client';

import { useReadContract, useWatchContractEvent } from 'wagmi';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import { REGISTRY_ADDRESS, REGISTRY_ABI } from '@/config/contracts';

interface LeaderEntry {
  address: string;
  score: number;
  streak: number;
}

export default function LeaderboardPage() {
  const { address } = useAccount();
  const [entries, setEntries] = useState<LeaderEntry[]>([
    // Placeholder data for demo (will be replaced by live events)
    { address: '0x1234...5678', score: 850, streak: 7 },
    { address: '0xabcd...ef01', score: 620, streak: 4 },
    { address: '0x9876...5432', score: 440, streak: 2 },
  ]);

  // Read connected user's score
  const { data: myScore } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'scoreOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Watch for live ScoreUpdated events
  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: 'ScoreUpdated',
    onLogs(logs) {
      setEntries((prev) => {
        const updated = [...prev];
        for (const log of logs) {
          const dev = (log.args as { dev: string }).dev;
          const newScore = Number((log.args as { newScore: bigint }).newScore);
          const streak = Number((log.args as { repoStreak: number }).repoStreak || 0);
          const idx = updated.findIndex((e) => e.address === dev);
          if (idx >= 0) {
            updated[idx] = { address: dev, score: newScore, streak };
          } else {
            updated.push({ address: dev, score: newScore, streak });
          }
        }
        return updated.sort((a, b) => b.score - a.score);
      });
    },
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
          <p className="text-gray-400 mt-1">Top builders ranked by verified build score</p>
        </div>
        <ConnectButton />
      </div>

      {/* My Score */}
      {address && (
        <div className="border border-purple-800/50 bg-purple-950/20 rounded-lg p-5 mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">Your Score</p>
            <p className="text-3xl font-bold text-purple-400">
              {myScore ? Number(myScore).toLocaleString() : '0'}
            </p>
          </div>
          <div className="text-right text-sm text-gray-400">
            <p className="font-mono">{address.slice(0, 6)}...{address.slice(-4)}</p>
            <p className="mt-1">
              {myScore && Number(myScore) >= 500
                ? <span className="text-green-400">Bounty eligible</span>
                : <span>{500 - Number(myScore || 0)} pts to bounty</span>
              }
            </p>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-gray-900 text-xs text-gray-400 uppercase tracking-wide">
          <div className="col-span-1">Rank</div>
          <div className="col-span-7">Developer</div>
          <div className="col-span-2 text-right">Streak</div>
          <div className="col-span-2 text-right">Score</div>
        </div>

        {entries.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-500">
            <p>No verified builds yet. Be the first!</p>
            <a href="/verify" className="text-purple-400 text-sm mt-2 inline-block">Verify a build</a>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {entries.map((entry, i) => (
              <div
                key={entry.address}
                className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-gray-900/50 transition"
              >
                <div className="col-span-1 text-gray-500 font-bold">
                  {i === 0 ? <span className="text-yellow-400">1</span> :
                   i === 1 ? <span className="text-gray-300">2</span> :
                   i === 2 ? <span className="text-orange-400">3</span> :
                   i + 1}
                </div>
                <div className="col-span-7 font-mono text-sm text-gray-300">
                  {entry.address}
                </div>
                <div className="col-span-2 text-right text-sm text-orange-400">
                  {entry.streak > 0 ? `${entry.streak} streak` : '-'}
                </div>
                <div className="col-span-2 text-right font-bold text-purple-400">
                  {entry.score.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <p className="text-center text-xs text-gray-500 mt-6">
        Scores update in real-time from on-chain events on Monad Testnet
      </p>
    </main>
  );
}
