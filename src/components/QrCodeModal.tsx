import React, { useState, useRef, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  QrCode,
  Download,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  ShieldCheck,
  FileIcon,
  FileImage,
  FileText,
  FileCode,
  FileAudio,
  FileVideo,
  FileArchive,
  Share2,
  Sparkles
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
import { toast } from 'sonner';
import { FileMetadata } from '@/src/lib/fileService';

interface QrCodeModalProps {
  file: FileMetadata | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  file,
  isOpen,
  onClose,
}) => {
  const [selectedUrlType, setSelectedUrlType] = useState<'direct' | 'download' | 'private'>('direct');
  const [copied, setCopied] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (file) {
      // Default to private link if enabled, or direct file url
      if (file.isPrivateLink && file.privateLinkId) {
        setSelectedUrlType('private');
      } else {
        setSelectedUrlType('direct');
      }
      setCopied(false);
    }
  }, [file]);

  if (!file) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';

  // Calculate URLs
  const directUrl = file.url.startsWith('/') ? `${origin}${file.url}` : file.url;
  
  const downloadUrl = file.url.startsWith('/api/files/')
    ? `${origin}${file.url}?download=true&name=${encodeURIComponent(file.name)}`
    : (file.url.startsWith('/') ? `${origin}${file.url}` : file.url);

  const privateShareUrl = file.isPrivateLink && file.privateLinkId
    ? `${origin}${pathname}?share=${file.id}&token=${file.privateLinkId}`
    : '';

  // Get active URL for QR Code based on selection
  let activeUrl = directUrl;
  if (selectedUrlType === 'private' && privateShareUrl) {
    activeUrl = privateShareUrl;
  } else if (selectedUrlType === 'download') {
    activeUrl = downloadUrl;
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = () => {
    const type = (file.type || '').toLowerCase();
    if (type.startsWith('image/')) return <FileImage className="h-5 w-5 text-cyan-400" />;
    if (type.startsWith('video/')) return <FileVideo className="h-5 w-5 text-purple-400" />;
    if (type.startsWith('audio/')) return <FileAudio className="h-5 w-5 text-pink-400" />;
    if (type.includes('pdf')) return <FileText className="h-5 w-5 text-rose-400" />;
    if (type.includes('text') || type.includes('json') || type.includes('javascript')) return <FileCode className="h-5 w-5 text-teal-400" />;
    if (type.includes('zip') || type.includes('compressed')) return <FileArchive className="h-5 w-5 text-amber-400" />;
    return <FileIcon className="h-5 w-5 text-slate-400" />;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleDownloadQrImage = () => {
    try {
      setIsDownloadingImage(true);
      const canvas = document.getElementById('qr-code-canvas-element') as HTMLCanvasElement;
      if (!canvas) {
        toast.error('QR code image not found');
        return;
      }

      // Create a nice bordered high-res image with padding and file label
      const exportCanvas = document.createElement('canvas');
      const padding = 28;
      const bottomTextHeight = 44;
      exportCanvas.width = canvas.width + padding * 2;
      exportCanvas.height = canvas.height + padding * 2 + bottomTextHeight;
      const ctx = exportCanvas.getContext('2d');

      if (ctx) {
        // White rounded background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        // Draw original QR code
        ctx.drawImage(canvas, padding, padding);

        // Draw caption
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        
        // Truncate name if long
        let displayName = file.name;
        if (displayName.length > 28) {
          displayName = displayName.substring(0, 25) + '...';
        }
        ctx.fillText(displayName, exportCanvas.width / 2, exportCanvas.height - 24);

        ctx.fillStyle = '#64748b';
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        ctx.fillText('Scan to open • CloudDrop', exportCanvas.width / 2, exportCanvas.height - 10);

        const dataUrl = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        const safeBaseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        link.download = `${safeBaseName}-qr-code.png`;
        link.href = dataUrl;
        link.click();
        toast.success('QR Code saved as PNG');
      }
    } catch (err) {
      console.error('Error exporting QR Code image:', err);
      toast.error('Failed to download QR code');
    } finally {
      setIsDownloadingImage(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        id="file-qr-code-dialog"
        className="w-[92vw] sm:max-w-md p-0 overflow-hidden bg-slate-900 border border-white/10 text-slate-100 shadow-2xl rounded-2xl"
      >
        {/* Header */}
        <div className="p-4 sm:px-6 py-4 border-b border-white/10 bg-slate-900/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 pr-6">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold truncate text-slate-100" title={file.name}>
                QR Code Sharing
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                <Smartphone className="h-3 w-3 text-cyan-400" />
                <span>Scan with mobile device to access file</span>
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col items-center gap-4 bg-slate-950/60">
          {/* File summary pill */}
          <div className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
            <div className="flex items-center gap-2.5 min-w-0 mr-2">
              <div className="p-1.5 rounded-lg bg-slate-800 shrink-0">
                {getFileIcon()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatFileSize(file.size)} • {file.type || 'file'}
                </p>
              </div>
            </div>
            {file.isPrivateLink ? (
              <Badge variant="outline" className="text-[10px] py-0.5 px-2 border-cyan-500/30 text-cyan-300 bg-cyan-500/10 shrink-0">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Private Link
              </Badge>
            ) : file.isPublic ? (
              <Badge variant="outline" className="text-[10px] py-0.5 px-2 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 shrink-0">
                Public
              </Badge>
            ) : null}
          </div>

          {/* URL Mode Switcher if Private Link is available */}
          {privateShareUrl && (
            <div className="w-full grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-white/10 text-xs">
              <button
                type="button"
                id="qr-mode-private-btn"
                onClick={() => setSelectedUrlType('private')}
                className={`py-1.5 px-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 text-xs ${
                  selectedUrlType === 'private'
                    ? 'bg-cyan-500 text-slate-950 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Secure Link</span>
              </button>
              <button
                type="button"
                id="qr-mode-direct-btn"
                onClick={() => setSelectedUrlType('direct')}
                className={`py-1.5 px-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 text-xs ${
                  selectedUrlType === 'direct'
                    ? 'bg-cyan-500 text-slate-950 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Direct File URL</span>
              </button>
            </div>
          )}

          {/* QR Code Card Display */}
          <div className="relative group p-4 rounded-2xl bg-white shadow-xl shadow-cyan-950/20 border border-white/20 flex flex-col items-center justify-center transition-all">
            {/* Corner styling frame indicators */}
            <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-slate-900 rounded-tl-sm pointer-events-none" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-slate-900 rounded-tr-sm pointer-events-none" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-slate-900 rounded-bl-sm pointer-events-none" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-slate-900 rounded-br-sm pointer-events-none" />

            <div ref={canvasRef} id="qr-code-canvas-container">
              <QRCodeCanvas
                id="qr-code-canvas-element"
                value={activeUrl}
                size={200}
                level="M"
                bgColor="#ffffff"
                fgColor="#090d16"
                includeMargin={false}
              />
            </div>
          </div>

          {/* Scan Instructions Callout */}
          <div className="w-full text-center space-y-1">
            <p className="text-xs text-slate-300 font-medium flex items-center justify-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
              Point your phone camera at this QR code
            </p>
            <p className="text-[11px] text-slate-500">
              Compatible with iOS Camera, Android Camera, Google Lens & QR scanners
            </p>
          </div>

          {/* URL text display box */}
          <div className="w-full flex items-center gap-2 p-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs">
            <span className="text-[11px] text-slate-400 font-mono truncate flex-1 pl-1 select-all" title={activeUrl}>
              {activeUrl}
            </span>
            <Button
              id="qr-code-copy-btn"
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              className="h-7 px-2.5 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 shrink-0 gap-1"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="w-full grid grid-cols-2 gap-2 pt-1">
            <Button
              id="qr-code-download-image-btn"
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadQrImage}
              disabled={isDownloadingImage}
              className="w-full h-9 rounded-xl border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white text-xs gap-1.5"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              <span>Save QR Image</span>
            </Button>

            <a
              id="qr-code-open-link-btn"
              href={activeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full h-9 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors shadow-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Test Link</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-white/10 bg-slate-900/80 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1 text-slate-400">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            Instant mobile handover
          </span>
          <span className="font-mono text-slate-500 text-[10px]">
            {selectedUrlType === 'private' ? 'Secure Token Protected' : 'Direct Link'}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
