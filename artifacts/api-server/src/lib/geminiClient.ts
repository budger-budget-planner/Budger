import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY must be set to use screenshot transaction extraction.");
}

export const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
