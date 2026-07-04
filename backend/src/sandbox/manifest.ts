import { createHash } from 'crypto';

/**
 * Manifest parser — derives the correct test command from project manifests.
 * This mirrors the logic in entrypoint.sh but runs on the backend to
 * pre-validate and for result verification.
 */

export type Framework =
  | 'jest'
  | 'vitest'
  | 'mocha'
  | 'npm-test'
  | 'foundry'
  | 'cargo'
  | 'pytest'
  | 'go'
  | 'make'
  | 'unknown';

export interface ManifestResult {
  command: string;
  framework: Framework;
  structuredFlag: string;
  manifestHash: string;
  manifestFile: string;
}

export interface ManifestError {
  error: string;
  manifestFile: string | null;
}

/**
 * Given the contents of key manifest files, derive the test command.
 * This function takes file contents (strings) rather than reading from disk,
 * making it testable and usable both in the worker and as validation.
 */
export function deriveTestCommand(manifests: {
  packageJson?: string;
  foundryToml?: string;
  cargoToml?: string;
  pyprojectToml?: string;
  makefile?: string;
  goMod?: string;
}): ManifestResult | ManifestError {
  // Priority 1: package.json
  if (manifests.packageJson) {
    try {
      const pkg = JSON.parse(manifests.packageJson);
      const testScript = pkg?.scripts?.test;

      if (testScript && testScript !== 'echo "Error: no test specified" && exit 1') {
        const framework = detectNodeFramework(testScript);
        const flags = getStructuredFlags(framework);

        return {
          command: buildNodeTestCommand(framework, flags),
          framework,
          structuredFlag: flags.flag,
          manifestHash: computeHash(manifests.packageJson),
          manifestFile: 'package.json',
        };
      }
    } catch {
      return {
        error: 'Invalid package.json: failed to parse JSON',
        manifestFile: 'package.json',
      };
    }
  }

  // Priority 2: foundry.toml
  if (manifests.foundryToml) {
    return {
      command: 'forge test --json',
      framework: 'foundry',
      structuredFlag: '--json',
      manifestHash: computeHash(manifests.foundryToml),
      manifestFile: 'foundry.toml',
    };
  }

  // Priority 3: Cargo.toml
  if (manifests.cargoToml) {
    return {
      command: 'cargo test -- -Z unstable-options --format json',
      framework: 'cargo',
      structuredFlag: '-- -Z unstable-options --format json',
      manifestHash: computeHash(manifests.cargoToml),
      manifestFile: 'Cargo.toml',
    };
  }

  // Priority 4: pyproject.toml (or pytest config)
  if (manifests.pyprojectToml) {
    return {
      command: 'python -m pytest --junitxml=/tmp/test-results.xml -v',
      framework: 'pytest',
      structuredFlag: '--junitxml=/tmp/test-results.xml',
      manifestHash: computeHash(manifests.pyprojectToml),
      manifestFile: 'pyproject.toml',
    };
  }

  // Priority 5: go.mod
  if (manifests.goMod) {
    return {
      command: 'go test ./... -json',
      framework: 'go',
      structuredFlag: '-json',
      manifestHash: computeHash(manifests.goMod),
      manifestFile: 'go.mod',
    };
  }

  // Priority 6: Makefile with test target
  if (manifests.makefile) {
    const hasTestTarget = /^test\s*:/m.test(manifests.makefile);
    if (hasTestTarget) {
      return {
        command: 'make test',
        framework: 'make',
        structuredFlag: '',
        manifestHash: computeHash(manifests.makefile),
        manifestFile: 'Makefile',
      };
    }
  }

  // No manifest found
  return {
    error: 'No test command could be derived from project manifest',
    manifestFile: null,
  };
}

/**
 * Detect which Node.js test framework is being used from the test script.
 */
function detectNodeFramework(testScript: string): Framework {
  const lower = testScript.toLowerCase();

  if (lower.includes('jest')) return 'jest';
  if (lower.includes('vitest')) return 'vitest';
  if (lower.includes('mocha')) return 'mocha';

  // Check for known runner commands
  if (lower.includes('tap') || lower.includes('ava')) return 'npm-test';

  // Default: run via npm test (could be anything)
  return 'npm-test';
}

/**
 * Build the actual test command for Node.js frameworks.
 */
function buildNodeTestCommand(framework: Framework, flags: StructuredFlags): string {
  switch (framework) {
    case 'jest':
      return `npx jest ${flags.flag}`;
    case 'vitest':
      return `npx vitest run ${flags.flag}`;
    case 'mocha':
      return `npx mocha ${flags.flag}`;
    default:
      return 'npm test';
  }
}

// ─── Structured Flags ───────────────────────────────────────────────────────

interface StructuredFlags {
  flag: string;
  outputFile: string;
  format: 'json' | 'xml' | 'none';
}

function getStructuredFlags(framework: Framework): StructuredFlags {
  return STRUCTURED_FLAGS[framework] ?? { flag: '', outputFile: '', format: 'none' };
}

const STRUCTURED_FLAGS: Record<Framework, StructuredFlags> = {
  jest: {
    flag: '--json --outputFile=/tmp/test-results.json',
    outputFile: '/tmp/test-results.json',
    format: 'json',
  },
  vitest: {
    flag: '--reporter=json --outputFile=/tmp/test-results.json',
    outputFile: '/tmp/test-results.json',
    format: 'json',
  },
  mocha: {
    flag: '--reporter json > /tmp/test-results.json',
    outputFile: '/tmp/test-results.json',
    format: 'json',
  },
  'npm-test': {
    flag: '',
    outputFile: '',
    format: 'none',
  },
  foundry: {
    flag: '--json',
    outputFile: '',
    format: 'json',
  },
  cargo: {
    flag: '-- -Z unstable-options --format json',
    outputFile: '',
    format: 'json',
  },
  pytest: {
    flag: '--junitxml=/tmp/test-results.xml -v',
    outputFile: '/tmp/test-results.xml',
    format: 'xml',
  },
  go: {
    flag: '-json',
    outputFile: '',
    format: 'json',
  },
  make: {
    flag: '',
    outputFile: '',
    format: 'none',
  },
  unknown: {
    flag: '',
    outputFile: '',
    format: 'none',
  },
};

// ─── Utilities ──────────────────────────────────────────────────────────────

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Check if a manifest derivation result is an error.
 */
export function isManifestError(
  result: ManifestResult | ManifestError,
): result is ManifestError {
  return 'error' in result;
}

/**
 * Get the structured flags configuration for a given framework.
 * Useful for the worker to know what output file to expect.
 */
export function getFrameworkFlags(framework: Framework): StructuredFlags {
  return STRUCTURED_FLAGS[framework];
}
