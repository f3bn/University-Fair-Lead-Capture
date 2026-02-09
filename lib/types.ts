export interface Lead {
  id: string
  expoId: string
  createdByUserId: string
  qrRaw: string | null
  qrHash: string | null
  evidenceImagePath: string | null
  evidenceImageSource: 'frame' | 'upload'
  qrDecodeStatus: 'decoded' | 'failed'
  qrDecodeError: string | null
  generatedQrImagePath: string | null
  name: string | null
  phoneCountry: string | null
  phoneNumber: string | null
  qualification: string | null
  degreeLevel: string | null
  major: string | null
  majorLanguage: string | null
  notes: string | null
  status: 'draft' | 'done' | 'cancelled'
  scanCount: number
  scannedAt: string
  updatedAt: string
  cancelledAt: string | null
}

export interface SelectOption {
  id: string
  expoId: string
  category: 'qualification' | 'degree_level' | 'major' | 'major_language' | 'country_code'
  valueAr: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ExpoSettings {
  expo: {
    id: string
    name: string
    location: string | null
    date: string | null
  }
  settings: {
    logos: string[]
    exportIncludeDrafts?: boolean
    exportIncludeNeedsReview?: boolean
    exportIncludeCancelled?: boolean
    exportScope?: 'all' | 'today'
  }
}
