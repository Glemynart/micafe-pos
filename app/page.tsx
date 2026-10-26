import { redirect } from 'next/navigation'

/**
 * The product domain is the POS entry point. The former Café Atrato landing
 * remains available at /landing while a replacement marketing site is planned.
 */
export default function RootPage() {
  redirect('/pos')
}
