
import { GoogleGenAI } from "@google/genai";
import { Language } from '../types';

/**
 * Generates AI advice about image processing using Gemini API.
 * Uses gemini-3-flash-preview for basic text tasks as per guidelines.
 */
export const generateAIAdvice = async (
  query: string, 
  context?: { width: number, height: number, format: string },
  language: Language = 'en'
): Promise<string> => {
  try {
    // Initialize GoogleGenAI with the API key from environment variables.
    // Following guidelines to create a new instance right before making an API call.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const langInstruction = language === 'zh' ? "You must answer in Chinese (Simplified)." : "You must answer in English.";

    let prompt = `You are an expert Image Processing Engineer. ${langInstruction} Answer the user's question about image formats, compression, or resizing succinctly.`;
    
    if (context) {
      prompt += `\nCurrent Context: Target Size ${context.width}x${context.height}px, Format: ${context.format}.`;
    }
    
    prompt += `\nUser Question: ${query}`;

    // Use ai.models.generateContent directly with model name and prompt.
    // gemini-3-flash-preview is chosen for basic text/Q&A tasks.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // Directly access the .text property of GenerateContentResponse.
    return response.text || "I couldn't generate a response at this time.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return language === 'zh' 
      ? "抱歉，目前无法连接到 AI 服务。请检查您的 API 密钥。"
      : "Sorry, I am unable to connect to the AI service right now. Please check your API key.";
  }
};
