#!/usr/bin/env bash
#
# Deskly — one-command setup for macOS.
#
#   npm run setup:mac
#
# Installs and starts PostgreSQL via Homebrew, creates the database, writes a
# working .env with a freshly generated APP_SECRET, runs the migrations and
# seeds the demo workspace. Safe to re-run: every step checks before it acts,
# and an existing .env is never overwritten.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_FORMULA="postgresql@16"
DB_NAME="deskly"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info() { printf "  \033[34m→\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }
die()  { printf "  \033[31m✗\033[0m %s\n" "$1" >&2; exit 1; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  warn "This script targets macOS. On Linux, install PostgreSQL 16 with your"
  warn "package manager, then run: npm install && npm run db:deploy && npm run seed"
  exit 1
fi

bold "Deskly setup"
echo

# --- 1. Command line tools -------------------------------------------------

if ! xcode-select -p >/dev/null 2>&1; then
  info "Installing Xcode command line tools (a dialog will open)…"
  xcode-select --install || true
  die "Re-run this script once the command line tools have finished installing."
fi
ok "Xcode command line tools"

# --- 2. Homebrew -----------------------------------------------------------

if ! command -v brew >/dev/null 2>&1; then
  info "Installing Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Apple silicon puts brew somewhere the current shell does not know about yet.
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi
command -v brew >/dev/null 2>&1 || die "Homebrew is still not on PATH. Open a new terminal and re-run."
ok "Homebrew $(brew --version | head -1 | awk '{print $2}')"

# --- 3. Node ---------------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  info "Installing Node…"
  brew install node
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  die "Node 20 or newer is required (found $(node -v)). Try: brew upgrade node"
fi
ok "Node $(node -v)"

# --- 4. PostgreSQL ---------------------------------------------------------

if ! brew list --formula "$PG_FORMULA" >/dev/null 2>&1; then
  info "Installing $PG_FORMULA…"
  brew install "$PG_FORMULA"
fi

if ! brew services list | grep -q "^${PG_FORMULA}.*started"; then
  info "Starting $PG_FORMULA…"
  brew services start "$PG_FORMULA"
fi

# The server needs a moment before it accepts connections.
PG_BIN="$(brew --prefix "$PG_FORMULA")/bin"
export PATH="$PG_BIN:$PATH"

for _ in $(seq 1 30); do
  if pg_isready -q -h localhost 2>/dev/null; then break; fi
  sleep 1
done
pg_isready -q -h localhost 2>/dev/null || die "PostgreSQL did not start. Try: brew services restart $PG_FORMULA"
ok "PostgreSQL running on localhost:5432"

# Homebrew's Postgres creates a role named after the current user, not
# `postgres`, so the connection string uses whoever is running this.
DB_USER="$(whoami)"

if ! psql -h localhost -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  info "Creating the '$DB_NAME' database…"
  createdb -h localhost "$DB_NAME"
fi
ok "Database '$DB_NAME' ready"

# --- 5. Environment --------------------------------------------------------

if [[ -f .env ]]; then
  ok ".env already exists — leaving it untouched"
else
  info "Writing .env…"
  SECRET="$(openssl rand -hex 32)"
  INBOUND="$(openssl rand -hex 16)"

  sed \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://${DB_USER}@localhost:5432/${DB_NAME}?schema=public\"|" \
    -e "s|^APP_SECRET=.*|APP_SECRET=\"${SECRET}\"|" \
    -e "s|^INBOUND_WEBHOOK_SECRET=.*|INBOUND_WEBHOOK_SECRET=\"${INBOUND}\"|" \
    .env.example > .env

  ok ".env written with a generated APP_SECRET"
fi

# --- 6. Dependencies, schema, demo data ------------------------------------

info "Installing dependencies…"
npm install --silent
ok "Dependencies installed"

info "Applying migrations…"
npm run --silent db:deploy
ok "Schema up to date"

if [[ "${SKIP_SEED:-}" == "1" ]]; then
  info "SKIP_SEED=1 — not seeding"
else
  info "Seeding the demo workspace…"
  npm run --silent seed
  ok "Demo data loaded"
fi

echo
bold "Ready."
echo
echo "  npm run dev        Start the web app at http://localhost:3000"
echo "  npm run desktop    Build and launch the macOS app"
echo "  npm run worker     Run SLA timers (npm run dev only; the desktop app"
echo "                     starts its own)"
echo
echo "  Sign in as priya@acme.test / deskly123"
echo
