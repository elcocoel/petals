// The stored snapshots, which scripts/bundle.ts writes into petal as one file (file.ts).
declare module 'petal:fixtures' {
  const fixtures: { sha: string; files: Record<string, string> };
  export default fixtures;
}
