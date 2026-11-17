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

  /** Version of the pack this one updates (for soft/delta updates) */
  parentVersion?: string;
  
  /** Name of the .vref file */
  fileName: string;
  
  /** Total number of images in the container */
  imageCount: number;
  
  /** Array of image metadata */
  images: ImageMetadata[];

  /** SHA-256 Merkle-style root over all image contents (ordered by path) */
  imageContentHash?: string;
  
  /** ISO 8601 timestamp of creation */
  createdAt: string;

  /** Base64 Ed25519 signature over the canonical manifest (see seal/verify) */
  signature?: string;

  /** PEM public key that can verify `signature` */
  publicKey?: string;
  
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

  /** SHA-256 content hash of the image bytes */
  sha256?: string;
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

  /** Version of the pack this one updates (recorded in the manifest) */
  parentVersion?: string;
  
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
 * Options for VREFWriter.addImageFromUrl
 */
export interface VREFUrlOptions {
  /** Per-attempt timeout in ms (default 30000) */
  timeoutMs?: number;
  /** Number of retries after the first attempt (default 0) */
  retries?: number;
  /** Maximum accepted size in bytes; downloads above are skipped */
  maxBytes?: number;
  /** File-name template with {index} and {basename} placeholders */
  fileNameTemplate?: string;
  /** 1-based index substituted for {index} in the template */
  index?: number;
}

/**
 * Result of verifying a signed .vref manifest
 */
export interface VREFVerifyResult {
  valid: boolean;
  errors: string[];
  /** Short fingerprint of the verifying public key */
  signer?: string;
}

/**
 * A single image that changed between two packs, in a diff result
 */
export interface VREFDiffModified {
  /** Image path within the packs */
  path: string;
  /** Size in the first (before) pack */
  beforeSize: number;
  /** Size in the second (after) pack */
  afterSize: number;
  /** SHA-256 of the first pack's image (if loadable) */
  beforeHash?: string;
  /** SHA-256 of the second pack's image (if loadable) */
  afterHash?: string;
}

/**
 * Result of comparing two .vref packs
 */
export interface VREFDiffResult {
  /** Images present in B but not in A */
  added: ImageMetadata[];
  /** Images present in A but not in B */
  removed: ImageMetadata[];
  /** Images present in both with different content */
  modified: VREFDiffModified[];
  /** Number of images identical in both packs */
  unchanged: number;
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
