import { GoogleGenAI } from "@google/genai";

// Lazily constructed so a missing key doesn't crash the whole API server at
// boot — only the screenshot-extraction route (the sole consumer) fails,
// with a clear 503 to the client. See getGenAI() usage in routes/transactions.ts.
let genaiInstance: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!genaiInstance) {
    genaiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return genaiInstance;
}
