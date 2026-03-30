#!/bin/bash

# Quick restart (ONLY for changes already in the container)
# Run from whatismybill.today directory
# Note: This won't pick up code changes - use rebuild.sh for that

echo "⚠️  Warning: This only restarts containers, it won't pick up code changes!"
echo "   For code changes, use ./rebuild.sh instead"
echo ""
read -p "Continue with restart? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    exit 1
fi

echo "🔄 Restarting containers..."
docker compose restart

echo "📊 Container status:"
docker compose ps

echo ""
echo "✅ Done! Viewing logs (Ctrl+C to exit)..."
docker compose logs -f
