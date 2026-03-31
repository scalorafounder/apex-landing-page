import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      if (!userId) break

      await supabase.from('profiles').update({
        plan: 'starter',
        credits: 500, // 500 credits on subscription
        stripe_subscription_id: session.subscription as string,
      }).eq('id', userId)
      break
    }

    case 'invoice.paid': {
      // Monthly renewal — refresh credits
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (profile) {
        await supabase.from('profiles').update({ credits: 500 }).eq('id', profile.id)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (profile) {
        await supabase.from('profiles').update({ plan: 'free', credits: 0 }).eq('id', profile.id)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
