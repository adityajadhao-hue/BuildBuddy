'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      {/* Hero */}
      <section className="text-center mb-20">
        <h1 className="text-5xl font-bold text-white mb-4">
          Proof-of-Build on Monad
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
          Verify your test suite passes. Get an immutable on-chain attestation.
          Build portable developer reputation that smart contracts can read.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/verify"
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium no-underline transition"
          >
            Verify a Build
          </Link>
          <Link
            href="/leaderboard"
            className="border border-gray-700 hover:border-gray-500 text-gray-300 px-6 py-3 rounded-lg font-medium no-underline transition"
          >
            View Leaderboard
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-gray-800 rounded-lg p-6 text-center">
            <div className="text-3xl mb-3">1</div>
            <h3 className="text-lg font-semibold text-white mb-2">Submit Your Repo</h3>
            <p className="text-gray-400 text-sm">
              Provide your GitHub repo URL, commit hash, and wallet address.
              We clone it server-side at that exact commit.
            </p>
          </div>
          <div className="border border-gray-800 rounded-lg p-6 text-center">
            <div className="text-3xl mb-3">2</div>
            <h3 className="text-lg font-semibold text-white mb-2">Tests Run in Sandbox</h3>
            <p className="text-gray-400 text-sm">
              We detect your test framework (Jest, Vitest, pytest, Foundry, etc.),
              install deps, and run your actual tests. No faking possible.
            </p>
          </div>
          <div className="border border-gray-800 rounded-lg p-6 text-center">
            <div className="text-3xl mb-3">3</div>
            <h3 className="text-lg font-semibold text-white mb-2">On-Chain Attestation</h3>
            <p className="text-gray-400 text-sm">
              Results are verified and submitted to Monad testnet.
              Your score grows. Bounties unlock. Reputation is permanent.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">Why BuildBuddy?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-gray-800 rounded-lg p-5">
            <h3 className="font-semibold text-white mb-2">On-Chain Reputation</h3>
            <p className="text-gray-400 text-sm">
              Your build score lives on Monad. Any smart contract can read it.
              No more trusting CI badges locked to GitHub.
            </p>
          </div>
          <div className="border border-gray-800 rounded-lg p-5">
            <h3 className="font-semibold text-white mb-2">Anti-Cheat</h3>
            <p className="text-gray-400 text-sm">
              Framework signature detection catches &quot;echo PASS&quot; attacks.
              Exit code is ground truth. Whitespace commits earn 0 points.
            </p>
          </div>
          <div className="border border-gray-800 rounded-lg p-5">
            <h3 className="font-semibold text-white mb-2">Score-Gated Bounties</h3>
            <p className="text-gray-400 text-sm">
              BountyGate lets projects gate rewards by build score.
              Only proven builders can claim. No resumes needed.
            </p>
          </div>
          <div className="border border-gray-800 rounded-lg p-5">
            <h3 className="font-semibold text-white mb-2">MCP Integration</h3>
            <p className="text-gray-400 text-sm">
              Works with AI coding assistants (Kiro, Claude).
              Just say &quot;verify my build&quot; and the tool handles everything.
            </p>
          </div>
        </div>
      </section>

      {/* Connect Wallet CTA */}
      <section className="text-center border border-gray-800 rounded-lg p-10 mb-20">
        <h2 className="text-2xl font-bold text-white mb-3">Get Started</h2>
        <p className="text-gray-400 mb-6">Connect your wallet to view your score and claim bounties</p>
        <ConnectButton />
      </section>

      {/* Scoring */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-6">Scoring System</h2>
        <div className="max-w-lg mx-auto border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900">
              <tr>
                <th className="text-left px-4 py-3 text-gray-400">Event</th>
                <th className="text-right px-4 py-3 text-gray-400">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              <tr>
                <td className="px-4 py-3">Verified passing build</td>
                <td className="px-4 py-3 text-right text-green-400">+100 + streak bonus</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Consecutive builds (streak)</td>
                <td className="px-4 py-3 text-right text-green-400">+10 per streak</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Flagged build (cheat detected)</td>
                <td className="px-4 py-3 text-right text-red-400">-25, streak resets</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Failed build</td>
                <td className="px-4 py-3 text-right text-gray-400">0, streak resets</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Whitespace-only commit</td>
                <td className="px-4 py-3 text-right text-gray-400">0 (still recorded)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-gray-500 border-t border-gray-800 pt-8">
        <p>Built on Monad Testnet (Chain ID: 10143) | Sub-second finality | EVM compatible</p>
        <p className="mt-2">
          <a href="https://faucet.monad.xyz" target="_blank" rel="noopener noreferrer">Get free MON</a>
          {' | '}
          <a href="https://testnet.monadexplorer.com" target="_blank" rel="noopener noreferrer">Explorer</a>
        </p>
      </footer>
    </main>
  );
}
