import { useState } from 'react'
import type { FormEvent } from 'react'
import { demoBid, demoOpportunities, filterDemoOpportunities } from './demoOpportunities'
import type { DemoOpportunity } from './demoOpportunities'
import { money } from './calculations'
import { priceToPaise } from '../services/auctionApi'
import { Detail, Empty, Metric, Notice, Panel, Status } from './ui'

export function DemoTradeBoard() {
  const [items, setItems] = useState<DemoOpportunity[]>(() => demoOpportunities.map(item => ({ ...item })))
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const active = items.find(item => item.id === selected)
  const filtered = filterDemoOpportunities(items, query, mode, status)
  function bid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!active) return
    const form = event.currentTarget
    try {
      const updated = demoBid(active, priceToPaise(String(new FormData(form).get('price'))))
      setItems(rows => rows.map(item => item.id === updated.id ? updated : item))
      setError(''); setNotice(`Demo offer recorded for ${updated.crop} at ${money(updated.pricePaise)} per kg. It is saved only in this page and resets on reload.`)
      form.reset()
    } catch (cause) { setNotice(''); setError(cause instanceof Error ? cause.message : 'Check your offer.') }
  }
  return <>
    <Notice><strong>Demo opportunities.</strong> All organisations, quantities, prices and bids below are sample data. Try an offer without contacting anyone. No stock, contract or payment is created; changes reset when you leave or reload.</Notice>
    <div className="t-metrics" style={{ marginTop: 20 }}><Metric label="Open demo opportunities" value={items.filter(item => item.status === 'open').length} /><Metric label="Sample quantity" value={`${items.reduce((total, item) => total + item.quantityKg, 0).toLocaleString('en-IN')} kg`} /><Metric label="Demo offers" value={items.reduce((total, item) => total + item.bids, 0)} /><Metric label="Sample awarded" value={items.filter(item => item.status === 'awarded').length} /></div>
    {notice && <Notice>{notice}</Notice>}{error && <Notice error>{error}</Notice>}
    <div className="t-grid"><Panel title="Demo market board" subtitle="Explore harvested lots and future supply requests.">
      <div className="t-filter" style={{ marginBottom: 18 }}>
        <label><span className="sr-only">Search demo opportunities</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search crop, organisation or location" /></label>
        <label><span className="sr-only">Demo opportunity type</span><select value={mode} onChange={event => setMode(event.target.value)}><option value="all">Both types</option><option value="spot">Harvested lots</option><option value="forward">Forward requests</option></select></label>
        <label><span className="sr-only">Demo opportunity status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="awarded">Awarded</option></select></label>
      </div>
      <div className="t-list">{filtered.map(item => <article key={item.id} className="t-opportunity">
        <div className="t-opportunity-head"><div><span className="m-tag m-tag-indicative">Demo · {item.mode === 'spot' ? 'Harvested lot' : 'Forward request'}</span><h3>{item.crop}</h3><p className="m-small">{item.variety} · {item.quantityKg.toLocaleString('en-IN')} kg</p></div><Status value={item.status} /></div>
        <p>{item.organisation}</p><dl className="t-details"><Detail label="Handover">{item.location}</Detail><Detail label="Delivery">{item.delivery}</Detail><Detail label="Sample offers">{item.bids}</Detail></dl>
        <div className="t-opportunity-foot"><div className="t-opportunity-price">{money(item.pricePaise)}<small> / kg · sample price</small></div><button type="button" className="m-btn m-btn-secondary" aria-expanded={selected === item.id} onClick={() => { setSelected(item.id); setError(''); setNotice('') }}>View {item.crop} demo</button></div>
      </article>)}{!filtered.length && <Empty>No demo opportunities match. Try another crop or clear the filters.</Empty>}</div>
    </Panel><Panel title={active ? `${active.crop} demo details` : 'Try a demo offer'}>
      {!active ? <p>Select an opportunity to review its sample terms and try bidding.</p> : <>
        <p>{active.organisation} · {active.quantityKg.toLocaleString('en-IN')} kg · whole {active.mode === 'spot' ? 'lot' : 'request'}.</p>
        <dl className="t-details"><Detail label="Handover">{active.location}; sample price includes packing.</Detail><Detail label="Quality">Grade A; sample inspection at collection.</Detail><Detail label="Payment">Illustrative bank transfer within 7 days of acceptance.</Detail><Detail label="Cancellation">Both parties review any cancellation before dispatch.</Detail><Detail label="Bidding rule">{active.mode === 'spot' ? 'Highest buyer bid' : 'Lowest FPO offer'}; minimum step {money(active.stepPaise)} / kg.</Detail><Detail label="Current sample price">{money(active.pricePaise)} / kg</Detail></dl>
        {active.status === 'open' ? <form key={active.id} className="demo-offer" onSubmit={bid} style={{ marginTop: 20 }}><label htmlFor="demo-offer-price">Your demo {active.mode === 'spot' ? 'buyer bid' : 'FPO offer'} (₹/kg)</label><input id="demo-offer-price" name="price" type="number" min="0.01" max="100000" step="0.01" required /><button className="m-btn m-btn-primary" type="submit">Submit demo offer</button><p className="m-small">This changes sample data on this page only.</p></form> : <p>This sample opportunity is awarded. Choose an open opportunity to try an offer.</p>}
      </>}
    </Panel></div>
  </>
}
