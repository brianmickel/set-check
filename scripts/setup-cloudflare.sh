#!/usr/bin/env bash
# One-time Cloudflare setup for set-check.
# Creates the KV namespace, R2 bucket, and Worker secrets, then prints
# the GitHub Actions secrets you need to configure.
#
# Prerequisites:
#   - wrangler installed (npx wrangler or global install)
#   - logged in: npx wrangler login
#
# Usage: bash scripts/setup-cloudflare.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$SCRIPT_DIR/../worker"

echo "=== set-check Cloudflare setup ==="
echo ""
echo "This script will:"
echo "  1. Create KV namespace (rate limits)"
echo "  2. Create R2 bucket (temporary uploads)"
echo "  3. Set Worker secrets: OPENAI_API_KEY, JWT_SECRET"
echo "  4. Print the GitHub Actions secrets you need to save"
echo ""
echo "Prerequisite: run 'npx wrangler login' first if not already authenticated."
echo ""
read -rp "Continue? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

cd "$WORKER_DIR"

# ── Step 1: KV namespace ─────────────────────────────────────────────────────
echo ""
echo "── Step 1: Create KV namespace (rate limits) ──"
KV_OUTPUT=$(npx wrangler kv namespace create RATE_LIMIT 2>&1)
echo "$KV_OUTPUT"
# Parse the id from output like: { binding = "RATE_LIMIT", id = "abc123" }
KV_ID=$(echo "$KV_OUTPUT" | grep -oE 'id = "[a-f0-9]+"' | grep -oE '[a-f0-9]{20,}' | head -1 || true)
if [[ -z "$KV_ID" ]]; then
  echo ""
  echo "Could not parse KV namespace ID automatically."
  read -rp "Paste the KV namespace ID from the output above: " KV_ID
fi
echo "KV namespace ID: $KV_ID"

# ── Step 2: R2 bucket ────────────────────────────────────────────────────────
echo ""
echo "── Step 2: Create R2 bucket (temporary uploads) ──"
npx wrangler r2 bucket create set-check-uploads 2>&1 || echo "(Bucket may already exist — continuing.)"

# ── Step 3: Worker secrets ───────────────────────────────────────────────────
echo ""
echo "── Step 3: Set Worker secrets ──"
echo "Enter your OpenAI API key (sk-...):"
npx wrangler secret put OPENAI_API_KEY

echo ""
echo "Enter a JWT secret (min 32 chars; generate one with: openssl rand -base64 32):"
npx wrangler secret put JWT_SECRET

echo ""
read -rp "Set INCLUDE_BOUNDING_BOXES secret? Leave blank to skip (default: true): " set_bbox
if [[ -n "$set_bbox" ]]; then
  npx wrangler secret put INCLUDE_BOUNDING_BOXES
fi

# ── Step 4: Summary ──────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo " Setup complete! Save these as GitHub repo secrets:"
echo " (Settings → Secrets and variables → Actions)"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  KV_NAMESPACE_ID   = $KV_ID"
echo ""
echo "  CF_API_TOKEN      = <Create at Cloudflare Dashboard → My Profile → API Tokens>"
echo "                      Use the 'Edit Cloudflare Workers' template."
echo ""
echo "  CF_ACCOUNT_ID     = <Cloudflare Dashboard → right sidebar>"
echo ""
echo "  ALLOWED_ORIGINS   = <Your GitHub Pages URL, e.g. https://your-username.github.io>"
echo "                      Comma-separate multiple origins if needed."
echo ""
echo "After the Worker deploys for the first time, also add:"
echo ""
echo "  VITE_API_URL      = <Worker URL shown after deploy, e.g. https://set-check-api.xxx.workers.dev>"
echo ""
echo "Then push to main to rebuild the frontend with the correct API URL."
echo "════════════════════════════════════════════════════════════"
