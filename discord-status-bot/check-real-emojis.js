const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config({ path: '../.env' });

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
});

client.once('ready', async () => {
    console.log('Bot ready, checking emojis...');
    
    const guild = client.guilds.cache.get(process.env.BOT2_GUILD_ID);
    if (!guild) {
        console.log('Guild not found');
        process.exit(1);
    }
    
    console.log(`\nChecking emojis in guild: ${guild.name}`);
    console.log('=====================================');
    
    const serverEmojis = await guild.emojis.fetch();
    
    if (serverEmojis.size > 0) {
        console.log(`✅ Found ${serverEmojis.size} custom emojis:\n`);
        serverEmojis.forEach(emoji => {
            console.log(`📎 Name: ${emoji.name}`);
            console.log(`   ID: ${emoji.id}`);
            console.log(`   Full: <:${emoji.name}:${emoji.id}>`);
            console.log(`   URL: ${emoji.url}\n`);
        });
    } else {
        console.log('❌ No custom emojis found in this server.');
    }

    client.destroy();
    process.exit(0);
});

client.login(process.env.BOT2_TOKEN);
