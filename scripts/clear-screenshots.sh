#!/bin/bash

# Weekly screenshot cleanup script
# Intended to run via cron every Monday (e.g. 03:00) after claims finish.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCREENSHOT_DIRS=(
	"screenshots/confirmation"
	"screenshots/final-page"
	"screenshots/go-click"
	"screenshots/id-entry"
	"screenshots/login"
	"screenshots/shop-page"
)

echo "🧹 Weekly screenshot cleanup started at $(date -Iseconds)"
echo "Project root: ${ROOT_DIR}"

for dir in "${SCREENSHOT_DIRS[@]}"; do
	TARGET="${ROOT_DIR}/${dir}"
	if [[ -d "${TARGET}" ]]; then
		echo "   ➤ Clearing ${dir}"
		find "${TARGET}" -type f -name '*.png' -delete
	else
		echo "   ➤ Skipping ${dir} (directory not found)"
	fi
done

echo "✅ Screenshot cleanup complete at $(date -Iseconds)"









