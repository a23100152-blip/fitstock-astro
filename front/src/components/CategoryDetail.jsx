// CategoryDetail.jsx — Isla interactiva del catálogo de una categoría.
// Migración a Astro: la categoría y sus productos ya llegan renderizados desde
// el servidor (props), así que se eliminó el fetch/skeleton/reintento del
// listado. Se conserva la parte interactiva: búsqueda, orden por precio,
// agregar rápido al carrito y ficha de producto en modal.
import { useState, useTransition } from 'react';
import { resolveImage } from '../data/imageMap';
import { useCartStore } from '../store/useCartStore';
import { useUiStore } from '../store/useUiStore';
import { useToast } from '../store/useToastStore';
import ProductDetail from './ProductDetail';
import './Category.css';

export default function CategoryDetail({ categoria, productos }) {
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('default');
  const [productoModalId, setProductoModalId] = useState(null);
  const [isPending, startTransition] = useTransition();

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useUiStore((s) => s.openCart);
  const { showToast } = useToast();

  const handleVerProducto = (producto) => {
    startTransition(() => setProductoModalId(producto.id));
  };

  const handleAgregarRapido = (e, producto) => {
    e.stopPropagation();
    addItem(producto, 1);
    showToast(`${producto.nombre} agregado al carrito`);
  };

  let productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (orden === 'menor') {
    productosFiltrados = [...productosFiltrados].sort((a, b) => a.precio - b.precio);
  } else if (orden === 'mayor') {
    productosFiltrados = [...productosFiltrados].sort((a, b) => b.precio - a.precio);
  }

  return (
    <>
      <header className="category-header">
        <a className="back-button" href="/" style={{ textDecoration: 'none' }}>← Volver</a>
        <h1>{categoria.nombre}</h1>

        <select className="sort-select" value={orden} onChange={(e) => setOrden(e.target.value)}>
          <option value="default">Ordenar por</option>
          <option value="menor">Precio: menor a mayor</option>
          <option value="mayor">Precio: mayor a menor</option>
        </select>

        <input
          className="search-input"
          type="text"
          placeholder="Buscar en esta categoría..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </header>

      <main className={isPending ? 'content-pending' : ''}>
        <p className="results-count">
          Mostrando {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? 's' : ''}
        </p>

        <div className="product-grid">
          {productosFiltrados.map((producto) => {
            const imagen = resolveImage(producto.imagenUrl);
            return (
              <div key={producto.id} className="product-card" onClick={() => handleVerProducto(producto)}>
                {imagen ? (
                  <img src={imagen} alt={producto.nombre} loading="lazy" />
                ) : (
                  <div className="product-noimg">Sin imagen</div>
                )}
                <div className="product-info">
                  <h3>{producto.nombre}</h3>
                  <p className="product-price">${producto.precio}</p>
                  <button className="quick-add-button" onClick={(e) => handleAgregarRapido(e, producto)}>
                    + Agregar
                  </button>
                </div>
              </div>
            );
          })}

          {productosFiltrados.length === 0 && (
            <p className="empty-state">No hay productos que coincidan.</p>
          )}
        </div>
      </main>

      {productoModalId && (
        <ProductDetail
          productoId={productoModalId}
          onCerrar={() => setProductoModalId(null)}
          onAgregado={() => {
            setProductoModalId(null);
            openCart();
          }}
        />
      )}
    </>
  );
}
