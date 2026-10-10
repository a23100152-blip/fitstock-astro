/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    user: { id: number; nombre: string; email: string; rol: 'cliente' | 'admin' } | null;
    token: string | null;
  }
}
