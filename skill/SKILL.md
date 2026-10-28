---
name: vref
description: Package, inspect, validate, and extract .vref visual-reference packs (a ZIP containing manifest.json plus images) with the @harpiaresearch/vref library or CLI. Use when the user wants to bundle reference images for AI image generation, read or validate a .vref file, sample images from a pack, or build VREF support into a platform. Do not use for generic ZIP, archive, or image-editing tasks.
---

# VREF — Visual Reference Format

A `.vref` file is a ZIP container with `manifest.json` at the root plus one entry per image. It packages curated visual references so an AI platform can sample N random images to condition image generation.

Supported image formats: `png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`. Non-image files are rejected.

## When to use

- Bundle a folder of reference images into a single `.vref`.
- Inspect metadata, validate integrity, or extract a `.vref`.
- Integrate reference sampling into an AI image-generation platform.
- Read samples from a `.vref` at runtime and pass them as reference images.

## CLI

Install or run without installing:

```bash
npm install @harpiaresearch/vref
npx @harpiaresearch/vref --help
```

Create a pack from a file or directory:

```bash
vref ./images -o pack.vref \
  -n "My Reference Pack" \
  -d "Curated art references" \
  -t "art,style,inspiration" \
  -a "Your Name" \
  -l "CC-BY-4.0" \
  -r
```

Inspect, validate, and extract:

```bash
vref info pack.vref                 # metadata + image list (alias: inspect)
vref validate pack.vref             # integrity + manifest checks
vref extract pack.vref ./output     # extract all entries to a directory
```

Creation options: `-o/--output` (default `output.vref`), `-n/--name`, `-d/--desc/--description`, `-t/--tags` (comma-separated), `-a/--author`, `-l/--license`, `-r/--recursive`, `-v/--version`, `-h/--help`.

Exit code is non-zero on error (missing input, no valid images, validation failure).

## Library

Writing:

```typescript
import { VREFWriter } from '@harpiaresearch/vref';

const writer = new VREFWriter({
  name: 'Art Style References',
  description: 'Curated art style references',
  tags: ['art', 'style'],
  author: 'Your Name',
  license: 'CC-BY-4.0',
});

writer.addImageFromFile('./img/one.png');
writer.addImage('two.jpg', buffer);
writer.addImagesFromDirectory('./images', /* recursive */ true);
writer.write('pack.vref');            // throws if no image was added
```

Reading:

```typescript
import { VREFReader } from '@harpiaresearch/vref';

const vref = VREFReader.read('pack.vref', { validate: true, loadImages: true });

vref.manifest.imageCount;             // number of images
const refs = vref.sample(3);          // Buffer[] — 3 random images
const img  = vref.getImage('one.png');// Buffer | undefined

VREFReader.readManifest('pack.vref'); // manifest only, no image loading
VREFReader.validate('pack.vref');     // { valid: boolean, errors: string[] }
VREFReader.extract('pack.vref', './out');
```

Typical platform integration: user uploads a `.vref` → `VREFReader.read(file, { loadImages: true })` → let the user pick a count → `vref.sample(count)` → send those buffers as reference images alongside the text prompt.

## manifest.json

```json
{
  "version": "1.0.2",
  "format": "VREF",
  "fileName": "pack.vref",
  "imageCount": 24,
  "images": [
    { "path": "one.png", "format": "png", "size": 45678, "width": 1920, "height": 1080 }
  ],
  "createdAt": "2026-10-13T10:30:00.000Z",
  "metadata": { "name": "", "description": "", "tags": [], "author": "", "license": "" }
}
```

`format` must be `VREF`. `validate()` checks that `imageCount` matches the archive entries and that every image listed in `images` exists.

## Constraints and gotchas

- Only images are allowed. The writer validates both the extension and the file's magic bytes; a renamed non-image is rejected.
- `addImage*` keys images by `path.basename`, so two different directories with the same file name silently overwrite each other. Rename before adding if names can collide.
- Write the manifest last; the writer always emits it as the final ZIP entry.
- `npm test` runs `node --test` against `dist/`, so run `npm run build` before testing.
- `VREFReader.extract` uses `AdmZip.extractAllTo` and does not sanitize entry names. Only extract `.vref` files you trust.
- `manifest.version` currently mirrors the npm package version, not an independent format version. Compare `version` loosely across releases.
