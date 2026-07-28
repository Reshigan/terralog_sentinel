import { Reading } from '../types'

export interface ExportOptions {
  format: 'csv' | 'pdf'
  tenant: string
  startDate?: string
  endDate?: string
}

export class RegulatoryExport {
  private readonly options: ExportOptions

  constructor(options: ExportOptions) {
    this.options = options
  }

  async export(readings: Reading[]): Promise<string> {
    if (readings.length === 0) {
      throw new Error('No readings to export')
    }

    const filtered = this.filterByDateRange(readings)
    if (filtered.length === 0) {
      throw new Error('No readings in date range')
    }

    switch (this.options.format) {
      case 'csv':
        return this.toCsv(filtered)
      case 'pdf':
        return this.toPdf(filtered)
      default:
        throw new Error(`Unsupported format: ${this.options.format}`)
    }
  }

  private filterByDateRange(readings: Reading[]): Reading[] {
    if (!this.options.startDate && !this.options.endDate) {
      return readings
    }

    return readings.filter(reading => {
      const date = new Date(reading.timestamp)
      const start = this.options.startDate ? new Date(this.options.startDate) : null
      const end = this.options.endDate ? new Date(this.options.endDate) : null

      if (start && date < start) return false
      if (end && date > end) return false
      return true
    })
  }

  private toCsv(readings: Reading[]): string {
    const headers = [
      'id',
      'tenant',
      'timestamp',
      'latitude',
      'longitude',
      'numeric_value',
      'sync_status',
      'sync_attempts'
    ]

    const rows = readings.map(r => [
      r.id,
      r.tenant,
      r.timestamp,
      r.latitude,
      r.longitude,
      r.numeric_value,
      r.sync_status,
      r.sync_attempts
    ].map(v => {
      if (v === null || v === undefined) return ''
      if (typeof v === 'string') {
        const escaped = v.replace(/"/g, '""')
        return `"${escaped}"`
      }
      return v
    }).join(','))

    return [headers.join(','), ...rows].join('\n')
  }

  private toPdf(readings: Reading[]): string {
    // PDF generation would require external library in real implementation
    // For this edge environment, return a placeholder that indicates PDF format
    // In production, this would use a library like pdfkit or similar
    const pdfHeader = '%PDF-1.4\n'
    const pdfContent = readings.map(r => 
      `Reading ${r.id}: ${r.timestamp}, ${r.latitude}, ${r.longitude}, ${r.numeric_value}`
    ).join('\n')
    return pdfHeader + pdfContent
  }
}
