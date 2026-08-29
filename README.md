# SatsPath Wallet ⚡🛡️⛓️

**SatsPath Wallet** is an intelligent, multi-rail Bitcoin, Lightning, and Ark wallet. Powered by the **SatsPath SDK** (`@satspath/resolvers` & `@satspath/router`) and the **Arkade OS** core, SatsPath Wallet automatically selects the most cost-effective and fastest payment route between Ark (VTXO), Lightning Network, and Bitcoin Layer 1.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.15.0-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D8-orange.svg)](https://pnpm.io)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](https://www.docker.com/)

---

## 🌟 Key Features

### 1. 🔍 SatsPath Multi-Rail Identifier Resolution
Send bitcoin to human-readable names with zero friction:
- **BIP-353**: DNS-based addresses (e.g. `alice@satspath.com` via DNSSEC).
- **Lightning Address / LNURL**: Direct Lightning routing.
- **Nostr NIP-05**: Decentralized identifiers (`_@domain.com` or `name@domain.com`).
- **HTTP Well-Known**: Host-level profile manifests (`.well-known/satspath.json`).
- **Cryptographic Verification**: Schnorr signature verification (secp256k1) ensuring profile integrity.

### 2. ⚡ Smart Rail Routing Engine (`@satspath/router`)
Automatically determines the optimal execution rail based on transaction amount, speed, and real-time mempool fee rates:
- **🛡️ Ark Rail (VTXOs)**: Instant off-chain transfers on Arkade ASPs with 0 network fees and high throughput. Ideal when L1 fees are elevated.
- **⚡ Lightning Rail**: Instant sub-100k sats micropayments executed via non-custodial RFQ Solvers and Boltz swaps.
- **⛓️ Bitcoin L1 Rail**: Direct on-chain settlement when mempool fees are low (≤ 10 sat/vB) or when recipient is on-chain only.
- **Dynamic Route Comparison UI**: Interactive breakdown showing fee savings (sats saved) and estimated confirmation time.

### 3. 📱 Unified Multi-Rail Receive & QR
- Generate unified BIP-21 payment payloads embedding Ark, Lightning, and On-chain parameters simultaneously.
- Self-custodial key management with BIP-39 mnemonic seed phrases and biometrics.

---

## 🏗️ Repository Architecture

This repository is organized as a unified monorepo using **pnpm workspaces**:

```
satspath-wallet/
├── packages/
│   ├── resolvers/         # @satspath/resolvers (BIP-353, LNURL, Nostr NIP-05, Schnorr)
│   └── router/            # @satspath/router (Smart fee selection, rail planner, QR generator)
├── src/
│   ├── components/        # React components (SatsPathRouteSelector, SatsPathProfileCard, etc.)
│   ├── lib/
│   │   ├── satspath.ts    # Core SatsPath SDK wallet integration layer
│   │   └── ...            # Arkade wallet utilities & cryptographic drivers
│   ├── providers/         # Context providers (Wallet, Navigation, Fees, Asp, Swaps)
│   └── screens/           # Send, Receive, Swap, Activity, Settings screens
├── public/                # Static assets, icons, manifest
├── Dockerfile             # Multi-stage container build (pnpm + Node 24 + Nginx)
├── docker-compose.yml     # Standalone container orchestration
├── nginx.conf             # Production Nginx configuration with security headers
└── package.json           # Unified dependencies & build scripts
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v24.15.0` or higher
- **pnpm**: `v8` or higher (`corepack enable && corepack prepare pnpm@10.25.0 --activate`)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/marchelo23/satspath-wallet.git
cd satspath-wallet

# Install all workspace dependencies
pnpm install
```

### 2. Development Server
```bash
# Start local development server
pnpm start

# Or connect directly to Arkade Mainnet ASP
pnpm start:mainnet
```

Access the wallet at `http://localhost:3000` (or the port shown in Vite output).

### 3. Testing
```bash
# Run unit tests across resolvers, router, and wallet components
pnpm test

# Run tests with coverage
pnpm test:coverage
```

### 4. Production Build
```bash
# Build web worker and optimized production assets
pnpm build
```

---

## 🐳 Docker Deployment

You can build and run SatsPath Wallet instantly with Docker and Docker Compose:

### Using Docker Compose
```bash
# Start SatsPath Wallet container
docker compose up -d

# View logs
docker compose logs -f

# Stop container
docker compose down
```

The wallet will be served securely via Nginx at `http://localhost:3000`.

### Manual Docker Build
```bash
# Build image
docker build -t satspath-wallet:latest .

# Run container
docker run -d -p 3000:80 --name satspath-wallet satspath-wallet:latest
```

---

## ⚙️ Environment Configuration

| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_ARK_SERVER` | Ark ASP Server endpoint | `https://arkade.computer` |
| `VITE_NOSTR_RELAY_URL` | Nostr Relay for RFQ Solvers | `wss://relay.damus.io` |
| `VITE_LNURL_SERVER_URL` | LNURL bridge server | Optional |
| `PORT` | Docker host port mapping | `3000` |

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
