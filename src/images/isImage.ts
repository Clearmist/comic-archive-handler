export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'] as const;

export function getExtension(entryPath: string): string {
  const match = /\.([^./\\]+)$/.exec(entryPath);

  return match ? match[1]!.toLowerCase() : '';
}

export function isImagePath(entryPath: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(getExtension(entryPath));
}
