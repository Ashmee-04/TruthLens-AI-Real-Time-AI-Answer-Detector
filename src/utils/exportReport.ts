import { jsPDF } from 'jspdf';
import type { VerificationRecord } from '../../shared/types.ts';
import { getClaimStatusMeta } from '../components/StatusIndicator.tsx';

export function formatReportSummaryText(record: VerificationRecord): string {
  const { report } = record;
  const s = report.summary;

  const lines: string[] = [
    `TRUTHLENS AI — VERIFICATION REPORT`,
    `Report Title: ${report.reportTitle}`,
    `Verification ID: ${report.verificationId}`,
    `Verified At: ${new Date(report.completedAt).toISOString()}`,
    `Bifrost Model: ${report.metadata.bifrostModel}`,
    ``,
    `EXECUTIVE SUMMARY`,
    report.executiveSummary,
    ``,
    `SUMMARY COUNTS`,
    `- Total Claims Extracted: ${s.totalClaims}`,
    `- Time-Sensitive Claims Checked: ${s.claimsChecked}`,
    `- Verified / Current: ${s.verifiedCount}`,
    `- Potentially Outdated: ${s.potentiallyOutdatedCount}`,
    `- Conflicting Evidence: ${s.conflictingCount}`,
    `- Unverifiable / Insufficient Evidence: ${s.unverifiableCount + s.insufficientEvidenceCount}`,
    `- Not Time-Sensitive: ${s.notTimeSensitiveCount}`,
    `- Verification Failed: ${s.verificationFailedCount}`,
    ``,
    `CLAIM-BY-CLAIM FINDINGS`,
  ];

  if (report.claims.length === 0) {
    lines.push('No verifiable factual claims were detected in the submitted text.');
  } else {
    for (const c of report.claims) {
      const statusMeta = getClaimStatusMeta(c.status);
      lines.push(
        ``,
        `[${c.id}] ${statusMeta.label} (${c.category})`,
        `Claim: "${c.originalText}"`,
        `Freshness: ${c.freshness.label}${c.freshness.score !== null ? ` (${c.freshness.score}/100)` : ''}`,
        `Evidence Confidence: ${c.confidence.level}${c.confidence.score !== null ? ` (${c.confidence.score}/100)` : ''}`,
        `Explanation: ${c.explanation}`,
        `Suggested Action: ${c.suggestedAction}`
      );
      if (c.sources.length > 0) {
        lines.push(`Sources:`);
        for (const src of c.sources) {
          lines.push(
            `  - ${src.title} | ${src.url} | Published: ${src.publishedDate ?? 'Not supplied'} | Retrieved: ${src.retrievedAt}`
          );
        }
      } else {
        lines.push(`Sources: None retrieved`);
      }
    }
  }

  lines.push(``, `RECOMMENDED ACTIONS`);
  for (const action of report.recommendedActions) {
    lines.push(`- ${action}`);
  }

  lines.push(``, `VERIFICATION LIMITATIONS`);
  for (const lim of report.limitations) {
    lines.push(`- ${lim}`);
  }

  return lines.join('\n');
}

export function downloadReportPdf(record: VerificationRecord): void {
  const { report } = record;
  const s = report.summary;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = 50;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 50;
    }
  };

  const writeWrapped = (
    text: string,
    options: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}
  ) => {
    const size = options.size ?? 10;
    const indent = options.indent ?? 0;
    const gap = options.gap ?? 6;
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const [r, g, b] = options.color ?? [30, 41, 59];
    doc.setTextColor(r, g, b);

    const lines = doc.splitTextToSize(text, maxWidth - indent) as string[];
    const lineHeight = size * 1.38;
    for (const line of lines) {
      ensureSpace(lineHeight + 4);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += gap;
  };

  // Header
  writeWrapped('TruthLens AI — Verification Report', {
    size: 16,
    bold: true,
    color: [15, 23, 42],
    gap: 4,
  });
  writeWrapped(report.reportTitle, { size: 12, bold: true, color: [67, 56, 202], gap: 6 });
  writeWrapped(
    `Verification ID: ${report.verificationId}   |   Completed: ${new Date(report.completedAt).toUTCString()}   |   Model: ${report.metadata.bifrostModel}`,
    { size: 8.5, color: [100, 116, 139], gap: 12 }
  );

  // Executive summary
  writeWrapped('Executive Summary', { size: 11.5, bold: true, color: [15, 23, 42], gap: 4 });
  writeWrapped(report.executiveSummary, { size: 9.5, color: [51, 65, 85], gap: 10 });

  // Summary Counts
  writeWrapped(
    `Summary Counts — Total: ${s.totalClaims} | Checked: ${s.claimsChecked} | Verified: ${s.verifiedCount} | Outdated: ${s.potentiallyOutdatedCount} | Conflicting: ${s.conflictingCount} | Unverifiable/Insufficient: ${s.unverifiableCount + s.insufficientEvidenceCount} | Not Time-Sensitive: ${s.notTimeSensitiveCount} | Failed: ${s.verificationFailedCount}`,
    { size: 9, bold: true, color: [30, 41, 59], gap: 12 }
  );

  // Original Answer
  writeWrapped('Original Submitted Answer', { size: 11.5, bold: true, color: [15, 23, 42], gap: 4 });
  writeWrapped(report.originalAnswer, { size: 9, color: [71, 85, 105], gap: 14 });

  // Claims
  writeWrapped('Claim-by-Claim Findings', { size: 11.5, bold: true, color: [15, 23, 42], gap: 6 });

  if (report.claims.length === 0) {
    writeWrapped('No verifiable factual claims were detected in the submitted text.', {
      size: 9.5,
      color: [71, 85, 105],
      gap: 10,
    });
  } else {
    for (const c of report.claims) {
      const meta = getClaimStatusMeta(c.status);
      ensureSpace(90);
      writeWrapped(`${c.id} · ${meta.label} · ${c.category}`, {
        size: 10,
        bold: true,
        color: [15, 23, 42],
        gap: 3,
      });
      writeWrapped(`"${c.originalText}"`, { size: 9.5, bold: true, color: [51, 65, 85], indent: 8, gap: 4 });
      writeWrapped(
        `Freshness: ${c.freshness.label}${c.freshness.score !== null ? ` (${c.freshness.score}/100)` : ''}  |  Evidence Confidence: ${c.confidence.level}${c.confidence.score !== null ? ` (${c.confidence.score}/100)` : ''}`,
        { size: 8.5, color: [71, 85, 105], indent: 8, gap: 3 }
      );
      writeWrapped(`Explanation: ${c.explanation}`, { size: 9, color: [51, 65, 85], indent: 8, gap: 3 });
      writeWrapped(`Suggested Action: ${c.suggestedAction}`, { size: 9, color: [51, 65, 85], indent: 8, gap: 4 });

      if (c.sources.length > 0) {
        writeWrapped('Cited Sources:', { size: 8.5, bold: true, color: [71, 85, 105], indent: 8, gap: 2 });
        for (const src of c.sources) {
          writeWrapped(
            `- ${src.title} (${src.url}) [Published: ${src.publishedDate ? src.publishedDate.slice(0, 10) : 'Not supplied'} | Retrieved: ${src.retrievedAt.slice(0, 10)}]`,
            { size: 8, color: [67, 56, 202], indent: 14, gap: 2 }
          );
        }
      } else {
        writeWrapped('Cited Sources: None retrieved.', { size: 8.5, color: [100, 116, 139], indent: 8, gap: 4 });
      }
      y += 6;
    }
  }

  // Recommended Actions & Limitations
  writeWrapped('Recommended Actions', { size: 11.5, bold: true, color: [15, 23, 42], gap: 4 });
  for (const act of report.recommendedActions) {
    writeWrapped(`• ${act}`, { size: 9, color: [51, 65, 85], indent: 8, gap: 3 });
  }

  y += 6;
  writeWrapped('Verification Limitations', { size: 11.5, bold: true, color: [15, 23, 42], gap: 4 });
  for (const lim of report.limitations) {
    writeWrapped(`• ${lim}`, { size: 9, color: [71, 85, 105], indent: 8, gap: 3 });
  }

  const filename = `${report.verificationId.toLowerCase()}-truthlens-report.pdf`;
  doc.save(filename);
}
