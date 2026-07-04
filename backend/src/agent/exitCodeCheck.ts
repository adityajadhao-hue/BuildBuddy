/**
 * Layer 1: Exit Code Check
 *
 * Ground truth. Non-zero exit code = fail. Period.
 * This layer cannot be overridden by any subsequent layer.
 */

export interface ExitCodeResult {
  layer: 'exit-code';
  passed: boolean;
  exitCode: number;
  reason: string;
}

/**
 * Check the exit code from test execution.
 * Exit code 0 = pass, anything else = fail.
 */
export function checkExitCode(exitCode: number): ExitCodeResult {
  if (exitCode === 0) {
    return {
      layer: 'exit-code',
      passed: true,
      exitCode,
      reason: 'Exit code 0 — tests passed',
    };
  }

  // Special exit codes
  let reason: string;
  switch (exitCode) {
    case 1:
      reason = 'Exit code 1 — tests failed';
      break;
    case 2:
      reason = 'Exit code 2 — test runner configuration error';
      break;
    case 126:
      reason = 'Exit code 126 — command not executable';
      break;
    case 127:
      reason = 'Exit code 127 — command not found';
      break;
    case 128:
      reason = 'Exit code 128 — invalid exit argument / git error';
      break;
    case 137:
      reason = 'Exit code 137 — killed (OOM or timeout SIGKILL)';
      break;
    case 143:
      reason = 'Exit code 143 — terminated (SIGTERM)';
      break;
    default:
      if (exitCode > 128) {
        reason = `Exit code ${exitCode} — killed by signal ${exitCode - 128}`;
      } else {
        reason = `Exit code ${exitCode} — tests failed`;
      }
  }

  return {
    layer: 'exit-code',
    passed: false,
    exitCode,
    reason,
  };
}
