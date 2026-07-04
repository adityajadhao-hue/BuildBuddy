'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

interface VerifyResult {
  jobId?: string;
  status?: string;
  result?: {
    status: string;
    testsPassed: number;
    testsFailed: number;
    durationMs: number;
    frameworkDetected: string;
    scoreAwarded: number;
    txHash: string;
    flagReason?: string;
  };
  error?: string;
}

export default function VerifyPage() {
  const { address } = useAccount();
  const [repoUrl, setRepoUrl] = useState('');
  const [commitHash, setCommitHash] = useState('');
  const [branch, setBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'my-dev-key';

  const handleVerify = async () => {
    if (!address || !repoUrl || !commitHash) return;

    setLoading(true);
    setResult(null);
    setStep('Submitting...');

    try {
      // Submit verification
      const submitRes = await fetch(`${API_URL}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          repoUrl,
          commitHash,
          branch,
          walletAddress: address,
        }),
      });

      const submitData = await submitRes.json();

      if (!submitRes.ok) {
        setResult({ error: submitData.error || 'Submission failed' });
        setLoading(false);
        return;
      }

      const jobId = submitData.jobId;
      setStep('Cloning repo...');

      // Poll for result
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));

        const pollRes = await fetch(`${API_URL}/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        });
        const pollData = await pollRes.json();

        if (pollData.status === 'cloning') setStep('Cloning repository...');
        else if (pollData.status === 'installing') setStep('Installing dependencies...');
        else if (pollData.status === 'testing') setStep('Running tests...');
        else if (pollData.status === 'parsing') setStep('Analyzing results...');
        else if (pollData.status === 'attesting') setStep('Submitting on-chain...');

        if (pollData.status === 'completed' || pollData.status === 'failed') {
          setResult(pollData);
          break;
        }
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Unknown error' });
    }

    setLoading(false);
    setStep('');
  };

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Verify a Build</h1>
      <p className="text-gray-400 mb-8">
        Submit a GitHub repo + commit. We run your tests and record the result on-chain.
      </p>

      {!address ? (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">Connect your wallet to verify builds</p>
          <ConnectButton />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Form */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Repository URL</label>
            <input
              type="text"
              placeholder="https://github.com/user/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Commit Hash</label>
              <input
                type="text"
                placeholder="abc1234 or full 40-char hash"
                value={commitHash}
                onChange={(e) => setCommitHash(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Branch</label>
              <input
                type="text"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm text-gray-400">
            Wallet: <span className="text-white font-mono">{address}</span>
          </div>

          <button
            onClick={handleVerify}
            disabled={loading || !repoUrl || !commitHash}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-medium transition"
          >
            {loading ? step || 'Processing...' : 'Verify Build'}
          </button>

          {/* Result */}
          {result && (
            <div className={`border rounded-lg p-6 mt-6 ${
              result.error
                ? 'border-red-800 bg-red-950/30'
                : result.result?.status === 'pass'
                  ? 'border-green-800 bg-green-950/30'
                  : result.result?.status === 'flagged'
                    ? 'border-orange-800 bg-orange-950/30'
                    : 'border-red-800 bg-red-950/30'
            }`}>
              {result.error ? (
                <div>
                  <h3 className="text-red-400 font-semibold mb-1">Error</h3>
                  <p className="text-gray-300 text-sm">{result.error}</p>
                </div>
              ) : result.result ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-lg font-bold ${
                      result.result.status === 'pass' ? 'text-green-400' :
                      result.result.status === 'flagged' ? 'text-orange-400' : 'text-red-400'
                    }`}>
                      {result.result.status === 'pass' ? 'PASSED' :
                       result.result.status === 'flagged' ? 'FLAGGED' : 'FAILED'}
                    </h3>
                    <span className="text-sm text-gray-400">
                      +{result.result.scoreAwarded} points
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-gray-400">Tests Passed</p>
                      <p className="text-white font-semibold">{result.result.testsPassed}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Tests Failed</p>
                      <p className="text-white font-semibold">{result.result.testsFailed}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Duration</p>
                      <p className="text-white font-semibold">{result.result.durationMs}ms</p>
                    </div>
                  </div>

                  <div className="text-sm space-y-1">
                    <p className="text-gray-400">
                      Framework: <span className="text-white">{result.result.frameworkDetected}</span>
                    </p>
                    {result.result.txHash && result.result.txHash !== '0x0' && (
                      <p className="text-gray-400">
                        TX:{' '}
                        <a
                          href={`https://testnet.monadexplorer.com/tx/${result.result.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400"
                        >
                          {result.result.txHash.slice(0, 20)}...
                        </a>
                      </p>
                    )}
                    {result.result.flagReason && (
                      <p className="text-orange-400 mt-2">
                        Flag reason: {result.result.flagReason}
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Help */}
      <div className="mt-12 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-3">What gets verified?</h2>
        <ul className="space-y-2 text-sm text-gray-400">
          <li>Your repo is cloned at the exact commit (you cannot inject output)</li>
          <li>Test command is derived from your manifest (package.json, foundry.toml, etc.)</li>
          <li>Exit code 0 = pass. Non-zero = fail. No overrides.</li>
          <li>Framework signature detection catches fake output like &quot;echo PASS&quot;</li>
          <li>Whitespace-only diffs earn 0 points (anti-farming)</li>
        </ul>
      </div>
    </main>
  );
}
