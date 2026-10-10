import { createPortal } from 'react-dom';
import { useCartStore } from '../store/useCartStore';
import { useCartTotals } from '../hooks/useCartTotals';
import './Cart.css';

function Cart({ onVolver, onIrCheckout }) {
  const items = useCartStore((state) => state.items);
  const updateQty = useCartStore((state) => state.updateQty);
  const removeItem = useCartStore((state) => state.removeItem);
  const { subtotal, totalItems, totalConEnvio } = useCartTotals();
  const envio = totalConEnvio - subtotal;

  const contenido = (
    <>
      <div className="cart-overlay" onClick={onVolver} />

      <div className="cart-drawer">
        <div className="cart-header">
          <h2>Tu carrito {totalItems > 0 && `(${totalItems})`}</h2>
          <button className="cart-close" onClick={onVolver}>✕</button>
        </div>

        <div className="cart-body">
          {items.length === 0 ? (
            <div className="cart-empty">
              <span className="icon">🛒</span>
              <p>Tu carrito está vacío</p>
            </div>
          ) : (
            items.map((item) => (
              <div className="cart-item" key={item.id}>
                <div className="cart-item-info">
                  <p className="cart-item-name">{item.nombre}</p>
                  <p className="cart-item-price">${item.precio} c/u</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="cart-qty">
                    <button onClick={() => updateQty(item.id, item.cantidad - 1)}>−</button>
                    <span>{item.cantidad}</span>
                    <button onClick={() => updateQty(item.id, item.cantidad + 1)}>+</button>
                  </div>
                  <button className="cart-remove" onClick={() => removeItem(item.id)}>
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-summary">
            <div className="cart-summary-row">
              <span>Subtotal</span>
              <span>${subtotal}</span>
            </div>
            <div className="cart-summary-row">
              <span>Envío</span>
              <span>{envio === 0 ? 'Gratis' : `$${envio}`}</span>
            </div>
            <div className="cart-summary-row total">
              <span>Total</span>
              <span>${totalConEnvio}</span>
            </div>

            <button className="cart-checkout-btn" onClick={onIrCheckout}>
              Ir a pagar
            </button>
          </div>
        )}
      </div>
    </>
  );

  return createPortal(contenido, document.body);
}

export default Cart;