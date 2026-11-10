import { analyzeUpload } from "@/server/upload/analyzeUpload";
export const runtime = "nodejs";
export const maxDuration = 15;
export async function POST(request: Request) {
  return analyzeUpload(request);
}
