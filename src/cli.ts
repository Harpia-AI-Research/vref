#!/usr/bin/env node
/**
 * VREF CLI - Command line interface for .vref files
 * Harpia AI Research
 */

import * as fs from 'fs';
import * as path from 'path';
import { VREFWriter } from './VREFWriter';
import { VREFReader } from './VREFReader';

const CLI_VERSION = '1.0.2';

function showHelp() {
  console.log(`
┌─────────────────────────────────────────────────┐
│  VREF CLI v${CLI_VERSION}                                │
│  by Harpia AI Research                          │
│  https://harpiaresearch.cc                      │
└─────────────────────────────────────────────────┘

Standardized container for curated visual references in AI image generation

USAGE:
  npx @harpiaresearch/vref <input> [options]
  vref <command> [arguments]

COMMANDS:
  <input> [options]          Create a .vref file from an image or directory
  info, inspect <file.vref>  Inspect metadata and images in a .vref file
  validate <file.vref>       Validate integrity and manifest of a .vref file
  extract <file.vref> [dir]  Extract all images from a .vref file

CREATION OPTIONS:
  -o, --output <path>   Output .vref file path (default: output.vref)
  -n, --name <name>     Name/title for the reference pack
  -d, --desc <text>     Description of the reference pack
  -t, --tags <tags>     Comma-separated tags
  -a, --author <name>   Author name
  -l, --license <lic>   License (e.g., CC-BY-4.0, MIT)
  -r, --recursive       Include subdirectories
  -v, --version         Show CLI version
  -h, --help            Show this help

EXAMPLES:
  # Create from directory
  npx @harpiaresearch/vref ./images -o pack.vref -n "My Pack"

  # Create with complete metadata
  npx @harpiaresearch/vref ./sprites -o rpg-sprites.vref \\
    -n "RPG Sprites" \\
    -d "Character sprites for RPG games" \\
    -t "rpg,sprites,pixelart" \\
    -a "Your Name" \\
    -l "CC-BY-4.0"

  # Inspect an existing .vref file
  vref info references.vref

  # Validate file integrity
  vref validate references.vref

  # Extract images
  vref extract references.vref ./extracted-images
`);
}

function handleValidate(filePath: string) {
  if (!filePath) {
    console.error('❌ Error: Please specify a .vref file to validate');
    process.exit(1);
  }

  console.log(`🔍 Validating ${filePath}...`);
  const result = VREFReader.validate(filePath);

  if (result.valid) {
    const manifest = VREFReader.readManifest(filePath);
    console.log(`✅ Valid .vref file!`);
    console.log(`   Format: ${manifest.format} (v${manifest.version})`);
    console.log(`   Images: ${manifest.imageCount}`);
    if (manifest.metadata?.name) console.log(`   Name: ${manifest.metadata.name}`);
  } else {
    console.error(`❌ Validation failed with ${result.errors.length} error(s):`);
    result.errors.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }
}

function handleInfo(filePath: string) {
  if (!filePath) {
    console.error('❌ Error: Please specify a .vref file to inspect');
    process.exit(1);
  }

  try {
    const manifest = VREFReader.readManifest(filePath);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n📦 File: ${path.basename(filePath)} (${sizeMB} MB)`);
    console.log(`   Format: ${manifest.format} v${manifest.version}`);
    console.log(`   Created at: ${manifest.createdAt}`);
    console.log(`   Total images: ${manifest.imageCount}`);

    if (manifest.metadata) {
      console.log('\n📋 Metadata:');
      if (manifest.metadata.name) console.log(`   Name: ${manifest.metadata.name}`);
      if (manifest.metadata.description) console.log(`   Description: ${manifest.metadata.description}`);
      if (manifest.metadata.tags && manifest.metadata.tags.length > 0) {
        console.log(`   Tags: ${manifest.metadata.tags.join(', ')}`);
      }
      if (manifest.metadata.author) console.log(`   Author: ${manifest.metadata.author}`);
      if (manifest.metadata.license) console.log(`   License: ${manifest.metadata.license}`);
    }

    if (manifest.images.length > 0) {
      console.log('\n🖼️ Sample of contained images:');
      const previewCount = Math.min(manifest.images.length, 5);
      for (let i = 0; i < previewCount; i++) {
        const img = manifest.images[i];
        const dim = img.width && img.height ? ` (${img.width}x${img.height})` : '';
        const sizeKB = (img.size / 1024).toFixed(1);
        console.log(`   - ${img.path} [${img.format.toUpperCase()}]${dim} - ${sizeKB} KB`);
      }
      if (manifest.images.length > previewCount) {
        console.log(`   ... and ${manifest.images.length - previewCount} more`);
      }
    }
    console.log();
  } catch (error: any) {
    console.error(`❌ Error inspecting file: ${error.message}`);
    process.exit(1);
  }
}

function handleExtract(filePath: string, outputDir?: string) {
  if (!filePath) {
    console.error('❌ Error: Please specify a .vref file to extract');
    process.exit(1);
  }

  const targetDir = outputDir || path.join(process.cwd(), path.basename(filePath, '.vref') + '_extracted');

  try {
    console.log(`📦 Extracting ${filePath} to ${targetDir}...`);
    VREFReader.extract(filePath, targetDir);
    console.log(`✅ Extracted successfully to ${targetDir}`);
  } catch (error: any) {
    console.error(`❌ Extraction error: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs(args: string[]) {
  const options: any = {
    input: null,
    output: 'output.vref',
    name: null,
    description: null,
    tags: null,
    author: null,
    license: null,
    recursive: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
        break;

      case '-v':
      case '--version':
        console.log(`v${CLI_VERSION}`);
        process.exit(0);
        break;

      case '-o':
      case '--output':
        options.output = args[++i];
        break;

      case '-n':
      case '--name':
        options.name = args[++i];
        break;

      case '-d':
      case '--desc':
      case '--description':
        options.description = args[++i];
        break;

      case '-t':
      case '--tags':
        options.tags = args[++i]?.split(',').map((t: string) => t.trim());
        break;

      case '-a':
      case '--author':
        options.author = args[++i];
        break;

      case '-l':
      case '--license':
        options.license = args[++i];
        break;

      case '-r':
      case '--recursive':
        options.recursive = true;
        break;

      default:
        if (!arg.startsWith('-') && !options.input) {
          options.input = arg;
        }
        break;
    }
  }

  return options;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const firstArg = args[0];

  if (firstArg === 'validate') {
    handleValidate(args[1]);
    return;
  }

  if (firstArg === 'info' || firstArg === 'inspect') {
    handleInfo(args[1]);
    return;
  }

  if (firstArg === 'extract') {
    handleExtract(args[1], args[2]);
    return;
  }

  if (firstArg === '-h' || firstArg === '--help') {
    showHelp();
    process.exit(0);
  }

  if (firstArg === '-v' || firstArg === '--version') {
    console.log(`v${CLI_VERSION}`);
    process.exit(0);
  }

  const options = parseArgs(args);

  if (!options.input) {
    console.error('❌ Error: No input specified');
    console.log('Run "npx @harpiaresearch/vref --help" for usage information');
    process.exit(1);
  }

  if (!fs.existsSync(options.input)) {
    console.error(`❌ Error: Input not found: ${options.input}`);
    process.exit(1);
  }

  console.log('┌─────────────────────────────────────────────────┐');
  console.log(`│  VREF CLI v${CLI_VERSION}                                │`);
  console.log('│  by Harpia AI Research                          │');
  console.log('└─────────────────────────────────────────────────┘\n');

  try {
    const writer = new VREFWriter({
      fileName: path.basename(options.output),
      name: options.name,
      description: options.description,
      tags: options.tags,
      author: options.author,
      license: options.license,
    });

    console.log(`📂 Input: ${options.input}`);

    const stat = fs.statSync(options.input);

    if (stat.isDirectory()) {
      console.log(`🔍 Scanning directory${options.recursive ? ' (recursive)' : ''}...`);
      writer.addImagesFromDirectory(options.input, options.recursive);
    } else if (stat.isFile()) {
      console.log('📄 Adding image...');
      writer.addImageFromFile(options.input);
    } else {
      throw new Error('Input must be a file or directory');
    }

    const imageCount = writer.getImageCount();

    if (imageCount === 0) {
      console.error('❌ Error: No valid images found');
      process.exit(1);
    }

    console.log(`✅ Found ${imageCount} valid image${imageCount !== 1 ? 's' : ''}`);
    console.log(`📦 Creating ${options.output}...`);

    writer.write(options.output);

    const stats = fs.statSync(options.output);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ Success! Created ${options.output} (${sizeMB} MB)`);
    console.log('\n📋 Metadata:');
    console.log(`   Images: ${imageCount}`);
    if (options.name) console.log(`   Name: ${options.name}`);
    if (options.description) console.log(`   Description: ${options.description}`);
    if (options.tags) console.log(`   Tags: ${options.tags.join(', ')}`);
    if (options.author) console.log(`   Author: ${options.author}`);
    if (options.license) console.log(`   License: ${options.license}`);

    console.log('\n🚀 Share this file with AI platforms that support VREF!');
    console.log('   Learn more: https://harpiaresearch.cc\n');

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
