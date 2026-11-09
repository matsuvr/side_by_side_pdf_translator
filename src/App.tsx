import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alignment,
  Button,
  ButtonGroup,
  Callout,
  Card,
  Classes,
  H3,
  Icon,
  Intent,
  Navbar,
  NavbarGroup,
  NavbarHeading,
  NonIdealState,
  NumericInput,
  ProgressBar,
  SegmentedControl,
  Spinner,
  Tag,
  Text,
  Tooltip,
} from '@blueprintjs/core';
import type { IconName } from '@blueprintjs/icons';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  ModelStatus,
  TranslationPhase,
} from '../shared/types';
import { api } from './api';
import { extractPageText } from './pdfText';

GlobalWorkerOptions.workerSrc = workerUrl;

const DELTA_FLUSH_MS = 40;
const TRANSLATION_START_DELAY_MS = 100;

const FORM_OPTIONS = [
  { label: '常体', value: 'plain' },
  { label: '敬体', value: 'polite' },
];

type TranslationStatus = 'idle' | 'waiting' | 'streaming' | 'done' | 'error';

type TranslationView = {
  status: TranslationStatus;
  text: string;
  message: string | null;
  reason: 'model' | 'empty' | 'generic' | null;
  startedAt: number | null;
  elapsedMs: number | null;
  phase: TranslationPhase | null;
  chunkIndex: number;
  chunkCount: number;
  chars: number;
};

const EMPTY_TRANSLATION: TranslationView = {
  status: 'idle',
  text: '',
  message: null,
  reason: null,
  startedAt: null,
  elapsedMs: null,
  phase: null,
  chunkIndex: 0,
  chunkCount: 1,
  chars: 0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}秒`;
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
}

function splitParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  for (const part of text.split(/\n{2,}/)) {
    const trimmed = part.trim();
    if (trimmed) paragraphs.push(trimmed);
  }
  return paragraphs;
}

function gpuLabel(status: ModelStatus | null): string {
  if (!status) return '状態を確認中';
  if (status.state === 'ready') {
    if (!status.gpuBackend || status.gpuBackend === 'CPU') return 'CPU';
    return status.gpuName
      ? `${status.gpuBackend} · ${status.gpuName}`
      : status.gpuBackend;
  }
  if (status.state === 'loading') return 'モデルを読み込み中';
  if (status.state === 'missing') return 'モデル未配置';
  return 'モデルエラー';
}

function modelStateLabel(status: ModelStatus | null): string {
  if (!status) return '確認中';
  if (status.state === 'ready') return '準備完了';
  if (status.state === 'loading') return '読み込み中';
  if (status.state === 'missing') return '未配置';
  return 'エラー';
}

function modelIntent(status: ModelStatus | null): Intent {
  if (!status) return Intent.NONE;
  if (status.state === 'ready') return Intent.SUCCESS;
  if (status.state === 'loading') return Intent.PRIMARY;
  return Intent.DANGER;
}

function modelIcon(status: ModelStatus | null): IconName {
  if (!status) return 'desktop';
  if (status.state === 'ready') return 'tick-circle';
  if (status.state === 'loading') return 'refresh';
  if (status.state === 'missing') return 'folder-open';
  return 'error';
}

function translationStateLabel(status: TranslationStatus): string {
  if (status === 'waiting') return '待機中';
  if (status === 'streaming') return '翻訳中';
  if (status === 'done') return '完了';
  if (status === 'error') return 'エラー';
  return '未処理';
}

function translationIntent(status: TranslationStatus): Intent {
  if (status === 'done') return Intent.SUCCESS;
  if (status === 'waiting' || status === 'streaming') return Intent.PRIMARY;
  if (status === 'error') return Intent.DANGER;
  return Intent.NONE;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

/* ---------------------------------------------------------------- elapsed */

type ElapsedTimeProps = {
  startedAt: number | null;
  elapsedMs?: number | null;
  active?: boolean;
};

const ElapsedTime = memo(function ElapsedTime({
  startedAt,
  elapsedMs = null,
  active = false,
}: ElapsedTimeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || elapsedMs != null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active, elapsedMs, startedAt]);

  const ms =
    elapsedMs ?? (startedAt != null ? Math.max(0, now - startedAt) : 0);
  return <>{formatSeconds(ms)}</>;
});

/* ----------------------------------------------------------------- navbar */

type AppNavbarProps = {
  hasPdf: boolean;
  fileName: string;
  numPages: number;
  model: ModelStatus | null;
  onOpenFile: () => void;
};

const AppNavbar = memo(function AppNavbar({
  hasPdf,
  fileName,
  numPages,
  model,
  onOpenFile,
}: AppNavbarProps) {
  const modelStatusText = gpuLabel(model);

  return (
    <Navbar className={`${Classes.DARK} app-navbar`}>
      <NavbarGroup align={Alignment.LEFT}>
        <NavbarHeading className="app-brand">
          <Icon icon="translate" size={18} />
          <span>PLaMo PDF Translator</span>
        </NavbarHeading>
      </NavbarGroup>

      {hasPdf ? (
        <div className="app-navbar-file">
          <Icon icon="document" size={15} />
          <span className="app-navbar-file-name" title={fileName}>
            {fileName}
          </span>
          <Tag minimal className="app-navbar-pages">
            {numPages}ページ
          </Tag>
        </div>
      ) : null}

      <NavbarGroup align={Alignment.RIGHT}>
        <Tooltip content={model?.message ?? modelStatusText} placement="bottom">
          <Tag
            minimal
            icon={modelIcon(model)}
            intent={modelIntent(model)}
            className="app-navbar-status"
          >
            {modelStateLabel(model)}
          </Tag>
        </Tooltip>
        {hasPdf && <Button variant="minimal" icon="folder-open" text="別のPDF" onClick={onOpenFile} />}
      </NavbarGroup>
    </Navbar>
  );
});

/* ---------------------------------------------------------------- pdf pane */

type PdfPaneProps = {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  numPages: number;
  zoom: number;
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
};

const PdfPane = memo(function PdfPane({
  pdfDoc,
  pageNumber,
  numPages,
  zoom,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: PdfPaneProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageRatio, setPageRatio] = useState(792 / 612);
  const [renderError, setRenderError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfViewportRef = useRef<HTMLDivElement | null>(null);
  const pdfScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = pdfViewportRef.current;
    if (!element) return;
    let frame = 0;

    const apply = (width: number) => {
      const next = Math.max(0, Math.round(width));
      setContainerWidth((current) =>
        Math.abs(current - next) < 1 ? current : next
      );
    };

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => apply(width));
    });
    observer.observe(element);
    apply(element.clientWidth - 44);

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pdfDoc]);

  useEffect(() => {
    if (!pdfDoc || containerWidth <= 0) return;
    let disposed = false;
    let renderTask: { cancel(): void; promise: Promise<void> } | null = null;

    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (disposed) return;
        const base = page.getViewport({ scale: 1 });
        const fitScale = Math.max(0.2, (containerWidth - 44) / base.width);
        const scale = clamp(fitScale * zoom, 0.2, 5);
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setPageRatio(base.height / base.width);
        setRenderError(null);

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas を初期化できませんでした');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const scaledViewport = page.getViewport({ scale: scale * dpr });
        renderTask = page.render({
          canvas,
          viewport: scaledViewport,
        });
        await renderTask.promise;
      } catch (error) {
        if (disposed) return;
        const name = error instanceof Error ? error.name : '';
        if (name === 'RenderingCancelledException') return;
        setRenderError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, zoom, containerWidth]);

  useEffect(() => {
    pdfScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pageNumber]);

  return (
    <section className={`${Classes.DARK} pane pdf-pane`}>
      <div className="pane-head">
        <div className="pane-head-main">
          <Icon icon="document" size={16} />
          <span className="pane-title">原文 PDF</span>
        </div>
        <div className="pane-tools">
          <div className="page-nav">
            <Tooltip content="前のページ（←）" placement="bottom">
              <Button
                variant="minimal"
                size="small"
                icon="chevron-left"
                aria-label="前のページ"
                disabled={pageNumber <= 1}
                onClick={() => onGoToPage(pageNumber - 1)}
              />
            </Tooltip>
            <NumericInput
              className="page-number"
              value={pageNumber}
              min={1}
              max={numPages}
              buttonPosition="none"
              selectAllOnFocus
              size="small"
              aria-label="ページ番号"
              onValueChange={(value) => {
                if (Number.isFinite(value)) onGoToPage(value);
              }}
            />
            <span className="page-total">/ {numPages}</span>
            <Tooltip content="次のページ（→）" placement="bottom">
              <Button
                variant="minimal"
                size="small"
                icon="chevron-right"
                aria-label="次のページ"
                disabled={pageNumber >= numPages}
                onClick={() => onGoToPage(pageNumber + 1)}
              />
            </Tooltip>
          </div>

          <span className="tool-divider" />

          <ButtonGroup variant="minimal">
            <Tooltip content="縮小（−）" placement="bottom">
              <Button
                size="small"
                icon="zoom-out"
                aria-label="縮小"
                onClick={onZoomOut}
              />
            </Tooltip>
            <Tooltip content="100%に戻す（0）" placement="bottom">
              <Button
                size="small"
                text={`${Math.round(zoom * 100)}%`}
                onClick={onZoomReset}
              />
            </Tooltip>
            <Tooltip content="拡大（＋）" placement="bottom">
              <Button
                size="small"
                icon="zoom-in"
                aria-label="拡大"
                onClick={onZoomIn}
              />
            </Tooltip>
          </ButtonGroup>
        </div>
      </div>

      <div className="pdf-scroll" ref={pdfScrollRef}>
        <div className="pdf-viewport" ref={pdfViewportRef}>
          <div
            className="pdf-stage"
            style={{ aspectRatio: `1 / ${pageRatio}` }}
          >
            <canvas ref={canvasRef} className="pdf-canvas" />
            {renderError ? (
              <div className="canvas-error">
                <Icon icon="error" size={24} intent={Intent.DANGER} />
                <span>ページを描画できませんでした</span>
                <small>{renderError}</small>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
});

/* ------------------------------------------------------- translation parts */

type TranslationHeaderProps = {
  status: TranslationStatus;
  statusLabel: string;
  form: 'plain' | 'polite';
  canCopy: boolean;
  copied: boolean;
  onChangeForm: (next: 'plain' | 'polite') => void;
  onCopy: () => void;
};

const TranslationHeader = memo(function TranslationHeader({
  status,
  statusLabel,
  form,
  canCopy,
  copied,
  onChangeForm,
  onCopy,
}: TranslationHeaderProps) {
  return (
    <div className="pane-head">
      <div className="pane-head-main">
        <Icon icon="translate" size={16} />
        <span className="pane-title">日本語訳</span>
        <Tag intent={translationIntent(status)}>{statusLabel}</Tag>
      </div>
      <div className="pane-tools">
        <SegmentedControl
          size="small"
          intent={Intent.PRIMARY}
          options={FORM_OPTIONS}
          value={form}
          onValueChange={(value) => onChangeForm(value as 'plain' | 'polite')}
        />
        <Button
          icon={copied ? 'tick' : 'duplicate'}
          text={copied ? 'コピー済み' : 'コピー'}
          disabled={!canCopy}
          intent={copied ? Intent.SUCCESS : Intent.NONE}
          onClick={onCopy}
        />
      </div>
    </div>
  );
});

const BusyBar = memo(function BusyBar() {
  return <ProgressBar className="app-progress" intent={Intent.PRIMARY} />;
});

type StreamingNoteProps = {
  phaseText: string;
  startedAt: number | null;
};

const StreamingNote = memo(function StreamingNote({
  phaseText,
  startedAt,
}: StreamingNoteProps) {
  return (
    <div className="streaming-note">
      <Spinner size={12} intent={Intent.PRIMARY} />
      <span>{phaseText}</span>
      <span className="streaming-elapsed">
        <ElapsedTime startedAt={startedAt} active />
      </span>
    </div>
  );
});

type TranslationDocumentProps = {
  text: string;
  status: TranslationStatus;
  pageNumber: number;
  form: 'plain' | 'polite';
  phaseText: string;
  startedAt: number | null;
  elapsedMs: number | null;
  chars: number;
  isBusy: boolean;
};

const TranslationDocument = memo(function TranslationDocument({
  text,
  status,
  pageNumber,
  form,
  phaseText,
  startedAt,
  elapsedMs,
  chars,
  isBusy,
}: TranslationDocumentProps) {
  const paragraphs = useMemo(
    () => (status === 'done' ? splitParagraphs(text) : []),
    [status, text]
  );

  return (
    <>
      <div className={`${Classes.RUNNING_TEXT} translation-document`} lang="ja">
        {status === 'streaming' ? (
          <p>
            {text}
            <span className="stream-caret" aria-hidden="true" />
          </p>
        ) : (
          paragraphs.map((paragraph, index) => (
            <p key={`${pageNumber}-${form}-${index}`}>{paragraph}</p>
          ))
        )}
      </div>
      {isBusy ? (
        <StreamingNote phaseText={phaseText} startedAt={startedAt} />
      ) : (
        <div className="document-meta">
          <span>{chars.toLocaleString('ja-JP')}文字</span>
          <span className="meta-dot" />
          <span>
            {elapsedMs != null
              ? `${formatSeconds(elapsedMs)}で翻訳`
              : '翻訳完了'}
          </span>
          <span className="meta-dot" />
          <span>{form === 'plain' ? '常体' : '敬体'}</span>
        </div>
      )}
    </>
  );
});

type TranslationFooterProps = {
  onOpenLicense: () => void;
};

const TranslationFooter = memo(function TranslationFooter({
  onOpenLicense,
}: TranslationFooterProps) {
  return (
    <div className="translation-foot">
      <Icon icon="translate" size={13} />
      <span>PLaMo 3 Translate 0.8B</span>
      <Button
        variant="minimal"
        size="small"
        className="foot-link"
        endIcon="share"
        text="ライセンス"
        onClick={onOpenLicense}
      />
    </div>
  );
});

/* -------------------------------------------------------------------- app */

export default function App() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [translation, setTranslation] = useState<TranslationView>(EMPTY_TRANSLATION);
  const [form, setForm] = useState<'plain' | 'polite'>(() =>
    localStorage.getItem('plamo.form') === 'polite' ? 'polite' : 'plain'
  );
  const [retryNonce, setRetryNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const openSequence = useRef(0);
  const pdfTaskRef = useRef<ReturnType<typeof getDocument> | null>(null);
  const translationScrollRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const activeKeyRef = useRef<string | null>(null);
  const translationStartedAtRef = useRef<number | null>(null);
  const translationTextRef = useRef('');
  const pendingDeltaRef = useRef<{ text: string; chars: number } | null>(null);
  const deltaTimerRef = useRef<number | null>(null);
  const cacheRef = useRef<Map<string, TranslationView>>(new Map());
  const textCacheRef = useRef<Map<number, string>>(new Map());
  const dragDepthRef = useRef(0);
  const copiedTimerRef = useRef<number | null>(null);

  const modelBlocked = model?.state === 'missing' || model?.state === 'error';
  const isBusy = translation.status === 'waiting' || translation.status === 'streaming';
  const canCopy = translation.text.length > 0;
  const statusLabel =
    translation.status === 'error' && translation.reason === 'model'
      ? '要設定'
      : translationStateLabel(translation.status);

  const cancelPendingDelta = useCallback(() => {
    if (deltaTimerRef.current != null) {
      window.clearTimeout(deltaTimerRef.current);
      deltaTimerRef.current = null;
    }
    pendingDeltaRef.current = null;
  }, []);

  const goToPage = useCallback(
    (next: number) => {
      if (numPages <= 0) return;
      setPageNumber(clamp(Math.round(next), 1, numPages));
    },
    [numPages]
  );

  const onZoomIn = useCallback(() => {
    setZoom((value) => clamp(Number((value + 0.1).toFixed(2)), 0.6, 2.5));
  }, []);

  const onZoomOut = useCallback(() => {
    setZoom((value) => clamp(Number((value - 0.1).toFixed(2)), 0.6, 2.5));
  }, []);

  const onZoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (!/\.pdf$/i.test(file.name)) {
        setPdfError('PDFファイルを選択してください');
        return;
      }

      const sequence = ++openSequence.current;
      setPdfLoading(true);
      setPdfError(null);
      let loadingTask: ReturnType<typeof getDocument> | null = null;
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        if (sequence !== openSequence.current) return;
        loadingTask = getDocument({
          data,
          useSystemFonts: true,
        });
        const doc = await loadingTask.promise;
        if (sequence !== openSequence.current) {
          await loadingTask.destroy();
          return;
        }
        if (doc.numPages < 1) {
          throw new Error('ページのないPDFです');
        }

        const previousTask = pdfTaskRef.current;
        pdfTaskRef.current = loadingTask;
        if (previousTask) {
          void previousTask.destroy();
        }

        requestIdRef.current += 1;
        activeKeyRef.current = null;
        cancelPendingDelta();
        translationTextRef.current = '';
        api.cancelTranslation();
        cacheRef.current.clear();
        textCacheRef.current.clear();

        setPdfDoc(doc);
        setFileName(file.name);
        setNumPages(doc.numPages);
        setPageNumber(1);
        setZoom(1);
        setTranslation(EMPTY_TRANSLATION);
        document.title = `${file.name} — PLaMo PDF Translator`;
      } catch (error) {
        if (loadingTask) void loadingTask.destroy();
        if (sequence !== openSequence.current) return;
        const message = error instanceof Error ? error.message : String(error);
        setPdfError(`PDFを開けませんでした: ${message}`);
      } finally {
        if (sequence === openSequence.current) setPdfLoading(false);
      }
    },
    [cancelPendingDelta]
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void openFile(file);
    },
    [openFile]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      const file = Array.from(event.dataTransfer.files).find((candidate) =>
        /\.pdf$/i.test(candidate.name)
      );
      if (file) void openFile(file);
      else setPdfError('PDFファイルをドロップしてください');
    },
    [openFile]
  );

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const reloadModel = useCallback(async () => {
    setModel((current) =>
      current
        ? { ...current, state: 'loading', message: 'モデルを再読み込みしています…' }
        : current
    );
    try {
      await api.reloadModel();
    } catch (error) {
      setModel((current) =>
        current
          ? {
              ...current,
              state: 'error',
              message: error instanceof Error ? error.message : String(error),
            }
          : current
      );
    }
  }, []);

  const retryTranslation = useCallback(() => {
    const key = activeKeyRef.current;
    if (key) cacheRef.current.delete(key);
    setRetryNonce((value) => value + 1);
  }, []);

  const copyTranslation = useCallback(async () => {
    const text = translationTextRef.current;
    if (!text) return;
    await copyText(text);
    setCopied(true);
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
  }, []);

  const handleCopy = useCallback(() => {
    void copyTranslation();
  }, [copyTranslation]);

  const openLicense = useCallback(() => {
    void api.openExternal('license').catch((error) => setPdfError(String(error)));
  }, []);

  const openModelUrl = useCallback(() => {
    void api.openExternal('model').catch((error) => setPdfError(String(error)));
  }, []);

  const openModelFolder = useCallback(() => {
    void api.openModelFolder().catch((error) => setPdfError(String(error)));
  }, []);

  const changeForm = useCallback((next: 'plain' | 'polite') => {
    setForm((current) => (current === next ? current : next));
    localStorage.setItem('plamo.form', next);
  }, []);

  useEffect(() => {
    let disposed = false;
    let receivedEvent = false;
    const subscription = api.onModelStatus((status) => {
      receivedEvent = true;
      if (!disposed) setModel(status);
    });
    void subscription.then(async () => {
      if (disposed) return;
      const status = await api.getModelStatus();
      if (!receivedEvent && !disposed) setModel(status);
    }).catch((error) => {
      if (!disposed) setPdfError(String(error));
    });
    return () => {
      disposed = true;
      void subscription.then((unsubscribe) => unsubscribe(), () => {});
    };
  }, []);

  useEffect(() => {
    const flushDelta = () => {
      deltaTimerRef.current = null;
      const pending = pendingDeltaRef.current;
      if (!pending) return;
      pendingDeltaRef.current = null;
      translationTextRef.current = pending.text;
      setTranslation((current) => ({
        ...current,
        status: 'streaming',
        text: pending.text,
        chars: pending.chars,
        startedAt: current.startedAt ?? translationStartedAtRef.current,
      }));
    };

    const offProgress = api.onTranslationProgress((progress) => {
      if (progress.requestId !== requestIdRef.current) return;
      setTranslation((current) => ({
        ...current,
        status: current.text ? 'streaming' : 'waiting',
        phase: progress.phase,
        chunkIndex: progress.chunkIndex,
        chunkCount: progress.chunkCount,
        startedAt: current.startedAt ?? translationStartedAtRef.current,
      }));
    });

    const offDelta = api.onTranslationDelta((delta) => {
      if (delta.requestId !== requestIdRef.current) return;
      pendingDeltaRef.current = { text: delta.text, chars: delta.chars };
      if (deltaTimerRef.current == null) {
        deltaTimerRef.current = window.setTimeout(flushDelta, DELTA_FLUSH_MS);
      }
    });

    const offDone = api.onTranslationDone((done) => {
      if (done.requestId !== requestIdRef.current) return;
      cancelPendingDelta();
      translationTextRef.current = done.text;
      const entry: TranslationView = {
        status: 'done',
        text: done.text,
        message: null,
        reason: null,
        startedAt: translationStartedAtRef.current,
        elapsedMs: done.elapsedMs,
        phase: 'translating',
        chunkIndex: 0,
        chunkCount: 1,
        chars: done.chars,
      };
      const key = activeKeyRef.current;
      if (key) cacheRef.current.set(key, entry);
      setTranslation(entry);
    });

    const offError = api.onTranslationError((error) => {
      if (error.requestId !== requestIdRef.current) return;
      if (error.cancelled) return;
      cancelPendingDelta();
      setTranslation((current) => ({
        ...current,
        status: 'error',
        message: error.message,
        reason: 'generic',
        phase: null,
      }));
    });

    return () => {
      offProgress();
      offDelta();
      offDone();
      offError();
      cancelPendingDelta();
    };
  }, [cancelPendingDelta]);

  useEffect(() => {
    if (!pdfDoc) return;
    cancelPendingDelta();
    translationTextRef.current = '';
    const key = `${pageNumber}:${form}`;
    const requestId = ++requestIdRef.current;
    activeKeyRef.current = key;
    api.cancelTranslation();

    const cached = cacheRef.current.get(key);
    if (cached) {
      translationTextRef.current = cached.text;
      setTranslation(cached);
      return;
    }

    if (modelBlocked) {
      setTranslation({
        ...EMPTY_TRANSLATION,
        status: 'error',
        reason: 'model',
        message: model?.message ?? '翻訳モデルが準備できていません',
      });
      return;
    }

    const startedAt = Date.now();
    translationStartedAtRef.current = startedAt;
    setTranslation({
      ...EMPTY_TRANSLATION,
      status: 'waiting',
      phase: 'preparing',
      startedAt,
    });

    let disposed = false;
    const startTimer = window.setTimeout(() => {
      void (async () => {
        if (disposed) return;
        try {
          let text = textCacheRef.current.get(pageNumber);
          if (text == null) {
            const page = await pdfDoc.getPage(pageNumber);
            text = await extractPageText(page);
            if (disposed || requestIdRef.current !== requestId) return;
            textCacheRef.current.set(pageNumber, text);
          }
          if (disposed || requestIdRef.current !== requestId) return;

          if (!text.trim()) {
            translationTextRef.current = '';
            setTranslation({
              ...EMPTY_TRANSLATION,
              status: 'error',
              reason: 'empty',
              message:
                '画像のみのページは翻訳できません',
            });
            return;
          }

          await api.startTranslation({
            requestId,
            text,
            sourceLang: 'en',
            targetLang: 'ja',
            form,
          });
        } catch (error) {
          if (disposed || requestIdRef.current !== requestId) return;
          translationTextRef.current = '';
          setTranslation({
            ...EMPTY_TRANSLATION,
            status: 'error',
            reason: 'generic',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    }, TRANSLATION_START_DELAY_MS);

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      cancelPendingDelta();
      api.cancelTranslation();
    };
  }, [pdfDoc, pageNumber, form, modelBlocked, retryNonce, cancelPendingDelta]);

  useEffect(() => {
    translationScrollRef.current?.scrollTo({ top: 0 });
    setCopied(false);
  }, [pageNumber]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if (!pdfDoc) return;
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goToPage(pageNumber - 1);
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        goToPage(pageNumber + 1);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        onZoomIn();
      } else if (event.key === '-') {
        event.preventDefault();
        onZoomOut();
      } else if (event.key === '0') {
        event.preventDefault();
        onZoomReset();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pdfDoc, pageNumber, goToPage, onZoomIn, onZoomOut, onZoomReset]);

  useEffect(() => {
    return () => {
      cancelPendingDelta();
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
      api.cancelTranslation();
      const task = pdfTaskRef.current;
      openSequence.current += 1;
      pdfTaskRef.current = null;
      if (task) void task.destroy();
    };
  }, [cancelPendingDelta]);

  const phaseText =
    model?.state === 'loading'
      ? model.message ?? 'モデルを読み込み中'
      : translation.phase === 'preparing'
        ? 'ページのレイアウトを解析しています'
        : translation.chunkCount > 1
          ? `翻訳中（${translation.chunkIndex + 1} / ${translation.chunkCount}）`
          : '翻訳中';

  const renderModelSetup = () => (
    <Callout
      className="model-callout"
      intent={Intent.DANGER}
      icon={model?.state === 'missing' ? 'folder-open' : 'error'}
      title={
        model?.state === 'missing'
          ? '翻訳モデルが見つかりません'
          : model?.state === 'error'
            ? '翻訳モデルを読み込めませんでした'
            : '翻訳モデルを確認しています'
      }
    >
      {model?.state === 'error' && <p className="callout-lead">{model.message}</p>}
      <div className="path-block">
        <div className="path-label">必要なファイル</div>
        <code className="path-value">
          {model?.modelFileName ?? 'plamo-3-translate-0.8b-Q4_K_M.gguf'}
        </code>
        <div className="path-label">配置先</div>
        <code className="path-value">{model?.searchDir ?? 'アプリと同じフォルダ'}</code>
      </div>
      <ButtonGroup className="callout-actions">
        <Button icon="folder-open" text="フォルダを開く" onClick={openModelFolder} />
        <Button
          icon="refresh"
          text="再スキャン"
          loading={model?.state === 'loading'}
          onClick={() => void reloadModel()}
        />
      </ButtonGroup>
      <Button
        variant="minimal"
        size="small"
        className="callout-link"
        endIcon="share"
        text="GGUFモデルをダウンロード"
        onClick={openModelUrl}
      />
    </Callout>
  );

  const renderWaiting = () => (
    <NonIdealState
      className="translation-state"
      icon={<Spinner size={50} intent={Intent.PRIMARY} />}
      title={phaseText}
    >
      <div className="waiting-extra">
        <div className="waiting-stats">
          <Tag minimal icon="time">
            <ElapsedTime startedAt={translation.startedAt} active /> 経過
          </Tag>
          <Tag minimal icon="desktop">
            {gpuLabel(model)}
          </Tag>
        </div>
      </div>
    </NonIdealState>
  );

  const renderTranslationError = () => (
    <NonIdealState
      className="translation-state"
      icon={<Icon icon="error" size={48} intent={Intent.DANGER} />}
      iconMuted={false}
      title={
        translation.reason === 'empty'
          ? 'テキストを抽出できませんでした'
          : '翻訳できませんでした'
      }
      description={translation.message ?? '不明なエラー'}
      action={
        <ButtonGroup>
          <Button icon="refresh" text="再試行" onClick={retryTranslation} />
          {model?.state === 'ready' ? null : (
            <Button
              icon="cog"
              text="モデルを再読み込み"
              onClick={() => void reloadModel()}
            />
          )}
        </ButtonGroup>
      }
    />
  );

  const renderWelcome = () => (
    <main className="start-screen">
      <div className="start-inner">
        <div className="start-drop">
          <Icon icon="document-open" size={36} className="start-drop-icon" />
          <Button intent={Intent.PRIMARY} size="large" icon="folder-open" text="PDFを開く" onClick={handleOpenFile} />
          <Text className="start-drop-hint">または PDF をドロップ</Text>
        </div>
        {modelBlocked && renderModelSetup()}
        <Button variant="minimal" size="small" endIcon="share" text="モデルのライセンス" onClick={openLicense} />
      </div>
    </main>
  );

  return (
    <div
      className="app-shell"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="file-input"
        onChange={handleFileInput}
      />

      <AppNavbar
        hasPdf={pdfDoc != null}
        fileName={fileName}
        numPages={numPages}
        model={model}
        onOpenFile={handleOpenFile}
      />

      {pdfError ? (
        <div className="app-banner-wrap">
          <Callout intent={Intent.DANGER} icon="error" className="app-banner">
            <div className="app-banner-body">
              <span>{pdfError}</span>
              <Button
                variant="minimal"
                size="small"
                icon="cross"
                aria-label="閉じる"
                onClick={() => setPdfError(null)}
              />
            </div>
          </Callout>
        </div>
      ) : null}

      {!pdfDoc ? (
        renderWelcome()
      ) : (
        <main className="workspace">
          <PdfPane
            pdfDoc={pdfDoc}
            pageNumber={pageNumber}
            numPages={numPages}
            zoom={zoom}
            onGoToPage={goToPage}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onZoomReset={onZoomReset}
          />

          <section className="pane translation-pane">
            <TranslationHeader
              status={translation.status}
              statusLabel={statusLabel}
              form={form}
              canCopy={canCopy}
              copied={copied}
              onChangeForm={changeForm}
              onCopy={handleCopy}
            />

            {isBusy ? <BusyBar /> : null}

            <div className="translation-scroll" ref={translationScrollRef}>
              {modelBlocked ? (
                renderModelSetup()
              ) : translation.status === 'error' ? (
                renderTranslationError()
              ) : (translation.status === 'idle' ||
                  translation.status === 'waiting') &&
                !translation.text ? (
                renderWaiting()
              ) : (
                <TranslationDocument
                  text={translation.text}
                  status={translation.status}
                  pageNumber={pageNumber}
                  form={form}
                  phaseText={phaseText}
                  startedAt={translation.startedAt}
                  elapsedMs={translation.elapsedMs}
                  chars={translation.chars}
                  isBusy={isBusy}
                />
              )}
            </div>

            <TranslationFooter onOpenLicense={openLicense} />
          </section>
        </main>
      )}

      {pdfLoading ? (
        <div className="app-loading-overlay" role="status" aria-live="polite">
          <Card className="app-loading-card">
            <Spinner size={28} intent={Intent.PRIMARY} />
            <Text>PDFを読み込んでいます</Text>
          </Card>
        </div>
      ) : null}

      {dragActive ? (
        <div className="app-drop-overlay" aria-hidden="true">
          <Card className="app-drop-card">
            <Icon icon="document-open" size={48} intent={Intent.PRIMARY} />
            <H3>PDFをドロップして開く</H3>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
