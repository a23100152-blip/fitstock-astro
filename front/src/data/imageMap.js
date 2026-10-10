// imageMap.js — Convierte el nombre de archivo guardado en la BD
// (por ejemplo "proteina.jpg") en la URL pública de la imagen.
// Las imágenes viven en public/products/ y Astro las sirve en /products/...
export function resolveImage(imagenUrl) {
  if (!imagenUrl) return null;
  if (/^(https?:)?\/\//.test(imagenUrl) || imagenUrl.startsWith('/')) return imagenUrl;
  return `/products/${imagenUrl}`;
}
