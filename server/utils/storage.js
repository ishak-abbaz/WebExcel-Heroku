// server/utils/storage.js
const {
  S3Client, PutObjectCommand, GetObjectCommand,
  ListObjectsV2Command, DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
});

const Bucket = process.env.S3_BUCKET;

function saveFile(key, body, contentType) {
  return s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
}

function getFile(key) {
  return s3.send(new GetObjectCommand({ Bucket, Key: key }));
}

async function listKeys(prefix) {
  const keys = [];
  let ContinuationToken;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
    (res.Contents || []).forEach((o) => keys.push(o.Key));
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

async function deleteKeys(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const Objects = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
  }
}

// delete everything under a prefix except the keys in keepKeys
async function deletePrefixExcept(prefix, keepKeys = []) {
  const keep = new Set(keepKeys);
  const old = (await listKeys(prefix)).filter((k) => !keep.has(k));
  await deleteKeys(old);
}

// run an async function over items a few at a time
async function mapInBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

module.exports = { saveFile, getFile, listKeys, deleteKeys, deletePrefixExcept, mapInBatches };