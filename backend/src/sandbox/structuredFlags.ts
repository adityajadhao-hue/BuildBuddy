/**
 * Structured output flags per framework.
 * Maps framework → the appropriate structured reporter flag.
 * Used by both the entrypoint.sh and the backend for result validation.
 */

export interface FrameworkConfig {
  /** Flag to pass to the test runner for structured output */
  structuredFlag: string;
  /** Expected output file path (if any) */
  outputFile: string;
  /** Format of the structured output */
  outputFormat: 'json' | 'xml' | 'tap' | 'none';
  /** Known banner patterns for framework signature detection */
  bannerPatterns: RegExp[];
  /** The test runner command prefix */
  commandPrefix: string;
}

export const FRAMEWORK_CONFIGS: Record<string, FrameworkConfig> = {
  jest: {
    structuredFlag: '--json --outputFile=/tmp/test-results.json',
    outputFile: '/tmp/test-results.json',
    outputFormat: 'json',
    bannerPatterns: [
      /Tests:\s+\d+\s+passed/,
      /Test Suites:\s+\d+\s+passed/,
      /PASS\s+\S+/,
      /FAIL\s+\S+/,
      /"numPassedTests"\s*:\s*\d+/,
    ],
    commandPrefix: 'npx jest',
  },
  vitest: {
    structuredFlag: '--reporter=json --outputFile=/tmp/test-results.json',
    outputFile: '/tmp/test-results.json',
    outputFormat: 'json',
    bannerPatterns: [
      /✓\s+\S+/,
      /Tests\s+\d+\s+passed/,
      /Test Files\s+\d+\s+passed/,
      /"numPassedTests"\s*:\s*\d+/,
    ],
    commandPrefix: 'npx vitest',
  },
  mocha: {
    structuredFlag: '--reporter json',
    outputFile: '/tmp/test-results.json',
    outputFormat: 'json',
    bannerPatterns: [
      /passing\s*\(\d+/,
      /\d+\s+passing/,
      /"stats"\s*:\s*\{/,
    ],
    commandPrefix: 'npx mocha',
  },
  foundry: {
    structuredFlag: '--json',
    outputFile: '',
    outputFormat: 'json',
    bannerPatterns: [
      /Test result: ok/,
      /Suite result: ok/,
      /\[PASS\]/,
      /\[FAIL\]/,
      /Ran \d+ tests? for/,
    ],
    commandPrefix: 'forge test',
  },
  cargo: {
    structuredFlag: '-- -Z unstable-options --format json',
    outputFile: '',
    outputFormat: 'json',
    bannerPatterns: [
      /test result: ok\./,
      /\d+ passed; \d+ failed/,
      /running \d+ tests?/,
      /test \S+ \.\.\. ok/,
    ],
    commandPrefix: 'cargo test',
  },
  pytest: {
    structuredFlag: '--junitxml=/tmp/test-results.xml -v',
    outputFile: '/tmp/test-results.xml',
    outputFormat: 'xml',
    bannerPatterns: [
      /\d+ passed/,
      /PASSED/,
      /FAILED/,
      /===.*passed.*===/,
      /collected \d+ items?/,
    ],
    commandPrefix: 'python -m pytest',
  },
  go: {
    structuredFlag: '-json',
    outputFile: '',
    outputFormat: 'json',
    bannerPatterns: [
      /^ok\s+\S+/m,
      /^PASS$/m,
      /^FAIL$/m,
      /--- PASS:/,
      /--- FAIL:/,
    ],
    commandPrefix: 'go test',
  },
  make: {
    structuredFlag: '',
    outputFile: '',
    outputFormat: 'none',
    bannerPatterns: [], // Make is too generic
    commandPrefix: 'make test',
  },
  'npm-test': {
    structuredFlag: '',
    outputFile: '',
    outputFormat: 'none',
    bannerPatterns: [], // Could be anything
    commandPrefix: 'npm test',
  },
};

/**
 * Get framework config by name.
 */
export function getFrameworkConfig(framework: string): FrameworkConfig | null {
  return FRAMEWORK_CONFIGS[framework] ?? null;
}

/**
 * Get all known framework names.
 */
export function getKnownFrameworks(): string[] {
  return Object.keys(FRAMEWORK_CONFIGS);
}
