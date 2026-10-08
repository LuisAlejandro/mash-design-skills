#!/bin/bash

# Migrate a Figma file into the local Penpot instance using figpot.
# https://github.com/betagouv/figpot
# Usage: ./convert.sh   or   mds convert
# Reads IDs from .env (FIGMA_DESIGN_URL and PENPOT_DESIGN_URL).

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_error() { echo -e "${RED}Error: $1${NC}" >&2; }
print_success() { echo -e "${GREEN}$1${NC}"; }
print_info() { echo -e "${YELLOW}$1${NC}"; }

extract_figma_id() {
    local url="$1"
    if [[ $url =~ /design/([^/]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo ""
    fi
}

extract_penpot_id() {
    local url="$1"
    if [[ $url =~ file-id=([^&]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo ""
    fi
}

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

usage_env() {
    echo ""
    echo "Required in .env:"
    echo "  FIGMA_DESIGN_URL, PENPOT_DESIGN_URL"
    echo "  FIGMA_ACCESS_TOKEN, PENPOT_ACCESS_TOKEN"
    echo "  PENPOT_USER_EMAIL, PENPOT_USER_PASSWORD"
    echo "Optional:"
    echo "  PENPOT_BASE_URL (default http://localhost:9001)"
}

if [ -z "$FIGMA_DESIGN_URL" ]; then
    print_error "FIGMA_DESIGN_URL not set in .env"
    usage_env
    exit 1
fi

FIGMA_ID=$(extract_figma_id "$FIGMA_DESIGN_URL")
if [ -z "$FIGMA_ID" ]; then
    print_error "Could not extract Figma ID from FIGMA_DESIGN_URL: $FIGMA_DESIGN_URL"
    exit 1
fi

if [ -z "$PENPOT_DESIGN_URL" ]; then
    print_error "PENPOT_DESIGN_URL not set in .env"
    usage_env
    exit 1
fi

PENPOT_ID=$(extract_penpot_id "$PENPOT_DESIGN_URL")
if [ -z "$PENPOT_ID" ]; then
    print_error "Could not extract Penpot ID from PENPOT_DESIGN_URL: $PENPOT_DESIGN_URL"
    exit 1
fi

: "${PENPOT_BASE_URL:=http://localhost:9001}"
export PENPOT_BASE_URL

for var in FIGMA_ACCESS_TOKEN PENPOT_ACCESS_TOKEN PENPOT_USER_EMAIL PENPOT_USER_PASSWORD; do
    if [ -z "${!var}" ]; then
        print_error "$var is not set"
        usage_env
        exit 1
    fi
done

print_info "=== Figma to Penpot (figpot) ==="
echo "Figma ID:   $FIGMA_ID"
echo "Penpot ID:  $PENPOT_ID"
echo "Penpot URL: $PENPOT_BASE_URL"
echo ""

export PLAYWRIGHT_BROWSERS_PATH="$(pwd)/.playwright"
export npm_config_prefix="$(pwd)/.npm-global"

if ! command -v npx &> /dev/null; then
    print_error "npx is required for figpot. Install Node.js, or run figpot from a Node container."
    exit 1
fi

if [ ! -d "node_modules/@betagouv/figpot" ]; then
    print_info "Installing @betagouv/figpot locally..."
    npm install --no-save @betagouv/figpot
    print_success "figpot installed"
    echo ""
fi

print_info "Installing Playwright browsers for hydration..."
npx --yes @betagouv/figpot deps
print_success "Dependencies in .playwright/"
echo ""

print_info "Synchronizing..."
npx @betagouv/figpot document synchronize -d "${FIGMA_ID}:${PENPOT_ID}"
print_success "Synchronization complete"
echo ""
print_info "Open the file in Penpot at $PENPOT_BASE_URL"
