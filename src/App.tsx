/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  auth, 
  db 
} from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { 
  Upload, 
  File as FileIcon, 
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  Trash2, 
  Share2, 
  LogOut, 
  LogIn, 
  Cloud, 
  Search,
  MoreVertical,
  ExternalLink,
  Globe,
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  Users,
  Key,
  Shield,
  Eye,
  QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import { fileService, FileMetadata, testFirestoreConnection, handleFirestoreError, OperationType } from './lib/fileService';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StorageUsageChart } from './components/StorageUsageChart';
import { PrivateLinkDialog } from './components/PrivateLinkDialog';
import { PrivateLinkViewer } from './components/PrivateLinkViewer';
import { FilePreviewModal, getFilePreviewCategory } from './components/FilePreviewModal';
import { QrCodeModal } from './components/QrCodeModal';

interface UploadingItem {
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'saving' | 'done';
}

function CloudDropApp() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [publicFiles, setPublicFiles] = useState<FileMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, UploadingItem>>({});

  // Private Link Management
  const [privateLinkTargetFile, setPrivateLinkTargetFile] = useState<FileMetadata | null>(null);
  const [isPrivateLinkDialogOpen, setIsPrivateLinkDialogOpen] = useState(false);

  // File Preview Modal
  const [previewTargetFile, setPreviewTargetFile] = useState<FileMetadata | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleOpenPreview = (file: FileMetadata) => {
    setPreviewTargetFile(file);
    setIsPreviewOpen(true);
  };

  // QR Code Modal
  const [qrCodeTargetFile, setQrCodeTargetFile] = useState<FileMetadata | null>(null);
  const [isQrCodeOpen, setIsQrCodeOpen] = useState(false);

  const handleOpenQrCode = (file: FileMetadata) => {
    setQrCodeTargetFile(file);
    setIsQrCodeOpen(true);
  };

  // Private Link Viewer from URL params
  const [activeShareParams, setActiveShareParams] = useState<{ shareId: string; token: string } | null>(null);

  useEffect(() => {
    testFirestoreConnection();

    // Check if user arrived via a private share link
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    const token = params.get('token');
    if (shareId && token) {
      setActiveShareParams({ shareId, token });
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setFiles([]);
      return;
    }

    const q = query(
      collection(db, 'files'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fileList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FileMetadata[];
      setFiles(fileList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'files');
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  useEffect(() => {
    const q = query(
      collection(db, 'files'),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fileList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FileMetadata[];
      setPublicFiles(fileList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'files');
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Successfully logged in!');
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to login with Google');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user) {
      toast.error('Please sign in to upload files');
      return;
    }

    if (acceptedFiles.length === 0) return;

    // Concurrently handle uploads so a single slow upload never stalls others
    acceptedFiles.forEach(async (file) => {
      const fileId = Math.random().toString(36).substring(7);
      setUploadingFiles(prev => ({
        ...prev,
        [fileId]: {
          name: file.name,
          size: file.size,
          progress: 5,
          status: 'uploading'
        }
      }));

      try {
        await fileService.uploadFile(file, (progress) => {
          setUploadingFiles(prev => {
            const current = prev[fileId];
            if (!current) return prev;
            return {
              ...prev,
              [fileId]: {
                ...current,
                progress,
                status: progress >= 100 ? 'saving' : 'uploading'
              }
            };
          });
        });
        toast.success(`"${file.name}" uploaded successfully!`);
      } catch (error: any) {
        console.error('Upload error:', error);
        const errorMessage = error.message || 'Unknown upload error';
        toast.error(`Upload error for "${file.name}": ${errorMessage}`, {
          duration: 6000,
        });
      } finally {
        setUploadingFiles(prev => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }
    });
  }, [user]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop } as any);

  const handleDelete = async (file: FileMetadata) => {
    try {
      await fileService.deleteFile(file);
      toast.success('File deleted');
    } catch (error) {
      toast.error('Failed to delete file');
    }
  };

  const handleTogglePublic = async (file: FileMetadata) => {
    try {
      await fileService.togglePublic(file);
      toast.success(file.isPublic ? 'File is now private' : 'File is now public in feed');
    } catch (error) {
      toast.error('Failed to update file visibility');
    }
  };

  const handleOpenPrivateLink = (file: FileMetadata) => {
    setPrivateLinkTargetFile(file);
    setIsPrivateLinkDialogOpen(true);
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPublicFiles = publicFiles.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent font-sans text-slate-100 selection:bg-primary/30">
      <div className="space-bg">
        <div className="stars" />
      </div>
      
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div 
            onClick={() => {
              if (activeShareParams) {
                setActiveShareParams(null);
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            }}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="bg-primary/20 p-2 rounded-xl border border-primary/30 shadow-[0_0_15px_rgba(56,189,248,0.3)]">
              <Cloud className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight glow-text">CloudDrop</h1>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost" }), "relative h-10 w-10 rounded-full")}>
                  <Avatar className="h-10 w-10 border border-white/10">
                    <AvatarImage src={user.photoURL || ''} alt={user.displayName || ''} />
                    <AvatarFallback className="bg-slate-800 text-cyan-300">{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-slate-900 border-white/10 text-slate-100">
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.displayName || 'User'}</p>
                      <p className="text-xs leading-none text-slate-400 font-mono truncate">{user.email}</p>
                    </div>
                  </div>
                  <DropdownMenuItem onClick={handleLogout} className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10 cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={handleLogin} className="gap-2 bg-primary text-slate-950 font-semibold shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* If user navigated via a private link share, show the dedicated viewer */}
        {activeShareParams ? (
          <PrivateLinkViewer
            shareId={activeShareParams.shareId}
            token={activeShareParams.token}
            currentUser={user}
            onCloseViewer={() => {
              setActiveShareParams(null);
              window.history.replaceState({}, document.title, window.location.pathname);
            }}
            onLoginSuccess={() => {
              // State updates automatically via Firebase Auth observer
            }}
          />
        ) : !user ? (
          /* Public Hero Section when logged out */
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <h2 className="text-5xl font-extrabold tracking-tight sm:text-7xl glow-text">
                Store and share files <br />
                <span className="text-primary">with controlled access</span>
              </h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                CloudDrop provides resilient cloud file storage, storage usage charts, and private share links with strict user limits.
              </p>
              <div className="pt-4">
                <Button 
                  size="lg" 
                  onClick={handleLogin} 
                  className="px-10 h-14 text-lg gap-3 rounded-full bg-cyan-500 text-slate-950 font-bold shadow-[0_0_20px_rgba(56,189,248,0.4)] hover:shadow-[0_0_30px_rgba(56,189,248,0.6)] transition-all"
                >
                  Get Started for Free
                  <LogIn className="h-5 w-5" />
                </Button>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full pt-12">
              {[
                { 
                  icon: ShieldCheck, 
                  title: "Private Link & User Limits", 
                  desc: "Generate private links restricted to specific emails or cap the maximum number of users who can claim access." 
                },
                { 
                  icon: Lock, 
                  title: "Resilient Cloud Storage", 
                  desc: "Fast resumable file uploads with real-time progress indicators and fail-safe synchronization." 
                },
                { 
                  icon: Globe, 
                  title: "Public Community Feed", 
                  desc: "Optionally share resources with the global feed with single-click visibility toggles." 
                }
              ].map((feature, i) => (
                <Card key={i} className="glass border-white/5 shadow-none bg-slate-900/40">
                  <CardContent className="pt-8 text-center space-y-3">
                    <div className="mx-auto w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-2 border border-primary/20">
                      <feature.icon className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="font-bold text-lg text-slate-100">{feature.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          /* Logged In Dashboard */
          <div className="space-y-10">
            {/* Upload Dropzone */}
            <section>
              <div 
                {...getRootProps()} 
                id="dropzone-upload-area"
                className={`
                  border-2 border-dashed rounded-3xl p-14 text-center transition-all cursor-pointer glass
                  ${isDragActive ? 'border-primary bg-primary/10 scale-[1.01] shadow-[0_0_30px_rgba(56,189,248,0.2)]' : 'border-white/10 hover:border-primary/50'}
                `}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-5">
                  <div className="p-5 bg-primary/10 rounded-full border border-primary/20 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
                    <Upload className={`h-10 w-10 text-primary ${isDragActive ? 'animate-bounce' : ''}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold glow-text">
                      {isDragActive ? 'Drop your files here' : 'Drag & drop files here, or click to browse'}
                    </p>
                    <p className="text-slate-400 mt-2 text-sm">
                      Supports images, documents, videos, audio, archives, and code files up to 100MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Active Uploads with Real-Time Progress */}
              {Object.keys(uploadingFiles).length > 0 && (
                <div className="mt-4 space-y-3">
                  {(Object.entries(uploadingFiles) as [string, UploadingItem][]).map(([id, item]) => (
                    <Card key={id} className="overflow-hidden bg-slate-900/60 border-white/10 glass">
                      <CardContent className="p-4 flex items-center gap-4">
                        <Loader2 className="h-5 w-5 animate-spin text-cyan-400 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="truncate max-w-md font-semibold text-slate-200">
                              {item.name} ({formatFileSize(item.size)})
                            </span>
                            <span className="font-mono text-cyan-300">
                              {item.status === 'saving' ? 'Finalizing...' : `${Math.round(item.progress)}%`}
                            </span>
                          </div>
                          <Progress value={item.progress} className="h-2 bg-slate-800" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Storage Usage Visualization */}
            <StorageUsageChart files={files} />

            {/* Files Tabs */}
            <Tabs defaultValue="my-files" className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <TabsList className="grid w-full sm:w-[380px] grid-cols-2 bg-slate-900/60 border border-white/10">
                  <TabsTrigger value="my-files" className="data-[state=active]:bg-primary/20 data-[state=active]:text-cyan-300">
                    My Files ({files.length})
                  </TabsTrigger>
                  <TabsTrigger value="public" className="data-[state=active]:bg-primary/20 data-[state=active]:text-cyan-300">
                    Public Feed ({publicFiles.length})
                  </TabsTrigger>
                </TabsList>
                
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Search files by name..." 
                    className="pl-9 bg-slate-900/60 border-white/10 focus:border-primary/50 text-xs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <TabsContent value="my-files" className="mt-0">
                <AnimatePresence mode="popLayout">
                  {filteredFiles.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredFiles.map((file) => (
                        <FileCard 
                          key={file.id} 
                          file={file} 
                          onDelete={() => handleDelete(file)}
                          onTogglePublic={() => handleTogglePublic(file)}
                          onOpenPrivateLink={() => handleOpenPrivateLink(file)}
                          onPreview={() => handleOpenPreview(file)}
                          onOpenQrCode={() => handleOpenQrCode(file)}
                          isOwner={true}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState 
                      title={searchQuery ? "No matching files" : "No files uploaded yet"} 
                      desc={searchQuery ? "Try a different search term" : "Upload your first file above to get started"} 
                    />
                  )}
                </AnimatePresence>
              </TabsContent>

              <TabsContent value="public" className="mt-0">
                <AnimatePresence mode="popLayout">
                  {filteredPublicFiles.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredPublicFiles.map((file) => (
                        <FileCard 
                          key={file.id} 
                          file={file} 
                          onDelete={() => handleDelete(file)}
                          onTogglePublic={() => handleTogglePublic(file)}
                          onOpenPrivateLink={() => handleOpenPrivateLink(file)}
                          onPreview={() => handleOpenPreview(file)}
                          onOpenQrCode={() => handleOpenQrCode(file)}
                          isOwner={file.ownerId === user.uid}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState 
                      title={searchQuery ? "No matching public files" : "No public files yet"} 
                      desc={searchQuery ? "Try a different search query" : "Files marked as public by community members will appear here"} 
                    />
                  )}
                </AnimatePresence>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* Private Link and User Limit Management Modal */}
      <PrivateLinkDialog
        file={privateLinkTargetFile}
        isOpen={isPrivateLinkDialogOpen}
        onClose={() => {
          setIsPrivateLinkDialogOpen(false);
          setPrivateLinkTargetFile(null);
        }}
        onUpdateFile={(updatedFile) => {
          setPrivateLinkTargetFile(updatedFile);
          setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
        }}
      />

      {/* Modal Preview for Images and Text-based Files using <object> or <iframe> */}
      <FilePreviewModal
        file={previewTargetFile}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewTargetFile(null);
        }}
        onOpenQrCode={handleOpenQrCode}
      />

      {/* QR Code Sharing Modal for Mobile Handover */}
      <QrCodeModal
        file={qrCodeTargetFile}
        isOpen={isQrCodeOpen}
        onClose={() => {
          setIsQrCodeOpen(false);
          setQrCodeTargetFile(null);
        }}
      />
    </div>
  );
}

function FileCard(props: { 
  file: FileMetadata; 
  onDelete: () => void; 
  onTogglePublic: () => void;
  onOpenPrivateLink: () => void;
  onPreview: () => void;
  onOpenQrCode: () => void;
  isOwner: boolean;
  [key: string]: any;
}) {
  const { file, onDelete, onTogglePublic, onOpenPrivateLink, onPreview, onOpenQrCode, isOwner } = props;
  const previewInfo = getFilePreviewCategory(file);

  const getFileIcon = () => {
    const type = file.type.toLowerCase();
    if (type.startsWith('image/')) return <FileImage className="h-5 w-5 text-cyan-400" />;
    if (type.startsWith('video/')) return <FileVideo className="h-5 w-5 text-purple-400" />;
    if (type.startsWith('audio/')) return <FileAudio className="h-5 w-5 text-pink-400" />;
    if (type.includes('pdf')) return <FileText className="h-5 w-5 text-rose-400" />;
    if (type.includes('word') || type.includes('officedocument.wordprocessingml') || type.includes('text/')) return <FileText className="h-5 w-5 text-blue-400" />;
    if (type.includes('excel') || type.includes('officedocument.spreadsheetml')) return <FileText className="h-5 w-5 text-emerald-400" />;
    if (type.includes('zip') || type.includes('rar') || type.includes('compressed')) return <FileArchive className="h-5 w-5 text-amber-400" />;
    if (type.includes('javascript') || type.includes('typescript') || type.includes('html') || type.includes('css') || type.includes('json')) return <FileCode className="h-5 w-5 text-teal-400" />;
    return <FileIcon className="h-5 w-5 text-slate-400" />;
  };

  const isImage = file.type.startsWith('image/');
  const accessedCount = file.accessedUsers?.length || 0;
  const maxLimit = file.maxUsers ?? null;

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't trigger if clicked on an action button, anchor link, or dropdown menu
    if (
      target.closest('button') || 
      target.closest('a') || 
      target.closest('[role="menuitem"]') ||
      target.closest('[data-slot="dropdown-menu-trigger"]')
    ) {
      return;
    }

    if (previewInfo.canPreview) {
      onPreview();
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <Card 
        id={`file-card-${file.id || file.name}`}
        onClick={handleCardClick}
        className={cn(
          "group transition-all border-white/5 overflow-hidden glass bg-slate-900/50 hover:border-cyan-500/30",
          previewInfo.canPreview && "cursor-pointer hover:shadow-xl hover:shadow-cyan-950/20 hover:bg-slate-900/70"
        )}
      >
        <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className={`p-2.5 rounded-xl shrink-0 ${isImage ? 'bg-primary/10 text-primary' : 'bg-slate-800 text-slate-400'} border border-white/5`}>
              {getFileIcon()}
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <CardTitle 
                  className={cn(
                    "text-sm font-semibold truncate text-slate-100 transition-colors",
                    previewInfo.canPreview && "group-hover:text-cyan-300"
                  )} 
                  title={file.name}
                >
                  {file.name}
                </CardTitle>
                {previewInfo.canPreview && (
                  <Eye className="h-3.5 w-3.5 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Click card to preview" />
                )}
              </div>
              <CardDescription className="text-xs text-slate-400">
                {format(file.createdAt?.toDate ? file.createdAt.toDate() : new Date(), 'MMM d, yyyy')} • {file.size ? (file.size / 1024 / 1024).toFixed(2) : 0} MB
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            {/* Quick QR Code Button */}
            <button
              type="button"
              id={`file-qr-btn-${file.id || file.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenQrCode();
              }}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "h-8 w-8 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
              )}
              title="Generate QR code for mobile sharing"
            >
              <QrCode className="h-4 w-4" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8 text-slate-400 hover:text-white")}>
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-900 border-white/10 text-slate-100">
                {previewInfo.canPreview && (
                  <DropdownMenuItem onClick={onPreview} className="text-cyan-400 focus:text-cyan-300 cursor-pointer">
                    <Eye className="mr-2 h-4 w-4" />
                    <span>Preview File</span>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem onClick={onOpenQrCode} className="text-cyan-400 focus:text-cyan-300 cursor-pointer">
                  <QrCode className="mr-2 h-4 w-4" />
                  <span>Generate QR Code</span>
                </DropdownMenuItem>

                <DropdownMenuItem className="p-0 cursor-pointer">
                  <a 
                    href={file.url.startsWith('/api/files/') ? `${file.url}?download=true&name=${encodeURIComponent(file.name)}` : file.url} 
                    download={file.name} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center w-full px-2 py-1.5"
                  >
                    <ExternalLink className="mr-2 h-4 w-4 text-cyan-400" />
                    <span>Download File</span>
                  </a>
                </DropdownMenuItem>

              {isOwner && (
                <>
                  <DropdownMenuItem onClick={onOpenPrivateLink} className="text-cyan-400 focus:text-cyan-300 cursor-pointer">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    <span>Private Link & User Limit</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={onTogglePublic} className="cursor-pointer">
                    {file.isPublic ? (
                      <><Lock className="mr-2 h-4 w-4" /><span>Make Private</span></>
                    ) : (
                      <><Globe className="mr-2 h-4 w-4" /><span>Make Public in Feed</span></>
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={onDelete} className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10 cursor-pointer">
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Delete File</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
        
        <CardContent className="p-4 pt-0">
          {/* Visual inline preview container for Images */}
          {isImage && file.url && (
            <div 
              className="relative w-full h-32 mt-1 mb-2 rounded-xl overflow-hidden bg-slate-950/80 border border-white/5 group-hover:border-cyan-500/30 transition-all flex items-center justify-center cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onPreview();
              }}
              title="Click to preview image in modal"
            >
              <img 
                src={file.url} 
                alt={file.name} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs text-white font-medium backdrop-blur-[2px]">
                <Eye className="h-4 w-4 text-cyan-400" />
                <span>Click to preview</span>
              </div>
            </div>
          )}

          {/* Visual inline preview container for Text/Code files */}
          {previewInfo.category === 'text' && (
            <div 
              className="relative w-full h-20 mt-1 mb-2 p-2.5 rounded-xl bg-slate-950/80 border border-white/5 font-mono text-[11px] text-slate-400 overflow-hidden group-hover:border-cyan-500/30 transition-all cursor-pointer flex flex-col justify-between"
              onClick={(e) => {
                e.stopPropagation();
                onPreview();
              }}
              title="Click to preview text/code file in modal"
            >
              <div className="space-y-0.5 select-none">
                <div className="flex items-center justify-between text-slate-500 text-[10px]">
                  <span className="text-cyan-400/90 font-mono">// {file.name}</span>
                  <span className="text-slate-500 uppercase">{file.name.split('.').pop() || 'TEXT'}</span>
                </div>
                <p className="text-slate-400 text-[10px] font-mono truncate">
                  {file.type || 'text/plain'}
                </p>
              </div>
              <div className="flex items-center justify-between text-[10px] text-cyan-400/90 pt-1 border-t border-white/5">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Click to view content
                </span>
                <span className="text-slate-500 font-mono text-[9px]">&lt;object/iframe&gt;</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Preview Badge */}
              {previewInfo.canPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[11px] font-medium hover:bg-cyan-500/20 transition-all cursor-pointer"
                  title="Click to preview in modal"
                >
                  <Eye className="h-3 w-3" />
                  <span>Preview</span>
                </button>
              )}

              {/* QR Code Quick Badge Button */}
              <button
                type="button"
                id={`file-qr-badge-btn-${file.id || file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenQrCode();
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-cyan-500/15 text-slate-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/30 text-[11px] font-medium transition-all cursor-pointer"
                title="Generate QR code for mobile devices"
              >
                <QrCode className="h-3 w-3 text-cyan-400" />
                <span>QR Code</span>
              </button>

              {/* Public Badge */}
              {file.isPublic && (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1 text-[11px] py-0.5">
                  <Globe className="h-3 w-3" />
                  Public
                </Badge>
              )}

              {/* Private Link Status Badge */}
              {file.isPrivateLink ? (
                <button
                  type="button"
                  onClick={onOpenPrivateLink}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px] font-medium hover:bg-cyan-500/25 transition-all"
                  title="Click to manage private link and user number limit"
                >
                  <ShieldCheck className="h-3 w-3 text-cyan-400" />
                  <span>
                    Private Link ({accessedCount}/{maxLimit ? `${maxLimit}` : '∞'})
                  </span>
                </button>
              ) : isOwner ? (
                <button
                  type="button"
                  onClick={onOpenPrivateLink}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 border border-white/5 text-[11px] transition-colors"
                >
                  <Key className="h-3 w-3" />
                  <span>Setup Private Link</span>
                </button>
              ) : (
                <Badge variant="secondary" className="bg-slate-800 text-slate-400 border-white/5 text-[11px]">
                  <Lock className="h-3 w-3 mr-1" />
                  Private
                </Badge>
              )}
            </div>

            {!isOwner && file.ownerEmail && (
              <span className="text-[10px] text-slate-500 truncate max-w-[120px] font-mono">
                by {file.ownerEmail.split('@')[0]}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function EmptyState({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center glass rounded-3xl border-2 border-dashed border-white/5">
      <div className="p-5 bg-slate-900/50 rounded-full mb-4 border border-white/5">
        <FileIcon className="h-8 w-8 text-slate-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      <p className="text-sm text-slate-400 max-w-xs mx-auto mt-2 leading-relaxed">
        {desc}
      </p>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CloudDropApp />
      <Toaster position="bottom-right" richColors />
    </ErrorBoundary>
  );
}
