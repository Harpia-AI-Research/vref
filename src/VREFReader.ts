/**
 * VREFReader - Reads .vref files
 * Harpia AI Research
 */

import * as fs from 'fs';
import AdmZip from 'adm-zip';
import {
  VREFManifest,
  VREFReadOptions,
  VREFReadResult,
} from './types';

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
   * Extract all files from a .vref file to a target directory
   */
  static extract(filePath: string, targetDir: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const zip = new AdmZip(filePath);
    zip.extractAllTo(targetDir, true);
  }
}

