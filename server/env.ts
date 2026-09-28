import { existsSync } from 'node:fs'
// Also used by tsx watch so development and production read the same local config.
if (existsSync('.env')) process.loadEnvFile('.env')
