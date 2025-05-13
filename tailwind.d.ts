// https://github.com/tailwindlabs/tailwindcss/issues/13791
declare module "@tailwindcss/core/lib/flat-color-palette" {
  export default function flattenColorPalette(
    palette: Record<string, string>,
  ): Record<string, string>;
}