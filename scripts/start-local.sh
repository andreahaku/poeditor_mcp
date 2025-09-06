#!/bin/bash

# POEditor MCP Server Local Development Script

set -e

echo "🌐 POEditor Integration Studio - Local Development"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the poeditor_mcp directory"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env file. Please edit it with your POEditor API token."
        echo ""
    else
        echo "❌ Error: .env.example not found"
        exit 1
    fi
fi

# Check for required environment variables
if ! grep -q "POEDITOR_API_TOKEN=" .env || grep -q "POEDITOR_API_TOKEN=$" .env; then
    echo "⚠️  POEDITOR_API_TOKEN not set in .env file"
    echo "   Please add your POEditor API token to continue."
    echo "   Get your token from: https://poeditor.com/account/api"
    echo ""
fi

echo "Choose a development option:"
echo "1) Docker container (recommended - persistent server)"
echo "2) Local build and run (exits immediately - normal MCP stdio behavior)"
echo "3) Development mode with watch (auto-reload)"
echo "4) Integration test (test key detection)"
echo "5) Install dependencies only"
echo ""

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo ""
        echo "🐳 Starting Docker development environment..."
        echo ""
        
        # Build Docker image if it doesn't exist or is outdated
        if ! docker images | grep -q poeditor-mcp-dev; then
            echo "📦 Building Docker image..."
            docker build -t poeditor-mcp-dev -f - . <<EOF
FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
RUN pnpm build
CMD ["pnpm", "dev"]
EOF
        fi
        
        # Run container
        echo "🚀 Starting container..."
        docker run -it --rm \
            --name poeditor-mcp-dev \
            -v "$(pwd)/src:/app/src" \
            -v "$(pwd)/.env:/app/.env" \
            -v "$(pwd)/.smartness-i18n.json:/app/.smartness-i18n.json" \
            -p 3001:3001 \
            poeditor-mcp-dev
        ;;
        
    2)
        echo ""
        echo "🔨 Building and running locally..."
        echo ""
        
        # Install dependencies
        if [ ! -d "node_modules" ]; then
            echo "📦 Installing dependencies..."
            pnpm install
        fi
        
        # Build
        echo "🔧 Building TypeScript..."
        pnpm build
        
        # Run
        echo "🚀 Starting MCP server..."
        echo "Note: This will exit immediately (normal MCP stdio behavior)"
        pnpm start
        ;;
        
    3)
        echo ""
        echo "⚡ Starting development mode with watch..."
        echo ""
        
        # Install dependencies
        if [ ! -d "node_modules" ]; then
            echo "📦 Installing dependencies..."
            pnpm install
        fi
        
        # Start development server
        echo "🚀 Starting dev server with auto-reload..."
        pnpm dev
        ;;
        
    4)
        echo ""
        echo "🧪 Running integration test..."
        echo ""
        
        # Install dependencies
        if [ ! -d "node_modules" ]; then
            echo "📦 Installing dependencies..."
            pnpm install
        fi
        
        # Build if needed
        if [ ! -d "dist" ]; then
            echo "🔧 Building TypeScript..."
            pnpm build
        fi
        
        # Run integration test
        echo "🔍 Testing key detection..."
        pnpm test:integration
        ;;
        
    5)
        echo ""
        echo "📦 Installing dependencies..."
        echo ""
        pnpm install
        echo "✅ Dependencies installed successfully!"
        ;;
        
    *)
        echo "❌ Invalid choice. Please run the script again and select 1-5."
        exit 1
        ;;
esac

echo ""
echo "✅ Development setup complete!"

# Show next steps based on choice
case $choice in
    1)
        echo ""
        echo "🔧 Next steps for Docker development:"
        echo "1. Add MCP server to Claude Code:"
        echo "   claude mcp add poeditor -s user -- docker exec -i poeditor-mcp-dev node /app/dist/index.js"
        echo "2. Test the server:"
        echo "   claude \"Use poeditor_detect_keys to scan src/**/*.vue for Vue 3 keys\""
        ;;
    2|3)
        echo ""
        echo "🔧 Next steps for local development:"
        echo "1. Add MCP server to Claude Code:"
        echo "   claude mcp add poeditor -s user -- node $(pwd)/dist/index.js"
        echo "2. Test the server:"
        echo "   claude \"Use poeditor_detect_keys to scan your codebase\""
        ;;
esac

echo ""
echo "📚 Documentation:"
echo "   • README.md - Full documentation"
echo "   • .env.example - Configuration options"
echo "   • https://poeditor.com/docs/api - POEditor API docs"