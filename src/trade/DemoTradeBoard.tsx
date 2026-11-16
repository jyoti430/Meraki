import { useEffect, useRef, useState } from 'react'
import { demoOpportunities, filterDemoOpportunities } from './demoOpportunities'
import { money } from './calculations'
import { Detail, Empty, Metric, Notice, Panel, Status } from './ui'

export function DemoTradeBoard() {
  const items = demoOpportunities
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const details = useRef<HTMLDivElement>(null)
  useEffect(() => { if (selected) { details.current?.focus({ preventScroll: true }); details.current?.scrollIntoView({ block: 'nearest' }) } }, [selected])
  const active = items.find(item => item.id === selected)
  const filtered = filterDemoOpportunities(items, query, mode, status)
  return <>
    <Notice><strong>Demo opportunities.</strong> Read-only sample organisations, quantities and prices. To place a bid that both FPO and exporter accounts can see, select Shared auctions above.</Notice>
    <div className="t-metrics" style={{ marginTop: 20 }}><Metric label="Open demo opportunities" value={items.filter(item => item.status === 'open').length} /><Metric label="Sample quantity" value={`${items.reduce((total, item) => total + item.quantityKg, 0).toLocaleString('en-IN')} kg`} /><Metric label="Demo offers" value={items.reduce((total, item) => total + item.bids, 0)} /><Metric label="Sample awarded" value={items.filter(item => item.status === 'awarded').length} /></div>
    <div className="t-grid"><Panel title="Demo market board" subtitle="Explore harvested lots and future supply requests.">
      <div className="t-filter" style={{ marginBottom: 18 }}>
        <label><span className="sr-only">Search demo opportunities</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search crop, organisation or location" /></label>
        <label><span className="sr-only">Demo opportunity type</span><select value={mode} onChange={event => setMode(event.target.value)}><option value="all">Both types</option><option value="spot">Harvested lots</option><option value="forward">Forward requests</option></select></label>
        <label><span className="sr-only">Demo opportunity status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="awarded">Awarded</option></select></label>
      </div>
      <div className="t-list">{filtered.map(item => <article key={item.id} className="t-opportunity">
        <div className="t-opportunity-head"><div><span className="m-tag m-tag-indicative">Demo · {item.mode === 'spot' ? 'Harvested lot' : 'Forward request'}</span><h3>{item.crop}</h3><p className="m-small">{item.variety} · {item.quantityKg.toLocaleString('en-IN')} kg</p></div><Status value={item.status} /></div>
        <p>{item.organisation}</p><dl className="t-details"><Detail label="Handover">{item.location}</Detail><Detail label="Delivery">{item.delivery}</Detail><Detail label="Sample offers">{item.bids}</Detail></dl>
        <div className="t-opportunity-foot"><div className="t-opportunity-price">{money(item.pricePaise)}<small> / kg · sample price</small></div><button type="button" className="m-btn m-btn-secondary" aria-expanded={selected === item.id} onClick={() => setSelected(item.id)}>View {item.crop} demo</button></div>
      </article>)}{!filtered.length && <Empty>No demo opportunities match. Try another crop or clear the filters.</Empty>}</div>
    </Panel><div ref={details} tabIndex={-1} role="region" aria-label="Demo opportunity details"><Panel title={active ? `${active.crop} demo details` : 'Sample opportunity details'}>
      {!active ? <p>Select an opportunity to review sample terms. Place saved bids in Shared auctions.</p> : <>
        <p>{active.organisation} · {active.quantityKg.toLocaleString('en-IN')} kg · whole {active.mode === 'spot' ? 'lot' : 'request'}.</p>
        <dl className="t-details"><Detail label="Handover">{active.location}; sample price includes packing.</Detail><Detail label="Quality">Grade A; sample inspection at collection.</Detail><Detail label="Payment">Illustrative bank transfer within 7 days of acceptance.</Detail><Detail label="Cancellation">Both parties review any cancellation before dispatch.</Detail><Detail label="Bidding rule">{active.mode === 'spot' ? 'Highest buyer bid' : 'Lowest FPO offer'}; minimum step {money(active.stepPaise)} / kg.</Detail><Detail label="Current sample price">{money(active.pricePaise)} / kg</Detail></dl>
        <p>Read-only example. Select Shared auctions above to submit a saved bid.</p>
      </>}
    </Panel></div></div>
  </>
}
