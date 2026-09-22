import { 
  collection, 
  doc, 
  getDoc,
  getDocFromServer,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { db, storage, fallbackStorage, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface AccessedUser {
  uid: string;
  email: string;
  displayName?: string;
  accessedAt: string;
}

export interface FileMetadata {
  id?: string;
  name: string;
  size: number;
  type: string;
  url: string;
  storagePath: string;
  ownerId: string;
  ownerEmail?: string;
  createdAt: Timestamp | any;
  isPublic?: boolean;

  // Private Link & User Number Management
  isPrivateLink?: boolean;
  privateLinkId?: string;
  maxUsers?: number | null; // e.g., 1, 3, 5, 10, or null for unlimited
  allowedEmails?: string[]; // Specific whitelisted emails
  accessedUsers?: AccessedUser[]; // Users who accessed the link
}

/**
 * Helper to read a browser File as base64 Data URL
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file for storage'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload helper using the application's dedicated high-performance upload API
 * Provides live, real-time progress callbacks and supports files up to 100MB
 */
function uploadViaServerApi(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ url: string; storagePath: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success && response.url) {
            if (onProgress) onProgress(100);
            resolve({
              url: response.url,
              storagePath: response.storagePath || `uploads/${response.filename}`
            });
          } else {
            reject(new Error(response.error || 'Server upload failed'));
          }
        } catch {
          reject(new Error('Invalid response from upload server'));
        }
      } else {
        reject(new Error(`Server upload returned status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during file upload'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload request timed out'));
    };

    xhr.open('POST', '/api/upload', true);
    xhr.timeout = 180000; // 3 minutes timeout for large files
    xhr.send(formData);
  });
}

export const fileService = {
  async uploadFile(file: File, onProgress?: (progress: number) => void): Promise<FileMetadata> {
    if (!auth.currentUser) throw new Error('User must be authenticated to upload files');

    console.log('Starting upload for:', file.name, 'Size:', file.size, 'Type:', file.type);
    if (onProgress) onProgress(5);

    let uploadResult: { url: string; storagePath: string } | null = null;

    try {
      uploadResult = await uploadViaServerApi(file, onProgress);
    } catch (apiErr: any) {
      console.warn('Direct server upload failed, testing resilient inline fallback:', apiErr);
      // If server upload failed and file is small enough (<700KB), fallback to inline data url
      if (file.size <= 700 * 1024) {
        const dataUrl = await readFileAsDataUrl(file);
        if (onProgress) onProgress(100);
        uploadResult = {
          url: dataUrl,
          storagePath: 'inline_data'
        };
      } else {
        throw new Error(apiErr.message || 'File upload failed. Please try again.');
      }
    }

    if (!uploadResult) {
      throw new Error('Failed to process file upload');
    }

    // Default unique token for private link
    const initialPrivateLinkId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

    const metadata: Omit<FileMetadata, 'id'> = {
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      url: uploadResult.url,
      storagePath: uploadResult.storagePath,
      ownerId: auth.currentUser.uid,
      ownerEmail: auth.currentUser.email || undefined,
      createdAt: serverTimestamp(),
      isPublic: false,
      isPrivateLink: false,
      privateLinkId: initialPrivateLinkId,
      maxUsers: 5, // Default maximum user number: 5 users
      allowedEmails: [],
      accessedUsers: []
    };

    console.log('Saving file metadata to Firestore...');
    try {
      const docRef = await addDoc(collection(db, 'files'), metadata);
      console.log('File metadata saved successfully with ID:', docRef.id);
      return { id: docRef.id, ...metadata } as FileMetadata;
    } catch (dbErr) {
      handleFirestoreError(dbErr, OperationType.CREATE, 'files');
      throw dbErr;
    }
  },

  async deleteFile(file: FileMetadata) {
    if (!auth.currentUser || auth.currentUser.uid !== file.ownerId) {
      throw new Error('Unauthorized to delete this file');
    }

    try {
      // Clean up server file if saved in uploads/
      if (file.storagePath && file.storagePath.startsWith('uploads/')) {
        const filename = file.storagePath.replace('uploads/', '');
        try {
          await fetch(`/api/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        } catch (serverDelErr) {
          console.warn('Server file cleanup warning:', serverDelErr);
        }
      }

      // Delete from firestore
      if (file.id) {
        await deleteDoc(doc(db, 'files', file.id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `files/${file.id}`);
    }
  },

  async togglePublic(file: FileMetadata) {
    if (!auth.currentUser || auth.currentUser.uid !== file.ownerId) {
      throw new Error('Unauthorized to modify this file');
    }

    try {
      if (file.id) {
        await updateDoc(doc(db, 'files', file.id), {
          isPublic: !file.isPublic
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `files/${file.id}`);
    }
  },

  async updatePrivateLinkSettings(
    fileId: string, 
    settings: {
      isPrivateLink: boolean;
      maxUsers?: number | null;
      allowedEmails?: string[];
      privateLinkId?: string;
    }
  ) {
    if (!auth.currentUser) throw new Error('User must be authenticated');
    
    try {
      const updates: Record<string, any> = {
        isPrivateLink: settings.isPrivateLink
      };
      if (settings.maxUsers !== undefined) {
        updates.maxUsers = settings.maxUsers;
      }
      if (settings.allowedEmails !== undefined) {
        // Sanitize and lowercase allowed emails
        updates.allowedEmails = settings.allowedEmails.map(e => e.trim().toLowerCase()).filter(Boolean);
      }
      if (settings.privateLinkId) {
        updates.privateLinkId = settings.privateLinkId;
      }

      await updateDoc(doc(db, 'files', fileId), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `files/${fileId}`);
    }
  },

  async regeneratePrivateLinkId(fileId: string): Promise<string> {
    if (!auth.currentUser) throw new Error('User must be authenticated');
    const newId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    try {
      await updateDoc(doc(db, 'files', fileId), {
        privateLinkId: newId
      });
      return newId;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `files/${fileId}`);
      throw error;
    }
  },

  async removeAccessedUser(fileId: string, targetUid: string) {
    if (!auth.currentUser) throw new Error('User must be authenticated');
    try {
      const fileRef = doc(db, 'files', fileId);
      const snapshot = await getDoc(fileRef);
      if (!snapshot.exists()) throw new Error('File not found');
      
      const fileData = snapshot.data() as FileMetadata;
      if (fileData.ownerId !== auth.currentUser.uid) {
        throw new Error('Only the file owner can manage authorized users');
      }

      const updatedUsers = (fileData.accessedUsers || []).filter(u => u.uid !== targetUid);
      await updateDoc(fileRef, {
        accessedUsers: updatedUsers
      });
      return updatedUsers;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `files/${fileId}`);
      throw error;
    }
  },

  async getFileById(fileId: string): Promise<FileMetadata | null> {
    try {
      const fileRef = doc(db, 'files', fileId);
      const snapshot = await getDoc(fileRef);
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() } as FileMetadata;
    } catch (error) {
      console.error('Failed to get file by ID:', error);
      return null;
    }
  },

  /**
   * Evaluates and records access to a private link
   */
  async claimPrivateLinkAccess(
    fileId: string, 
    token: string, 
    currentUser: { uid: string; email: string; displayName?: string }
  ): Promise<{
    allowed: boolean;
    reason?: 'owner' | 'already_joined' | 'slot_claimed' | 'user_limit_reached' | 'email_not_allowed' | 'invalid_link' | 'disabled';
    message: string;
    file?: FileMetadata;
    userNumber?: number;
    maxUsers?: number | null;
  }> {
    const fileRef = doc(db, 'files', fileId);
    const snapshot = await getDoc(fileRef);
    if (!snapshot.exists()) {
      return { allowed: false, reason: 'invalid_link', message: 'File not found or has been deleted.' };
    }

    const file = { id: snapshot.id, ...snapshot.data() } as FileMetadata;

    // Verify token
    if (file.privateLinkId && file.privateLinkId !== token) {
      return { allowed: false, reason: 'invalid_link', message: 'Invalid or expired private link token.' };
    }

    // Verify private link enabled
    if (!file.isPrivateLink) {
      return { allowed: false, reason: 'disabled', message: 'Private link sharing has been disabled by the owner.' };
    }

    // Owner always has access
    if (currentUser.uid === file.ownerId) {
      return { allowed: true, reason: 'owner', message: 'Welcome back, owner!', file };
    }

    const userEmail = (currentUser.email || '').toLowerCase().trim();

    // Check specific allowed emails whitelist if configured
    if (file.allowedEmails && file.allowedEmails.length > 0) {
      const isAllowed = file.allowedEmails.some(e => e.toLowerCase().trim() === userEmail);
      if (!isAllowed) {
        return {
          allowed: false,
          reason: 'email_not_allowed',
          message: `Access denied. Your account (${currentUser.email}) is not on the authorized user list for this private link.`
        };
      }
    }

    // Check if user is already recorded in accessedUsers
    const accessedList = file.accessedUsers || [];
    const existingIndex = accessedList.findIndex(u => u.uid === currentUser.uid || u.email.toLowerCase() === userEmail);
    if (existingIndex !== -1) {
      return {
        allowed: true,
        reason: 'already_joined',
        message: 'Access verified.',
        file,
        userNumber: existingIndex + 1,
        maxUsers: file.maxUsers
      };
    }

    // Check maximum user number limit
    const maxUsers = typeof file.maxUsers === 'number' ? file.maxUsers : null;
    if (maxUsers !== null && maxUsers > 0 && accessedList.length >= maxUsers) {
      return {
        allowed: false,
        reason: 'user_limit_reached',
        maxUsers,
        message: `User limit reached! This private link was limited to ${maxUsers} user(s), and all access slots have been filled. Contact the owner to increase the user limit.`
      };
    }

    // Claim a slot: record new user
    const newUser: AccessedUser = {
      uid: currentUser.uid,
      email: userEmail,
      displayName: currentUser.displayName || userEmail.split('@')[0],
      accessedAt: new Date().toISOString()
    };

    const updatedUsers = [...accessedList, newUser];
    try {
      await updateDoc(fileRef, {
        accessedUsers: updatedUsers
      });
      return {
        allowed: true,
        reason: 'slot_claimed',
        message: `Access granted! You are user ${updatedUsers.length} of ${maxUsers || 'unlimited'}.`,
        file: { ...file, accessedUsers: updatedUsers },
        userNumber: updatedUsers.length,
        maxUsers
      };
    } catch (err) {
      console.error('Failed to register user access:', err);
      // Even if Firestore update fails, if reading was allowed, return file
      return {
        allowed: true,
        reason: 'slot_claimed',
        message: 'Access granted.',
        file,
        userNumber: updatedUsers.length,
        maxUsers
      };
    }
  }
};

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
