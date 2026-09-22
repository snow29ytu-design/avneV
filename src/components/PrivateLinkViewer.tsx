import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Download, 
  LogIn, 
  ArrowLeft, 
  FileText, 
  FileImage, 
  FileVideo, 
  FileAudio, 
  FileCode, 
  FileArchive, 
  File as FileIcon, 
  CheckCircle2, 
  Clock, 
  Users,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/src/lib/firebase';
import { fileService, FileMetadata } from '@/src/lib/fileService';
import { toast } from 'sonner';

interface PrivateLinkViewerProps {
  shareId: string;
  token: string;
  currentUser: User | null;
  onCloseViewer: () => void;
  onLoginSuccess?: () => void;
}

export const PrivateLinkViewer: React.FC<PrivateLinkViewerProps> = ({
  shareId,
  token,
  currentUser,
  onCloseViewer,
  onLoginSuccess
}) => {
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [file, setFile] = useState<FileMetadata | null>(null);
  const [accessResult, setAccessResult] = useState<{
    allowed: boolean;
    reason?: string;
    message: string;
    userNumber?: number;
    maxUsers?: number | null;
  } | null>(null);

  // Load and evaluate file
  const evaluateAccess = async (userToTest: User | null) => {
    setLoading(true);
    try {
      if (!userToTest) {
        // Fetch public metadata if available, but prompt login
        const basicFile = await fileService.getFileById(shareId);
        setFile(basicFile);
        setAccessResult({
          allowed: false,
          reason: 'needs_login',
          message: 'Sign in to verify if your account is authorized to view this private link.'
        });
        return;
      }

      setVerifying(true);
      const res = await fileService.claimPrivateLinkAccess(shareId, token, {
        uid: userToTest.uid,
        email: userToTest.email || '',
        displayName: userToTest.displayName || undefined
      });

      setAccessResult({
        allowed: res.allowed,
        reason: res.reason,
        message: res.message,
        userNumber: res.userNumber,
        maxUsers: res.maxUsers
      });

      if (res.file) {
        setFile(res.file);
      } else {
        const f = await fileService.getFileById(shareId);
        setFile(f);
      }
    } catch (err: any) {
      console.error('Error evaluating private link access:', err);
      setAccessResult({
        allowed: false,
        reason: 'error',
        message: err.message || 'Unable to load private link. It may be invalid or expired.'
      });
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  };

  useEffect(() => {
    evaluateAccess(currentUser);
  }, [shareId, token, currentUser]);

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      toast.success('Signed in as ' + cred.user.email);
      if (onLoginSuccess) onLoginSuccess();
      await evaluateAccess(cred.user);
    } catch (err) {
      console.error('Sign in error:', err);
      toast.error('Failed to sign in with Google');
    }
  };

  const getFileIcon = (mimeType: string = '') => {
    const type = mimeType.toLowerCase();
    if (type.startsWith('image/')) return <FileImage className="h-8 w-8 text-cyan-400" />;
    if (type.startsWith('video/')) return <FileVideo className="h-8 w-8 text-purple-400" />;
    if (type.startsWith('audio/')) return <FileAudio className="h-8 w-8 text-pink-400" />;
    if (type.includes('pdf')) return <FileText className="h-8 w-8 text-rose-400" />;
    if (type.includes('word') || type.includes('text/')) return <FileText className="h-8 w-8 text-blue-400" />;
    if (type.includes('zip') || type.includes('archive')) return <FileArchive className="h-8 w-8 text-amber-400" />;
    if (type.includes('code') || type.includes('javascript') || type.includes('json')) return <FileCode className="h-8 w-8 text-emerald-400" />;
    return <FileIcon className="h-8 w-8 text-slate-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading || verifying) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 p-8">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
        <p className="text-sm text-slate-400 font-medium">Verifying private link permissions & user slots...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 animate-in fade-in duration-300">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCloseViewer}
          className="text-xs text-slate-400 hover:text-slate-200 gap-1.5 -ml-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Button>
      </div>

      <Card className="glass border-white/10 bg-slate-900/60 shadow-2xl overflow-hidden relative">
        {/* Glow accent */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500" />

        <CardHeader className="p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-slate-950/80 rounded-2xl border border-white/10 shadow-inner">
                {getFileIcon(file?.type)}
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-slate-100 break-all">
                  {file?.name || 'Private File'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                  <span>{formatFileSize(file?.size || 0)}</span>
                  <span>•</span>
                  <span>Shared by {file?.ownerEmail || 'CloudDrop User'}</span>
                </CardDescription>
              </div>
            </div>

            {accessResult?.allowed ? (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs px-2.5 py-1 gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Access Granted
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs px-2.5 py-1 gap-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                Restricted
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 pt-2 space-y-6">
          {/* Access Outcome Banner */}
          {accessResult?.allowed ? (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Authorized Private Link Access</span>
              </div>
              <p className="text-xs text-slate-300">
                {accessResult.message}
              </p>
              {accessResult.userNumber !== undefined && (
                <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-cyan-400" />
                    Slot: User {accessResult.userNumber} of {accessResult.maxUsers ? `${accessResult.maxUsers} max` : 'Unlimited'}
                  </span>
                  <span>•</span>
                  <span>Verified Account: {currentUser?.email}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/20 space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Private Link Access Denied</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {accessResult?.message || 'You do not have permission to view or download this file.'}
              </p>
              {currentUser && (
                <div className="pt-1 text-[11px] text-slate-400">
                  Signed in as: <span className="font-mono text-slate-200">{currentUser.email}</span>
                </div>
              )}
            </div>
          )}

          {/* If Not Logged In, Prompt Sign-In */}
          {!currentUser && (
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/5 text-center space-y-3">
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                This link is configured with strict user limits. Sign in with Google to claim an access slot.
              </p>
              <Button
                onClick={handleSignIn}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs h-10 px-5 gap-2 shadow-[0_0_15px_rgba(56,189,248,0.3)]"
              >
                <LogIn className="h-4 w-4" />
                Sign In with Google to Unlock
              </Button>
            </div>
          )}

          {/* File Preview (When Access Granted) */}
          {accessResult?.allowed && file?.url && (
            <div className="space-y-4">
              {/* Image Preview */}
              {file.type.startsWith('image/') && (
                <div className="rounded-xl overflow-hidden border border-white/10 bg-slate-950 flex items-center justify-center max-h-80">
                  <img
                    src={file.url}
                    alt={file.name}
                    className="max-h-80 w-auto object-contain"
                  />
                </div>
              )}

              {/* Audio Preview */}
              {file.type.startsWith('audio/') && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10">
                  <audio controls src={file.url} className="w-full" />
                </div>
              )}

              {/* Video Preview */}
              {file.type.startsWith('video/') && (
                <div className="rounded-xl overflow-hidden border border-white/10 bg-slate-950">
                  <video controls src={file.url} className="w-full max-h-80" />
                </div>
              )}

              {/* Primary Download / Open Button */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <a
                  href={file.url.startsWith('/api/files/') ? `${file.url}?download=true&name=${encodeURIComponent(file.name)}` : file.url}
                  download={file.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-[0_0_20px_rgba(56,189,248,0.35)] transition-all"
                >
                  <Download className="h-4 w-4" />
                  Download "{file.name}"
                </a>
                <Button
                  variant="outline"
                  onClick={onCloseViewer}
                  className="w-full sm:w-auto h-11 px-5 border-white/10 bg-slate-950 text-slate-300 hover:text-white text-xs"
                >
                  Back to Dashboard
                </Button>
              </div>
            </div>
          )}

          {/* Action options when denied */}
          {!accessResult?.allowed && currentUser && (
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={onCloseViewer}
                className="w-full h-10 border-white/10 bg-slate-950 text-slate-300 hover:text-white text-xs"
              >
                Go to My Files
              </Button>
              <Button
                onClick={handleSignIn}
                variant="ghost"
                className="w-full h-10 text-cyan-400 hover:text-cyan-300 text-xs"
              >
                Switch Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
