import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LEAD_TYPE_LABELS: Record<string, string> = {
  nod:         'Notice of Default',
  lis_pendens: 'Lis Pendens',
  nts:         'Notice of Trustee Sale',
}

const PROPERTY_LABELS: Record<string, string> = {
  sfr:        'single-family homes',
  multi:      'multi-family properties',
  commercial: 'commercial properties',
  all:        'all property types',
}

const CONTACT_LABELS: Record<string, string> = {
  both:  'phone + email on every lead',
  phone: 'phone numbers only',
  any:   'maximum volume (phone or email)',
}

export async function POST(req: NextRequest) {
  try {
    const { county, state, leadTypes, count, propertyType, contactReq } = await req.json()

    if (!county || !state || !leadTypes || !count) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const leadTypeNames = (leadTypes as string[])
      .map((t: string) => LEAD_TYPE_LABELS[t] || t)
      .join(', ')

    const propLabel     = PROPERTY_LABELS[propertyType]  || 'all property types'
    const contactLabel  = CONTACT_LABELS[contactReq]     || 'maximum contacts'

    const isAllThree  = leadTypes.length === 3
    const isUrgent    = leadTypes.includes('nts')
    const isEarliest  = leadTypes.length === 1 && leadTypes[0] === 'nod'

    const urgencyNote = isAllThree
      ? 'You\'re casting the widest net — all three stages of pre-foreclosure.'
      : isUrgent
        ? 'NTS filings move fast. These sellers need out NOW — be ready to move quickly.'
        : isEarliest
          ? 'Early-stage NOD leads give you the most time to negotiate before the seller\'s options narrow.'
          : 'Good mix of urgency and negotiation window.'

    const prompt = `You are the AI engine behind Real Deal Wholesale, a lead generation platform for wholesale real estate investors. A user just submitted a pull request and you need to confirm it and set expectations.

Their order:
- Location: ${county}, ${state}
- Lead types: ${leadTypeNames}
- Count: ${count} leads
- Property filter: ${propLabel}
- Contact requirement: ${contactLabel}
- Market insight: ${urgencyNote}

Write a 2–3 sentence confirmation response. Tone: confident, sharp, like a smart operator who knows real estate. Don't be generic. Reference the actual county and lead types. Tell them the list will be skip-traced and ready in about 2 hours. End with one specific, useful tip for working these leads in this market. No bullet points. No fluff. Pure signal.`

    const message = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    return NextResponse.json({ message: text })
  } catch (err: any) {
    console.error('AI brief error:', err)
    // Graceful fallback — never break the UI
    return NextResponse.json({
      message: `On it. I'm queuing your pull right now and every lead will be skip-traced before delivery. Come back in about 2 hours — your list will be in the sidebar on the left.`,
    })
  }
}
