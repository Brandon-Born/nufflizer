import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ReplayAnalysisReport } from "@/server/services/analyzeReplay";

const inMemoryStore = new Map<string, ReplayAnalysisReport>();
const REPORTS_DIR = path.join(process.cwd(), ".data", "reports");

function reportPath(id: string): string {
  return path.join(REPORTS_DIR, `${id}.json`);
}

export async function saveReplayReport(report: ReplayAnalysisReport): Promise<void> {
  inMemoryStore.set(report.id, report);

  try {
    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(reportPath(report.id), JSON.stringify(report, null, 2), "utf8");
  } catch {
    // Runtime may be read-only in some environments; keep in-memory fallback.
  }
}

export async function getReplayReportById(id: string): Promise<ReplayAnalysisReport | null> {
  const cached = inMemoryStore.get(id);
  if (cached) {
    return cached;
  }

  try {
    const content = await readFile(reportPath(id), "utf8");
    const parsed = JSON.parse(content) as ReplayAnalysisReport;
    inMemoryStore.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}
