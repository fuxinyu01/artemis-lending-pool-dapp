#!/bin/sh
set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       Artemis Lending Pool — Hardhat Node    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

echo "Starting Hardhat node..."
npx hardhat node --hostname 0.0.0.0 &
NODE_PID=$!

echo "Waiting for Hardhat node to be ready..."
RETRIES=40
while [ $RETRIES -gt 0 ]; do
  if curl -s -X POST \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' \
     http://localhost:8545 > /dev/null 2>&1; then
    break
  fi
  RETRIES=$((RETRIES - 1))
  sleep 1
done

if [ $RETRIES -eq 0 ]; then
  echo "ERROR: Hardhat node failed to start within 40 seconds."
  exit 1
fi

echo ""
echo "Deploying contracts..."
npx hardhat run scripts/deployLocal.ts

touch /tmp/contracts-deployed

echo ""
echo "════════════════════════════════════════════════"
echo "  Hardhat node:  http://localhost:8545"
echo "  Chain ID:      31337"
echo "  Frontend:      http://localhost:5173"
echo "════════════════════════════════════════════════"
echo ""

wait $NODE_PID
