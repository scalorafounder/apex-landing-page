import { Suspense } from 'react'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-cream">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500 text-ink-900 font-display font-semibold text-xl shadow-soft">
            A
          </div>
          <h1 className="mt-6 text-2xl font-display font-semibold tracking-tight text-ink-900">APEX</h1>
          <p className="mt-1 text-sm text-ink-500">Internal lead system</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
