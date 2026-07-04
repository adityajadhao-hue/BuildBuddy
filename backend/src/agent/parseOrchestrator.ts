/**
 * Parse Orchestrator — Runs Layers 1→2→3 in sequence.
 *
 * Layer 1 (Exit Code): Ground truth. Cannot be overridden.
 * Layer 2 (Structured Parse): Machine-readable output. Authoritative for counts.
 * Layer 3 (Framework Detect): Anti-cheat. Flags if no recognizable output.
 *
 * The orchestrator aggregates results into a final ParseResult with:
 * - Final status (pass/fail/flagged)
 * - Confidence score
 * - Test counts
 * - Flag reasons
 */

import { checkExitCode, type ExitCodeResult } from './exitCodeCheck.js';
import { parseStructuredOutput, type StructuredParseResult } from './structuredParse.js';
import { detectFrameworkSignature, type FrameworkDetectResult } from './frameworkDetect.js';

export interface ParseInput {
  exitCode: number;
  stdout: string;
  stderr: string;
  framework: string;
  structuredOutputContent?: string; // Content of the structured output file (if separate)
}

export interface ParseResult {
  /** Final status: 0=fail, 1=pass, 2=flagged */
  status: 0 | 1 | 2;
  /** Confidence score 0-10000 (basis points) */
  confidenceScore: number;
  /** Number of tests that passed */
  testsPassed: number;
  /** Number of tests that failed */
  testsFailed: number;
  /** Number of tests skipped */
  testsSkipped: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Detected framework */
  frameworkDetected: string;
  /** Whether structured output was found */
  structuredOutputFound: boolean;
  /** Whether framework signature was detected */
  frameworkSignatureFound: boolean;
  /** If flagged, why */
  flagReason: string | null;
  /** Individual layer results for audit trail */
  layers: {
    exitCode: ExitCodeResult;
    structured: StructuredParseResult;
    frameworkDetect: FrameworkDetectResult;
  };
}

/**
 * Run the full 3-layer parsing pipeline.
 */
export function parseTestOutput(input: ParseInput): ParseResult {
  // ─── Layer 1: Exit Code ─────────────────────────────────────────────────────
  const exitResult = checkExitCode(input.exitCode);

  // ─── Layer 2: Structured Parse ──────────────────────────────────────────────
  const structuredResult = parseStructuredOutput(
    input.stdout,
    input.framework,
    input.structuredOutputContent,
  );

  // ─── Layer 3: Framework Signature Detection ─────────────────────────────────
  const frameworkResult = detectFrameworkSignature(
    input.stdout,
    input.stderr,
    input.framework,
    structuredResult.found,
  );

  // ─── Aggregate Results ──────────────────────────────────────────────────────

  // Determine final status
  let status: 0 | 1 | 2;
  let flagReason: string | null = null;

  if (!exitResult.passed) {
    // Layer 1 says fail — this is ground truth
    status = 0;
  } else if (frameworkResult.flagged) {
    // Layer 3 says flagged — automatic flag (anti-cheat)
    status = 2;
    flagReason = frameworkResult.flagReason;
  } else if (structuredResult.found && structuredResult.testsFailed > 0) {
    // Structured output shows failures despite exit code 0 (rare but possible)
    status = 0;
    flagReason = 'Exit code 0 but structured output shows test failures';
  } else {
    // All layers agree: pass
    status = 1;
  }

  // Determine confidence score (0-10000 bps)
  let confidence: number;
  if (status === 2) {
    confidence = 0; // Flagged = no confidence
  } else if (status === 0) {
    confidence = 10000; // Fail is certain (exit code is ground truth)
  } else {
    // Pass: confidence based on layers
    if (structuredResult.found && frameworkResult.signatureFound) {
      confidence = 9500; // Both layers confirm
    } else if (structuredResult.found) {
      confidence = 9000; // Structured output found
    } else if (frameworkResult.signatureFound) {
      confidence = Math.round(frameworkResult.confidence * 100); // Only signature
    } else {
      confidence = 5000; // Neither found but not flagged (e.g., unknown framework)
    }
  }

  // Test counts: prefer structured data, fall back to 0
  const testsPassed = structuredResult.found ? structuredResult.testsPassed : 0;
  const testsFailed = structuredResult.found ? structuredResult.testsFailed : 0;
  const testsSkipped = structuredResult.found ? structuredResult.testsSkipped : 0;
  const durationMs = structuredResult.found ? structuredResult.durationMs : 0;

  return {
    status,
    confidenceScore: confidence,
    testsPassed,
    testsFailed,
    testsSkipped,
    durationMs,
    frameworkDetected: input.framework,
    structuredOutputFound: structuredResult.found,
    frameworkSignatureFound: frameworkResult.signatureFound,
    flagReason,
    layers: {
      exitCode: exitResult,
      structured: structuredResult,
      frameworkDetect: frameworkResult,
    },
  };
}
