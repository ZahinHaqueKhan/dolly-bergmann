#!/bin/bash
set -e

# ============================================================
# ModestWear Store — Startup Script
# ============================================================
# Usage:
#   ./run.sh          — Interactive menu
#   ./run.sh docker   — Docker Compose (recommended)
#   ./run.sh dev      — Manual dev (no Docker)
#   ./run.sh prod     — Production build
#   ./run.sh stop     — Stop Docker services
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }

# ----------------------------------------------------------------
# Check prerequisites
# ----------------------------------------------------------------
check_docker() {
  if ! command -v docker &> /dev/null; then
    err "Docker is not installed. Install Docker Desktop or run: ./run.sh dev"
    exit 1
  fi
  if ! docker info &> /dev/null; then
    err "Docker daemon is not running. Start Docker Desktop."
    exit 1
  fi
  if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    err "docker-compose is not installed."
    exit 1
  fi
  DOCKER_COMPOSE="docker compose"
  if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
  else
    DOCKER_COMPOSE="docker-compose"
  fi
}

check_node() {
  if ! command -v node &> /dev/null; then
    err "Node.js is not installed."
    exit 1
  fi
}

check_python() {
  if ! command -v python3 &> /dev/null; then
    err "Python 3 is not installed."
    exit 1
  fi
}

# ----------------------------------------------------------------
# Environment setup
# ----------------------------------------------------------------
setup_env() {
  if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
    info "Creating backend/.env from .env.example..."
    cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
    ok "Created backend/.env"
    warn "Please edit backend/.env and fill in:"
    echo "  - DATABASE_URL"
    echo "  - JWT_SECRET"
    echo "  - SAIA_API_KEY"
    echo "  - STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
    echo ""
  fi
}

# ----------------------------------------------------------------
# Docker commands
# ----------------------------------------------------------------
cmd_docker() {
  check_docker
  setup_env

  info "Starting services with Docker Compose..."
  $DOCKER_COMPOSE up -d

  info "Services:"
  echo "  Backend API  → http://localhost:8000"
  echo "  API Docs     → http://localhost:8000/docs"
  echo "  Frontend    → http://localhost:3000"
  echo ""
  info "View logs: $DOCKER_COMPOSE logs -f"
  info "Stop services: $DOCKER_COMPOSE down"
}

cmd_docker_build() {
  check_docker
  info "Building images (no cache)..."
  $DOCKER_COMPOSE build --no-cache
  info "Build complete. Run './run.sh docker' to start."
}

cmd_stop() {
  check_docker
  info "Stopping Docker services..."
  $DOCKER_COMPOSE down
  ok "Stopped."
}

# ----------------------------------------------------------------
# Manual dev commands
# ----------------------------------------------------------------
cmd_backend_setup() {
  check_python
  cd "$SCRIPT_DIR/backend"

  if [ ! -d "venv" ]; then
    info "Creating Python virtual environment..."
    python3 -m venv venv
  fi

  info "Activating venv and installing dependencies..."
  source venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
  ok "Backend dependencies installed."
}

cmd_backend_dev() {
  check_python
  cd "$SCRIPT_DIR/backend"

  if [ ! -f ".env" ]; then
    setup_env
  fi

  if [ ! -d "venv" ]; then
    cmd_backend_setup
  fi

  info "Starting FastAPI backend on http://localhost:8000"
  source venv/bin/activate
  alembic upgrade head
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}

cmd_frontend_dev() {
  check_node
  cd "$SCRIPT_DIR/frontend"

  info "Installing frontend dependencies..."
  npm install

  info "Starting Next.js dev server on http://localhost:3000"
  npm run dev
}

cmd_dev() {
  setup_env
  ok "Manual dev mode selected."
  echo ""
  echo "Run TWO separate terminals:"
  echo ""
  echo "  Terminal 1 (backend):"
  echo "    ./run.sh backend-dev"
  echo ""
  echo "  Terminal 2 (frontend):"
  echo "    ./run.sh frontend-dev"
  echo ""
  echo "Or run them together with tmux:"
  echo "  ./run.sh dev-tmux"
}

cmd_dev_tmux() {
  check_docker  # just for tmux check
  if ! command -v tmux &> /dev/null; then
    err "tmux is not installed. Run './run.sh backend-dev' and './run.sh frontend-dev' in separate terminals instead."
    exit 1
  fi

  setup_env
  cmd_backend_setup

  info "Starting backend and frontend in tmux..."

  tmux kill-session -t modestwear-backend 2>/dev/null || true
  tmux kill-session -t modestwear-frontend 2>/dev/null || true

  tmux new-session -d -s modestwear-backend "cd $SCRIPT_DIR/backend && source venv/bin/activate && alembic upgrade head && uvicorn app.main:app --reload --port 8000"
  sleep 2

  tmux new-session -d -s modestwear-frontend "cd $SCRIPT_DIR/frontend && npm install && npm run dev"
  sleep 2

  ok "Services started in tmux."
  echo ""
  echo "  Backend  → tmux attach -t modestwear-backend (Ctrl+B, D to detach)"
  echo "  Frontend → tmux attach -t modestwear-frontend (Ctrl+B, D to detach)"
  echo ""
  echo "  Frontend at http://localhost:3000"
  echo "  Backend  at http://localhost:8000"
}

# ----------------------------------------------------------------
# Production build
# ----------------------------------------------------------------
cmd_prod() {
  check_node
  check_docker

  info "Building production images..."
  $DOCKER_COMPOSE -f docker-compose.yml -f docker-compose.prod.yml build

  info "Starting production services..."
  $DOCKER_COMPOSE -f docker-compose.yml -f docker-compose.prod.yml up -d

  ok "Production is running."
  echo "  Frontend → https://yourdomain.com"
  echo "  Backend  → https://api.yourdomain.com"
}

# ----------------------------------------------------------------
# Help
# ----------------------------------------------------------------
usage() {
  echo ""
  echo -e "${BLUE}ModestWear Store — Available Commands${NC}"
  echo ""
  echo "  ./run.sh docker       Start all services via Docker Compose (recommended)"
  echo "  ./run.sh docker-build Rebuild Docker images from scratch"
  echo "  ./run.sh stop         Stop Docker services"
  echo ""
  echo "  ./run.sh dev          Show instructions for manual dev"
  echo "  ./run.sh backend-dev  Start backend only (FastAPI)"
  echo "  ./run.sh frontend-dev Start frontend only (Next.js)"
  echo "  ./run.sh dev-tmux     Start both backend + frontend in tmux"
  echo ""
  echo "  ./run.sh prod         Production build + startup"
  echo "  ./run.sh setup        Install all dependencies (no startup)"
  echo ""
  echo "  ./run.sh help         Show this help"
  echo ""
}

# ----------------------------------------------------------------
# Main
# ----------------------------------------------------------------
case "${1:-}" in
  docker)
    cmd_docker ;;
  docker-build)
    cmd_docker_build ;;
  stop)
    cmd_stop ;;
  dev)
    cmd_dev ;;
  backend-dev)
    cmd_backend_dev ;;
  frontend-dev)
    cmd_frontend_dev ;;
  dev-tmux)
    cmd_dev_tmux ;;
  prod)
    cmd_prod ;;
  setup)
    check_python && check_node
    setup_env
    cmd_backend_setup
    cd "$SCRIPT_DIR/frontend" && npm install
    ok "All dependencies installed. Run './run.sh dev-tmux' to start." ;;
  help|--help|-h|"")
    usage ;;
  *)
    err "Unknown command: $1"
    usage
    exit 1 ;;
esac