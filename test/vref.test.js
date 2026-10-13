const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { VREFWriter, VREFReader } = require('../dist/index.js');

describe('VREF Library Tests', () => {
  const tmpDir = path.join(__dirname, 'temp_test_env');
  const sampleVrefPath = path.join(tmpDir, 'test_output.vref');
  const extractDir = path.join(tmpDir, 'extracted');

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

  before(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  after(() => {
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
    assert.strictEqual(manifest.version, '1.0.2');
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
});
