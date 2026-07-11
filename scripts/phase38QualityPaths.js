import os from "node:os";
import path from "node:path";

const baseDir = path.join(os.tmpdir(), "x-ai-phase38-quality");

export function getPhase38QualitySnapshotPath() {
  return path.join(baseDir, "phase38-quality-evaluations.json");
}

export function getPhase38QualityReportDir() {
  return path.join(baseDir, "reports");
}
