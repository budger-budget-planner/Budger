import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { db, transactionsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads
 *
 * Server-side receipt upload — accepts a base64 data URL in JSON body.
 * Decodes and saves the image directly to private object storage via the
 * server SDK, avoiding any browser CORS restrictions with GCS signed URLs
 * (which fail on iOS Safari / mobile WebKit).
 *
 * Body: { data: "data:image/jpeg;base64,..." }
 * Response: { objectPath: "/objects/uploads/<uuid>" }
 */
router.post('/storage/uploads', async (req: Request, res: Response) => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { data } = req.body as { data?: string };
  if (!data || typeof data !== 'string' || !data.startsWith('data:')) {
    res.status(400).json({ error: 'Missing or invalid image data' });
    return;
  }

  try {
    // Parse "data:<contentType>;base64,<payload>"
    const commaIdx = data.indexOf(',');
    if (commaIdx === -1) throw new Error('Malformed data URL');
    const meta = data.slice(5, commaIdx); // e.g. "image/jpeg;base64"
    const contentType = meta.split(';')[0] || 'image/jpeg';
    const b64 = data.slice(commaIdx + 1);
    const buffer = Buffer.from(b64, 'base64');

    const objectPath = await objectStorageService.uploadObjectEntity(buffer, contentType);
    res.json({ objectPath });
  } catch (error) {
    req.log.error({ err: error }, 'Error uploading receipt');
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires a valid session so anonymous callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * Requires a valid session — receipt images are private to the owning user.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Ownership check: receipt objects are only ever referenced from the
    // uploading user's own transaction row (transactions.receiptImage stores
    // the objectPath once uploaded). Without this, any authenticated user
    // could read any other user's receipt by guessing/observing the path.
    const [owningTx] = await db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.receiptImage, objectPath), eq(transactionsTable.userId, userId)));
    if (!owningTx) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
