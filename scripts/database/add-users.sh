#!/bin/bash

# Script to add users to PostgreSQL database
# Usage: ./add-users.sh

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-8bp_rewards}"
POSTGRES_USER="${POSTGRES_USER:-8bp_user}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"

# Check if running in Docker or locally
if docker ps | grep -q "8bp-postgres"; then
    echo "Using Docker PostgreSQL..."
    DOCKER_CMD="docker exec -i 8bp-postgres"
else
    echo "Using local PostgreSQL..."
    DOCKER_CMD=""
fi

# SQL to insert users
SQL_FILE=$(mktemp)
cat > "$SQL_FILE" << 'EOF'
-- Add users to registrations table
INSERT INTO registrations (eight_ball_pool_id, username, created_at, updated_at, is_blocked) VALUES
('1343603058', 'Yusef', NOW(), NOW(), false),
('1632750779', 'Vx & Blake', NOW(), NOW(), false),
('3323504033', 'Kolbi', NOW(), NOW(), false),
('4070842330', 'Anthony', NOW(), NOW(), false),
('4931685486', 'AK Tiktok', NOW(), NOW(), false),
('3213334533', '8bp.ryan 2nd', NOW(), NOW(), false),
('4069824470', 'AT''nerb', NOW(), NOW(), false),
('3132133520', 'GBR (Olly)', NOW(), NOW(), false),
('1543016560', 'Lewisblive0 TT', NOW(), NOW(), false),
('2357661125', 'GBR (Karol)', NOW(), NOW(), false),
('2133913807', 'GBR (NATH)', NOW(), NOW(), false),
('574047', 'dan666 TT', NOW(), NOW(), false),
('2130294000', 'GBR (Harry Lee)', NOW(), NOW(), false),
('1028645630', 'queen x Qman', NOW(), NOW(), false),
('4014680882', 'GBR (Chris)', NOW(), NOW(), false),
('3247684699', 'Ems TT', NOW(), NOW(), false),
('3411766218', 'GBR (King Luke)', NOW(), NOW(), false),
('3417777776', 'tango', NOW(), NOW(), false),
('9984415', 'tao', NOW(), NOW(), false),
('2811111711', 'tao', NOW(), NOW(), false),
('4074000337', 'DΔяēDє∇!ʟ', NOW(), NOW(), false),
('4361367039', 'Polar', NOW(), NOW(), false),
('2813420254', 'TT Meg', NOW(), NOW(), false),
('1852427833', 'TT Elise', NOW(), NOW(), false),
('1937295559', 'Ash', NOW(), NOW(), false),
('4175261019', 'MÅSIAH 8BP', NOW(), NOW(), false),
('2222430702', 'XT OTILIA 🦋', NOW(), NOW(), false),
('2184547630', 'Mr8ballking', NOW(), NOW(), false),
('3411092263', 'Ethan', NOW(), NOW(), false),
('4143936427', 'RM', NOW(), NOW(), false),
('2409322815', 'Dan666__tt', NOW(), NOW(), false),
('4714098502', 'ROSS 8BP TIKTOK', NOW(), NOW(), false),
('1195368689', 'Lei eds', NOW(), NOW(), false),
('31597069', 'Osman', NOW(), NOW(), false),
('1085827502', 'FVJA 8BP TIKTOK', NOW(), NOW(), false),
('2686894134', 'XT OTYBLOOM', NOW(), NOW(), false),
('4097217556', 'Antonio', NOW(), NOW(), false),
('4673161248', 'BATMAN', NOW(), NOW(), false),
('3329876494', 'JJ8BP:TT LIVE', NOW(), NOW(), false),
('4154083336', 'TT:EvilPro8BP', NOW(), NOW(), false),
('1637173455', 'AK SUCKZ TIKTOK', NOW(), NOW(), false),
('1624513715', 'JVHK.7', NOW(), NOW(), false),
('2684440456', 'KINGWILL19', NOW(), NOW(), false),
('4930469421', 'polar', NOW(), NOW(), false),
('2985394421', 'Rohan', NOW(), NOW(), false),
('4665757426', 'Exotic', NOW(), NOW(), false),
('4146271461', 'Zaza', NOW(), NOW(), false),
('9009991', '𝔚𝔢𝔰𝔱𝔓𝔬𝔦𝔫𝔱', NOW(), NOW(), false),
('3332956756', 'NHA SLOY', NOW(), NOW(), false)
ON CONFLICT (eight_ball_pool_id) DO UPDATE SET
    username = EXCLUDED.username,
    updated_at = NOW();
EOF

if [ -n "$DOCKER_CMD" ]; then
    # Run in Docker
    cat "$SQL_FILE" | $DOCKER_CMD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
else
    # Run locally
    export PGPASSWORD="$POSTGRES_PASSWORD"
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$SQL_FILE"
fi

RESULT=$?
rm "$SQL_FILE"

if [ $RESULT -eq 0 ]; then
    echo "✅ Successfully added 52 users to the database!"
else
    echo "❌ Failed to add users. Check the error above."
    exit 1
fi

