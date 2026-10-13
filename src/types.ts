/**
 * VREF (Visual Reference Format) Type Definitions
 * Harpia AI Research
 */

/**
 * VREF Manifest structure
 * Automatically generated and included in every .vref file
 */
export interface VREFManifest {
  /** VREF format version (semver) */
  version: string;
  
  /** Format identifier */
  format: 'VREF';
  
  /** ZIP compression version (if applicable) */
  zipVersion?: string;
  
  /** Name of the .vref file */
  fileName: string;
  
  /** Total number of images in the container */
  imageCount: number;
  
  /** Array of image metadata */
  images: ImageMetadata[];
  
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  
  /** Optional metadata */
  metadata?: {
    /** Human-readable title/name of the reference pack */
    name?: string;
    
    /** Description of the reference pack */
    description?: string;
    
    /** Tags for categorization */
    tags?: string[];
    
    /** Author information */
    author?: string;
    
    /** License information */
    license?: string;
    
    /** Any additional custom fields */
    [key: string]: any;
  };
}

/**
 * Metadata for individual images within the VREF
 */
export interface ImageMetadata {
  /** Relative path within the .vref archive */
  path: string;
  
  /** Image format (png, jpg, jpeg, webp, gif, avif) */
  format: string;
  
  /** File size in bytes */
  size: number;
  
  /** Image width in pixels */
  width?: number;
  
  /** Image height in pixels */
  height?: number;
}

/**
 * Options for creating a VREF file
 */
export interface VREFCreateOptions {
  /** Optional name/title for the reference pack */
  name?: string;

  /** Name for the output .vref file (optional, defaults to output path file name) */
  fileName?: string;
  
  /** Optional description */
  description?: string;
  
  /** Optional tags */
  tags?: string[];
  
  /** Optional author */
  author?: string;
  
  /** Optional license */
  license?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Options for reading a VREF file
 */
export interface VREFReadOptions {
  /** Whether to extract images to memory */
  loadImages?: boolean;
  
  /** Validate image formats */
  validate?: boolean;
}

/**
 * Result of reading a VREF file
 */
export interface VREFReadResult {
  /** Parsed manifest */
  manifest: VREFManifest;
  
  /** Image buffers (if loadImages: true) */
  images?: Map<string, Buffer>;
  
  /** Get a random sample of N images */
  sample: (count: number) => Buffer[];
  
  /** Get specific image by path */
  getImage: (path: string) => Buffer | undefined;
}

/**
 * Supported image formats
 */
export const SUPPORTED_IMAGE_FORMATS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'avif'
] as const;

export type SupportedImageFormat = typeof SUPPORTED_IMAGE_FORMATS[number];
