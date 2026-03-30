#!/bin/bash

# Rebuild only the service that changed
# Usage: ./rebuild-service.sh frontend
# Usage: ./rebuild-service.sh backend

SERVICE=$1

if [ -z "$SERVICE" ]; then
    echo "Usage: ./rebuild-service.sh [frontend|backend]"
    exit 1
fi

if [ "$SERVICE" != "frontend" ] && [ "$SERVICE" != "backend" ]; then
    echo "Error: Service must be 'frontend' or 'backend'"
    exit 1
fi

echo "🔨 Rebuilding $SERVICE..."
docker compose build --no-cache $SERVICE

echo "🚀 Restarting $SERVICE..."
docker compose up -d $SERVICE

echo "📊 Container status:"
docker compose ps

echo ""
echo "✅ Done! Viewing $SERVICE logs (Ctrl+C to exit)..."
docker compose logs -f $SERVICE
