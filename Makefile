.PHONY: build up down dev-backend dev-frontend build-wasm build-css watch-css clean test

# ── Docker ─────────────────────────────────────────────────────────────────────

build:
	docker compose build

up:
	docker compose up

down:
	docker compose down

up-dev:
	docker compose -f docker-compose.dev.yml up

down-dev:
	docker compose -f docker-compose.dev.yml down

# ── Local development ──────────────────────────────────────────────────────────

dev-backend:
	cd backend && go run ./cmd/server

dev-frontend: build-wasm build-css
	cd frontend && python3 -m http.server 3000 --directory public

# ── WASM build ─────────────────────────────────────────────────────────────────

build-wasm:
	@echo "Compiling Go frontend to WebAssembly..."
	cd frontend && GOOS=js GOARCH=wasm go build -o public/main.wasm ./src
	@echo "Copying wasm_exec.js runtime..."
	cp "$(shell go env GOROOT)/misc/wasm/wasm_exec.js" frontend/public/wasm_exec.js

# ── CSS build ──────────────────────────────────────────────────────────────────

build-css:
	@echo "Building Tailwind CSS..."
	cd frontend && npx tailwindcss -i src/styles/main.css -o public/dist/styles.css --minify

watch-css:
	cd frontend && npx tailwindcss -i src/styles/main.css -o public/dist/styles.css --watch

# ── Utilities ──────────────────────────────────────────────────────────────────

clean:
	rm -f frontend/public/main.wasm
	rm -f frontend/public/wasm_exec.js
	rm -rf frontend/public/dist
	rm -rf frontend/node_modules

test:
	cd backend && go test ./...

lint:
	cd backend && go vet ./...
