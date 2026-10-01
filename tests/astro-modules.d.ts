// Plain `tsc` cannot resolve .astro files (astro check can, and ignores this fallback).
// Typed only as far as the tests use them.
declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

  const Component: AstroComponentFactory;
  export default Component;
  export function getStaticPaths(): { params: Record<string, string> }[];
}
