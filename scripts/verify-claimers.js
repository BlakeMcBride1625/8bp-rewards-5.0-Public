#!/usr/bin/env node
/**
 * Verification script to test all claimers and services
 * Checks database connectivity, claimer functionality, and service health
 */

const DatabaseService = require('../services/database-service');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const dbService = DatabaseService.getInstance();

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function verifyDatabase() {
  logSection('1. Database Connectivity');
  try {
    await dbService.connect();
    logSuccess('Database connection established');
    
    // Test query
    const users = await dbService.findRegistrations();
    logInfo(`Found ${users.length} registered users in database`);
    
    if (users.length === 0) {
      logWarning('No users found - this is normal for a fresh setup');
    }
    
    return true;
  } catch (error) {
    logError(`Database connection failed: ${error.message}`);
    return false;
  }
}

async function verifyClaimerFiles() {
  logSection('2. Claimer Files Verification');
  
  const claimers = [
    { name: 'playwright-claimer.js', path: path.join(__dirname, '..', 'playwright-claimer.js') },
    { name: 'playwright-claimer-discord.js', path: path.join(__dirname, '..', 'playwright-claimer-discord.js') },
    { name: 'first-time-claim.js', path: path.join(__dirname, '..', 'first-time-claim.js') }
  ];
  
  const results = [];
  
  for (const claimer of claimers) {
    try {
      if (fs.existsSync(claimer.path)) {
        const stats = fs.statSync(claimer.path);
        logSuccess(`${claimer.name} exists (${Math.round(stats.size / 1024)}KB)`);
        
        // Try to require the file to check for syntax errors
        try {
          require(claimer.path);
          logInfo(`${claimer.name} can be loaded`);
          results.push({ name: claimer.name, status: 'ok' });
        } catch (error) {
          logWarning(`${claimer.name} has load errors: ${error.message}`);
          results.push({ name: claimer.name, status: 'error', error: error.message });
        }
      } else {
        logError(`${claimer.name} not found at ${claimer.path}`);
        results.push({ name: claimer.name, status: 'missing' });
      }
    } catch (error) {
      logError(`Error checking ${claimer.name}: ${error.message}`);
      results.push({ name: claimer.name, status: 'error', error: error.message });
    }
  }
  
  return results;
}

async function verifyDependencies() {
  logSection('3. Dependencies Verification');
  
  const requiredDeps = [
    'playwright',
    'dotenv',
    'child_process'
  ];
  
  const results = [];
  
  for (const dep of requiredDeps) {
    try {
      require(dep);
      logSuccess(`${dep} is available`);
      results.push({ name: dep, status: 'ok' });
    } catch (error) {
      logError(`${dep} is not available: ${error.message}`);
      results.push({ name: dep, status: 'missing' });
    }
  }
  
  // Check for playwright browsers
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    logSuccess('Playwright browsers are installed and working');
    results.push({ name: 'playwright-browsers', status: 'ok' });
  } catch (error) {
    logError(`Playwright browsers check failed: ${error.message}`);
    logInfo('Run: npx playwright install chromium');
    results.push({ name: 'playwright-browsers', status: 'missing' });
  }
  
  return results;
}

async function verifyServices() {
  logSection('4. Services Verification');
  
  const services = [
    { name: 'database-service', path: path.join(__dirname, '..', 'services', 'database-service.js') },
    { name: 'discord-service', path: path.join(__dirname, '..', 'services', 'discord-service.js') },
    { name: 'claimer-utils', path: path.join(__dirname, '..', 'claimer-utils.js') },
    { name: 'browser-pool', path: path.join(__dirname, '..', 'browser-pool.js') }
  ];
  
  const results = [];
  
  for (const service of services) {
    try {
      if (fs.existsSync(service.path)) {
        try {
          require(service.path);
          logSuccess(`${service.name} is available`);
          results.push({ name: service.name, status: 'ok' });
        } catch (error) {
          logWarning(`${service.name} has load errors: ${error.message}`);
          results.push({ name: service.name, status: 'error', error: error.message });
        }
      } else {
        logWarning(`${service.name} not found (optional for some claimers)`);
        results.push({ name: service.name, status: 'optional' });
      }
    } catch (error) {
      logWarning(`Error checking ${service.name}: ${error.message}`);
      results.push({ name: service.name, status: 'unknown' });
    }
  }
  
  return results;
}

async function verifyEnvironmentVariables() {
  logSection('5. Environment Variables');
  
  const required = [
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_HOST'
  ];
  
  const optional = [
    'DISCORD_TOKEN',
    'SHOP_URL',
    'HEADLESS',
    'DELAY_BETWEEN_USERS'
  ];
  
  const results = { required: [], optional: [] };
  
  for (const key of required) {
    if (process.env[key]) {
      logSuccess(`${key} is set`);
      results.required.push({ name: key, status: 'ok' });
    } else {
      logError(`${key} is missing (REQUIRED)`);
      results.required.push({ name: key, status: 'missing' });
    }
  }
  
  for (const key of optional) {
    if (process.env[key]) {
      logSuccess(`${key} is set`);
      results.optional.push({ name: key, status: 'ok' });
    } else {
      logWarning(`${key} is not set (optional)`);
      results.optional.push({ name: key, status: 'missing' });
    }
  }
  
  return results;
}

async function generateReport(results) {
  logSection('Verification Report');
  
  const totalChecks = 
    (results.database ? 1 : 0) +
    results.claimers.length +
    results.dependencies.length +
    results.services.length +
    results.env.required.length;
  
  const passedChecks = 
    (results.database ? 1 : 0) +
    results.claimers.filter(c => c.status === 'ok').length +
    results.dependencies.filter(d => d.status === 'ok').length +
    results.services.filter(s => s.status === 'ok').length +
    results.env.required.filter(e => e.status === 'ok').length;
  
  const percentage = ((passedChecks / totalChecks) * 100).toFixed(1);
  
  log(`Total Checks: ${totalChecks}`, 'cyan');
  log(`Passed: ${passedChecks}`, 'green');
  log(`Failed: ${totalChecks - passedChecks}`, totalChecks - passedChecks > 0 ? 'red' : 'green');
  log(`Success Rate: ${percentage}%`, percentage >= 80 ? 'green' : percentage >= 50 ? 'yellow' : 'red');
  
  if (passedChecks === totalChecks) {
    log('\n✅ All checks passed! Claimers should be ready to use.', 'green');
  } else {
    log('\n⚠️  Some checks failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  log('\n🔍 8BP Rewards - Claimer Verification Script', 'cyan');
  log('=' .repeat(60), 'cyan');
  
  const results = {
    database: null,
    claimers: [],
    dependencies: [],
    services: [],
    env: { required: [], optional: [] }
  };
  
  // Run all verifications
  results.database = await verifyDatabase();
  results.claimers = await verifyClaimerFiles();
  results.dependencies = await verifyDependencies();
  results.services = await verifyServices();
  results.env = await verifyEnvironmentVariables();
  
  // Generate report
  await generateReport(results);
  
  // Exit with appropriate code
  const allPassed = 
    results.database &&
    results.claimers.every(c => c.status === 'ok') &&
    results.dependencies.every(d => d.status === 'ok') &&
    results.env.required.every(e => e.status === 'ok');
  
  process.exit(allPassed ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    logError(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { verifyDatabase, verifyClaimerFiles, verifyDependencies, verifyServices, verifyEnvironmentVariables };

