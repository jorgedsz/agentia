/**
 * Recording storage layer.
 *
 * On Railway we kept encrypted recordings on local disk (uploads/recordings/).
 * That works on a single always-running instance but breaks the moment we
 * scale or move to ephemeral container hosts (Lightsail / Fargate / etc.):
 * a container restart wipes the volume and the recordings vanish.
 *
 * When the S3-style env vars are set this module uploads each encrypted
 * recording to object storage (AWS S3, Lightsail Object Storage, DO Spaces —
 * anything S3-compatible) and serves reads as a stream. When the env vars are
 * NOT set it does nothing, and the caller falls back to its original disk
 * behavior — that keeps local dev and the current Railway deploy working
 * unchanged.
 *
 * Required env vars to activate object storage:
 *   RECORDINGS_S3_BUCKET   — bucket name (e.g. "sword-recordings")
 *   RECORDINGS_S3_REGION   — region (e.g. "us-east-1")
 *   AWS_ACCESS_KEY_ID      — credentials (standard AWS SDK lookup)
 *   AWS_SECRET_ACCESS_KEY  — credentials
 * Optional:
 *   RECORDINGS_S3_ENDPOINT — for non-AWS S3 (DO Spaces, MinIO, etc.). Leave
 *                            unset for AWS S3 and Lightsail Object Storage.
 *   RECORDINGS_S3_PREFIX   — folder prefix inside the bucket (default "")
 */

const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.RECORDINGS_S3_BUCKET || null;
const REGION = process.env.RECORDINGS_S3_REGION || 'us-east-1';
const ENDPOINT = process.env.RECORDINGS_S3_ENDPOINT || null;
const PREFIX = (process.env.RECORDINGS_S3_PREFIX || '').replace(/^\/+|\/+$/g, '');

let _client = null;
const getClient = () => {
  if (_client) return _client;
  const cfg = { region: REGION };
  if (ENDPOINT) {
    cfg.endpoint = ENDPOINT;
    cfg.forcePathStyle = true;  // MinIO and some S3-compat providers need this
  }
  _client = new S3Client(cfg);
  return _client;
};

const isConfigured = () => !!BUCKET;

const keyFor = (filename) => (PREFIX ? `${PREFIX}/${filename}` : filename);

/**
 * Upload an encrypted recording file to object storage.
 * Returns true on success, false if storage isn't configured.
 */
const uploadEncryptedRecording = async (localPath, filename) => {
  if (!isConfigured()) return false;
  const body = fs.createReadStream(localPath);
  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: keyFor(filename),
    Body: body,
    ContentType: 'application/octet-stream',
    Metadata: { encrypted: 'true' }
  }));
  return true;
};

/**
 * Check whether a recording exists in object storage.
 * Returns false if storage isn't configured (so callers fall back to disk).
 */
const remoteRecordingExists = async (filename) => {
  if (!isConfigured()) return false;
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyFor(filename) }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
};

/**
 * Return a readable stream of an encrypted recording from object storage.
 * The caller is responsible for decryption (same as with disk reads).
 */
const getEncryptedRecordingStream = async (filename) => {
  if (!isConfigured()) throw new Error('Recording storage not configured');
  const out = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: keyFor(filename) }));
  return out.Body;  // a Node.js Readable stream when running in Node
};

module.exports = {
  isConfigured,
  uploadEncryptedRecording,
  remoteRecordingExists,
  getEncryptedRecordingStream
};
