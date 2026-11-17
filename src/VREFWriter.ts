/**
 * VREFWriter - Creates .vref files
 * Harpia AI Research
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import AdmZip from 'adm-zip';
import {
  VREFManifest,
  VREFCreateOptions,
  VREFUrlOptions,
  ImageMetadata,
  SUPPORTED_IMAGE_FORMATS,
} from './types';
import { canonicalJson, omitKeys } from './utils';

export class VREFWriter {
  private images: Map<string, Buffer> = new Map();
  private options: VREFCreateOptions;
  private sealKey?: string;

  constructor(options: VREFCreateOptions) {
    this.options = options;
  }

  /**
   * Add an image from a file path
   */
  addImageFromFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    this.addImage(fileName, buffer);
  }

  /**
   * Add an image from a buffer
   */
  addImage(fileName: string, buffer: Buffer): void {
    const ext = path.extname(fileName).toLowerCase().slice(1);
    
    if (!this.isValidImageFormat(ext)) {
      throw new Error(
        `Unsupported format: ${ext}. Only images are allowed: ${SUPPORTED_IMAGE_FORMATS.join(', ')}`
      );
    }

    // Validate that it's actually an image by checking magic bytes
    if (!this.isValidImageBuffer(buffer, ext)) {
      throw new Error(`File ${fileName} does not appear to be a valid ${ext} image`);
    }

    // Images are keyed by their file name; duplicate names would silently
    // overwrite each other in the archive, so reject them explicitly.
    if (this.images.has(fileName)) {
      throw new Error(
        `Duplicate image name: ${fileName}. Image names must be unique within a .vref pack.`
      );
    }

    this.images.set(fileName, buffer);
  }

  /**
   * Set an Ed25519 private key (PEM) so the next write() signs the manifest.
   */
  seal(privateKeyPem: string): void {
    this.sealKey = privateKeyPem;
  }

  /**
   * Download an image from a URL (or data: URL) and add it to the pack.
   *
   * Returns the file name under which the image was added. Supports retries
   * with exponential backoff, per-attempt timeout, a maximum size, and a
   * file-name template ({index}, {basename}).
   */
  async addImageFromUrl(url: string, options: VREFUrlOptions = {}): Promise<string> {
    const timeoutMs = options.timeoutMs ?? 30000;
    const retries = options.retries ?? 0;
    const maxBytes = options.maxBytes;

    if (!url) {
      throw new Error('Invalid URL: empty');
    }

    // data: URL support (e.g. pasted from clipboard/HTML)
    if (url.startsWith('data:')) {
      const { buffer, mime } = this.parseDataUrl(url);
      const fileName = this.buildFileNameFromUrlOrMime('', mime, options);
      this.addImage(fileName, buffer);
      return fileName;
    }

    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`Invalid URL: ${url}`);
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
          response = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          throw new Error(
            `Failed to download ${url}: HTTP ${response.status} ${response.statusText}`
          );
        }

        const contentLength = Number(response.headers.get('content-length'));
        if (maxBytes && !Number.isNaN(contentLength) && contentLength > maxBytes) {
          throw new Error(`Skipping ${url}: exceeds size limit (${maxBytes} bytes)`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (maxBytes && buffer.length > maxBytes) {
          throw new Error(`Skipping ${url}: exceeds size limit (${maxBytes} bytes)`);
        }

        const fileName = this.buildFileNameFromUrlOrMime(
          url,
          response.headers.get('content-type') || '',
          options
        );
        this.addImage(fileName, buffer);
        return fileName;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise(resolve =>
            setTimeout(resolve, Math.min(1000 * 2 ** attempt, 8000))
          );
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Add multiple images from a directory
   */
  addImagesFromDirectory(dirPath: string, recursive: boolean = false): void {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        this.addImagesFromDirectory(fullPath, recursive);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase().slice(1);
        if (this.isValidImageFormat(ext)) {
          try {
            this.addImageFromFile(fullPath);
          } catch (error) {
            console.warn(`Skipping ${entry.name}: ${error}`);
          }
        }
      }
    }
  }

  /**
   * Write the .vref file
   */
  write(outputPath: string): void {
    if (this.images.size === 0) {
      throw new Error('No images added. Cannot create empty .vref file.');
    }

    const zip = new AdmZip();
    const imageMetadataList: ImageMetadata[] = [];

    // Add all images to ZIP
    for (const [fileName, buffer] of this.images) {
      zip.addFile(fileName, buffer);

      const ext = path.extname(fileName).toLowerCase().slice(1);
      const dimensions = this.getImageDimensions(buffer, ext);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      imageMetadataList.push({
        path: fileName,
        format: ext,
        size: buffer.length,
        width: dimensions?.width,
        height: dimensions?.height,
        sha256,
      });
    }

    // Merkle-style root over all image hashes (ordered by path)
    const contentHash = crypto.createHash('sha256');
    for (const img of [...imageMetadataList].sort((a, b) => a.path.localeCompare(b.path))) {
      contentHash.update(`${img.path}\0${img.sha256}`);
    }

    // Create manifest
    const manifest: VREFManifest = {
      version: '1.1.0',
      format: 'VREF',
      fileName: this.options.fileName || path.basename(outputPath),
      imageCount: this.images.size,
      images: imageMetadataList,
      imageContentHash: contentHash.digest('hex'),
      createdAt: new Date().toISOString(),
      ...(this.options.parentVersion ? { parentVersion: this.options.parentVersion } : {}),
      metadata: {
        name: this.options.name,
        description: this.options.description,
        tags: this.options.tags,
        author: this.options.author,
        license: this.options.license,
        ...this.options.metadata,
      },
    };

    // Optional Ed25519 signature over the canonical manifest
    let manifestToWrite: VREFManifest = manifest;
    if (this.sealKey) {
      const privateKey = crypto.createPrivateKey(this.sealKey);
      const publicKeyPem = crypto
        .createPublicKey(privateKey)
        .export({ type: 'spki', format: 'pem' })
        .toString();
      const baseManifest = omitKeys(manifest, ['signature', 'publicKey']);
      const signature = crypto.sign(null, Buffer.from(canonicalJson(baseManifest)), privateKey);
      manifestToWrite = {
        ...manifest,
        publicKey: publicKeyPem,
        signature: signature.toString('base64'),
      };
    }

    // Add manifest as JSON
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifestToWrite, null, 2)));

    // Write ZIP file
    zip.writeZip(outputPath);
  }

  /**
   * Validate image format
   */
  private isValidImageFormat(format: string): boolean {
    return SUPPORTED_IMAGE_FORMATS.includes(format as any);
  }

  /**
   * Validate image buffer by checking magic bytes
   */
  private isValidImageBuffer(buffer: Buffer, format: string): boolean {
    if (!buffer || buffer.length < 8) return false;

    switch (format.toLowerCase()) {
      case 'png':
        return (
          buffer.length >= 8 &&
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47
        );
      
      case 'jpg':
      case 'jpeg':
        return (
          buffer.length >= 3 &&
          buffer[0] === 0xff &&
          buffer[1] === 0xd8 &&
          buffer[2] === 0xff
        );
      
      case 'gif':
        return (
          buffer.length >= 6 &&
          buffer[0] === 0x47 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x38 &&
          (buffer[4] === 0x37 || buffer[4] === 0x39) &&
          buffer[5] === 0x61
        );
      
      case 'webp':
        return (
          buffer.length >= 12 &&
          buffer[0] === 0x52 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x46 &&
          buffer[8] === 0x57 &&
          buffer[9] === 0x45 &&
          buffer[10] === 0x42 &&
          buffer[11] === 0x50
        );
      
      case 'avif':
        if (buffer.length < 16) return false;
        const ftypBox = buffer.toString('ascii', 4, 8);
        if (ftypBox !== 'ftyp') return false;
        const majorBrand = buffer.toString('ascii', 8, 12);
        if (majorBrand === 'avif' || majorBrand === 'avis') return true;
        const headerSlice = buffer.subarray(12, Math.min(buffer.length, 64)).toString('ascii');
        return headerSlice.includes('avif') || headerSlice.includes('avis');
      
      default:
        return false;
    }
  }

  /**
   * Get image dimensions (supports PNG, JPEG, GIF, WebP)
   */
  private getImageDimensions(buffer: Buffer, format: string): { width: number; height: number } | undefined {
    try {
      if (format === 'png' && buffer.length >= 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }

      if ((format === 'jpg' || format === 'jpeg') && buffer.length >= 4) {
        let offset = 2;
        while (offset < buffer.length) {
          if (buffer[offset] !== 0xff) break;
          
          const marker = buffer[offset + 1];
          offset += 2;

          if (marker === 0xc0 || marker === 0xc2) {
            const height = buffer.readUInt16BE(offset + 3);
            const width = buffer.readUInt16BE(offset + 5);
            return { width, height };
          }

          const segmentLength = buffer.readUInt16BE(offset);
          offset += segmentLength;
        }
      }

      if (format === 'gif' && buffer.length >= 10) {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return { width, height };
      }

      if (format === 'webp' && buffer.length >= 30) {
        const chunkType = buffer.toString('ascii', 12, 16);
        if (chunkType === 'VP8 ' && buffer.length >= 30) {
          const width = buffer.readUInt16LE(26) & 0x3fff;
          const height = buffer.readUInt16LE(28) & 0x3fff;
          return { width, height };
        } else if (chunkType === 'VP8L' && buffer.length >= 25) {
          const b1 = buffer[21];
          const b2 = buffer[22];
          const b3 = buffer[23];
          const b4 = buffer[24];
          const width = 1 + (((b2 & 0x3f) << 8) | b1);
          const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
          return { width, height };
        } else if (chunkType === 'VP8X' && buffer.length >= 30) {
          const width = 1 + buffer.readUIntLE(24, 3);
          const height = 1 + buffer.readUIntLE(27, 3);
          return { width, height };
        }
      }
    } catch (error) {
      // If dimension extraction fails, just return undefined
      return undefined;
    }

    return undefined;
  }

  /**
   * Build the final image file name for a download, honoring the template.
   */
  private buildFileNameFromUrlOrMime(
    url: string,
    contentType: string,
    options: VREFUrlOptions
  ): string {
    // Derive a base name (without extension) from the URL path when possible
    let base = 'image';
    let urlExt = '';
    try {
      if (!url.startsWith('data:')) {
        const pathname = new URL(url).pathname;
        const lastSegment = pathname.split('/').filter(Boolean).pop();
        if (lastSegment) {
          const decoded = decodeURIComponent(lastSegment);
          const dot = decoded.lastIndexOf('.');
          if (dot > 0) {
            base = decoded.slice(0, dot);
            urlExt = decoded.slice(dot + 1).toLowerCase();
          } else {
            base = decoded;
          }
        }
      }
    } catch {
      // fall through
    }

    const fallbackExt = this.extFromContentType(contentType);
    const ext = urlExt || fallbackExt;

    let fileName = base;
    if (options.fileNameTemplate) {
      fileName = options.fileNameTemplate
        .replace(/\{index\}/g, String(options.index ?? 1))
        .replace(/\{basename\}/g, base);
    }

    const currentExt = path.extname(fileName).toLowerCase().slice(1);
    if (!currentExt && ext) {
      fileName = `${fileName}.${ext}`;
    }
    if (!currentExt && !ext) {
      throw new Error(
        `Cannot determine image format: use a URL with an image extension or a supported Content-Type`
      );
    }

    return fileName;
  }

  /**
   * Parse a data: URL into its buffer and MIME type.
   */
  private parseDataUrl(url: string): { buffer: Buffer; mime: string } {
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
    if (!match) {
      throw new Error('Invalid data URL');
    }
    const mime = (match[1] || '').toLowerCase();
    const isBase64 = Boolean(match[2]);
    const payload = match[3];
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    if (!mime) {
      throw new Error('Cannot determine image format from data URL');
    }
    return { buffer, mime };
  }

  /**
   * Map an HTTP Content-Type to a supported image extension, or ''.
   */
  private extFromContentType(contentType: string): string {
    const type = contentType.toLowerCase().split(';')[0].trim();
    const extByType: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
    };
    return extByType[type] || '';
  }

  /**
   * Get current image count
   */
  getImageCount(): number {
    return this.images.size;
  }

  /**
   * Clear all images
   */
  clear(): void {
    this.images.clear();
  }
}
