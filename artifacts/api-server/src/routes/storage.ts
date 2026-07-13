import { randomUUID } from 'crypto';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import express, { Router, type IRouter, type Request, type Response } from 'express';

import { setPendingUpload } from '../lib/pending-uploads';

const router: IRouter = Router();

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

// Note: there used to be GET /storage/public-objects/* and /storage/objects/*
// proxy routes here that served files out of Replit Object Storage (GCS).
// Files now live in the public Supabase Storage bucket and are addressed by
// their permanent public URL (returned directly from the receipt upload
// endpoint), so no authenticated proxy route is needed to view them.

export default router;
