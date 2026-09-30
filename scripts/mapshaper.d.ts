// Minimal typings for the parts of the mapshaper API used by build-geo.ts.
declare module 'mapshaper' {
  const mapshaper: {
    applyCommands(
      commands: string,
      input: Record<string, string | Buffer>,
    ): Promise<Record<string, string | Buffer>>;
  };
  export default mapshaper;
}
