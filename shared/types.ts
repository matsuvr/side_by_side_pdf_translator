export type ModelState = 'loading' | 'ready' | 'missing' | 'error';

export interface ModelStatus {
  state: ModelState;
  modelFileName: string;
  modelPath: string | null;
  expectedPath: string;
  searchDir: string;
  gpuBackend: string | null;
  gpuName: string | null;
  message: string | null;
  contextSize: number;
}

export type TranslationPhase = 'preparing' | 'translating';

export interface TranslationRequest {
  requestId: number;
  text: string;
  sourceLang: 'en' | 'auto';
  targetLang: 'ja';
  form: 'plain' | 'polite';
}

export interface TranslationProgress {
  requestId: number;
  phase: TranslationPhase;
  chunkIndex: number;
  chunkCount: number;
}

export interface TranslationDelta {
  requestId: number;
  text: string;
  chars: number;
}

export interface TranslationDone {
  requestId: number;
  text: string;
  chars: number;
  elapsedMs: number;
}

export interface TranslationError {
  requestId: number;
  message: string;
  cancelled: boolean;
}

export interface PdfTranslatorApi {
  getModelStatus(): Promise<ModelStatus>;
  reloadModel(): Promise<void>;
  openModelFolder(): Promise<void>;
  openExternal(link: 'model'): Promise<void>;
  openLicense(): Promise<void>;
  startTranslation(request: TranslationRequest): Promise<void>;
  cancelTranslation(): void;
  onModelStatus(callback: (status: ModelStatus) => void): Promise<() => void>;
  onTranslationProgress(callback: (progress: TranslationProgress) => void): () => void;
  onTranslationDelta(callback: (delta: TranslationDelta) => void): () => void;
  onTranslationDone(callback: (done: TranslationDone) => void): () => void;
  onTranslationError(callback: (error: TranslationError) => void): () => void;
}
