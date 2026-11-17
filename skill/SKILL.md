---
name: vref
description: Package, inspect, validate, extract, diff, sign, verify, and build .vref visual-reference packs (a ZIP containing manifest.json plus images) with the @harpiaresearch/vref library or CLI. Use when the user wants to bundle reference images for AI image generation, read or validate a .vref file, sample images from a pack, download images from URLs into a pack, compare/sign packs, or build VREF support into a platform. Do not use for generic ZIP, archive, or image-editing tasks.
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

Inspect, validate, extract, diff, build from URLs, sign, and verify:

```bash
vref info pack.vref                 # metadata + image list (alias: inspect)
vref validate pack.vref             # integrity + manifest checks
vref extract pack.vref ./output     # extract all entries to a directory
vref diff old.vref new.vref         # compare two packs (added/removed/modified)
vref url https://example.com/a.png https://example.com/b.jpg -o web.vref
vref seal pack.vref -k private.pem -o signed.vref   # sign manifest (Ed25519)
vref verify signed.vref             # verify signature + image content hash
```

`vref url` downloads images from URLs. Names are derived from the URL path; if the URL has no image extension, the format is inferred from the response `Content-Type` (e.g. `image/png` → `image.png`). Failed downloads are skipped with a warning; the command fails if no image is downloaded.

URL options: `--concurrency <n>` (default 4), `--retry <n>` (default 2), `--timeout <ms>` (default 30000), `--limit-mb <n>`, `--name-pattern <p>` (placeholders `{index}` and `{basename}`).

Creation options: `-o/--output` (default `output.vref`), `-n/--name`, `-d/--desc/--description`, `-t/--tags` (comma-separated), `-a/--author`, `-l/--license`, `-p/--parent-version`, `-r/--recursive`, `-v/--version`, `-h/--help`. `-p/--parent-version` records the version of the pack this one updates in the manifest. `seal`/`verify` accept `-k/--key <pem>`.

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
VREFReader.diff('old.vref', 'new.vref'); // { added, removed, modified, unchanged }
```

Writing from a URL (requires network):

```typescript
// Returns the file name that was added. Supports data: URLs too.
const name = await writer.addImageFromUrl('https://example.com/photo.png', {
  timeoutMs: 10000,
  retries: 3,
  maxBytes: 5 * 1024 * 1024,
  fileNameTemplate: '{index}-{basename}',
  index: 1,
});
```

Signing and verification:

```typescript
VREFReader.seal('pack.vref', privateKeyPem, 'signed.vref');
VREFReader.verify('signed.vref');                // { valid, errors, signer }
VREFReader.verifyContent('signed.vref');          // checks imageContentHash
```

Typical platform integration: user uploads a `.vref` → `VREFReader.read(file, { loadImages: true })` → let the user pick a count → `vref.sample(count)` → send those buffers as reference images alongside the text prompt.

## manifest.json

```json
{
  "version": "1.1.0",
  "format": "VREF",
  "fileName": "pack.vref",
  "imageCount": 24,
  "parentVersion": "1.0.2",
  "imageContentHash": "<sha256 over all image hashes, ordered by path>",
  "images": [
    { "path": "one.png", "format": "png", "size": 45678, "width": 1920, "height": 1080, "sha256": "<hex>" }
  ],
  "createdAt": "2026-10-13T10:30:00.000Z",
  "metadata": { "name": "", "description": "", "tags": [], "author": "", "license": "" },
  "publicKey": "<PEM, only when signed>",
  "signature": "<base64 Ed25519, only when signed>"
}
```

`format` must be `VREF`. `validate()` checks that `imageCount` matches the archive entries and that every image listed in `images` exists. Each image records a `sha256` content hash; `imageContentHash` is a Merkle-style root over them (ordered by path). `verifyContent()` recomputes and compares it; `verify()` checks the Ed25519 signature.

## Constraints and gotchas

- Only images are allowed. The writer validates both the extension and the file's magic bytes; a renamed non-image is rejected.
- `addImage*` keys images by `path.basename`. Adding an image whose name already exists in the pack throws `Duplicate image name`; in `addImagesFromDirectory` the duplicate is skipped with a warning. Rename files before adding if basenames can collide across directories.
- Write the manifest last; the writer always emits it as the final ZIP entry.
- `npm test` runs `node --test` against `dist/`, so run `npm run build` before testing.
- `VREFReader.extract` writes entries individually and rejects unsafe paths (path traversal / zip-slip). Extract only `.vref` files you trust regardless.
- `manifest.version` currently mirrors the npm package version, not an independent format version. Compare `version` loosely across releases.
