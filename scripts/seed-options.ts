/**
 * Seed Options Script
 * 
 * Usage:
 *   npx tsx scripts/seed-options.ts
 * 
 * This script seeds the database with default select options
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const defaultOptions = {
  qualification: [
    'ثانوية عامة',
    'دبلوم',
    'بكالوريوس',
    'ماجستير',
    'دكتوراه',
    'طالب جامعي',
    'أخرى',
  ],
  degree_level: [
    'بكالوريوس',
    'ماجستير',
    'أخرى',
  ],
  major: [
    'تطوير الويب',
    'الموسيقى الشعبية',
    'قانون, اقتصاد وحوكمة',
    'إدارة الأعمال الدولية - تركيز في إدارة سلسلة التوريد',
    'إدارة الأعمال الدولية',
    'إدارة الأعمال الدولية - تخصص في التسويق الرقمي',
    'إدارة الأعمال الدولية - تخصص في علم النفس',
    'إدارة الضيافة العالمية',
    'تصميم الفيلم والحركة',
    'إدارة الصناعات الإبداعية',
    'علوم الحاسوب',
    'الأنظمة الميكاترونيكية التطبيقية',
    'تصميم الإعلان والعلامة التجارية',
    'الأعمال التجارية الدولية والقيادة',
    'تكنلوجيا المياه',
    'تصميم تجربة المستخدم والخدمات',
    'برنامج هندسة إنتاج البطاريات المستدامة',
    'التصميم الاجتماعي والابتكار المستدام',
    'القانون والتكنولوجيا',
    'إدارة دولية - تخصص في القيادة الإبداعية',
    'إدارة الأعمال الدولية - تركيز في إدارة الرعاية',
    'دارة الرعاية الصحية',
    'دارة الأعمال العالمية',
    'الإدارة العامة',
    'الإدارة العامة التنفيذية',
    'إدارة التحول الرقمي',
    'الهندسة وإدارة التكنولوجيا المستدامة - تخصص في صناعة التنقل والسيارات',
    'الصحة الرقمية - تحليل البيانات',
    'علوم الحاسوب - تخصص في الأمن السيبراني',
    'علوم البيانات التطبيقية والذكاء الاصطناعي',
    'الهندسة المعمارية',
    'علوم الحاسوب التطبيقية',
    'تصميم تجربة المستخدم والخدمات (أونلاين)',
    'ماجستير إدارة الأعمال العالمي في الاستدامة (أونلاين)',
    'إدارة التصميم (أونلاين)',
  ],
  major_language: [
    'الإنجليزية',
    'الألمانية',
  ],
  country_code: [
    '+966',
    '+90',
    '+49',
    '+971',
    '+973',
    '+974',
    '+968',
    '+965',
    '+20',
    '+962',
    '+961',
    '+963',
    '+964',
    '+967',
    '+212',
    '+213',
    '+216',
    '+218',
  ],
}

async function main() {
  // Get or create expo
  let expo = await prisma.expo.findFirst()
  
  if (!expo) {
    expo = await prisma.expo.create({
      data: {
        name: 'معرض ايدس',
        location: '',
        date: new Date(),
        settings: {
          create: {
            logosJson: '[]',
          },
        },
      },
    })
    console.log(`Created expo: ${expo.name}`)
  }
  
  // Seed options for each category
  for (const [category, values] of Object.entries(defaultOptions)) {
    console.log(`\nSeeding ${category}...`)
    
    for (let i = 0; i < values.length; i++) {
      const value = values[i]
      
      // Check if option already exists
      const existing = await prisma.selectOption.findFirst({
        where: {
          expoId: expo.id,
          category: category as 'qualification' | 'degree_level' | 'major' | 'major_language' | 'country_code',
          valueAr: value,
        },
      })
      
      if (!existing) {
        await prisma.selectOption.create({
          data: {
            expoId: expo.id,
            category: category as 'qualification' | 'degree_level' | 'major' | 'major_language' | 'country_code',
            valueAr: value,
            isActive: true,
            sortOrder: i,
          },
        })
        console.log(`  Created: ${value}`)
      } else {
        console.log(`  Skipped (exists): ${value}`)
      }
    }
  }
  
  console.log('\nSeeding complete!')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
