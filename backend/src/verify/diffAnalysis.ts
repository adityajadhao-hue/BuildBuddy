/**
 * Diff Analysis — Trivial-Diff Detection
 *
 * Before awarding score, check if the commit's diff touches meaningful code.
 * Strip comment-only and whitespace-only changes from the diff.
 * If what remains is empty → attestation is recorded but awarded 0 points.
 */

export interface DiffAnalysisResult {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  meaningfulChanges: boolean;
  trivialDiff: boolean;
  reason: string | null;
}

/**
 * Analyze a git diff to determine if changes are meaningful.
 * Input is the raw `git diff` output from the sandbox.
 */
export function analyzeDiff(diffContent: string): DiffAnalysisResult {
  if (!diffContent || diffContent.trim().length === 0) {
    return {
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      meaningfulChanges: false,
      trivialDiff: true,
      reason: 'Empty diff — no changes detected',
    };
  }

  const lines = diffContent.split('\n');
  let filesChanged = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let meaningfulAdded = 0;
  let meaningfulRemoved = 0;
  let currentFileExt = '';

  for (const line of lines) {
    // Count files
    if (line.startsWith('diff --git')) {
      filesChanged++;
      // Extract file extension
      const match = line.match(/b\/.*\.(\w+)$/);
      currentFileExt = match ? match[1] : '';
      continue;
    }

    // Skip diff metadata lines
    if (
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('@@')
    ) {
      continue;
    }

    // Analyze added lines
    if (line.startsWith('+')) {
      totalAdded++;
      const content = line.slice(1); // Remove the '+' prefix
      if (isMeaningfulChange(content, currentFileExt)) {
        meaningfulAdded++;
      }
      continue;
    }

    // Analyze removed lines
    if (line.startsWith('-')) {
      totalRemoved++;
      const content = line.slice(1); // Remove the '-' prefix
      if (isMeaningfulChange(content, currentFileExt)) {
        meaningfulRemoved++;
      }
      continue;
    }
  }

  const totalMeaningful = meaningfulAdded + meaningfulRemoved;
  const trivialDiff = totalMeaningful === 0;

  let reason: string | null = null;
  if (trivialDiff && (totalAdded > 0 || totalRemoved > 0)) {
    reason = 'All changes are whitespace-only or comment-only';
  } else if (trivialDiff) {
    reason = 'No code changes detected';
  }

  return {
    filesChanged,
    linesAdded: totalAdded,
    linesRemoved: totalRemoved,
    meaningfulChanges: !trivialDiff,
    trivialDiff,
    reason,
  };
}

/**
 * Determine if a line change is meaningful (not just whitespace or comments).
 */
function isMeaningfulChange(lineContent: string, fileExt: string): boolean {
  const trimmed = lineContent.trim();

  // Empty lines are never meaningful
  if (trimmed.length === 0) return false;

  // Whitespace-only changes
  if (trimmed === lineContent.replace(/\s/g, '')) {
    // The line itself is non-whitespace, check if it's a comment
  }

  // Check if it's a comment based on file extension
  if (isCommentLine(trimmed, fileExt)) return false;

  return true;
}

/**
 * Detect comment lines based on file extension.
 */
function isCommentLine(line: string, ext: string): boolean {
  // Language-specific comment detection
  switch (ext) {
    case 'js':
    case 'ts':
    case 'tsx':
    case 'jsx':
    case 'java':
    case 'go':
    case 'rs':
    case 'c':
    case 'cpp':
    case 'h':
    case 'sol':
      // C-style comments
      if (line.startsWith('//')) return true;
      if (line.startsWith('/*')) return true;
      if (line.startsWith('*')) return true;
      if (line.startsWith('*/')) return true;
      break;

    case 'py':
      // Python comments
      if (line.startsWith('#')) return true;
      if (line.startsWith('"""') || line.startsWith("'''")) return true;
      break;

    case 'rb':
      if (line.startsWith('#')) return true;
      break;

    case 'sh':
    case 'bash':
    case 'yml':
    case 'yaml':
    case 'toml':
      if (line.startsWith('#')) return true;
      break;

    case 'html':
    case 'xml':
      if (line.startsWith('<!--')) return true;
      if (line.startsWith('-->')) return true;
      break;

    case 'css':
    case 'scss':
      if (line.startsWith('/*')) return true;
      if (line.startsWith('*')) return true;
      if (line.startsWith('*/')) return true;
      break;

    default:
      // Generic: check common patterns
      if (line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
        return true;
      }
  }

  return false;
}

/**
 * Parse git diff --stat output to get summary counts.
 * Example: " 3 files changed, 45 insertions(+), 12 deletions(-)"
 */
export function parseDiffStat(statLine: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  const filesMatch = statLine.match(/(\d+)\s+files?\s+changed/);
  const insertMatch = statLine.match(/(\d+)\s+insertions?\(\+\)/);
  const deleteMatch = statLine.match(/(\d+)\s+deletions?\(-\)/);

  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
    insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
    deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
  };
}
