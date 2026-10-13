#!/usr/bin/env node
/**
 * VREF CLI - Command line interface for creating .vref files
 * Harpia AI Research
 */

import * as fs from 'fs';
import * as path from 'path';
import { VREFWriter } from './VREFWriter';

function showHelp() {
  console.log(`
┌─────────────────────────────────────────────────┐
│  VREF CLI v1.0.0                                │
│  by Harpia AI Research                          │
│  https://harpiaresearch.cc                      │
└─────────────────────────────────────────────────┘

Create .vref files from images

USAGE:
  npx create-vref <input> [options]
  
ARGUMENTS:
  <input>              Path to image file or directory

OPTIONS:
  -o, --output <path>  Output .vref file path (default: output.vref)
  -n, --name <name>    Name for the reference pack
  -d, --desc <text>    Description of the reference pack
  -t, --tags <tags>    Comma-separated tags
  -a, --author <name>  Author name
  -l, --license <lic>  License (e.g., CC-BY-4.0, MIT)
  -r, --recursive      Include subdirectories
  -h, --help           Show this help

EXAMPLES:
  # Create from single image
  npx create-vref image.png -o references.vref
  
  # Create from directory
  npx create-vref ./images -o pack.vref -n "My Pack"
  
  # With metadata
  npx create-vref ./sprites -o rpg-sprites.vref \\
    -n "RPG Sprites" \\
    -d "Character sprites for RPG games" \\
    -t "rpg,sprites,pixelart" \\
    -a "Your Name" \\
    -l "CC-BY-4.0"
  `);
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
        options.tags = args[++i].split(',').map((t: string) => t.trim());
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
        if (!arg.startsWith('-')) {
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

  const options = parseArgs(args);

  if (!options.input) {
    console.error('❌ Error: No input specified');
    console.log('Run "npx create-vref --help" for usage information');
    process.exit(1);
  }

  if (!fs.existsSync(options.input)) {
    console.error(`❌ Error: Input not found: ${options.input}`);
    process.exit(1);
  }

  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│  VREF CLI v1.0.0                                │');
  console.log('│  by Harpia AI Research                          │');
  console.log('└─────────────────────────────────────────────────┘\n');

  try {
    const fileName = options.name || path.basename(options.output, '.vref');

    const writer = new VREFWriter({
      fileName: options.output,
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
