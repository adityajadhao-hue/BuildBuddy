#!/bin/bash
set -euo pipefail

# ─── BuildBuddy Sandbox Entrypoint ──────────────────────────────────────────
# This script runs inside an ephemeral Fly Machine.
# It clones the repo, derives the test command, runs tests, and outputs results.
#
# Environment variables (set by Fly Machine creation):
#   REPO_URL     - GitHub/GitLab HTTPS clone URL
#   COMMIT_HASH  - Full commit hash to checkout
#   BRANCH       - Branch name
#   JOB_ID       - Unique job identifier

WORKSPACE="/workspace"
RESULT_FILE="/tmp/buildbuddy_result.json"

echo "BUILDBUDDY_JOB_START=${JOB_ID}"
echo "BUILDBUDDY_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ─── Clone Repository ────────────────────────────────────────────────────────

echo "BUILDBUDDY_STAGE=cloning"
if ! git clone --depth=50 --branch "${BRANCH}" "${REPO_URL}" "${WORKSPACE}" 2>/tmp/clone_err.txt; then
    echo "BUILDBUDDY_RESULT_JSON={\"exitCode\":128,\"stage\":\"clone\",\"error\":\"$(cat /tmp/clone_err.txt | tr '\n' ' ')\"}"
    echo "BUILDBUDDY_EXIT_CODE=128"
    exit 0
fi

cd "${WORKSPACE}"

# Checkout exact commit
if ! git checkout "${COMMIT_HASH}" 2>/dev/null; then
    echo "BUILDBUDDY_RESULT_JSON={\"exitCode\":128,\"stage\":\"checkout\",\"error\":\"Commit ${COMMIT_HASH} not found\"}"
    echo "BUILDBUDDY_EXIT_CODE=128"
    exit 0
fi

# ─── Check Dirty Tree ────────────────────────────────────────────────────────

DIRTY_TREE=$(git status --porcelain)
if [ -n "${DIRTY_TREE}" ]; then
    DIRTY_FLAG="true"
else
    DIRTY_FLAG="false"
fi

# ─── Derive Test Command from Manifest ───────────────────────────────────────

echo "BUILDBUDDY_STAGE=manifest"

TEST_CMD=""
FRAMEWORK=""
STRUCTURED_FLAG=""

if [ -f "package.json" ]; then
    # Node.js project — extract test script
    TEST_SCRIPT=$(cat package.json | jq -r '.scripts.test // empty')
    if [ -n "${TEST_SCRIPT}" ] && [ "${TEST_SCRIPT}" != "null" ]; then
        # Detect framework for structured output flags
        if echo "${TEST_SCRIPT}" | grep -qi "jest"; then
            FRAMEWORK="jest"
            STRUCTURED_FLAG="--json --outputFile=/tmp/test-results.json"
            TEST_CMD="npx jest ${STRUCTURED_FLAG}"
        elif echo "${TEST_SCRIPT}" | grep -qi "vitest"; then
            FRAMEWORK="vitest"
            STRUCTURED_FLAG="--reporter=json --outputFile=/tmp/test-results.json"
            TEST_CMD="npx vitest run ${STRUCTURED_FLAG}"
        elif echo "${TEST_SCRIPT}" | grep -qi "mocha"; then
            FRAMEWORK="mocha"
            STRUCTURED_FLAG="--reporter json"
            TEST_CMD="npx mocha ${STRUCTURED_FLAG}"
        else
            FRAMEWORK="npm-test"
            TEST_CMD="npm test"
        fi
    fi
elif [ -f "foundry.toml" ]; then
    FRAMEWORK="foundry"
    STRUCTURED_FLAG="--json"
    TEST_CMD="forge test ${STRUCTURED_FLAG}"
elif [ -f "Cargo.toml" ]; then
    FRAMEWORK="cargo"
    STRUCTURED_FLAG="-- -Z unstable-options --format json"
    TEST_CMD="cargo test ${STRUCTURED_FLAG}"
elif [ -f "pyproject.toml" ] || [ -f "setup.py" ] || [ -f "pytest.ini" ]; then
    FRAMEWORK="pytest"
    STRUCTURED_FLAG="--junitxml=/tmp/test-results.xml -v"
    TEST_CMD="python -m pytest ${STRUCTURED_FLAG}"
elif [ -f "Makefile" ] && grep -q "^test:" Makefile; then
    FRAMEWORK="make"
    TEST_CMD="make test"
elif [ -f "go.mod" ]; then
    FRAMEWORK="go"
    STRUCTURED_FLAG="-json"
    TEST_CMD="go test ./... ${STRUCTURED_FLAG}"
fi

if [ -z "${TEST_CMD}" ]; then
    echo "BUILDBUDDY_RESULT_JSON={\"exitCode\":1,\"stage\":\"manifest\",\"error\":\"No test command could be derived from project manifest\"}"
    echo "BUILDBUDDY_EXIT_CODE=1"
    exit 0
fi

echo "BUILDBUDDY_FRAMEWORK=${FRAMEWORK}"
echo "BUILDBUDDY_TEST_CMD=${TEST_CMD}"

# ─── Install Dependencies ────────────────────────────────────────────────────

echo "BUILDBUDDY_STAGE=installing"

if [ -f "package-lock.json" ]; then
    npm ci --prefer-offline 2>/tmp/install_err.txt || true
elif [ -f "yarn.lock" ]; then
    yarn install --frozen-lockfile 2>/tmp/install_err.txt || true
elif [ -f "pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile 2>/tmp/install_err.txt || true
elif [ -f "package.json" ]; then
    npm install 2>/tmp/install_err.txt || true
elif [ -f "requirements.txt" ]; then
    pip install -r requirements.txt 2>/tmp/install_err.txt || true
elif [ -f "pyproject.toml" ]; then
    pip install -e ".[dev]" 2>/tmp/install_err.txt || pip install -e . 2>/tmp/install_err.txt || true
fi
# Rust/Go: dependencies are fetched during test run

# ─── Run Tests ───────────────────────────────────────────────────────────────

echo "BUILDBUDDY_STAGE=testing"

TEST_START=$(date +%s%N)

echo "BUILDBUDDY_STDOUT_START"
eval "${TEST_CMD}" > /tmp/test_stdout.txt 2> /tmp/test_stderr.txt
TEST_EXIT_CODE=$?
echo "BUILDBUDDY_STDOUT_END"

TEST_END=$(date +%s%N)
DURATION_MS=$(( (TEST_END - TEST_START) / 1000000 ))

# Output captured stdout
echo "BUILDBUDDY_STDOUT_START"
cat /tmp/test_stdout.txt
echo "BUILDBUDDY_STDOUT_END"

echo "BUILDBUDDY_STDERR_START"
cat /tmp/test_stderr.txt
echo "BUILDBUDDY_STDERR_END"

# ─── Build Result JSON ───────────────────────────────────────────────────────

# Check for structured output file
STRUCTURED_OUTPUT=""
if [ -f "/tmp/test-results.json" ]; then
    STRUCTURED_OUTPUT=$(cat /tmp/test-results.json | jq -c '.' 2>/dev/null || echo "")
elif [ -f "/tmp/test-results.xml" ]; then
    STRUCTURED_OUTPUT="xml:$(cat /tmp/test-results.xml)"
fi

# Get diff stats for parent commit
PARENT_COMMIT=$(git log --pretty=%P -n 1 HEAD | awk '{print $1}')
if [ -n "${PARENT_COMMIT}" ]; then
    DIFF_STAT=$(git diff "${PARENT_COMMIT}" HEAD --stat 2>/dev/null | tail -1 || echo "")
    DIFF_CONTENT=$(git diff "${PARENT_COMMIT}" HEAD 2>/dev/null || echo "")
else
    DIFF_STAT=""
    DIFF_CONTENT=""
    PARENT_COMMIT="0000000000000000000000000000000000000000"
fi

# Compute manifest hash
if [ -f "package.json" ]; then
    MANIFEST_HASH=$(sha256sum package.json | awk '{print $1}')
elif [ -f "foundry.toml" ]; then
    MANIFEST_HASH=$(sha256sum foundry.toml | awk '{print $1}')
elif [ -f "Cargo.toml" ]; then
    MANIFEST_HASH=$(sha256sum Cargo.toml | awk '{print $1}')
elif [ -f "pyproject.toml" ]; then
    MANIFEST_HASH=$(sha256sum pyproject.toml | awk '{print $1}')
else
    MANIFEST_HASH=""
fi

# Build final result
cat > "${RESULT_FILE}" << EOF
{
  "exitCode": ${TEST_EXIT_CODE},
  "durationMs": ${DURATION_MS},
  "framework": "${FRAMEWORK}",
  "testCommand": "${TEST_CMD}",
  "dirtyTree": ${DIRTY_FLAG},
  "parentCommit": "${PARENT_COMMIT}",
  "manifestHash": "${MANIFEST_HASH}",
  "diffStat": "$(echo ${DIFF_STAT} | sed 's/"/\\"/g')",
  "stdout": "$(cat /tmp/test_stdout.txt | head -c 50000 | jq -Rs '.' | sed 's/^"//;s/"$//')",
  "stderr": "$(cat /tmp/test_stderr.txt | head -c 10000 | jq -Rs '.' | sed 's/^"//;s/"$//')"
}
EOF

echo "BUILDBUDDY_RESULT_JSON=$(cat ${RESULT_FILE} | jq -c '.')"
echo "BUILDBUDDY_EXIT_CODE=${TEST_EXIT_CODE}"
echo "BUILDBUDDY_JOB_END=${JOB_ID}"
