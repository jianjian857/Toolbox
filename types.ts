export enum ImageFormat {
  JPG = 'image/jpeg',
  PNG = 'image/png',
  WEBP = 'image/webp',
}

export type Language = 'en' | 'zh';

export type WatermarkPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
export type WatermarkMode = 'single' | 'dual' | 'triple' | 'tiled';
export type WatermarkColorMode = 'original' | 'grayscale';

export interface ProcessingConfig {
  keepOriginalSize: boolean;
  aspectRatio: string;
  width: number;
  height: number;
  format: ImageFormat;
  quality: number;
  fillBackground: boolean;
  
  // Watermark Settings
  watermarkEnabled: boolean;
  watermarkImageUrl: string | null;
  watermarkOpacity: number;
  watermarkScale: number;
  watermarkRotation: number;
  watermarkPosition: WatermarkPosition;
  watermarkMode: WatermarkMode;
  watermarkColorMode: WatermarkColorMode;
  customX: number; // 0-100 percentage
  customY: number; // 0-100 percentage
}

export interface UploadedFile {
  id: string;
  file: File;
  previewUrl: string;
  originalName: string;
  originalWidth?: number;
  originalHeight?: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  processedBlob?: Blob;
}

export interface ProcessSummary {
  total: number;
  success: number;
  failed: number;
  outputZipName: string;
}

export type ChatRole = 'user' | 'model';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
}