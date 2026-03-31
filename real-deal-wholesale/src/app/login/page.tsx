import { Suspense } from 'react'
import LoginPageInner from './LoginPageInner'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-dark-900' />}>
      <LoginPageInner />
    </Suspense>
  )
}
