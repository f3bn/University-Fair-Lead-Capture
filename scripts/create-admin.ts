/**
 * Create Admin Script
 *
 * Usage:
 *   npx ts-node scripts/create-admin.ts --email admin@example.com --password "StrongPass123!" --name "Admin"
 *
 * Or with npx tsx:
 *   npx tsx scripts/create-admin.ts --email admin@example.com --password "StrongPass123!" --name "Admin"
 */

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../lib/auth'
import { passwordPolicySchema } from '../lib/validations'

const prisma = new PrismaClient()

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const value = args[i + 1]
      if (value && !value.startsWith('--')) {
        result[key] = value
        i++
      }
    }
  }
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const email = args.email
  const password = args.password
  const name = args.name

  if (!email || !password || !name) {
    console.error('Usage: npx tsx scripts/create-admin.ts --email <email> --password <password> --name <name>')
    process.exit(1)
  }

  const passwordCheck = passwordPolicySchema.safeParse(password)
  if (!passwordCheck.success) {
    console.error('Password does not meet policy requirements (min 12 chars, upper, lower, number, symbol).')
    process.exit(1)
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  })

  if (existingUser) {
    console.error(`User with email ${email} already exists.`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: 'admin',
    },
  })

  console.log('Admin user created successfully:')
  console.log(`  ID: ${user.id}`)
  console.log(`  Email: ${user.email}`)
  console.log(`  Name: ${user.name}`)
  console.log(`  Role: ${user.role}`)

  const existingExpo = await prisma.expo.findFirst()
  if (!existingExpo) {
    const expo = await prisma.expo.create({
      data: {
        name: 'معرض الجامعات',
        location: '',
        date: new Date(),
        settings: {
          create: {
            logosJson: '[]',
            exportIncludeNeedsReview: false,
          },
        },
      },
    })
    console.log(`\nDefault expo created: ${expo.name}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Failed to create admin user')
  prisma.$disconnect()
  process.exit(1)
})
