<div align="center">

# VREF — Visual Reference Format

**A standardized format for curated visual references in AI image generation**

[![npm version](https://img.shields.io/npm/v/@harpiaresearch/vref)](https://www.npmjs.com/package/@harpiaresearch/vref)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)

Harpia AI Research

</div>

---

<div align="center">

## The Problem

</div>

You know exactly what you want your AI to generate, but describing it in words is **nearly impossible**.

- 🤔 "How do I describe this art style?"
- 📸 "I have 20 reference images, but uploading them one by one is tedious"
- 🔄 "I can't easily share or reuse my reference collections"
- 😤 "Text prompts alone just don't capture the vision"

**Visual concepts are hard to describe, but easy to show.**

---

<div align="center">

## The Solution

**VREF** (Visual Reference Format) is a simple, open standard that packages your visual references into a single `.vref` file.

```
Your 50 reference images → one references.vref file
```

</div>

### How It Works

```
1. Package images → references.vref
2. Upload to AI platform
3. Platform samples N random images
4. You write text prompt
5. AI generates with visual context
```

Instead of fighting with text descriptions, you **show the AI what you want**.

---

<div align="center">

## Why You Should Use VREF

</div>

### ✅ For Creators

**Stop struggling with prompts.**
- Package your mood boards, style references, and inspirations
- Upload once, reuse forever
- Share with your team or community

**Example:** Download `roblox-banners.vref` → Upload → Describe what you want → Get perfect results

### ✅ For Platforms

**Better user experience.**
- Users get better results faster
- Reduces prompt engineering frustration
- Differentiates your platform
- Simple to implement (< 1 day)

### ✅ For Everyone

**It's an open standard.**
- No vendor lock-in
- Portable across platforms
- Community-driven
- Free forever

---

<div align="center">

## Real-World Use Cases

</div>

### 🎮 Game Development
```
rpg-sprites.vref      → Character references
platformer-tiles.vref → Level design inspiration
ui-elements.vref      → Interface styles
```

### 🎨 Creative Work
```
architecture.vref     → Building styles
color-palettes.vref   → Mood and tone
typography.vref       → Font and layout ideas
```

### 🤖 AI Training
```
training-data.vref    → Curated datasets
style-transfer.vref   → Style references
fine-tuning.vref      → Model-specific data
```

---

<div align="center">

## Installation

</div>

```bash
npm install @harpiaresearch/vref
```

Or use directly:

```bash
npx @harpiaresearch/vref
```

---

<div align="center">

## Quick Start

</div>

### Creating a .vref File

**CLI:**
```bash
# From a directory
npx @harpiaresearch/vref ./my-images -o references.vref

# With metadata
npx @harpiaresearch/vref ./images -o pack.vref \
  -n "My Reference Pack" \
  -d "Collection of art references" \
  -t "art,style,inspiration"
```

**Code:**
```typescript
import { VREFWriter } from '@harpiaresearch/vref';

const writer = new VREFWriter({
  fileName: 'references.vref',
  description: 'Art style references',
  tags: ['art', 'style'],
});

writer.addImagesFromDirectory('./images');
writer.write('references.vref');
```

### Reading a .vref File

```typescript
import { VREFReader } from '@harpiaresearch/vref';

// Read file
const vref = VREFReader.read('references.vref', { loadImages: true });

console.log(`Loaded ${vref.manifest.imageCount} images`);

// Sample 3 random images
const randomSamples = vref.sample(3);

// Get specific image
const image = vref.getImage('photo1.png');
```

---

<div align="center">

## For AI Platform Developers

Integrating VREF takes **< 1 day**:

</div>

```typescript
import { VREFReader } from '@harpiaresearch/vref';

// 1. User uploads .vref
const vref = VREFReader.read(uploadedFile, { loadImages: true });

// 2. Show slider: "How many references? (1-{imageCount})"
const count = getUserSliderValue();

// 3. Sample random images
const references = vref.sample(count);

// 4. Get user prompt
const prompt = getUserPrompt();

// 5. Send to your AI
await generateImage({
  prompt: prompt,
  referenceImages: references,
});
```

**That's it.** ✅

---

## File Format

A `.vref` file is a ZIP container with:

```
references.vref
├── manifest.json    (metadata)
├── image1.png
├── image2.jpg
└── image3.webp
```

**Supported formats:** PNG, JPEG, WebP, GIF, AVIF

**Only images allowed.** Any other file type is rejected.

### manifest.json

```json
{
  "version": "1.0.0",
  "format": "VREF",
  "fileName": "references.vref",
  "imageCount": 24,
  "images": [
    {
      "path": "image1.png",
      "format": "png",
      "size": 45678,
      "width": 1920,
      "height": 1080
    }
  ],
  "createdAt": "2024-10-12T10:30:00.000Z",
  "metadata": {
    "description": "Collection of references",
    "tags": ["style", "mood"],
    "author": "Your Name",
    "license": "CC-BY-4.0"
  }
}
```

---

<div align="center">

## Why VREF Will Win

</div>

### 🎯 Solves a Real Problem
Everyone who uses AI image generation has struggled with describing visual concepts. VREF makes it trivial.

### 🚀 Simple to Implement
ZIP + JSON. No complex dependencies. Works everywhere.

### 🌍 Open Standard
No company owns it. Community-driven. Free forever.

### 📦 Already Shipping
- ✅ npm package published
- ✅ Full TypeScript support
- ✅ CLI tool ready
- ✅ Documentation complete

### 🇧🇷 Made in Brazil
Harpia AI Research is putting Brazil on the map of AI innovation.

---

### VREFWriter

```typescript
class VREFWriter {
  constructor(options: VREFCreateOptions);
  
  addImageFromFile(filePath: string): void;
  addImage(fileName: string, buffer: Buffer): void;
  addImagesFromDirectory(dirPath: string, recursive?: boolean): void;
  
  write(outputPath: string): void;
  getImageCount(): number;
}
```

### VREFReader

```typescript
class VREFReader {
  static read(filePath: string, options?: VREFReadOptions): VREFReadResult;
  static readManifest(filePath: string): VREFManifest;
  static validate(filePath: string): { valid: boolean; errors: string[] };
}
```

### VREFReadResult

```typescript
interface VREFReadResult {
  manifest: VREFManifest;
  images?: Map<string, Buffer>;
  sample: (count: number) => Buffer[];
  getImage: (path: string) => Buffer | undefined;
}
```

Full API documentation: [TypeScript definitions](src/types.ts)

---

## Roadmap

### Phase 1 ✅ (Done)
- Core library implementation
- CLI tool
- npm package published
- Full documentation

### Phase 2 (In Progress)
- Community-created .vref files
- Platform integrations
- Example collections

### Phase 3 (Future)
- Web-based .vref creator
- .vref marketplace
- Browser extensions
- Mobile support

---

## Join the Movement

VREF is just getting started. We need:

- **Platform developers**: Integrate VREF support
- **Creators**: Build and share .vref collections
- **Contributors**: Improve the library
- **Evangelists**: Spread the word

---

## Links

- **npm**: https://www.npmjs.com/package/@harpiaresearch/vref
- **GitHub**: https://github.com/Harpia-AI-Research/vref
- **Harpia AI Research**: https://harpiaresearch.cc
- **Issues**: https://github.com/Harpia-AI-Research/vref/issues

---

## License

This project is licensed under the **BSD 3-Clause License** - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026, Harpia AI Research

---

## Acknowledgments

VREF is an open standard for visual references in AI systems. Built to solve the gap between what creators envision and what they can describe in text.

**Technologies**: TypeScript, Node.js, adm-zip

---

<div align="center">

**VREF** — Bridging vision and AI generation

<br><br>

[GitHub](https://github.com/Harpia-AI-Research/vref) •
[npm](https://www.npmjs.com/package/@harpiaresearch/vref) •
[Documentation](https://github.com/Harpia-AI-Research/vref#readme) •
[Issues](https://github.com/Harpia-AI-Research/vref/issues)

</div>

