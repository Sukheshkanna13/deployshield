import pkg from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' }) // Load the Prisma DB URL

const { PrismaClient } = pkg

export const prisma = new PrismaClient()
