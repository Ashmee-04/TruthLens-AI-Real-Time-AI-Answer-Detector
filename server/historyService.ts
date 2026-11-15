import fs from 'node:fs/promises';
import path from 'node:path';
import type { DashboardMetrics, VerificationRecord } from '../shared/types.ts';
import { getServerConfig } from './config.ts';

function getHistoryFilePath(): string {
  const { dataDir } = getServerConfig();
  return path.resolve(dataDir, 'verifications.json');
}

async function ensureStoreFile(): Promise<string> {
  const filePath = getHistoryFilePath();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, '[]', 'utf8');
  }
  return filePath;
}

async function readAllRecords(): Promise<VerificationRecord[]> {
  const filePath = await ensureStoreFile();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as VerificationRecord[];
  } catch {
    return [];
  }
}

async function writeAllRecords(records: VerificationRecord[]): Promise<void> {
  const filePath = await ensureStoreFile();
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(records, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}

export async function listHistory(): Promise<VerificationRecord[]> {
  const records = await readAllRecords();
  return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getVerificationById(id: string): Promise<VerificationRecord | null> {
  const records = await readAllRecords();
  return records.find((r) => r.id === id) || null;
}

export async function saveVerification(record: VerificationRecord): Promise<VerificationRecord> {
  const records = await readAllRecords();
  const filtered = records.filter((r) => r.id !== record.id);
  const updated = [record, ...filtered].slice(0, 200);
  await writeAllRecords(updated);
  return record;
}

export async function deleteVerification(id: string): Promise<boolean> {
  const records = await readAllRecords();
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) {
    return false;
  }
  await writeAllRecords(next);
  return true;
}

export function computeDashboardMetrics(records: VerificationRecord[]): DashboardMetrics {
  return records.reduce<DashboardMetrics>(
    (acc, rec) => {
      acc.totalVerifications += 1;
      acc.totalClaimsProcessed += rec.summary.totalClaims;
      acc.potentiallyOutdatedClaims += rec.summary.potentiallyOutdatedCount;
      acc.conflictingClaims += rec.summary.conflictingCount;
      acc.unverifiableClaims +=
        rec.summary.unverifiableCount + rec.summary.insufficientEvidenceCount;
      acc.verifiedClaims += rec.summary.verifiedCount;
      return acc;
    },
    {
      totalVerifications: 0,
      totalClaimsProcessed: 0,
      potentiallyOutdatedClaims: 0,
      conflictingClaims: 0,
      unverifiableClaims: 0,
      verifiedClaims: 0,
    }
  );
}
