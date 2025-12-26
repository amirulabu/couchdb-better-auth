# Express.js Example for `couchdb-better-auth`

This folder contains a minimal Express.js application and a local CouchDB setup used to **demonstrate and test the `couchdb-better-auth` adapter**.  
The Express app is intentionally simple—it just exposes a couple of endpoints so you can focus on wiring and testing authentication behavior against CouchDB.

## What’s in here?

- **Express app (`src/index.ts`)**
  - `GET /` – returns a simple JSON greeting.
  - `GET /health` – returns `{ status: "ok", timestamp: ... }` for basic liveness checks.
- **CouchDB via Docker Compose (`docker-compose.yml`)**
  - Spins up a local CouchDB 3 container on `http://localhost:5984`.
  - Uses `local.ini` for basic single-node and admin configuration.
- **Config (`local.ini`)**
  - `single_node = true` for simple local development.
  - Preconfigured `admin` user and `chttpd_auth.secret` for consistent local auth behavior.

## Prerequisites

- **Node.js** (recommended: latest LTS)
- **pnpm** (used by the repo; see `package.json` `packageManager` field)
- **Docker** & **Docker Compose**

## Getting Started

1. **Install dependencies**

  
   pnpm install
   2. **Start CouchDB via Docker Compose**

   From this folder:

  
   docker compose up -d
      This will start CouchDB at `http://localhost:5984` with:
   - Username: `admin`
   - Password: `password`

3. **Run the Express.js server**

   - For development (with watch):

    
     pnpm dev
        - Or run once:

    
     pnpm start
        The server will start on `http://localhost:3000` by default (or the port given in `PORT` env var).

## Testing the Example

With the server running:

- **Check the root endpoint**

 
  curl http://localhost:3000/
    Expected response:

 
  { "message": "Hello from Express.js server!" }
  - **Health check**

 
  curl http://localhost:3000/health
    Expected response (example):

 
  {
    "status": "ok",
    "timestamp": "2025-01-01T12:34:56.789Z"
  }
  ## Using This with `couchdb-better-auth`

This example is intended as a **playground** for integrating `couchdb-better-auth` into an Express API:

- Wire up the adapter in `src/index.ts` (or a separate auth/router module).
- Point it at the local CouchDB instance configured by `docker-compose.yml` / `local.ini`.
- Use the existing routes