import React, { useState } from 'react';
import {
  FileImage,
  FileText,
  FileCode,
  Download,
  ExternalLink,
  Layers,
  Code,
  Sparkles,
  Info,
  QrCode
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileMetadata } from '@/src/lib/fileService';

interface FilePreviewModalProps {
  file: FileMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenQrCode?: (file: FileMetadata) => void;
}

export type PreviewCategory = 'image' | 'text' | 'pdf' | 'none';

export function getFilePreviewCategory(file: { name: string; type?: string }): {
  canPreview: boolean;
  category: PreviewCategory;
} {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();

  // Images
  const isImage = type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(name);
  if (isImage) {
    return { canPreview: true, category: 'image' };
  }

  // Text-based files & source code
  const isText =
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('javascript') ||
    type.includes('typescript') ||
    type.includes('xml') ||
    type.includes('csv') ||
    /\.(txt|md|markdown|json|csv|log|html|htm|css|js|jsx|ts|tsx|py|java|c|cpp|h|cs|sh|bash|yml|yaml|sql|env|ini|conf|toml|xml)$/i.test(name);

  if (isText) {
    return { canPreview: true, category: 'text' };
  }

  // PDF
  if (type.includes('pdf') || name.endsWith('.pdf')) {
    return { canPreview: true, category: 'pdf' };
  }

  return { canPreview: false, category: 'none' };
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  isOpen,
  onClose,
  onOpenQrCode
}) => {
  const [renderMode, setRenderMode] = useState<'object' | 'iframe'>('object');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  if (!file) return null;

  const { canPreview, category } = getFilePreviewCategory(file);

  // Compute preview URL
  let previewUrl = file.url;
  if (file.url.startsWith('/api/files/')) {
    if (category === 'text') {
      previewUrl = `${file.url}?as_text=true&inline=true`;
    } else {
      previewUrl = `${file.url}?inline=true`;
    }
  }

  const downloadUrl = file.url.startsWith('/api/files/')
    ? `${file.url}?download=true&name=${encodeURIComponent(file.name)}`
    : file.url;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCategoryIcon = () => {
    if (category === 'image') return <FileImage className="h-5 w-5 text-cyan-400" />;
    if (category === 'text') {
      if (/\.(js|jsx|ts|tsx|py|java|c|cpp|h|sh|sql|json|html|css)$/i.test(file.name)) {
        return <FileCode className="h-5 w-5 text-teal-400" />;
      }
      return <FileText className="h-5 w-5 text-sky-400" />;
    }
    if (category === 'pdf') return <FileText className="h-5 w-5 text-rose-400" />;
    return <FileText className="h-5 w-5 text-slate-400" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        id="file-preview-modal-dialog"
        className="w-[95vw] sm:max-w-5xl h-[88vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-900 border border-white/10 text-slate-100 shadow-2xl rounded-2xl"
      >
        {/* Header */}
        <div className="p-4 sm:px-6 py-3.5 border-b border-white/10 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0 mr-8">
            <div className="p-2 rounded-xl bg-slate-800/80 border border-white/10 shrink-0">
              {getCategoryIcon()}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold truncate text-slate-100 max-w-md sm:max-w-lg" title={file.name}>
                {file.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>{formatFileSize(file.size)}</span>
                <span>•</span>
                <span className="font-mono text-[11px] text-cyan-300 uppercase">
                  {file.type ? file.type.split('/')[1] || file.type : 'Unknown'}
                </span>
                {category === 'image' && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                    Image
                  </Badge>
                )}
                {category === 'text' && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                    Text / Code
                  </Badge>
                )}
              </DialogDescription>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Tag Renderer Switcher */}
            <div
              id="preview-renderer-toggle-group"
              className="hidden sm:inline-flex items-center p-0.5 rounded-lg bg-slate-950 border border-white/10 text-xs"
              title="Switch HTML rendering element"
            >
              <button
                type="button"
                id="preview-mode-object-btn"
                onClick={() => setRenderMode('object')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-mono text-[11px] ${
                  renderMode === 'object'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-xs border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="h-3 w-3" />
                <span>&lt;object&gt;</span>
              </button>
              <button
                type="button"
                id="preview-mode-iframe-btn"
                onClick={() => setRenderMode('iframe')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-mono text-[11px] ${
                  renderMode === 'iframe'
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-xs border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code className="h-3 w-3" />
                <span>&lt;iframe&gt;</span>
              </button>
            </div>

            {/* Open in new window */}
            <a
              id="preview-open-new-tab-btn"
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 hover:text-white border border-white/10 transition-colors"
              title="Open full file in new browser tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Open Tab</span>
            </a>

            {/* QR Code Mobile Sharing Button */}
            {onOpenQrCode && (
              <button
                type="button"
                id="preview-qr-code-btn"
                onClick={() => onOpenQrCode(file)}
                className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 hover:text-cyan-300 border border-white/10 transition-colors cursor-pointer"
                title="Display QR code to scan on mobile"
              >
                <QrCode className="h-3.5 w-3.5 text-cyan-400" />
                <span className="hidden sm:inline">QR Code</span>
              </button>
            )}

            {/* Download Button */}
            <a
              id="preview-download-btn"
              href={downloadUrl}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-colors shadow-sm"
              title="Download file to computer"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div 
          id="preview-content-container" 
          className="flex-1 w-full h-full min-h-0 bg-slate-950 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden relative"
        >
          {canPreview ? (
            <div className="w-full h-full relative rounded-xl overflow-hidden border border-white/10 bg-slate-950/90 flex items-center justify-center">
              {/* Spinner while loading */}
              {isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-xs">
                  <div className="h-8 w-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-2" />
                  <p className="text-xs text-slate-400 font-mono">Rendering via &lt;{renderMode}&gt;...</p>
                </div>
              )}

              {/* Rendering via <object> tag */}
              {renderMode === 'object' && (
                <object
                  id="preview-object-tag"
                  data={previewUrl}
                  type={category === 'text' ? 'text/plain' : (file.type || 'application/octet-stream')}
                  className="w-full h-full border-0 rounded-lg bg-slate-950"
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                  }}
                  title={file.name}
                >
                  {/* Fallback to iframe if object fails to render */}
                  <iframe
                    id="preview-object-fallback-iframe"
                    src={previewUrl}
                    title={file.name}
                    className="w-full h-full border-0 rounded-lg bg-slate-950"
                    onLoad={() => setIsLoading(false)}
                  />
                </object>
              )}

              {/* Rendering via <iframe> tag */}
              {renderMode === 'iframe' && (
                <iframe
                  id="preview-iframe-tag"
                  src={previewUrl}
                  title={file.name}
                  className="w-full h-full border-0 rounded-lg bg-slate-950"
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                  }}
                />
              )}

              {/* Error fallback */}
              {hasError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center">
                  <Info className="h-10 w-10 text-amber-400 mb-3" />
                  <h4 className="text-sm font-semibold text-slate-200">Embedded preview could not be displayed</h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Your browser could not render this format inline. You can open it in a new tab or download it directly.
                  </p>
                  <div className="flex items-center gap-2 mt-4">
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in New Tab
                    </a>
                    <a
                      href={downloadUrl}
                      download={file.name}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download File
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8">
              <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 mb-4">
                <Info className="h-8 w-8 text-cyan-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">Direct preview not available</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1 mb-6">
                This file type ({file.type || 'binary/archive'}) is not an image or text format. You can download it to view it locally.
              </p>
              <a
                href={downloadUrl}
                download={file.name}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-all shadow-md"
              >
                <Download className="h-4 w-4" />
                Download {file.name}
              </a>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-white/10 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[11px]">
              Rendered via <span className="font-mono text-cyan-300">&lt;{renderMode}&gt;</span> element
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {file.ownerEmail ? `Uploaded by ${file.ownerEmail.split('@')[0]}` : ''}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
