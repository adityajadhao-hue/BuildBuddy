import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'BuildBuddy — Proof-of-Build on Monad',
  description: 'Verify your builds. Earn on-chain reputation. Claim bounties.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-white no-underline hover:no-underline">
              BuildBuddy
            </a>
            <div className="flex gap-6 text-sm">
              <a href="/" className="text-gray-400 hover:text-white no-underline">Home</a>
              <a href="/verify" className="text-gray-400 hover:text-white no-underline">Verify</a>
              <a href="/leaderboard" className="text-gray-400 hover:text-white no-underline">Leaderboard</a>
              <a href="/bounty" className="text-gray-400 hover:text-white no-underline">Bounties</a>
            </div>
          </nav>
          {children}
        </Providers>
      </body>
    </html>
  );
}
