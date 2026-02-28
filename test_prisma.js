import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({ errorFormat: 'minimal' })
console.log('Successfully initialized')
