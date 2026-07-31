import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// Lazily construct the models on first use rather than at module load. The
// ChatGoogleGenerativeAI constructor throws if GEMINI_API_KEY is missing, and
// that key isn't present during `next build` (runtime-only secret) — building
// the models at import time would crash the build when Next collects route data.
// Memoised so each model is created once and reused at runtime.
let _streamingModel: ChatGoogleGenerativeAI | null = null;
let _nonStreamingModel: ChatGoogleGenerativeAI | null = null;

export function getStreamingModel() {
  if (!_streamingModel) {
    _streamingModel = new ChatGoogleGenerativeAI({
      modelName: "gemini-2.5-flash",
      maxOutputTokens: 768,
      streaming: true,
      verbose: true,
      temperature: 0,
      apiKey: process.env.GEMINI_API_KEY as string,
    });
  }
  return _streamingModel;
}

export function getNonStreamingModel() {
  if (!_nonStreamingModel) {
    _nonStreamingModel = new ChatGoogleGenerativeAI({
      modelName: "gemini-2.5-flash",
      maxOutputTokens: 768,
      verbose: true,
      temperature: 0,
      apiKey: process.env.GEMINI_API_KEY as string,
    });
  }
  return _nonStreamingModel;
}
