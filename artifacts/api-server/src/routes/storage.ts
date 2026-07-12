import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import express, { Router, type IRouter, type Request, type Response } from 'express';
import { db, transactionsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { setPendingUpload, popPendingUpload } from '../lib/pending-uploads';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Returns a server-side upload URL instead of a GCS signed URL.
 * Direct-to-GCS PUT requests fail on iOS Safari due to CORS; routing through
 * our own server avoids this entirely and requires no object storage config.
 *
 * The client flow:
 *   1. POST here  → { uploadURL: "/api/storage/uploads/<uuid>", objectPath: "/objects/uploads/<uuid>" }
 *   2. PUT uploadURL with raw image bytes  → stored in pending-uploads memory cache
 *   3. POST /transactions/:id/receipt with { imageData: objectPath }
 *      → server resolves objectPath → base64 data URL → stored in DB
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

    const { name, size, contentType } = parsed.data;
    const uuid = randomUUID();

    // Do NOT use RequestUploadUrlResponse.parse() — its uploadURL field is
    // zod.string().url() which rejects relative paths and throws a 500.
    res.json({
      uploadURL: `/api/storage/uploads/${uuid}`,
      objectPath: `/objects/uploads/${uuid}`,
      metadata: { name, size, contentType },
    });
  },
);

/**
 * PUT /storage/uploads/:uuid
 *
 * Receives raw image bytes from the client (old upload flow).
 * Converts to a base64 data URL and stores in the pending-uploads cache.
 * The receipt endpoint resolves these paths when saving to the DB.
 */
router.put(
  '/storage/uploads/:uuid',
  express.raw({ type: '*/*', limit: '25mb' }),
  async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { uuid } = req.params;
    const contentType =
      (req.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
    const body = req.body as Buffer;

    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'Empty body' });
      return;
    }

    const dataUrl = `data:${contentType};base64,${body.toString('base64')}`;
    try {
      setPendingUpload(uuid, dataUrl);
    } catch (err: any) {
      res.status(err?.statusCode === 415 ? 415 : 500).json({ error: err?.message ?? 'Failed to store image' });
      return;
    }
    res.status(200).json({ ok: true });
  },
);

/**
 * POST /storage/uploads
 *
 * Alternative server-side upload: accepts a base64 data URL in JSON body.
 * Used by newer frontend code that skips the signed-URL dance entirely.
 * Body: { data: "data:image/jpeg;base64,..." }
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
    const uuid = randomUUID();
    setPendingUpload(uuid, data);
    res.json({ objectPath: `/objects/uploads/${uuid}` });
  } catch (error: any) {
    if (error?.statusCode === 415) {
      res.status(415).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, 'Error storing upload');
    res.status(500).json({ error: 'Failed to store image' });
  }
});

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
