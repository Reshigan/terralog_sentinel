import { describe, it, expect, beforeAll } from 'bun:test';

// Types imported from shared contract
interface Reading {
  id: number;
  tenant: string;
  photo: string;
  latitude: number;
  longitude: number;
  numeric_value: number;
  timestamp: string;
  encrypted_blob: string;
  sync_status: string;
  sync_attempts: number;
  dedupe_id: string;
  site_id: number;
  device_id: number;
  equipment_id: number;
  calibration_id: number;
}

interface Site {
  id: number;
  tenant: string;
  name: string;
  latitude: number;
  longitude: number;
  mean_value: number;
  std_dev: number;
  last_sync: string;
  sync_success_rate: number;
  technician_email: string;
  status: string;
  zone_id: number;
}

// Mock regulatory functions - these would be imported from src/lib/regulatory.ts
// CSV formatting
function formatCSV(headers: string[], rows: (string | number | null)[][]): string {
  const escapeCSV = (val: string | number | null): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map(row => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

// PDF formatting - simplified text-based representation
interface PDFContent {
  title: string;
  sections: { heading: string; content: string }[];
  signatureFields: { name: string; label: string; required: boolean }[];
}

function formatPDFDocument(content: PDFContent): string {
  const lines: string[] = [];
  lines.push(`%PDF-1.4`);
  lines.push(`1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj`);
  lines.push(`2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj`);
  lines.push(`3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj`);
  
  const bodyLines = [`BT`, `/F1 24 Tf`, `50 700 Td (${content.title}) Tj`, `ET`];
  
  let yPos = 660;
  for (const section of content.sections) {
    bodyLines.push(`BT`);
    bodyLines.push(`/F1 14 Tf`);
    bodyLines.push(`50 ${yPos} Td (${section.heading}) Tj`);
    yPos -= 20;
    bodyLines.push(`/F1 10 Tf`);
    const contentLines = section.content.split('\n');
    for (const line of contentLines) {
      bodyLines.push(`50 ${yPos} Td (${line}) Tj`);
      yPos -= 14;
    }
    bodyLines.push(`ET`);
  }
  
  yPos -= 30;
  for (const sig of content.signatureFields) {
    const required = sig.required ? ' (Required)' : ' (Optional)';
    bodyLines.push(`BT`);
    bodyLines.push(`/F1 10 Tf`);
    bodyLines.push(`50 ${yPos} Td (${sig.label}${required}) Tj`);
    yPos -= 25;
    bodyLines.push(`/F1 10 Tf`);
    bodyLines.push(`50 ${yPos} Td (_________________________) Tj`);
    yPos -= 20;
    bodyLines.push(`ET`);
  }
  
  const bodyStr = bodyLines.join('\n');
  const streamLength = bodyStr.length;
  lines.push(`4 0 obj<</Length ${streamLength}>>stream\n${bodyStr}\nendstream endobj`);
  lines.push(`xref`);
  lines.push(`0 5`);
  lines.push(`0000000000 65535 f`);
  lines.push(`0000000009 00000 n`);
  lines.push(`0000000058 00000 n`);
  lines.push(`0000000115 00000 n`);
  lines.push(`0000000207 00000 n`);
  lines.push(`trailer<</Size 5/Root 1 0 R>>`);
  lines.push(`startxref`);
  lines.push(`${lines.join('\n').length}`);
  lines.push(`%%EOF`);
  
  return lines.join('\n');
}

// Signature field generation
function generateSignatureField(name: string, label: string, required: boolean): { name: string; label: string; required: boolean; hash: string } {
  const data = `${name}:${label}:${required}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return { name, label, required, hash: hashHex };
}

function verifySignature(field: { name: string; label: string; required: boolean; hash: string }): boolean {
  const expected = generateSignatureField(field.name, field.label, field.required);
  return field.hash === expected.hash;
}

// Seeded test data
const seededReadings: Reading[] = [
  {
    id: 1,
    tenant: 'default',
    photo: 'base64encodedphoto1',
    latitude: 34.0522,
    longitude: -118.2437,
    numeric_value: 42.5,
    timestamp: '2026-03-14T10:30:00Z',
    encrypted_blob: 'encrypted1',
    sync_status: 'synced',
    sync_attempts: 1,
    dedupe_id: 'dedupe1',
    site_id: 1,
    device_id: 1,
    equipment_id: 1,
    calibration_id: 1
  },
  {
    id: 2,
    tenant: 'default',
    photo: 'base64encodedphoto2',
    latitude: 34.0622,
    longitude: -118.2537,
    numeric_value: 43.2,
    timestamp: '2026-03-14T11:00:00Z',
    encrypted_blob: 'encrypted2',
    sync_status: 'pending',
    sync_attempts: 0,
    dedupe_id: 'dedupe2',
    site_id: 1,
    device_id: 1,
    equipment_id: 1,
    calibration_id: 1
  },
  {
    id: 3,
    tenant: 'default',
    photo: 'base64encodedphoto3',
    latitude: 34.0722,
    longitude: -118.2637,
    numeric_value: 41.8,
    timestamp: '2026-03-14T11:30:00Z',
    encrypted_blob: 'encrypted3',
    sync_status: 'failed',
    sync_attempts: 5,
    dedupe_id: 'dedupe3',
    site_id: 1,
    device_id: 1,
    equipment_id: 1,
    calibration_id: 1
  }
];

const seededSites: Site[] = [
  {
    id: 1,
    tenant: 'default',
    name: 'Pipeline_Alpha_03',
    latitude: 34.0522,
    longitude: -118.2437,
    mean_value: 42.5,
    std_dev: 0.5,
    last_sync: '2026-03-14T12:00:00Z',
    sync_success_rate: 0.85,
    technician_email: 'tech1@field.example',
    status: 'active',
    zone_id: 1
  }
];

describe('CSV Formatting', () => {
  it('formats readings as CSV with correct headers', () => {
    const headers = ['id', 'timestamp', 'latitude', 'longitude', 'numeric_value', 'sync_status'];
    const rows = seededReadings.map(r => [
      r.id,
      r.timestamp,
      r.latitude,
      r.longitude,
      r.numeric_value,
      r.sync_status
    ]);
    
    const csv = formatCSV(headers, rows);
    const lines = csv.split('\n');
    
    expect(lines[0]).toBe('id,timestamp,latitude,longitude,numeric_value,sync_status');
    expect(lines[1]).toBe('1,2026-03-14T10:30:00Z,34.0522,-118.2437,42.5,synced');
    expect(lines[2]).toBe('2,2026-03-14T11:00:00Z,34.0622,-118.2537,43.2,pending');
    expect(lines[3]).toBe('3,2026-03-14T11:30:00Z,34.0722,-118.2637,41.8,failed');
  });

  it('escapes values containing commas', () => {
    const headers = ['site_name', 'value'];
    const rows = [['Pipeline, Alpha', 42.5]];
    
    const csv = formatCSV(headers, rows);
    
    expect(csv).toBe('site_name,value\n"Pipeline, Alpha",42.5');
  });

  it('escapes values containing quotes', () => {
    const headers = ['description'];
    const rows = [['He said "hello"']];
    
    const csv = formatCSV(headers, rows);
    
    expect(csv).toBe('description\n"He said ""hello"""');
  });

  it('escapes values containing newlines', () => {
    const headers = ['notes'];
    const rows = [['Line 1\nLine 2']];
    
    const csv = formatCSV(headers, rows);
    
    expect(csv).toBe('notes\n"Line 1\nLine 2"');
  });

  it('handles null values gracefully', () => {
    const headers = ['id', 'photo', 'notes'];
    const rows = [[1, null, 'test']];
    
    const csv = formatCSV(headers, rows);
    
    expect(csv).toBe('id,photo,notes\n1,,test');
  });

  it('generates valid CSV for sites export', () => {
    const headers = ['id', 'name', 'latitude', 'longitude', 'sync_success_rate', 'technician_email'];
    const rows = seededSites.map(s => [
      s.id,
      s.name,
      s.latitude,
      s.longitude,
      s.sync_success_rate,
      s.technician_email
    ]);
    
    const csv = formatCSV(headers, rows);
    const lines = csv.split('\n');
    
    expect(lines[0]).toBe('id,name,latitude,longitude,sync_success_rate,technician_email');
    expect(lines[1]).toBe('1,Pipeline_Alpha_03,34.0522,-118.2437,0.85,tech1@field.example');
  });
});

describe('PDF Formatting', () => {
  it('generates valid PDF structure with readings data', () => {
    const content: PDFContent = {
      title: 'Field Readings Report',
      sections: [
        {
          heading: 'Site Information',
          content: `Site: Pipeline_Alpha_03\nTechnician: tech1@field.example\nDate: 2026-03-14`
        },
        {
          heading: 'Readings Summary',
          content: `Total Readings: 3\nSynced: 1\nPending: 1\nFailed: 1`
        }
      ],
      signatureFields: [
        { name: 'technician_sig', label: 'Technician Signature', required: true },
        { name: 'supervisor_sig', label: 'Supervisor Signature', required: false }
      ]
    };
    
    const pdf = formatPDFDocument(content);
    
    expect(pdf).toContain('%PDF-1.4');
    expect(pdf).toContain('%%EOF');
    expect(pdf).toContain('Field Readings Report');
    expect(pdf).toContain('Technician Signature (Required)');
    expect(pdf).toContain('Supervisor Signature (Optional)');
  });

  it('includes all required PDF objects', () => {
    const content: PDFContent = {
      title: 'Test Report',
      sections: [],
      signatureFields: []
    };
    
    const pdf = formatPDFDocument(content);
    const lines = pdf.split('\n');
    
    expect(lines[0]).toBe('%PDF-1.4');
    expect(lines.some(l => l.includes('1 0 obj'))).toBe(true);
    expect(lines.some(l => l.includes('2 0 obj'))).toBe(true);
    expect(lines.some(l => l.includes('3 0 obj'))).toBe(true);
    expect(lines.some(l => l.includes('4 0 obj'))).toBe(true);
  });

  it('renders section content correctly', () => {
    const content: PDFContent = {
      title: 'Calibration Report',
      sections: [
        {
          heading: 'Equipment Details',
          content: 'Serial: ABC123\nType: Pressure Gauge\nLast Calibration: 2026-01-15'
        }
      ],
      signatureFields: []
    };
    
    const pdf = formatPDFDocument(content);
    
    expect(pdf).toContain('Calibration Report');
    expect(pdf).toContain('Equipment Details');
    expect(pdf).toContain('Serial: ABC123');
    expect(pdf).toContain('Type: Pressure Gauge');
  });
});

describe('Signature Fields', () => {
  it('generates unique hash for signature field', () => {
    const sig1 = generateSignatureField('tech_sig', 'Technician', true);
    const sig2 = generateSignatureField('tech_sig', 'Technician', true);
    const sig3 = generateSignatureField('supervisor_sig', 'Supervisor', false);
    
    expect(sig1.hash).toBe(sig2.hash);
    expect(sig1.hash).not.toBe(sig3.hash);
  });

  it('verifies valid signature field', () => {
    const sig = generateSignatureField('field_sig', 'Field Signature', true);
    
    expect(verifySignature(sig)).toBe(true);
  });

  it('rejects tampered signature field', () => {
    const sig = generateSignatureField('field_sig', 'Field Signature', true);
    const tampered = { ...sig, label: 'Tampered Label' };
    
    expect(verifySignature(tampered)).toBe(false);
  });

  it('includes all required properties', () => {
    const sig = generateSignatureField('test_sig', 'Test Signature', true);
    
    expect(sig).toHaveProperty('name');
    expect(sig).toHaveProperty('label');
    expect(sig).toHaveProperty('required');
    expect(sig).toHaveProperty('hash');
    expect(sig.name).toBe('test_sig');
    expect(sig.label).toBe('Test Signature');
    expect(sig.required).toBe(true);
  });

  it('handles optional signature fields', () => {
    const sig = generateSignatureField('opt_sig', 'Optional', false);
    
    expect(sig.required).toBe(false);
    expect(sig.hash.length).toBe(64); // SHA-256 hex
  });

  it('generates deterministic hashes for same input', () => {
    const sig1 = generateSignatureField('deterministic', 'Test', true);
    const sig2 = generateSignatureField('deterministic', 'Test', true);
    
    expect(sig1.hash).toBe(sig2.hash);
  });
});

describe('Regulatory Export Integration', () => {
  it('exports readings with regulatory metadata', () => {
    const headers = [
      'Reading ID',
      'Timestamp',
      'Latitude',
      'Longitude',
      'Value',
      'Sync Status',
      'Dedupe ID'
    ];
    
    const rows = seededReadings.map(r => [
      r.id,
      r.timestamp,
      r.latitude,
      r.longitude,
      r.numeric_value,
      r.sync_status,
      r.dedupe_id
    ]);
    
    const csv = formatCSV(headers, rows);
    
    expect(csv).toContain('Reading ID,Timestamp,Latitude,Longitude,Value,Sync Status,Dedupe ID');
    expect(csv).toContain('dedupe1');
    expect(csv).toContain('dedupe2');
    expect(csv).toContain('dedupe3');
  });

  it('generates PDF report with audit trail', () => {
    const content: PDFContent = {
      title: 'Regulatory Compliance Report',
      sections: [
        {
          heading: 'Audit Information',
          content: `Generated: 2026-03-14T12:00:00Z\nTenant: default\nReport Type: Daily Summary`
        },
        {
          heading: 'Compliance Status',
          content: `All readings within acceptable range\nSync success rate: 85%\nNo outliers detected`
        }
      ],
      signatureFields: [
        { name: 'audit_sig', label: 'Auditor Signature', required: true },
        { name: 'qa_sig', label: 'QA Verification', required: true },
        { name: 'archival_sig', label: 'Archival Record', required: false }
      ]
    };
    
    const pdf = formatPDFDocument(content);
    
    expect(pdf).toContain('Regulatory Compliance Report');
    expect(pdf).toContain('Audit Information');
    expect(pdf).toContain('Compliance Status');
    expect(pdf).toContain('Auditor Signature (Required)');
    expect(pdf).toContain('QA Verification (Required)');
    expect(pdf).toContain('Archival Record (Optional)');
  });

  it('validates signature chain for multi-signature reports', () => {
    const signatures = [
      generateSignatureField('step1', 'Technician', true),
      generateSignatureField('step2', 'Supervisor', true),
      generateSignatureField('step3', 'Quality Assurance', true)
    ];
    
    const allValid = signatures.every(sig => verifySignature(sig));
    
    expect(allValid).toBe(true);
    expect(signatures[0].hash).not.toBe(signatures[1].hash);
    expect(signatures[1].hash).not.toBe(signatures[2].hash);
  });

  it('handles empty data gracefully in CSV', () => {
    const headers = ['id', 'value'];
    const rows: (string | number | null)[][] = [];
    
    const csv = formatCSV(headers, rows);
    
    expect(csv).toBe('id,value');
  });

  it('handles empty sections in PDF', () => {
    const content: PDFContent = {
      title: 'Empty Report',
      sections: [],
      signatureFields: []
    };
    
    const pdf = formatPDFDocument(content);
    
    expect(pdf).toContain('%PDF-1.4');
    expect(pdf).toContain('%%EOF');
    expect(pdf).toContain('Empty Report');
  });
});
