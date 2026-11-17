#!/usr/bin/env node
/**
 * VREF CLI - Command line interface for .vref files
 * Harpia AI Research
 */

import * as fs from 'fs';
import * as path from 'path';
import { VREFWriter } from './VREFWriter';
import { VREFReader } from './VREFReader';

const CLI_VERSION = '1.1.0';

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
  diff <a.vref> <b.vref>    Compare two packs (added/removed/modified images)
  url <url...> [options]     Download images from URLs into a new pack
  seal <file.vref> -k <key> Sign a manifest (Ed25519)
  verify <file.vref> [-k <key>]  Verify a signed manifest

CREATION OPTIONS:
  -o, --output <path>   Output .vref file path (default: output.vref)
  -n, --name <name>     Name/title for the reference pack
  -d, --desc <text>     Description of the reference pack
  -t, --tags <tags>     Comma-separated tags
  -a, --author <name>   Author name
  -l, --license <lic>   License (e.g., CC-BY-4.0, MIT)
  -p, --parent-version <v>  Version of the pack this one updates
  -r, --recursive       Include subdirectories
  -v, --version         Show CLI version
  -h, --help            Show this help

URL OPTIONS:
  --concurrency <n>     Parallel downloads (default: 4)
  --retry <n>           Retries per URL after the first attempt (default: 2)
  --timeout <ms>        Per-attempt timeout in ms (default: 30000)
  --limit-mb <n>        Skip downloads larger than n MB
  --name-pattern <p>    Name template with {index} and {basename}

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

  # Compare two packs (versioning / updates)
  vref diff old.vref new.vref

  # Build a pack from image URLs (parallel, with retries and naming)
  vref url https://example.com/a.png https://example.com/b.jpg \
    -o web-refs.vref -n "Web References" -t "web,style" \
    --concurrency 5 --retry 3 --timeout 10000 \
    --name-pattern "{index}-{basename}"

  # Sign a manifest (keys: openssl genpkey -algorithm ed25519 ...)
  vref seal pack.vref -k private.pem -o signed.vref

  # Verify a signed manifest
  vref verify signed.vref
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

function handleDiff(fileA: string, fileB: string) {
  if (!fileA || !fileB) {
    console.error('❌ Error: Please specify two .vref files to compare');
    process.exit(1);
  }

  try {
    const result = VREFReader.diff(fileA, fileB);

    console.log(`\n🔀 Diff: ${path.basename(fileA)} vs ${path.basename(fileB)}`);
    console.log(`   Unchanged: ${result.unchanged}`);
    console.log(`   Added: ${result.added.length}`);
    for (const img of result.added) {
      console.log(`     + ${img.path} [${img.format.toUpperCase()}]`);
    }
    console.log(`   Removed: ${result.removed.length}`);
    for (const img of result.removed) {
      console.log(`     - ${img.path} [${img.format.toUpperCase()}]`);
    }
    console.log(`   Modified: ${result.modified.length}`);
    for (const mod of result.modified) {
      console.log(`     ~ ${mod.path} (${mod.beforeSize}B -> ${mod.afterSize}B)`);
    }
    console.log();
  } catch (error: any) {
    console.error(`❌ Error computing diff: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Collect positional arguments (URLs) from a command line, skipping the
 * value that follows any option that consumes one (e.g. -o path).
 */
function collectUrls(args: string[]): string[] {
  const urls: string[] = [];
  const valueFlags = new Set([
    '-o', '--output',
    '-n', '--name',
    '-d', '--desc', '--description',
    '-t', '--tags',
    '-a', '--author',
    '-l', '--license',
    '-p', '--parent-version',
    '-k', '--key',
    '--concurrency',
    '--retry',
    '--timeout',
    '--limit-mb',
    '--name-pattern',
  ]);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (valueFlags.has(arg) && i + 1 < args.length) i++; // skip consumed value
    } else {
      urls.push(arg);
    }
  }

  return urls;
}

async function handleUrls(urls: string[], options: any) {
  if (urls.length === 0) {
    console.error('❌ Error: Please specify at least one image URL');
    process.exit(1);
  }

  const writer = new VREFWriter({
    fileName: path.basename(options.output),
    name: options.name,
    description: options.description,
    tags: options.tags,
    author: options.author,
    license: options.license,
    parentVersion: options.parentVersion,
  });

  const concurrency = Math.max(1, Number(options.concurrency) || 1);
  const maxBytes = options.limitMb ? Number(options.limitMb) * 1024 * 1024 : undefined;

  const download = async (url: string, index: number) => {
    console.log(`⬇️ [${index + 1}/${urls.length}] Downloading ${url}...`);
    try {
      const name = await writer.addImageFromUrl(url, {
        timeoutMs: Number(options.timeout) || 30000,
        retries: Math.max(0, Number(options.retry) || 0),
        maxBytes,
        fileNameTemplate: options.namePattern || undefined,
        index: index + 1,
      });
      console.log(`   ✅ Added ${name}`);
    } catch (error: any) {
      console.warn(`   ⚠️ Skipping ${url}: ${error.message}`);
    }
  };

  // Simple worker pool over the URLs
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const i = cursor++;
      await download(urls[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker())
  );

  if (writer.getImageCount() === 0) {
    console.error('❌ Error: No valid images downloaded');
    process.exit(1);
  }

  console.log(`✅ Found ${writer.getImageCount()} valid image${writer.getImageCount() !== 1 ? 's' : ''}`);
  console.log(`📦 Creating ${options.output}...`);

  writer.write(options.output);

  const stats = fs.statSync(options.output);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Success! Created ${options.output} (${sizeMB} MB)`);
  console.log('\n🚀 Share this file with AI platforms that support VREF!\n');
}

function handleSeal(filePath: string, keyPath: string, outputPath?: string) {
  if (!filePath || !keyPath) {
    console.error('❌ Usage: vref seal <pack.vref> -k key.pem [-o out.vref]');
    process.exit(1);
  }
  if (!fs.existsSync(keyPath)) {
    console.error(`❌ Key not found: ${keyPath}`);
    process.exit(1);
  }

  try {
    const pem = fs.readFileSync(keyPath, 'utf8');
    VREFReader.seal(filePath, pem, outputPath);
    console.log(`✅ Signed ${outputPath || filePath} (Ed25519)`);
  } catch (error: any) {
    console.error(`❌ Seal error: ${error.message}`);
    process.exit(1);
  }
}

function handleVerify(filePath: string, keyPath?: string) {
  if (!filePath) {
    console.error('❌ Usage: vref verify <pack.vref> [-k pub.pem]');
    process.exit(1);
  }

  try {
    const pem = keyPath ? fs.readFileSync(keyPath, 'utf8') : undefined;
    const result = VREFReader.verify(filePath, pem);

    if (result.valid) {
      console.log(`✅ Valid signature (signer ${result.signer})`);
      const content = VREFReader.verifyContent(filePath);
      if (content.valid) {
        console.log('✅ Image content hash matches');
      } else {
        console.warn(`⚠️ ${content.errors.join('; ')}`);
      }
    } else {
      console.error(`❌ ${result.errors.join('; ')}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ Verify error: ${error.message}`);
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
    parentVersion: null,
    concurrency: 4,
    retry: 2,
    timeout: 30000,
    limitMb: null,
    namePattern: null,
    key: null,
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

      case '-p':
      case '--parent-version':
        options.parentVersion = args[++i];
        break;

      case '-k':
      case '--key':
        options.key = args[++i];
        break;

      case '--concurrency':
        options.concurrency = Number(args[++i]);
        break;

      case '--retry':
        options.retry = Number(args[++i]);
        break;

      case '--timeout':
        options.timeout = Number(args[++i]);
        break;

      case '--limit-mb':
        options.limitMb = Number(args[++i]);
        break;

      case '--name-pattern':
        options.namePattern = args[++i];
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

async function main() {
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

  if (firstArg === 'diff') {
    handleDiff(args[1], args[2]);
    return;
  }

  if (firstArg === 'url' || firstArg === 'download' || firstArg === 'from-url') {
    const commandArgs = args.slice(1);
    const options = parseArgs(commandArgs);
    const urls = collectUrls(commandArgs);
    await handleUrls(urls, options);
    return;
  }

  if (firstArg === 'seal') {
    const commandArgs = args.slice(1);
    const options = parseArgs(commandArgs);
    const hasOutput = commandArgs.includes('-o') || commandArgs.includes('--output');
    handleSeal(options.input, options.key, hasOutput ? options.output : undefined);
    return;
  }

  if (firstArg === 'verify') {
    const commandArgs = args.slice(1);
    const options = parseArgs(commandArgs);
    handleVerify(options.input, options.key);
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
      parentVersion: options.parentVersion,
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

main().catch((error: any) => {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
});
