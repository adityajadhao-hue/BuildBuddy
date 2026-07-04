/**
 * Layer 2: Structured Reporter Output Parser
 *
 * Parses machine-readable output from test frameworks:
 * - Jest JSON
 * - Vitest JSON
 * - Mocha JSON
 * - JUnit XML (pytest)
 * - Foundry JSON
 * - Cargo JSON
 * - Go test JSON
 *
 * If structured output is expected (based on framework) but absent → flag.
 */

export interface StructuredParseResult {
  layer: 'structured-parse';
  found: boolean;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  totalTests: number;
  durationMs: number;
  framework: string;
  suites: number;
  flagged: boolean;
  flagReason: string | null;
}

/**
 * Parse structured test output based on the detected framework.
 */
export function parseStructuredOutput(
  stdout: string,
  framework: string,
  structuredOutputContent?: string,
): StructuredParseResult {
  const empty: StructuredParseResult = {
    layer: 'structured-parse',
    found: false,
    testsPassed: 0,
    testsFailed: 0,
    testsSkipped: 0,
    totalTests: 0,
    durationMs: 0,
    framework,
    suites: 0,
    flagged: false,
    flagReason: null,
  };

  // Use dedicated structured output file content if available
  const content = structuredOutputContent || stdout;

  switch (framework) {
    case 'jest':
      return parseJestJson(content, empty);
    case 'vitest':
      return parseVitestJson(content, empty);
    case 'mocha':
      return parseMochaJson(content, empty);
    case 'foundry':
      return parseFoundryJson(content, empty);
    case 'cargo':
      return parseCargoJson(content, empty);
    case 'go':
      return parseGoJson(content, empty);
    case 'pytest':
      return parsePytestXml(content, empty);
    default:
      // Unknown framework — can't parse structured output
      return empty;
  }
}

// ─── Jest JSON Parser ───────────────────────────────────────────────────────

function parseJestJson(content: string, base: StructuredParseResult): StructuredParseResult {
  try {
    // Jest JSON might be embedded in other output; find the JSON block
    const json = extractJson(content);
    if (!json) return base;

    const data = JSON.parse(json);

    return {
      ...base,
      found: true,
      testsPassed: data.numPassedTests ?? 0,
      testsFailed: data.numFailedTests ?? 0,
      testsSkipped: data.numPendingTests ?? 0,
      totalTests: data.numTotalTests ?? 0,
      durationMs: data.testResults?.[0]?.endTime
        ? data.testResults[data.testResults.length - 1].endTime - data.startTime
        : 0,
      suites: data.numTotalTestSuites ?? 0,
    };
  } catch {
    return base;
  }
}

// ─── Vitest JSON Parser ─────────────────────────────────────────────────────

function parseVitestJson(content: string, base: StructuredParseResult): StructuredParseResult {
  try {
    const json = extractJson(content);
    if (!json) return base;

    const data = JSON.parse(json);

    // Vitest JSON format
    const testResults = data.testResults ?? [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const suite of testResults) {
      for (const test of suite.assertionResults ?? []) {
        if (test.status === 'passed') passed++;
        else if (test.status === 'failed') failed++;
        else skipped++;
      }
    }

    return {
      ...base,
      found: true,
      testsPassed: data.numPassedTests ?? passed,
      testsFailed: data.numFailedTests ?? failed,
      testsSkipped: data.numPendingTests ?? skipped,
      totalTests: data.numTotalTests ?? (passed + failed + skipped),
      durationMs: data.startTime ? Date.now() - data.startTime : 0,
      suites: testResults.length,
    };
  } catch {
    return base;
  }
}

// ─── Mocha JSON Parser ──────────────────────────────────────────────────────

function parseMochaJson(content: string, base: StructuredParseResult): StructuredParseResult {
  try {
    const json = extractJson(content);
    if (!json) return base;

    const data = JSON.parse(json);
    const stats = data.stats;
    if (!stats) return base;

    return {
      ...base,
      found: true,
      testsPassed: stats.passes ?? 0,
      testsFailed: stats.failures ?? 0,
      testsSkipped: stats.pending ?? 0,
      totalTests: stats.tests ?? 0,
      durationMs: stats.duration ?? 0,
      suites: stats.suites ?? 0,
    };
  } catch {
    return base;
  }
}

// ─── Foundry JSON Parser ────────────────────────────────────────────────────

function parseFoundryJson(content: string, base: StructuredParseResult): StructuredParseResult {
  try {
    // Foundry outputs multiple JSON objects (one per test file), newline-delimited
    const lines = content.split('\n').filter((l) => l.trim().startsWith('{'));
    let passed = 0;
    let failed = 0;
    let suites = 0;

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.test_results) {
          suites++;
          for (const result of Object.values(data.test_results) as Array<{ status: string }>) {
            if (result.status === 'Success') passed++;
            else if (result.status === 'Failure') failed++;
          }
        }
      } catch {
        continue;
      }
    }

    if (passed === 0 && failed === 0) return base;

    return {
      ...base,
      found: true,
      testsPassed: passed,
      testsFailed: failed,
      testsSkipped: 0,
      totalTests: passed + failed,
      durationMs: 0,
      suites,
    };
  } catch {
    return base;
  }
}

// ─── Cargo JSON Parser ──────────────────────────────────────────────────────

function parseCargoJson(content: string, base: StructuredParseResult): StructuredParseResult {
  try {
    const lines = content.split('\n').filter((l) => l.trim().startsWith('{'));
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'test' && event.event === 'ok') passed++;
        else if (event.type === 'test' && event.event === 'failed') failed++;
        else if (event.type === 'test' && event.event === 'ignored') skipped++;

        // Summary line
        if (event.type === 'suite' && event.event === 'ok') {
          passed = event.passed ?? passed;
          failed = event.failed ?? failed;
          skipped = event.ignored ?? skipped;
        }
      } catch {
        continue;
      }
    }

    if (passed === 0 && failed === 0) return base;

    return {
      ...base,
      found: true,
      testsPassed: passed,
      testsFailed: failed,
      testsSkipped: skipped,
      totalTests: passed + failed + skipped,
      durationMs: 0,
      suites: 1,
    };
  } catch {
    return base;
  }
}

// ─── Go Test JSON Parser ────────────────────────────────────────────────────

function parseGoJson(content: string, base: StructuredParseResult): StructuredParseResult {
  try {
    const lines = content.split('\n').filter((l) => l.trim().startsWith('{'));
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.Action === 'pass' && event.Test) passed++;
        else if (event.Action === 'fail' && event.Test) failed++;
        else if (event.Action === 'skip' && event.Test) skipped++;
      } catch {
        continue;
      }
    }

    if (passed === 0 && failed === 0) return base;

    return {
      ...base,
      found: true,
      testsPassed: passed,
      testsFailed: failed,
      testsSkipped: skipped,
      totalTests: passed + failed + skipped,
      durationMs: 0,
      suites: 1,
    };
  } catch {
    return base;
  }
}

// ─── pytest JUnit XML Parser ────────────────────────────────────────────────

function parsePytestXml(content: string, base: StructuredParseResult): StructuredParseResult {
  try {
    // Simple regex-based XML parsing (no need for full XML parser)
    const testsMatch = content.match(/tests="(\d+)"/);
    const failuresMatch = content.match(/failures="(\d+)"/);
    const errorsMatch = content.match(/errors="(\d+)"/);
    const skippedMatch = content.match(/skipped="(\d+)"/);
    const timeMatch = content.match(/time="([\d.]+)"/);

    if (!testsMatch) return base;

    const total = parseInt(testsMatch[1], 10);
    const failures = parseInt(failuresMatch?.[1] ?? '0', 10);
    const errors = parseInt(errorsMatch?.[1] ?? '0', 10);
    const skipped = parseInt(skippedMatch?.[1] ?? '0', 10);
    const timeSec = parseFloat(timeMatch?.[1] ?? '0');

    return {
      ...base,
      found: true,
      testsPassed: total - failures - errors - skipped,
      testsFailed: failures + errors,
      testsSkipped: skipped,
      totalTests: total,
      durationMs: Math.round(timeSec * 1000),
      suites: 1,
    };
  } catch {
    return base;
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Extract a JSON object/array from text that might contain surrounding non-JSON content.
 */
function extractJson(text: string): string | null {
  // Try to parse the whole thing first
  try {
    JSON.parse(text);
    return text;
  } catch {
    // Try to find the first { or [
    const startObj = text.indexOf('{');
    const startArr = text.indexOf('[');
    const start = Math.min(
      startObj === -1 ? Infinity : startObj,
      startArr === -1 ? Infinity : startArr,
    );

    if (start === Infinity) return null;

    // Find matching end bracket
    const isObj = text[start] === '{';
    const openChar = isObj ? '{' : '[';
    const closeChar = isObj ? '}' : ']';
    let depth = 0;

    for (let i = start; i < text.length; i++) {
      if (text[i] === openChar) depth++;
      else if (text[i] === closeChar) depth--;

      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
