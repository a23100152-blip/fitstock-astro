// CartWidget.jsx — Botón del carrito (con contador) + drawer. Es UNA isla
// porque ambos comparten estado; el drawer se abre con useUiStore.
import { useCartStore } from '../store/useCartStore';
import { useUiStore } from '../store/useUiStore';
import Cart from './Cart';

export default function CartWidget() {
  const count = useCartStore((s) => s.getCount());
  const cartOpen = useUiStore((s) => s.cartOpen);
  const openCart = useUiStore((s) => s.openCart);
  const closeCart = useUiStore((s) => s.closeCart);

  return (
    <>
      <button className="cart-button" onClick={openCart}>
        🛒 Carrito
        {count > 0 && <span className="cart-badge">{count}</span>}
      </button>

      {cartOpen && (
        <Cart
          onVolver={closeCart}
          onIrCheckout={() => {
            window.location.href = '/checkout';
          }}
        />
      )}
    </>
  );
}
