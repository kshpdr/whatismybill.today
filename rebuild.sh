#!/bin/bash

# Rebuild and restart Docker containers
# Run from whatismybill.today directory

echo "🛑 Stopping containers..."
docker compose down

echo "🔨 Rebuilding containers (no cache)..."
docker compose build --no-cache

echo "🚀 Starting containers..."
docker compose up -d

echo "📊 Container status:"
docker compose ps

echo ""
echo "✅ Done! Viewing logs (Ctrl+C to exit)..."
docker compose logs -f
