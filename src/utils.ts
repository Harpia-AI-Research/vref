/**
 * VREF shared utilities
 * Harpia AI Research
 */

/**
 * Deep-sort object keys and serialize canonically (deterministic JSON).
 * Used for signing/verifying manifests so the serialized bytes are stable.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Return a shallow copy of obj without the given keys. */
export function omitKeys<T extends object>(
  obj: T,
  keys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) {
      result[key] = (obj as Record<string, unknown>)[key];
    }
  }
  return result;
}
