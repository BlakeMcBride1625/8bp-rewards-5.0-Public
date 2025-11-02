#!/usr/bin/env node

/**
 * Emoji ID Updater
 * 
 * This script helps you update the Discord emoji IDs in the bot.
 * After uploading emojis to your Discord server, run this script
 * to update the bot with the new emoji IDs.
 */

const fs = require('fs');
const path = require('path');

const EMBED_FILE = path.join(__dirname, 'src/monitor/buildEmbed.ts');

console.log('🎨 Discord Emoji ID Updater');
console.log('============================\n');

// Read current emoji IDs from the file
function getCurrentEmojiIds() {
    try {
        const content = fs.readFileSync(EMBED_FILE, 'utf8');
        const greenMatch = content.match(/case "online": return "<:green_circle:(\d+)>"/);
        const yellowMatch = content.match(/case "slow": return "<:yellow_circle:(\d+)>"/);
        const redMatch = content.match(/case "offline": return "<:red_circle:(\d+)>"/);
        
        return {
            green: greenMatch ? greenMatch[1] : null,
            yellow: yellowMatch ? yellowMatch[1] : null,
            red: redMatch ? redMatch[1] : null
        };
    } catch (error) {
        console.error('❌ Error reading embed file:', error.message);
        return null;
    }
}

// Update emoji IDs in the file
function updateEmojiIds(newIds) {
    try {
        let content = fs.readFileSync(EMBED_FILE, 'utf8');
        
        // Replace each emoji ID
        if (newIds.green) {
            content = content.replace(
                /case "online": return "<:green_circle:\d+>"/,
                `case "online": return "<:green_circle:${newIds.green}>"`
            );
        }
        
        if (newIds.yellow) {
            content = content.replace(
                /case "slow": return "<:yellow_circle:\d+>"/,
                `case "slow": return "<:yellow_circle:${newIds.yellow}>"`
            );
        }
        
        if (newIds.red) {
            content = content.replace(
                /case "offline": return "<:red_circle:\d+>"/,
                `case "offline": return "<:red_circle:${newIds.red}>"`
            );
        }
        
        fs.writeFileSync(EMBED_FILE, content);
        return true;
    } catch (error) {
        console.error('❌ Error updating embed file:', error.message);
        return false;
    }
}

// Main function
function main() {
    const currentIds = getCurrentEmojiIds();
    
    if (!currentIds) {
        console.log('❌ Could not read current emoji IDs');
        return;
    }
    
    console.log('📋 Current emoji IDs:');
    console.log(`   Green circle:  <:green_circle:${currentIds.green || 'NOT_SET'}>`);
    console.log(`   Yellow circle: <:yellow_circle:${currentIds.yellow || 'NOT_SET'}>`);
    console.log(`   Red circle:    <:red_circle:${currentIds.red || 'NOT_SET'}>\n`);
    
    console.log('📝 To update emoji IDs:');
    console.log('1. Upload your emoji images to your Discord server');
    console.log('2. Right-click on the emoji and select "Copy Link"');
    console.log('3. Extract the emoji ID from the URL (the number at the end)');
    console.log('4. Run this script with the new IDs:\n');
    
    console.log('   node update-emojis.js --green=YOUR_GREEN_ID --yellow=YOUR_YELLOW_ID --red=YOUR_RED_ID\n');
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    const newIds = {};
    
    args.forEach(arg => {
        if (arg.startsWith('--green=')) {
            newIds.green = arg.split('=')[1];
        } else if (arg.startsWith('--yellow=')) {
            newIds.yellow = arg.split('=')[1];
        } else if (arg.startsWith('--red=')) {
            newIds.red = arg.split('=')[1];
        }
    });
    
    if (Object.keys(newIds).length > 0) {
        console.log('🔄 Updating emoji IDs...');
        
        // Merge with current IDs
        const finalIds = {
            green: newIds.green || currentIds.green,
            yellow: newIds.yellow || currentIds.yellow,
            red: newIds.red || currentIds.red
        };
        
        if (updateEmojiIds(finalIds)) {
            console.log('✅ Emoji IDs updated successfully!');
            console.log(`   Green circle:  <:green_circle:${finalIds.green}>`);
            console.log(`   Yellow circle: <:yellow_circle:${finalIds.yellow}>`);
            console.log(`   Red circle:    <:red_circle:${finalIds.red}>`);
            console.log('\n🔄 Now run: npm run build && npm start');
        } else {
            console.log('❌ Failed to update emoji IDs');
        }
    }
}

main();
