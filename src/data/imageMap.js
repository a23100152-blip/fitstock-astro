// imageMap.js — Las imágenes ahora viven en /public/products y se sirven tal cual.
// El backend guarda solo el nombre de archivo (imagen_url); aquí lo convertimos
// a URL. Si el producto no tiene imagen (ej. Shaker) devolvemos null.
export function resolveImage(filename) {
  return filename ? `/products/${filename}` : null;
}
