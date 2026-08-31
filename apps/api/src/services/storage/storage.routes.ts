import { Router, type Request, type Response } from 'express';
import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { storageService } from './storage.service.js';

/**
 * Serving route for the LOCAL storage provider (development only).
 *
 * Mirrors S3 presigned URLs: the URL carries an HMAC signature and expiry, so
 * no session/CSRF is involved — exactly like the production S3 flow where the
 * browser follows a presigned URL directly. Production (STORAGE_PROVIDER=s3)
 * never mounts this router and never issues these URLs.
 */

function verifySignature(req: Request, action: 'download' | 'upload'): { key: string; disposition: 'attachment' | 'inline' } {
  const key = Buffer.from(req.params.key ?? '', 'base64url').toString('utf8');
  const expires = Number(req.query.expires);
  const sig = String(req.query.sig ?? '');
  if (!key || !Number.isFinite(expires) || !sig)
    throw Object.assign(new Error('Invalid storage URL.'), { statusCode: 400 });
  if (expires < Math.floor(Date.now() / 1000))
    throw Object.assign(new Error('This download link has expired.'), { statusCode: 410 });
  const expected = createHmac('sha256', env.TOKEN_PEPPER)
    .update(`${action}|${key}|${expires}`)
    .digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw Object.assign(new Error('Invalid storage URL signature.'), { statusCode: 403 });
  const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
  return { key, disposition };
}

export const storageObjectsRoutes = Router();

storageObjectsRoutes.get('/objects/:key', async (req: Request, res: Response) => {
  const { key, disposition } = verifySignature(req, 'download');
  const body = await storageService.getObject(key);
  if (!body) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stored object not found.' } });
    return;
  }
  const head = await storageService.headObject(key);
  const fileName = String(req.query.filename ?? 'file').replace(/["\\]/g, '_');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${encodeURIComponent(fileName).replace(/["']/g, '')}"`,
  );
  res.setHeader('Content-Type', head?.contentType ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(body.length));
  res.status(200).end(body);
});

storageObjectsRoutes.put('/objects/:key', async (req: Request, res: Response) => {
  const { key } = verifySignature(req, 'upload');
  const contentType = String(req.query.contentType ?? 'application/octet-stream');
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const limit = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (body.length > limit) {
    res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Upload exceeds the size limit.' } });
    return;
  }
  await storageService.putObject({ key, body, contentType });
  res.status(200).json({ success: true, data: { key, size: body.length } });
});
