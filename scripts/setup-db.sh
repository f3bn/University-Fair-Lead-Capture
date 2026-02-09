#!/bin/bash

# University Fair Lead Capture - Database Setup Script
# 
# This script initializes the database with Prisma migrations
# and seeds it with default data.

echo "=== University Fair Lead Capture - Database Setup ==="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is not set."
    echo "Please set it in your .env file or export it."
    exit 1
fi

echo "1. Generating Prisma client..."
npx prisma generate

echo ""
echo "2. Running database migrations..."
npx prisma db push

echo ""
echo "3. Seeding default options..."
npx tsx scripts/seed-options.ts

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To create an admin user, run:"
echo '  npx tsx scripts/create-admin.ts --email admin@example.com --password "YourPassword123!" --name "Admin"'
echo ""
