/**
 * VREFReader - Reads .vref files
 * Harpia AI Research
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import AdmZip from 'adm-zip';
import {
  VREFManifest,
  VREFReadOptions,
  VREFReadResult,
  VREFDiffResult,
  VREFDiffModified,
  VREFVerifyResult,
  ImageMetadata,
} from './types';
import { canonicalJson, omitKeys } from './utils';

export class VREFReader {
  /**
   * Read a .vref file
   */
  static read(filePath: string, options: VREFReadOptions = {}): VREFReadResult {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (options.validate) {
      const validation = VREFReader.validate(filePath);
      if (!validation.valid) {
        throw new Error(`Invalid .vref file: ${validation.errors.join(', ')}`);
      }
    }

    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    // Find and parse manifest
    const manifestEntry = zipEntries.find(entry => entry.entryName === 'manifest.json');
    if (!manifestEntry) {
      throw new Error('Invalid .vref file: manifest.json not found');
    }

    const manifestData = manifestEntry.getData().toString('utf8');
    const manifest: VREFManifest = JSON.parse(manifestData);

    // Validate manifest
    if (manifest.format !== 'VREF') {
      throw new Error('Invalid .vref file: incorrect format identifier');
    }

    // Load images if requested
    const images = new Map<string, Buffer>();
    if (options.loadImages) {
      for (const imageInfo of manifest.images) {
        const entry = zipEntries.find(e => e.entryName === imageInfo.path);
        if (entry) {
          images.set(imageInfo.path, entry.getData());
        }
      }
    }

    // Helper function to get specific image
    const getImage = (path: string): Buffer | undefined => {
      if (images.has(path)) {
        return images.get(path);
      }

      // Load on-demand if not already loaded
      const entry = zipEntries.find(e => e.entryName === path);
      if (entry) {
        const buffer = entry.getData();
        images.set(path, buffer);
        return buffer;
      }

      return undefined;
    };

    // Helper function to sample N random images
    const sample = (count: number): Buffer[] => {
      const imagePaths = manifest.images.map(img => img.path);
      const sampledPaths: string[] = [];
      
      // Fisher-Yates shuffle for random sampling
      const shuffled = [...imagePaths];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Take first N
      const selected = shuffled.slice(0, Math.min(count, shuffled.length));

      // Load and return buffers
      return selected.map(path => {
        const buffer = getImage(path);
        if (!buffer) {
          throw new Error(`Failed to load image: ${path}`);
        }
        return buffer;
      });
    };

    return {
      manifest,
      images: options.loadImages ? images : undefined,
      sample,
      getImage,
    };
  }

  /**
   * Read only the manifest without loading images
   */
  static readManifest(filePath: string): VREFManifest {
    const result = VREFReader.read(filePath, { loadImages: false });
    return result.manifest;
  }

  /**
   * Validate a .vref file
   */
  static validate(filePath: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      if (!fs.existsSync(filePath)) {
        errors.push('File does not exist');
        return { valid: false, errors };
      }

      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();

      // Check for manifest
      const manifestEntry = zipEntries.find(entry => entry.entryName === 'manifest.json');
      if (!manifestEntry) {
        errors.push('manifest.json not found');
        return { valid: false, errors };
      }

      // Parse manifest
      let manifest: VREFManifest;
      try {
        const manifestData = manifestEntry.getData().toString('utf8');
        manifest = JSON.parse(manifestData);
      } catch (error) {
        errors.push('Failed to parse manifest.json');
        return { valid: false, errors };
      }

      // Validate format
      if (manifest.format !== 'VREF') {
        errors.push('Invalid format identifier (expected "VREF")');
      }

      // Validate version
      if (!manifest.version) {
        errors.push('Missing version field');
      }

      // Validate image count
      const actualImageCount = zipEntries.filter(e => e.entryName !== 'manifest.json').length;
      if (manifest.imageCount !== actualImageCount) {
        errors.push(`Image count mismatch: manifest says ${manifest.imageCount}, found ${actualImageCount}`);
      }

      // Validate all images listed in manifest exist
      for (const imageInfo of manifest.images) {
        const entry = zipEntries.find(e => e.entryName === imageInfo.path);
        if (!entry) {
          errors.push(`Image listed in manifest not found: ${imageInfo.path}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(`Unexpected error: ${error}`);
      return { valid: false, errors };
    }
  }

  /**
   * Verify that the manifest's imageContentHash matches the actual image
   * contents. Detects tampering with any image in the archive.
   */
  static verifyContent(filePath: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    try {
      const result = VREFReader.read(filePath, { loadImages: true });
      const manifest = result.manifest;

      if (!manifest.imageContentHash) {
        return { valid: false, errors: ['Manifest has no imageContentHash'] };
      }

      const hashes = new Map<string, string>();
      for (const info of manifest.images) {
        const buffer = result.images?.get(info.path);
        if (!buffer) {
          errors.push(`Missing image: ${info.path}`);
          continue;
        }
        hashes.set(info.path, crypto.createHash('sha256').update(buffer).digest('hex'));
      }

      const chain = crypto.createHash('sha256');
      for (const [p, h] of [...hashes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        chain.update(`${p}\0${h}`);
      }

      const computed = chain.digest('hex');
      if (computed !== manifest.imageContentHash) {
        errors.push('imageContentHash mismatch: an image was modified');
      }
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Sign an existing .vref manifest with an Ed25519 private key (PEM).
   * Writes to outputPath (default: overwrite the input file).
   */
  static seal(filePath: string, privateKeyPem: string, outputPath?: string): void {
    const zip = new AdmZip(filePath);
    const manifestEntry = zip.getEntries().find(entry => entry.entryName === 'manifest.json');
    if (!manifestEntry) {
      throw new Error('manifest.json not found');
    }

    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKeyPem = crypto
      .createPublicKey(privateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString();

    const baseManifest = omitKeys(manifest, ['signature', 'publicKey']);
    const signature = crypto.sign(null, Buffer.from(canonicalJson(baseManifest)), privateKey);

    manifest.publicKey = publicKeyPem;
    manifest.signature = signature.toString('base64');

    zip.deleteFile('manifest.json');
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.writeZip(outputPath || filePath);
  }

  /**
   * Verify an Ed25519 signature on a .vref manifest.
   * Uses the embedded public key unless one is provided.
   */
  static verify(filePath: string, publicKeyPem?: string): VREFVerifyResult {
    const errors: string[] = [];
    try {
      const zip = new AdmZip(filePath);
      const manifestEntry = zip.getEntries().find(entry => entry.entryName === 'manifest.json');
      if (!manifestEntry) {
        throw new Error('manifest.json not found');
      }

      const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      if (!manifest.signature) {
        return { valid: false, errors: ['Manifest is not signed'] };
      }

      const keyPem = publicKeyPem || manifest.publicKey;
      if (!keyPem) {
        return {
          valid: false,
          errors: ['No public key available: pass -k or sign with an embedded key'],
        };
      }

      const baseManifest = omitKeys(manifest, ['signature', 'publicKey']);
      const ok = crypto.verify(
        null,
        Buffer.from(canonicalJson(baseManifest)),
        crypto.createPublicKey(keyPem),
        Buffer.from(manifest.signature, 'base64')
      );

      if (!ok) {
        errors.push('Signature verification failed');
      }

      const fingerprint = crypto.createHash('sha256').update(keyPem).digest('hex').slice(0, 16);
      return { valid: errors.length === 0, errors, signer: fingerprint };
    } catch (error: any) {
      errors.push(error?.message || String(error));
      return { valid: false, errors };
    }
  }

  /**
   * Compare two .vref files and report images that were added, removed,
   * or modified (by content hash). Useful for versioning and updates.
   */
  static diff(fileAPath: string, fileBPath: string): VREFDiffResult {
    const a = VREFReader.read(fileAPath, { loadImages: true });
    const b = VREFReader.read(fileBPath, { loadImages: true });

    const hashOf = (buffer: Buffer): string =>
      crypto.createHash('sha256').update(buffer).digest('hex');

    // Prefer the manifest hash when present; fall back to hashing the buffer.
    const hashOfImage = (info: ImageMetadata, images: Map<string, Buffer> | undefined): string | undefined => {
      if (info.sha256) return info.sha256;
      const buffer = images?.get(info.path);
      return buffer ? hashOf(buffer) : undefined;
    };

    const aByPath = new Map<string, ImageMetadata>(
      a.manifest.images.map(img => [img.path, img])
    );
    const bByPath = new Map<string, ImageMetadata>(
      b.manifest.images.map(img => [img.path, img])
    );

    const added: ImageMetadata[] = [];
    const removed: ImageMetadata[] = [];
    const modified: VREFDiffModified[] = [];
    let unchanged = 0;

    for (const [path, infoB] of bByPath) {
      const infoA = aByPath.get(path);
      if (!infoA) {
        added.push(infoB);
        continue;
      }

      const hashA = hashOfImage(infoA, a.images);
      const hashB = hashOfImage(infoB, b.images);

      if (hashA === hashB) {
        unchanged++;
      } else {
        modified.push({
          path,
          beforeSize: infoA.size,
          afterSize: infoB.size,
          beforeHash: hashA,
          afterHash: hashB,
        });
      }
    }

    for (const [path] of aByPath) {
      if (!bByPath.has(path)) {
        removed.push(aByPath.get(path)!);
      }
    }

    return { added, removed, modified, unchanged };
  }

  /**
   * Extract all files from a .vref file to a target directory.
   * Entry names are sanitized to prevent path traversal (zip-slip).
   */
  static extract(filePath: string, targetDir: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const root = path.resolve(targetDir);
    fs.mkdirSync(root, { recursive: true });

    const zip = new AdmZip(filePath);
    for (const entry of zip.getEntries()) {
      const normalized = path.normalize(entry.entryName);
      const target = path.resolve(root, normalized);

      if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error(`Refusing to extract unsafe path: ${entry.entryName}`);
      }

      if (entry.isDirectory) {
        fs.mkdirSync(target, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, entry.getData());
      }
    }
  }
}

