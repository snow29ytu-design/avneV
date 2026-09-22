import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable CORS and JSON parsing
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Multer storage configuration
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${uniqueSuffix}_${safeName}`);
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB max file size
    }
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Upload file API endpoint
  app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const fileUrl = `/api/files/${encodeURIComponent(req.file.filename)}`;
      return res.json({
        success: true,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype || 'application/octet-stream',
        url: fileUrl,
        storagePath: `uploads/${req.file.filename}`
      });
    } catch (err: any) {
      console.error('Error handling upload:', err);
      return res.status(500).json({ error: err.message || 'Upload processing failed' });
    }
  });

  // Serve uploaded files
  app.get('/api/files/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(uploadsDir, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
      }

      // Check query parameter for download attachment vs inline view
      const downloadParam = req.query.download;
      const originalName = req.query.name as string;

      if (downloadParam === 'true') {
        return res.download(filePath, originalName || filename);
      }

      // Set headers for smooth iframe / object tag rendering
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Disposition', 'inline');

      const ext = path.extname(filename).toLowerCase();
      const textExtensions = [
        '.txt', '.md', '.json', '.csv', '.log', '.js', '.ts', '.tsx', '.jsx',
        '.py', '.java', '.c', '.cpp', '.h', '.cs', '.sh', '.bash', '.yml',
        '.yaml', '.sql', '.env', '.ini', '.conf', '.toml', '.xml', '.css'
      ];

      // If requested as raw text or it's a known text/code file, serve with text/plain utf-8
      if (req.query.as_text === 'true' || textExtensions.includes(ext)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }

      return res.sendFile(filePath);
    } catch (err: any) {
      console.error('Error serving file:', err);
      return res.status(500).send('Error retrieving file');
    }
  });

  // Delete file endpoint
  app.delete('/api/files/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(uploadsDir, filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ error: 'Could not delete file from disk' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
