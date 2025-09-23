#!/usr/bin/env node

import { EightBallPoolClaimer } from './8bp-claimer';

async function main(): Promise<void> {
  console.log('🚀 Running 8ball Pool Free Items Claimer (One-time execution)...');
  
  const claimer = new EightBallPoolClaimer();
  await claimer.runDailyClaim();
  
  console.log('✅ Claim process completed!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
