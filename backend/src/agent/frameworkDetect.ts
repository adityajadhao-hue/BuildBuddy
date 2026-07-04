/**
 * Layer 3: Framework Signature Detection
 *
 * The anti-`echo PASS` mechanism. This is a HARD RULE, not a confidence penalty.
 *
 * If the derived command claims to be a known test runner (npm test, pytest,
 * forge test, etc.) but produces ZERO recognizable framework output (no structured
 * reporter data, no recognizable framework banner), the build is AUTOMATICALLY
 * FLAGGED — not passed with lower confidence.
 *
 * A real test runner invoked correctly always produces either structured output
 * or a recognizable framework signature. A bare `echo` produces neither.
 */

import { FRAMEWORK_CONFIGS } from '../sandbox/structuredFlags.js';

export interface FrameworkDetectResult {
  layer: 'framework-detect';
  signatureFound: boolean;
  matchedPatterns: string[];
  framework: string;
  flagged: boolean;
  flagReason: string | null;
  confidence: number; // 0-100
}

/**
 * Detect framework signatures in raw stdout output.
 *
 * @param stdout - Raw stdout from test execution
 * @param stderr - Raw stderr from test execution
 * @param framework - The expected framework (derived from manifest)
 * @param structuredFound - Whether Layer 2 found structured output
 */
export function detectFrameworkSignature(
  stdout: string,
  stderr: string,
  framework: string,
  structuredFound: boolean,
): FrameworkDetectResult {
  const combined = stdout + '\n' + stderr;
  const config = FRAMEWORK_CONFIGS[framework];

  // If framework has no defined banner patterns (make, npm-test), skip detection
  if (!config || config.bannerPatterns.length === 0) {
    return {
      layer: 'framework-detect',
      signatureFound: true, // Can't verify, assume OK
      matchedPatterns: [],
      framework,
      flagged: false,
      flagReason: null,
      confidence: 50, // Low confidence — unknown framework
    };
  }

  // If structured output was found in Layer 2, that's sufficient proof
  if (structuredFound) {
    return {
      layer: 'framework-detect',
      signatureFound: true,
      matchedPatterns: ['structured-output-found'],
      framework,
      flagged: false,
      flagReason: null,
      confidence: 95,
    };
  }

  // Check each banner pattern against the combined output
  const matchedPatterns: string[] = [];
  for (const pattern of config.bannerPatterns) {
    if (pattern.test(combined)) {
      matchedPatterns.push(pattern.source);
    }
  }

  // Also check TAP format (universal)
  const tapPatterns = [
    /^TAP version \d+/m,
    /^ok \d+/m,
    /^not ok \d+/m,
    /^# tests \d+/m,
    /^1\.\.\d+/m,
  ];
  for (const pattern of tapPatterns) {
    if (pattern.test(combined)) {
      matchedPatterns.push(`TAP:${pattern.source}`);
    }
  }

  if (matchedPatterns.length > 0) {
    return {
      layer: 'framework-detect',
      signatureFound: true,
      matchedPatterns,
      framework,
      flagged: false,
      flagReason: null,
      confidence: Math.min(95, 60 + matchedPatterns.length * 10),
    };
  }

  // ─── NO SIGNATURE FOUND — THIS IS THE KEY ANTI-CHEAT MECHANISM ───────────

  // Check for suspicious patterns that indicate faking
  const suspiciousPatterns = [
    /^PASS\s*$/m, // Bare "PASS" with nothing else
    /^OK\s*$/m, // Bare "OK"
    /^All tests passed\s*$/m, // Generic pass message
    /^Tests: \d+ passed$/m, // Looks right but no suite info
  ];

  const suspiciousMatches: string[] = [];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(combined)) {
      suspiciousMatches.push(pattern.source);
    }
  }

  // Determine flag reason
  let flagReason: string;
  if (combined.trim().length === 0) {
    flagReason = 'No output produced — empty stdout/stderr';
  } else if (combined.trim().length < 20) {
    flagReason = `Minimal output ("${combined.trim().slice(0, 50)}") with no recognizable ${framework} framework signature`;
  } else if (suspiciousMatches.length > 0) {
    flagReason = `Output contains generic pass indicators but no recognizable ${framework} framework signature — possible echo attack`;
  } else {
    flagReason = `No recognizable ${framework} test framework output detected. Expected patterns like: ${config.bannerPatterns.slice(0, 2).map((p) => p.source).join(', ')}`;
  }

  return {
    layer: 'framework-detect',
    signatureFound: false,
    matchedPatterns: [],
    framework,
    flagged: true,
    flagReason,
    confidence: 0,
  };
}
