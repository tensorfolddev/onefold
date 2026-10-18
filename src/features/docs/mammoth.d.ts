// mammoth ships no types: just what docs import uses (Word → HTML, in the browser).
declare module "mammoth" {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}
