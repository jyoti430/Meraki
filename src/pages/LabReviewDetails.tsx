import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CircleAlert, FileText, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useLots } from '../context/LotsContext'
import { useLabReview } from '../context/LabReviewContext'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { getCurrentReleaseStatus, getCurrentRequirementReviews, getLabEvidenceStatus, getLatestEvidenceReview, getReleaseEligibility, getRequirementDefinitions, validateLaboratoryReport } from '../services/LabReviewService'
import type { EvidenceAttachment, EvidenceReviewStatus, LabTestResult, ReleaseOutcome, RequirementReviewResult } from '../types'
import type { ReviewRequirementInput } from '../services/LabReviewService'

const badge = (status: string) => <span className={`lab-badge lab-${status.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{status}</span>
const localInputDate = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }
const newResult = (): LabTestResult => ({ id: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, analyte: '', testingMethod: '', result: '', unit: '', reportingLimit: '' })

export default function LabReviewDetails() {
  const { lotId = '' } = useParams()
  const { data: lots } = useLots()
  const lab = useLabReview()
  const { orders } = useBuyerOrders()
  const { data: farmers } = useFarmers()
  const lot = lots.lots.find((item) => item.id === lotId)
  const order = orders.find((item) => item.id === lot?.buyerOrderId)
  const [reportId, setReportId] = useState('')
  const [sampleId, setSampleId] = useState('')
  const [supersedesReportId, setSupersedesReportId] = useState('')
  const [laboratory, setLaboratory] = useState('')
  const [reportDate, setReportDate] = useState(localInputDate().slice(0, 10))
  const [documentReference, setDocumentReference] = useState('')
  const [reportNotes, setReportNotes] = useState('')
  const [reporter, setReporter] = useState('')
  const [tests, setTests] = useState<LabTestResult[]>([newResult()])
  const [attachment, setAttachment] = useState<EvidenceAttachment | null>(null)
  const [reviewer, setReviewer] = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [requirementEdits, setRequirementEdits] = useState<ReviewRequirementInput[]>([])
  const [evidenceEdits, setEvidenceEdits] = useState<Record<string, { status: EvidenceReviewStatus; reason: string }>>({})

  if (!lot || !order) return <div className="page-shell lab-page"><Link className="lab-back-link" to="/lab-release-review"><ArrowLeft size={15} /> Back to review queue</Link><section className="lab-empty"><CircleAlert size={21} /><h2>Lot or buyer order unavailable</h2><p>Check the lot record and its linked buyer order before reviewing release evidence.</p></section></div>
  const farmer = farmers.farmers.find((item) => item.id === lot.farmerId)
  const definitions = getRequirementDefinitions(lot, order, lab.data)
  const savedRequirements = getCurrentRequirementReviews(lot, order, lab.data)
  const currentFingerprint = getReleaseEligibility(lot, order, lab.data).fingerprint
  const requirements = definitions.map((definition) => requirementEdits.find((item) => item.requirementId === definition.id) ?? (() => {
    const saved = savedRequirements.find((item) => item.requirementId === definition.id)
    return { requirementId: definition.id, group: definition.group, requirement: definition.requirement, requiredCondition: definition.requiredCondition, required: definition.required, result: saved?.result ?? definition.suggestedResult, evidenceReference: saved?.evidenceReference ?? definition.evidenceReference, reviewerNote: saved?.reviewerNote ?? '' }
  })())
  const eligibility = getReleaseEligibility(lot, order, lab.data)
  const currentRelease = getCurrentReleaseStatus(lot, order, lab.data)
  const reports = lab.data.reports.filter((item) => item.lotId === lot.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const updateRequirement = (requirementId: string, field: keyof ReviewRequirementInput, value: string | boolean) => {
    setRequirementEdits((current) => {
      const currentEntry = current.find((item) => item.requirementId === requirementId) ?? requirements.find((item) => item.requirementId === requirementId)
      if (!currentEntry) return current
      const next = { ...currentEntry, [field]: value } as ReviewRequirementInput
      return [...current.filter((item) => item.requirementId !== requirementId), next]
    })
  }
  const addReport = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice('')
    try {
      const createdId = lab.addReport({ reportId, lotId: lot.id, sampleId, supersedesReportId: supersedesReportId || null, issuingLaboratory: laboratory, reportDate, results: tests.filter((item) => item.analyte || item.result || item.unit), documentReference, attachment, reviewerNotes: reportNotes, createdBy: reporter })
      setNotice(`Report ${createdId} added as pending evidence. A new report starts a fresh review.`)
      setRequirementEdits([])
      setReportId(''); setSampleId(''); setSupersedesReportId(''); setLaboratory(''); setDocumentReference(''); setReportNotes(''); setTests([newResult()]); setAttachment(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Report could not be added.') }
  }
  const saveEvidenceReview = (id: string) => {
    setError(''); setNotice('')
    try { const value = evidenceEdits[id]; lab.reviewEvidence(lot.id, id, value?.status ?? 'Under Review', reviewer, value?.reason ?? ''); setRequirementEdits([]); setNotice('Evidence review recorded. Requirement reviews and release decisions may now need refreshing.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Evidence review could not be recorded.') }
  }
  const saveChecklist = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice('')
    try { lab.saveRequirements(lot.id, requirements, reviewer); setRequirementEdits([]); setNotice('Requirement review saved against this exact evidence and specification version.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Requirement checklist could not be saved.') }
  }
  const recordDecision = (outcome: ReleaseOutcome) => {
    setError(''); setNotice('')
    if (outcome === 'Released' && !window.confirm(`Release lot ${lot.id} against buyer order ${order.id}? This decision will be recorded in review history and does not dispatch the lot.`)) return
    try { lab.decide(lot.id, outcome, reviewer, decisionReason); setNotice(`${outcome} decision recorded in review history.`); setDecisionReason('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Decision could not be recorded.') }
  }
  const uploadAttachment = async (file: File | undefined) => {
    setError(''); setAttachment(null)
    if (!file) return
    if (file.size > 800_000) { setError('Report attachment exceeds the 800 KB local storage limit.'); return }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Attachment could not be read.')); reader.readAsDataURL(file) })
      setAttachment({ id: `LAB-FILE-${Date.now()}`, name: file.name, mediaType: file.type || 'application/octet-stream', dataUrl, addedAt: new Date().toISOString(), addedBy: reporter || reviewer })
    } catch (err) { setError(err instanceof Error ? err.message : 'Attachment could not be read.') }
  }
  const currentRequirementSetFresh = savedRequirements.length === definitions.length && savedRequirements.every((item) => item.sourceFingerprint === currentFingerprint)
  const history = lab.data.releaseHistory.filter((item) => item.lotId === lot.id).sort((a, b) => b.decision.decidedAt.localeCompare(a.decision.decidedAt))
  return <div className="page-shell lab-page lab-detail-page"><Link className="lab-back-link" to="/lab-release-review"><ArrowLeft size={15} /> Back to review queue</Link>
    <div className="lab-detail-heading"><div><div className="eyebrow">AUTHORISED REVIEW · {lot.buyerOrderId}</div><h1>{lot.id}</h1><p>{lot.crop} · {lot.variety} · {farmer?.name ?? lot.farmerId} · Specification {lot.buyerSpecificationVersion ? `v${lot.buyerSpecificationVersion}` : 'unavailable'}</p></div><div className="lab-current-status">{badge(currentRelease.status)}<Link to={`/lots-inspection/${lot.id}`}>Open lot record</Link></div></div>
    <div className="lab-context-strip"><div><small>Buyer</small><strong>{order.buyer.name}</strong></div><div><small>Inspection status</small><strong>{lot.inspectionStatus}</strong></div><div><small>Lab evidence status</small><strong>{getLabEvidenceStatus(lot, lab.data)}</strong></div><div><small>Inspection / sample / report</small><strong>{lot.inspections.length} / {lot.samples.length} / {reports.length}</strong></div><div><small>Net quantity</small><strong>{lot.weights.netReceivedWeightKg.toLocaleString()} kg</strong></div></div>
    {currentRelease.stale && <div className="lab-warning-box"><CircleAlert size={17} /><div><strong>Evidence changed since the last decision</strong><span>Previous decisions remain in history. Review the current requirements and record a new decision.</span></div></div>}
    {error && <div className="lab-alert" role="alert">{error}</div>}{notice && <div className="lab-notice" role="status"><Check size={15} />{notice}</div>}

    <section className="lab-card"><header className="lab-card-heading"><div><h2>Laboratory evidence</h2><p>Values are preserved as reported. A report upload alone does not establish compliance.</p></div><span>{reports.length} report(s)</span></header>
      {reports.length ? <div className="lab-report-stack">{reports.map((report) => { const evidenceReview = getLatestEvidenceReview(lab.data, report.id); const validation = validateLaboratoryReport(report, lot, lot.samples.find((sample) => sample.id === report.sampleId)); const edit = evidenceEdits[report.id]; return <article className="lab-report-card" key={report.id}><header><div><strong>{report.reportId}</strong><span>{report.issuingLaboratory} · Report date {new Date(report.reportDate).toLocaleDateString()}</span></div>{badge(evidenceReview?.status ?? 'Pending')}</header><div className="lab-report-meta"><span>Internal reference {report.id}</span><span>Sample {report.sampleId} · Collected {new Date(report.sampleCollectedAt).toLocaleString()}</span><span>Specification {report.buyerSpecificationVersion ? `v${report.buyerSpecificationVersion}` : 'version unavailable'}</span>{report.supersedesReportId && <span>Correction for {lab.data.reports.find((item) => item.id === report.supersedesReportId)?.reportId ?? report.supersedesReportId}</span>}</div><div className="lab-results-scroll"><table className="lab-results"><thead><tr><th>ANALYTE / TEST</th><th>METHOD</th><th>REPORTED RESULT</th><th>REPORTING LIMIT</th></tr></thead><tbody>{report.results.length ? report.results.map((result) => <tr key={result.id}><td>{result.analyte || 'Not reported'}</td><td>{result.testingMethod || 'Not reported'}</td><td>{result.result || 'Not reported'} {result.unit}</td><td>{result.reportingLimit || 'Not reported'}</td></tr>) : <tr><td colSpan={4}>No analyte results recorded.</td></tr>}</tbody></table></div>{validation.errors.length > 0 && <div className="lab-validation-list errors">{validation.errors.map((item) => <span key={item}>{item}</span>)}</div>}{validation.warnings.length > 0 && <div className="lab-validation-list warnings">{validation.warnings.map((item) => <span key={item}>{item}</span>)}</div>}{report.documentReference && <p className="lab-doc-ref"><FileText size={14} /> Document reference: {report.documentReference}</p>}{report.attachment && <a className="lab-attachment-link" href={report.attachment.dataUrl} download={report.attachment.name}><FileText size={14} />{report.attachment.name}</a>}{report.reviewerNotes && <p className="lab-report-note">Recorder note: {report.reviewerNotes}</p>}
          <div className="lab-evidence-review"><label>Evidence status<select value={edit?.status ?? evidenceReview?.status ?? 'Pending'} onChange={(event) => setEvidenceEdits((current) => ({ ...current, [report.id]: { status: event.target.value as EvidenceReviewStatus, reason: current[report.id]?.reason ?? '' } }))}>{['Pending', 'Under Review', 'Accepted', 'Rejected'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Review reason / notes<input value={edit?.reason ?? ''} onChange={(event) => setEvidenceEdits((current) => ({ ...current, [report.id]: { status: current[report.id]?.status ?? 'Pending', reason: event.target.value } }))} placeholder={edit?.status === 'Rejected' ? 'Required reason for rejection' : 'Required note when accepting evidence'} /></label><button className="secondary-button" type="button" onClick={() => saveEvidenceReview(report.id)}>Record evidence review</button></div>
          {lab.data.evidenceReviews.filter((item) => item.reportId === report.id).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).length > 1 && <details className="lab-evidence-history"><summary>Evidence review history</summary>{lab.data.evidenceReviews.filter((item) => item.reportId === report.id).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).map((item) => <p key={item.id}>{item.status} · {item.reviewer} · {new Date(item.reviewedAt).toLocaleString()} · {item.reason}</p>)}</details>}
        </article> })}</div> : <div className="lab-inline-empty">No laboratory reports recorded for this lot.</div>}
      <form className="lab-report-form" onSubmit={addReport}><div className="lab-form-title"><span><Plus size={16} /></span><div><h3>Add laboratory report</h3><p>Create a new immutable report record. Corrections should be entered as a separate report.</p></div></div><div className="lab-form-grid"><label>Report ID<input required value={reportId} onChange={(event) => setReportId(event.target.value)} /></label><label>Issuing laboratory<input required value={laboratory} onChange={(event) => setLaboratory(event.target.value)} /></label><label>Sample<select required value={sampleId} onChange={(event) => { setSampleId(event.target.value); setSupersedesReportId('') }}><option value="">Select a sample linked to this lot</option>{lot.samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.id} · {new Date(sample.collectedAt).toLocaleString()} · {sample.sublotId ?? 'Parent lot'}</option>)}</select></label><label>Correction of report <span>Optional · selects an explicit replacement</span><select value={supersedesReportId} onChange={(event) => setSupersedesReportId(event.target.value)}><option value="">New independent report</option>{reports.filter((report) => report.sampleId === sampleId && !reports.some((item) => item.supersedesReportId === report.id)).map((report) => <option key={report.id} value={report.id}>{report.reportId} · {getLatestEvidenceReview(lab.data, report.id)?.status ?? 'Pending'}</option>)}</select></label><label>Report date<input required type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label><label>Recorded by<input required value={reporter} onChange={(event) => setReporter(event.target.value)} /></label><label>Report/document reference <span>Optional</span><input value={documentReference} onChange={(event) => setDocumentReference(event.target.value)} /></label><label className="lab-wide">Recorder notes<textarea rows={2} value={reportNotes} onChange={(event) => setReportNotes(event.target.value)} /></label></div>
        <div className="lab-subhead"><strong>Reported analytes / tests</strong><span>Enter source values and units without conversion.</span><button type="button" className="lab-small-button" onClick={() => setTests((current) => [...current, newResult()])}><Plus size={13} /> Add result</button></div>{tests.map((test, index) => <div className="lab-test-entry" key={test.id}><label>Analyte / test<input value={test.analyte} onChange={(event) => setTests((current) => current.map((item, i) => i === index ? { ...item, analyte: event.target.value } : item))} /></label><label>Testing method<input value={test.testingMethod} onChange={(event) => setTests((current) => current.map((item, i) => i === index ? { ...item, testingMethod: event.target.value } : item))} /></label><label>Result<input value={test.result} onChange={(event) => setTests((current) => current.map((item, i) => i === index ? { ...item, result: event.target.value } : item))} /></label><label>Unit<input value={test.unit} onChange={(event) => setTests((current) => current.map((item, i) => i === index ? { ...item, unit: event.target.value } : item))} /></label><label>Reporting limit<input value={test.reportingLimit} onChange={(event) => setTests((current) => current.map((item, i) => i === index ? { ...item, reportingLimit: event.target.value } : item))} /></label><button type="button" className="lab-remove" aria-label="Remove result row" onClick={() => setTests((current) => current.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>)}
        <div className="lab-upload-row"><label>Attach report <span>Optional · PDF or image · max 800 KB</span><input type="file" accept="application/pdf,image/*" onChange={(event) => void uploadAttachment(event.target.files?.[0])} /></label>{attachment && <span className="lab-attached-file"><FileText size={13} />{attachment.name}</span>}</div><button className="primary-button" type="submit" disabled={!lot.samples.length}><Plus size={15} /> Add report as Pending</button>{!lot.samples.length && <small className="lab-help">Create a sample record in the lot first.</small>}</form>
    </section>

    <form className="lab-card lab-requirements-card" onSubmit={saveChecklist}><header className="lab-card-heading"><div><h2>Buyer requirement checklist</h2><p>Requirements are loaded from order {order.id}, specification version {lot.buyerSpecificationVersion ?? 'unavailable'}.</p></div><span>{savedRequirements.length}/{definitions.length} current reviews</span></header>{lot.buyerSpecificationVersion === null && <div className="lab-warning-box"><CircleAlert size={16} /><div><strong>Exact specification version unavailable</strong><span>This lot cannot be released until its plan is linked to a saved buyer specification version.</span></div></div>}{!definitions.length ? <div className="lab-inline-empty">No buyer specification version is available to evaluate.</div> : <div className="lab-requirements-groups">{(['Commercial / quality', 'Safety and laboratory', 'Mandatory documents', 'Other order requirements'] as const).map((group) => { const groupItems = requirements.filter((item) => item.group === group); return groupItems.length ? <section key={group}><h3>{group}</h3>{groupItems.map((item) => { const definition = definitions.find((candidate) => candidate.id === item.requirementId)!; return <article className="lab-requirement-row" key={item.requirementId}><div className="lab-requirement-main"><div><strong>{item.requirement}</strong>{item.required && <em>Required</em>}</div><p>{item.requiredCondition}</p><small>Evidence guidance: {definition.suggestionReason}</small></div><label>Review result<select value={item.result} onChange={(event) => updateRequirement(item.requirementId, 'result', event.target.value as RequirementReviewResult)}>{['Pending', 'Pass', 'Fail', 'Insufficient Evidence'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Evidence reference<input value={item.evidenceReference} onChange={(event) => updateRequirement(item.requirementId, 'evidenceReference', event.target.value)} placeholder="Inspection ID, report ID or document reference" /></label><label>Reviewer note<input value={item.reviewerNote} onChange={(event) => updateRequirement(item.requirementId, 'reviewerNote', event.target.value)} placeholder={definition.suggestionReason} /></label></article>})}</section> : null })}</div>}
      <div className="lab-save-reviews"><label>Authorised reviewer<input required value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label><button className="secondary-button" type="submit" disabled={!definitions.length}><Check size={14} /> Save checklist review</button></div>{savedRequirements.length > 0 && !currentRequirementSetFresh && <p className="lab-help">Some saved requirement reviews are stale because lot or report evidence changed. Save a new review before release.</p>}</form>

    <section className="lab-card lab-release-card"><header className="lab-card-heading"><div><h2>Release decision</h2><p>Release does not dispatch stock. Dispatch remains outside this module.</p></div>{badge(currentRelease.status)}</header><div className={`lab-eligibility ${eligibility.eligible ? 'eligible' : 'blocked'}`}><div><ShieldCheck size={17} /><strong>{eligibility.eligible ? 'All mandatory checks are currently eligible for reviewer approval.' : 'Release is blocked until required evidence and reviews are complete.'}</strong></div>{eligibility.blockers.length > 0 && <ul>{eligibility.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}{eligibility.warnings.map((item) => <p key={item}>{item}</p>)}</div><label className="lab-decision-reason">Decision reason / note<textarea rows={2} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Required for Held or Rejected; optional approval note for Released" /></label><div className="lab-decision-actions"><button type="button" className="lab-release-button" disabled={!eligibility.eligible || !reviewer.trim()} onClick={() => recordDecision('Released')}>Confirm Release</button><button type="button" className="lab-hold-button" disabled={!reviewer.trim() || !decisionReason.trim()} onClick={() => recordDecision('Held')}>Place on Hold</button><button type="button" className="lab-reject-button" disabled={!reviewer.trim() || !decisionReason.trim()} onClick={() => recordDecision('Rejected')}>Reject Lot</button></div></section>

    <section className="lab-card"><header className="lab-card-heading"><div><h2>Release review history</h2><p>Earlier decisions are preserved. Any source evidence change marks the prior decision stale.</p></div><span>{history.length} decision(s)</span></header>{history.length ? <div className="lab-history-list">{history.map((item) => <article key={item.id}><div>{badge(item.decision.outcome)}{item.sourceFingerprint !== currentFingerprint && badge('Stale review')}</div><strong>{item.decision.reviewer} · {new Date(item.decision.decidedAt).toLocaleString()}</strong><span>Order {item.buyerOrderId} · Specification {item.buyerSpecificationVersion ?? 'unavailable'}</span><p>{item.decision.reason || 'No decision note recorded.'}</p></article>)}</div> : <div className="lab-inline-empty">No release decisions have been recorded.</div>}</section>
  </div>
}
