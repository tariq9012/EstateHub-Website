// In-memory stand-in for the S3 client + presigner, so storage code is tested without Cloudflare credentials,
// the AWS SDK, or the network.
class Cmd {
  constructor(name, input) { this.name = name; this.input = input; }
}
const commands = Object.fromEntries(
  ['PutObjectCommand', 'GetObjectCommand', 'HeadObjectCommand', 'CopyObjectCommand', 'DeleteObjectCommand', 'HeadBucketCommand'].map(
    (n) => [n, class extends Cmd { constructor(input) { super(n, input); } }]
  )
);

function notFound() {
  const err = new Error('NotFound');
  err.name = 'NotFound';
  err.$metadata = { httpStatusCode: 404 };
  return err;
}

function makeFakeR2({ buckets = ['pub-bucket', 'priv-bucket'] } = {}) {
  const store = new Map(); // `${bucket}/${key}` -> { body, contentType }
  const calls = [];
  const client = {
    async send(cmd) {
      calls.push({ name: cmd.name, ...cmd.input });
      const { Bucket, Key } = cmd.input;
      switch (cmd.name) {
        case 'PutObjectCommand':
          store.set(`${Bucket}/${Key}`, { body: Buffer.from(cmd.input.Body || ''), contentType: cmd.input.ContentType });
          return {};
        case 'HeadObjectCommand': {
          const o = store.get(`${Bucket}/${Key}`);
          if (!o) throw notFound();
          return { ContentLength: o.body.length, ContentType: o.contentType };
        }
        case 'GetObjectCommand': {
          const o = store.get(`${Bucket}/${Key}`);
          if (!o) throw notFound();
          let body = o.body;
          const m = /^bytes=(\d+)-(\d+)$/.exec(cmd.input.Range || '');
          if (m) body = body.subarray(Number(m[1]), Number(m[2]) + 1);
          return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
        }
        case 'CopyObjectCommand': {
          const src = store.get(cmd.input.CopySource);
          if (!src) throw notFound();
          store.set(`${Bucket}/${Key}`, { ...src });
          return {};
        }
        case 'DeleteObjectCommand':
          store.delete(`${Bucket}/${Key}`);
          return {};
        case 'HeadBucketCommand':
          if (!buckets.includes(Bucket)) throw notFound();
          return {};
        default:
          throw new Error(`unhandled ${cmd.name}`);
      }
    },
  };
  const signUrl = async (c, command, { expiresIn }) =>
    `https://r2.test/${command.input.Bucket}/${command.input.Key}?X-Amz-Expires=${expiresIn}&X-Amz-Signature=sig`;
  return { client, signUrl, commands, store, calls, has: (bucket, key) => store.has(`${bucket}/${key}`) };
}

// Minimal real file signatures (the validators read the leading bytes).
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

module.exports = { makeFakeR2, PNG, JPEG, PDF, HTML };
