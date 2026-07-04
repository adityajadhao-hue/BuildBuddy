#!/usr/bin/env node

/**
 * BuildBuddy MCP Server
 *
 * Thin client that communicates with the hosted BuildBuddy verification backend.
 * Exposes 5 tools via stdio transport:
 *   - verify-build: Submit a repo for verification
 *   - get-job-status: Poll a pending verification job
 *   - get-dev-score: Query on-chain builder score
 *   - get-build-history: Get attestation history for a wallet+repo
 *   - link-github: Link GitHub identity via challenge-response
 *
 * No oracle keys or secrets on this side — just an API key for authentication.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { verifyBuildTool, handleVerifyBuild } from './tools/verifyBuild.js';
import { getJobStatusTool, handleGetJobStatus } from './tools/getJobStatus.js';
import { getDevScoreTool, handleGetDevScore } from './tools/getDevScore.js';
import { getBuildHistoryTool, handleGetBuildHistory } from './tools/getBuildHistory.js';
import { linkGithubTool, handleLinkGithub } from './tools/linkGithub.js';

// ─── Server Setup ───────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'buildbuddy',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── List Tools ─────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      verifyBuildTool,
      getJobStatusTool,
      getDevScoreTool,
      getBuildHistoryTool,
      linkGithubTool,
    ],
  };
});

// ─── Call Tool ──────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'verify-build':
        return await handleVerifyBuild(args as Parameters<typeof handleVerifyBuild>[0]);

      case 'get-job-status':
        return await handleGetJobStatus(args as Parameters<typeof handleGetJobStatus>[0]);

      case 'get-dev-score':
        return await handleGetDevScore(args as Parameters<typeof handleGetDevScore>[0]);

      case 'get-build-history':
        return await handleGetBuildHistory(args as Parameters<typeof handleGetBuildHistory>[0]);

      case 'link-github':
        return await handleLinkGithub(args as Parameters<typeof handleLinkGithub>[0]);

      default:
        return {
          content: [
            {
              type: 'text' as const,
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Start ──────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BuildBuddy MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
