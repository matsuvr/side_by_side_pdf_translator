import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ModelStatus,
  PdfTranslatorApi,
  TranslationDelta,
  TranslationDone,
  TranslationError,
  TranslationProgress,
  TranslationRequest,
} from '../shared/types';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | null = null;

  void listen<T>(channel, (event) => {
    if (!disposed) callback(event.payload);
  }).then((off) => {
    if (disposed) off();
    else unlisten = off;
  });

  return () => {
    disposed = true;
    unlisten?.();
    unlisten = null;
  };
}

export const api: PdfTranslatorApi = {
  getModelStatus: () => invoke<ModelStatus>('model_status'),
  reloadModel: () => invoke<void>('reload_model'),
  openModelFolder: () => invoke<void>('open_model_folder'),
  openExternal: (link) => invoke<void>('open_external', { link }),
  startTranslation: (request: TranslationRequest) => invoke<void>('start_translation', { request }),
  cancelTranslation: () => {
    void invoke('cancel_translation').catch(() => undefined);
  },
  onModelStatus: (callback) => listen<ModelStatus>('model:status', ({ payload }) => callback(payload)),
  onTranslationProgress: (callback) =>
    subscribe<TranslationProgress>('translation:progress', callback),
  onTranslationDelta: (callback) => subscribe<TranslationDelta>('translation:delta', callback),
  onTranslationDone: (callback) => subscribe<TranslationDone>('translation:done', callback),
  onTranslationError: (callback) => subscribe<TranslationError>('translation:error', callback),
};
