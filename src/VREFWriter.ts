/**
 * VREFWriter - Creates .vref files
 * Harpia AI Research
 */

import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import {
  VREFManifest,
  VREFCreateOptions,
  ImageMetadata,
  SUPPORTED_IMAGE_FORMATS,
} from './types';

export class VREFWriter {
  private images: Map<string, Buffer> = new Map();
  private options: VREFCreateOptions;

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

    this.images.set(fileName, buffer);
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

      imageMetadataList.push({
        path: fileName,
        format: ext,
        size: buffer.length,
        width: dimensions?.width,
        height: dimensions?.height,
      });
    }

    // Create manifest
    const manifest: VREFManifest = {
      version: '1.0.0',
      format: 'VREF',
      fileName: path.basename(outputPath),
      imageCount: this.images.size,
      images: imageMetadataList,
      createdAt: new Date().toISOString(),
      metadata: {
        description: this.options.description,
        tags: this.options.tags,
        author: this.options.author,
        license: this.options.license,
        ...this.options.metadata,
      },
    };

    // Add manifest as JSON
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

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
    if (buffer.length < 8) return false;

    switch (format.toLowerCase()) {
      case 'png':
        return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      
      case 'jpg':
      case 'jpeg':
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      
      case 'gif':
        return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
      
      case 'webp':
        return buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
      
      case 'avif':
        // AVIF detection is more complex, but we can check for 'ftyp' box
        const ftypCheck = buffer.toString('ascii', 4, 8);
        return ftypCheck === 'ftyp';
      
      default:
        return false;
    }
  }

  /**
   * Get image dimensions (basic implementation for PNG and JPEG)
   */
  private getImageDimensions(buffer: Buffer, format: string): { width: number; height: number } | undefined {
    try {
      if (format === 'png' && buffer.length >= 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }

      if ((format === 'jpg' || format === 'jpeg') && buffer.length >= 4) {
        // Basic JPEG dimension extraction (simplified)
        // This is a simplified version; production code might use a library
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
    } catch (error) {
      // If dimension extraction fails, just return undefined
      return undefined;
    }

    return undefined;
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
