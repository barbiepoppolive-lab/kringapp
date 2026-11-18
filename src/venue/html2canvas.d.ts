// html2canvas 1.4.1 ships without its dist/types in this install; only what Spot a bug (viewAs.ts) uses.
declare module 'html2canvas' {
  interface H2COptions {
    useCORS?: boolean; backgroundColor?: string | null; scale?: number; logging?: boolean; width?: number; height?: number;
    windowWidth?: number; windowHeight?: number; x?: number; y?: number; onclone?: (doc: Document) => void;
  }
  export default function html2canvas(element: HTMLElement, options?: H2COptions): Promise<HTMLCanvasElement>;
}
