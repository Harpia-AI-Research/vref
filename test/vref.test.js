const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { VREFWriter, VREFReader } = require('../dist/index.js');

describe('VREF Library Tests', () => {
  const tmpDir = path.join(__dirname, 'temp_test_env');
  const sampleVrefPath = path.join(tmpDir, 'test_output.vref');
  const extractDir = path.join(tmpDir, 'extracted');

  let server;
  let baseUrl;
  let flakyCount = 0;
  let slowCount = 0;

  // Minimal valid 1x1 PNG (67 bytes)
  const valid1x1Png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360606060000000050001a7e284050000000049454e44ae426082',
    'hex'
  );

  // Minimal valid 1x1 GIF (35 bytes)
  const valid1x1Gif = Buffer.from(
    '47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b',
    'hex'
  );

  before(async () => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Local HTTP server to test VREFWriter.addImageFromUrl
    server = http.createServer((req, res) => {
      if (req.url === '/pixel.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(valid1x1Png);
      } else if (req.url === '/pixel.gif') {
        res.writeHead(200, { 'Content-Type': 'image/gif' });
        res.end(valid1x1Gif);
      } else if (req.url === '/noext') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(valid1x1Png);
      } else if (req.url === '/missing.png') {
        res.writeHead(404);
        res.end('Not found');
      } else if (req.url === '/flaky.png') {
        flakyCount++;
        if (flakyCount === 1) {
          res.writeHead(500);
          res.end('boom');
        } else {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(valid1x1Png);
        }
      } else if (req.url === '/slow.png') {
        slowCount++;
        // Never respond, so the client's timeout aborts the request.
      } else if (req.url === '/big.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.concat([valid1x1Png, Buffer.alloc(4096)]));
      } else {
        res.writeHead(400);
        res.end('Bad request');
      }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    if (server) server.close();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('VREFWriter validates magic bytes and rejects corrupted image buffers', () => {
    const writer = new VREFWriter({ fileName: 'test.vref' });
    const fakePng = Buffer.from('this is just text and not a png image');

    assert.throws(
      () => {
        writer.addImage('fake.png', fakePng);
      },
      /does not appear to be a valid png image/,
      'Should throw an error for fake PNG magic bytes'
    );
  });

  test('VREFWriter rejects unsupported file extensions', () => {
    const writer = new VREFWriter({ fileName: 'test.vref' });
    const dummyBuffer = Buffer.from('hello');

    assert.throws(
      () => {
        writer.addImage('document.pdf', dummyBuffer);
      },
      /Unsupported format/,
      'Should throw an error for non-image formats'
    );
  });

  test('VREFWriter rejects duplicate image names', () => {
    const writer = new VREFWriter({ fileName: 'test.vref' });
    writer.addImage('pixel.png', valid1x1Png);

    assert.throws(
      () => {
        writer.addImage('pixel.png', valid1x1Png);
      },
      /Duplicate image name/,
      'Should throw an error when adding an image with an existing name'
    );
  });

  test('VREFWriter creates a valid .vref file with metadata and image dimensions', () => {
    const writer = new VREFWriter({
      name: 'Test Reference Pack',
      description: 'A test pack of curated references',
      tags: ['test', 'unit-test'],
      author: 'Antigravity Test Suite',
      license: 'MIT',
    });

    writer.addImage('pixel.png', valid1x1Png);
    writer.addImage('pixel.gif', valid1x1Gif);

    assert.strictEqual(writer.getImageCount(), 2);

    writer.write(sampleVrefPath);
    assert.ok(fs.existsSync(sampleVrefPath), 'The .vref file should be written to disk');
  });

  test('VREFReader validates the created .vref file successfully', () => {
    const validation = VREFReader.validate(sampleVrefPath);
    assert.strictEqual(validation.valid, true, 'File should be valid');
    assert.strictEqual(validation.errors.length, 0);
  });

  test('VREFReader reads manifest and metadata correctly', () => {
    const manifest = VREFReader.readManifest(sampleVrefPath);

    assert.strictEqual(manifest.format, 'VREF');
    assert.strictEqual(manifest.version, '1.1.0');
    assert.strictEqual(manifest.imageCount, 2);
    assert.strictEqual(manifest.metadata?.name, 'Test Reference Pack');
    assert.strictEqual(manifest.metadata?.author, 'Antigravity Test Suite');
    assert.deepStrictEqual(manifest.metadata?.tags, ['test', 'unit-test']);

    // Check that dimensions were parsed
    const pngInfo = manifest.images.find(img => img.path === 'pixel.png');
    assert.ok(pngInfo);
    assert.strictEqual(pngInfo.width, 1);
    assert.strictEqual(pngInfo.height, 1);

    const gifInfo = manifest.images.find(img => img.path === 'pixel.gif');
    assert.ok(gifInfo);
    assert.strictEqual(gifInfo.width, 1);
    assert.strictEqual(gifInfo.height, 1);
  });

  test('VREFReader reads file with validate: true and sample/getImage methods', () => {
    const result = VREFReader.read(sampleVrefPath, {
      validate: true,
      loadImages: true,
    });

    assert.strictEqual(result.manifest.imageCount, 2);

    const img1 = result.getImage('pixel.png');
    assert.ok(img1 instanceof Buffer);
    assert.strictEqual(img1.length, valid1x1Png.length);

    const sample = result.sample(1);
    assert.strictEqual(sample.length, 1);
    assert.ok(sample[0] instanceof Buffer);
  });

  test('VREFReader extracts files correctly', () => {
    VREFReader.extract(sampleVrefPath, extractDir);

    assert.ok(fs.existsSync(path.join(extractDir, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(extractDir, 'pixel.png')));
    assert.ok(fs.existsSync(path.join(extractDir, 'pixel.gif')));
  });

  test('VREFWriter downloads images from URLs', async () => {
    const writer = new VREFWriter({ fileName: 'url.vref' });
    await writer.addImageFromUrl(`${baseUrl}/pixel.png`);
    await writer.addImageFromUrl(`${baseUrl}/pixel.gif`);
    await writer.addImageFromUrl(`${baseUrl}/noext`);

    assert.strictEqual(writer.getImageCount(), 3);

    const outPath = path.join(tmpDir, 'url_output.vref');
    writer.write(outPath);

    const manifest = VREFReader.readManifest(outPath);
    const paths = manifest.images.map(img => img.path);
    assert.ok(paths.includes('pixel.png'));
    assert.ok(paths.includes('pixel.gif'));
    assert.ok(paths.includes('noext.png'), 'Should infer .png from Content-Type when URL has no extension');
  });

  test('VREFWriter addImageFromUrl rejects failed downloads', async () => {
    const writer = new VREFWriter({ fileName: 'url.vref' });

    await assert.rejects(
      () => writer.addImageFromUrl(`${baseUrl}/missing.png`),
      /HTTP 404/
    );

    await assert.rejects(
      () => writer.addImageFromUrl('not-a-url'),
      /Invalid URL/
    );

    assert.strictEqual(writer.getImageCount(), 0);
  });

  test('VREFReader computes diff between two packs', () => {
    const packA = path.join(tmpDir, 'a.vref');
    const packB = path.join(tmpDir, 'b.vref');

    const wa = new VREFWriter({});
    wa.addImage('pixel.png', valid1x1Png);
    wa.addImage('pixel.gif', valid1x1Gif);
    wa.write(packA);

    const wb = new VREFWriter({});
    wb.addImage('pixel.png', valid1x1Png); // unchanged
    wb.addImage('new.png', valid1x1Png);   // added
    wb.write(packB);

    const result = VREFReader.diff(packA, packB);

    assert.strictEqual(result.unchanged, 1);
    assert.strictEqual(result.added.length, 1);
    assert.strictEqual(result.added[0].path, 'new.png');
    assert.strictEqual(result.removed.length, 1);
    assert.strictEqual(result.removed[0].path, 'pixel.gif');
    assert.strictEqual(result.modified.length, 0);
  });

  test('VREFReader detects modified images by content hash', () => {
    const packA = path.join(tmpDir, 'mod_a.vref');
    const packB = path.join(tmpDir, 'mod_b.vref');

    // Still a valid PNG (magic bytes intact, extra trailing bytes ignored)
    const alteredPng = Buffer.concat([valid1x1Png, Buffer.from([0x00, 0x00])]);

    const wa = new VREFWriter({});
    wa.addImage('pixel.png', valid1x1Png);
    wa.write(packA);

    const wb = new VREFWriter({});
    wb.addImage('pixel.png', alteredPng);
    wb.write(packB);

    const result = VREFReader.diff(packA, packB);

    assert.strictEqual(result.modified.length, 1);
    assert.strictEqual(result.modified[0].path, 'pixel.png');
    assert.strictEqual(result.modified[0].beforeSize, valid1x1Png.length);
    assert.strictEqual(result.modified[0].afterSize, alteredPng.length);
    assert.strictEqual(result.unchanged, 0);
    assert.strictEqual(result.added.length, 0);
    assert.strictEqual(result.removed.length, 0);
  });

  test('VREFWriter records parentVersion in manifest', () => {
    const writer = new VREFWriter({ fileName: 'pv.vref', parentVersion: '1.0.2' });
    writer.addImage('pixel.png', valid1x1Png);

    const out = path.join(tmpDir, 'pv.vref');
    writer.write(out);

    const manifest = VREFReader.readManifest(out);
    assert.strictEqual(manifest.parentVersion, '1.0.2');
  });

  test('VREFWriter records sha256 hashes and imageContentHash', () => {
    const writer = new VREFWriter({ fileName: 'hash.vref' });
    writer.addImage('pixel.png', valid1x1Png);
    writer.addImage('pixel.gif', valid1x1Gif);

    const out = path.join(tmpDir, 'hash.vref');
    writer.write(out);

    const manifest = VREFReader.readManifest(out);
    assert.strictEqual(manifest.images.length, 2);
    for (const img of manifest.images) {
      assert.ok(/^[a-f0-9]{64}$/.test(img.sha256), `sha256 expected for ${img.path}`);
    }
    assert.ok(/^[a-f0-9]{64}$/.test(manifest.imageContentHash));
  });

  test('VREFReader.verifyContent detects tampered images', () => {
    const writer = new VREFWriter({ fileName: 'content.vref' });
    writer.addImage('pixel.png', valid1x1Png);
    const out = path.join(tmpDir, 'content.vref');
    writer.write(out);

    // Tamper with the stored image bytes (manifest is left untouched).
    const zip = new AdmZip(out);
    zip.updateFile('pixel.png', Buffer.concat([valid1x1Png, Buffer.from([0x01])]));
    zip.writeZip(out);

    const result = VREFReader.verifyContent(out);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('imageContentHash mismatch')));
  });

  test('VREFReader.extract refuses unsafe paths (zip-slip)', () => {
    // AdmZip sanitizes names on write, so craft the malicious name by patching
    // the raw bytes: "abcdefghijk" (11 chars) -> "../evil.txt" (11 chars).
    const evil = path.join(tmpDir, 'evil.vref');
    const zip = new AdmZip();
    zip.addFile('abcdefghijk', Buffer.from('evil'));
    zip.writeZip(evil);

    const raw = fs.readFileSync(evil);
    const patched = Buffer.from(raw.toString('latin1').split('abcdefghijk').join('../evil.txt'), 'latin1');
    fs.writeFileSync(evil, patched);

    assert.throws(
      () => VREFReader.extract(evil, path.join(tmpDir, 'evil_out')),
      /unsafe path/
    );
  });

  test('VREFWriter addImageFromUrl accepts data: URLs', async () => {
    const writer = new VREFWriter({ fileName: 'data.vref' });
    const dataUrl = `data:image/png;base64,${valid1x1Png.toString('base64')}`;

    const name = await writer.addImageFromUrl(dataUrl);
    assert.strictEqual(name, 'image.png');
    assert.strictEqual(writer.getImageCount(), 1);
  });

  test('VREFWriter addImageFromUrl retries transient failures', async () => {
    const writer = new VREFWriter({ fileName: 'retry.vref' });
    const name = await writer.addImageFromUrl(`${baseUrl}/flaky.png`, { retries: 2 });
    assert.strictEqual(name, 'flaky.png');
    assert.ok(flakyCount >= 2);
  });

  test('VREFWriter addImageFromUrl honors timeout', async () => {
    const writer = new VREFWriter({ fileName: 'timeout.vref' });
    await assert.rejects(
      () => writer.addImageFromUrl(`${baseUrl}/slow.png`, { timeoutMs: 150, retries: 0 }),
      /aborted|abort|fetch failed/i
    );
    assert.ok(slowCount >= 1);
  });

  test('VREFWriter addImageFromUrl enforces maxBytes', async () => {
    const writer = new VREFWriter({ fileName: 'limit.vref' });
    await assert.rejects(
      () => writer.addImageFromUrl(`${baseUrl}/big.png`, { maxBytes: 1024 }),
      /size limit/
    );
    assert.strictEqual(writer.getImageCount(), 0);
  });

  test('VREFWriter addImageFromUrl applies fileNameTemplate', async () => {
    const writer = new VREFWriter({ fileName: 'template.vref' });
    const name = await writer.addImageFromUrl(`${baseUrl}/pixel.png`, {
      fileNameTemplate: 'r{index}-{basename}',
      index: 7,
    });
    assert.strictEqual(name, 'r7-pixel.png');
  });

  test('VREFReader.seal and verify round-trip (Ed25519)', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const writer = new VREFWriter({ fileName: 'signed.vref', name: 'Original' });
    writer.addImage('pixel.png', valid1x1Png);
    const unsigned = path.join(tmpDir, 'unsigned.vref');
    writer.write(unsigned);

    const signed = path.join(tmpDir, 'signed.vref');
    VREFReader.seal(unsigned, privatePem, signed);

    const v = VREFReader.verify(signed);
    assert.strictEqual(v.valid, true);
    assert.ok(v.signer);

    const v2 = VREFReader.verify(signed, publicPem);
    assert.strictEqual(v2.valid, true);

    // Tamper with the manifest, then verification must fail.
    const zip = new AdmZip(signed);
    const manifest = JSON.parse(zip.getEntry('manifest.json').getData().toString('utf8'));
    manifest.metadata.name = 'Tampered';
    zip.deleteFile('manifest.json');
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.writeZip(signed);

    const tampered = VREFReader.verify(signed);
    assert.strictEqual(tampered.valid, false);
    assert.ok(tampered.errors.some(e => e.includes('verification failed')));
  });

  test('VREFReader.verify rejects unsigned manifests', () => {
    const writer = new VREFWriter({ fileName: 'plain.vref' });
    writer.addImage('pixel.png', valid1x1Png);
    const out = path.join(tmpDir, 'plain.vref');
    writer.write(out);

    const result = VREFReader.verify(out);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('not signed')));
  });
});
