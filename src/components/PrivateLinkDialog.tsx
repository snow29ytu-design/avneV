import React, { useState, useEffect } from 'react';
import { 
  Copy, 
  Check, 
  RotateCw, 
  ShieldCheck, 
  Users, 
  UserMinus, 
  Lock, 
  Unlock, 
  Mail, 
  Plus, 
  X, 
  ExternalLink,
  Info,
  UserCheck
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { FileMetadata, fileService, AccessedUser } from '@/src/lib/fileService';

interface PrivateLinkDialogProps {
  file: FileMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateFile: (updatedFile: FileMetadata) => void;
}

export const PrivateLinkDialog: React.FC<PrivateLinkDialogProps> = ({
  file,
  isOpen,
  onClose,
  onUpdateFile
}) => {
  if (!file) return null;

  const [isEnabled, setIsEnabled] = useState<boolean>(file.isPrivateLink || false);
  const [privateLinkId, setPrivateLinkId] = useState<string>(file.privateLinkId || '');
  const [maxUsers, setMaxUsers] = useState<number | null>(file.maxUsers ?? 5);
  const [emailInput, setEmailInput] = useState('');
  const [allowedEmails, setAllowedEmails] = useState<string[]>(file.allowedEmails || []);
  const [accessedUsers, setAccessedUsers] = useState<AccessedUser[]>(file.accessedUsers || []);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Sync state when file prop changes
  useEffect(() => {
    if (file) {
      setIsEnabled(file.isPrivateLink || false);
      setPrivateLinkId(file.privateLinkId || Math.random().toString(36).substring(2, 10));
      setMaxUsers(file.maxUsers ?? 5);
      setAllowedEmails(file.allowedEmails || []);
      setAccessedUsers(file.accessedUsers || []);
    }
  }, [file]);

  const shareableUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?share=${file.id}&token=${privateLinkId}`
    : '';

  const handleCopyLink = () => {
    if (!shareableUrl) return;
    navigator.clipboard.writeText(shareableUrl);
    setIsCopied(true);
    toast.success('Private link copied to clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleRegenerateToken = async () => {
    if (!file.id) return;
    setIsRegenerating(true);
    try {
      const newToken = await fileService.regeneratePrivateLinkId(file.id);
      setPrivateLinkId(newToken);
      toast.success('Generated new private link token! Old links are now invalid.');
      onUpdateFile({
        ...file,
        privateLinkId: newToken
      });
    } catch (err: any) {
      toast.error('Failed to regenerate link token: ' + (err.message || 'Unknown error'));
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleAddEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes('@') || !trimmed.includes('.')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (allowedEmails.includes(trimmed)) {
      toast.error('This email is already in the authorized list');
      return;
    }
    setAllowedEmails(prev => [...prev, trimmed]);
    setEmailInput('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setAllowedEmails(prev => prev.filter(e => e !== emailToRemove));
  };

  const handleRemoveAccessedUser = async (userUid: string) => {
    if (!file.id) return;
    try {
      const updated = await fileService.removeAccessedUser(file.id, userUid);
      setAccessedUsers(updated);
      toast.success('User access revoked and slot released!');
      onUpdateFile({
        ...file,
        accessedUsers: updated
      });
    } catch (err: any) {
      toast.error('Failed to remove user: ' + (err.message || 'Unknown error'));
    }
  };

  const handleSaveSettings = async () => {
    if (!file.id) return;
    setIsSaving(true);
    try {
      await fileService.updatePrivateLinkSettings(file.id, {
        isPrivateLink: isEnabled,
        privateLinkId,
        maxUsers: maxUsers && maxUsers > 0 ? maxUsers : null,
        allowedEmails
      });

      const updated: FileMetadata = {
        ...file,
        isPrivateLink: isEnabled,
        privateLinkId,
        maxUsers: maxUsers && maxUsers > 0 ? maxUsers : null,
        allowedEmails,
        accessedUsers
      };

      onUpdateFile(updated);
      toast.success('Private link settings saved successfully!');
      onClose();
    } catch (err: any) {
      toast.error('Failed to save settings: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const claimedCount = accessedUsers.length;
  const userSlotsProgress = maxUsers && maxUsers > 0 
    ? Math.min(100, Math.round((claimedCount / maxUsers) * 100)) 
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        id="private-link-modal"
        className="max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 border-white/10 text-slate-100 p-6 sm:p-7 rounded-2xl shadow-2xl"
      >
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-100">
                Private Link & User Access
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Share <span className="font-semibold text-slate-200">"{file.name}"</span> with controlled user limits
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Main Activation Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-white/5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200">Enable Private Link</span>
                {isEnabled ? (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] px-1.5 py-0">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0">
                    Disabled
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Only authenticated users allowed by your rules can view or download this file
              </p>
            </div>
            <button
              id="btn-toggle-private-link-state"
              type="button"
              onClick={() => setIsEnabled(!isEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isEnabled ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {isEnabled && (
            <>
              {/* Shareable Link Bar */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Unique Shareable Link</span>
                  <button
                    type="button"
                    onClick={handleRegenerateToken}
                    disabled={isRegenerating}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                  >
                    <RotateCw className={`h-3 w-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                    Regenerate Token
                  </button>
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="input-private-share-link"
                    readOnly
                    value={shareableUrl}
                    className="bg-slate-950/80 border-white/10 text-xs font-mono text-cyan-300 truncate"
                  />
                  <Button
                    id="btn-copy-private-link"
                    type="button"
                    onClick={handleCopyLink}
                    variant="outline"
                    className="shrink-0 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30 gap-1.5 text-xs h-9 px-3"
                  >
                    {isCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    {isCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              {/* Manage User Number (Capacity Limit) */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-950/40 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-cyan-400" />
                      Manage User Number Limit
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Cap the maximum number of distinct users who can access this link
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono border-white/10 bg-slate-900 text-slate-200">
                    {claimedCount} / {maxUsers ? `${maxUsers} users` : 'Unlimited'}
                  </Badge>
                </div>

                {/* Slots Progress Gauge */}
                {maxUsers && maxUsers > 0 ? (
                  <div className="space-y-1">
                    <Progress value={userSlotsProgress} className="h-2 bg-slate-800" />
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>{claimedCount} slots claimed</span>
                      <span>{Math.max(0, maxUsers - claimedCount)} remaining</span>
                    </div>
                  </div>
                ) : null}

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[1, 3, 5, 10].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant={maxUsers === preset ? 'default' : 'outline'}
                      onClick={() => setMaxUsers(preset)}
                      className={`text-xs h-7 px-2.5 rounded-lg ${
                        maxUsers === preset 
                          ? 'bg-cyan-500 text-slate-950 font-semibold' 
                          : 'bg-slate-900/60 border-white/5 text-slate-300 hover:text-white'
                      }`}
                    >
                      {preset} {preset === 1 ? 'User (1-Time)' : 'Users'}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={maxUsers === null ? 'default' : 'outline'}
                    onClick={() => setMaxUsers(null)}
                    className={`text-xs h-7 px-2.5 rounded-lg ${
                      maxUsers === null 
                        ? 'bg-cyan-500 text-slate-950 font-semibold' 
                        : 'bg-slate-900/60 border-white/5 text-slate-300 hover:text-white'
                    }`}
                  >
                    Unlimited
                  </Button>
                </div>

                {/* Custom Number Input */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400">Custom user number:</span>
                  <Input
                    id="input-custom-max-users"
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="Enter limit"
                    value={maxUsers === null ? '' : maxUsers}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) setMaxUsers(null);
                      else setMaxUsers(Math.max(1, parseInt(val, 10) || 1));
                    }}
                    className="w-24 h-8 bg-slate-900 border-white/10 text-xs font-mono"
                  />
                  <span className="text-[11px] text-slate-500">users</span>
                </div>
              </div>

              {/* Whitelist Allowed Emails (Optional Specific Restriction) */}
              <div className="space-y-2.5 p-4 rounded-xl bg-slate-950/40 border border-white/5">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-cyan-400" />
                    Specific Allowed Users (Whitelist)
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Leave blank to let any user claim a slot up to your max user limit, or specify exact emails
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    id="input-allowed-user-email"
                    type="email"
                    placeholder="colleague@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEmail();
                      }
                    }}
                    className="bg-slate-900 border-white/10 text-xs"
                  />
                  <Button
                    id="btn-add-allowed-email"
                    type="button"
                    onClick={handleAddEmail}
                    size="sm"
                    className="h-9 px-3 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30 shrink-0 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>

                {allowedEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {allowedEmails.map((email) => (
                      <Badge
                        key={email}
                        variant="secondary"
                        className="bg-slate-800 text-slate-200 border-white/10 text-xs pl-2.5 pr-1.5 py-1 flex items-center gap-1.5"
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(email)}
                          className="hover:text-red-400 text-slate-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Accessed Users List (Manage / Revoke Slots) */}
              <div className="space-y-2 p-4 rounded-xl bg-slate-950/40 border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Users Who Claimed Access ({accessedUsers.length})
                  </span>
                </div>

                {accessedUsers.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic py-1">
                    No users have accessed this private link yet.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {accessedUsers.map((accUser, idx) => (
                      <div
                        key={accUser.uid || idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-white/5 text-xs"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] flex items-center justify-center font-bold">
                            {idx + 1}
                          </div>
                          <div className="truncate">
                            <span className="font-medium text-slate-200 block truncate">
                              {accUser.email}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {new Date(accUser.accessedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAccessedUser(accUser.uid)}
                          className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <UserMinus className="h-3 w-3 mr-1" />
                          Revoke Slot
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-white/5">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Cancel
          </Button>
          <Button
            id="btn-save-private-link-settings"
            type="button"
            disabled={isSaving}
            onClick={handleSaveSettings}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs h-9 px-4 shadow-[0_0_15px_rgba(56,189,248,0.3)]"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
