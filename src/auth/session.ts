import { auctionRequest, validateAccount } from '../services/auctionApi'
import type { Account } from '../services/auctionApi'

export const sessionKey = 'meraki-auction-session-v1'
/** Demo preview role for this tab. Never an account and never sent to a server. */
export const previewKey = 'meraki-demo-preview-v1'
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
type Snapshot = { preview: 'fpo' | 'exporter' | null; account: Account | null; checking: boolean; error: string }
type Request = (path: string, account: Account | null, body?: unknown) => Promise<unknown>

export function normalizeMobile(value: string): string {
  const number = value.replace(/[\s()\-]/g, '')
  if (!/^\+[1-9][0-9]{6,14}$/.test(number)) throw new Error('Include the country code, for example +91, and 7–15 digits.')
  return number
}

/** One session for entry and shared auctions; stale replies cannot change identity. */
export class AccountSession {
  private snapshot: Snapshot = { preview: null, account: null, checking: true, error: '' }
  private listeners = new Set<() => void>()
  private generation = 0
  constructor(private storage?: Storage, private request: Request = auctionRequest) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(value: Snapshot) { this.snapshot = value; this.listeners.forEach(listener => listener()) }
  private persistPreview(role: 'fpo' | 'exporter' | null) {
    try {
      if (role) this.storage?.setItem(previewKey, role)
      else this.storage?.removeItem(previewKey)
    } catch { /* Preview still works in memory for this page. */ }
  }
  private storedPreview(): 'fpo' | 'exporter' | null {
    try {
      const role = this.storage?.getItem(previewKey)
      return role === 'fpo' || role === 'exporter' ? role : null
    } catch { return null }
  }
  private persist(account: Account | null) {
    try {
      if (account) this.storage?.setItem(sessionKey, JSON.stringify(account))
      else {
        this.storage?.removeItem(sessionKey)
        // Procurement uses its own explicit identity; never carry it to another login.
        this.storage?.removeItem('meraki.trade.development-session.v1')
      }
    } catch { /* Private browsing can still use an in-memory session. */ }
  }
  async restore() {
    const epoch = ++this.generation
    this.update({ preview: null, account: null, checking: true, error: '' })
    try {
      let raw: string | null = null
      try { raw = this.storage?.getItem(sessionKey) ?? null } catch { /* no stored session */ }
      if (!raw) {
        // A reload keeps an explicit demo preview; it never restores an account.
        const preview = this.storedPreview()
        if (preview && epoch === this.generation) this.update({ preview, account: null, checking: false, error: '' })
        return
      }
      const account = validateAccount(JSON.parse(raw))
      const me = await this.request('/auth/me', account) as Record<string, unknown>
      if (!me || typeof me.user_id !== 'string' || me.organisation_id !== account.organisation_id || me.role !== account.role) throw new Error('Your account changed. Please sign in again.')
      if (epoch === this.generation) this.update({ preview: null, account, checking: false, error: '' })
    } catch {
      if (epoch === this.generation) {
        this.persist(null)
        this.update({ preview: null, account: null, checking: false, error: 'Your session could not be confirmed. Please sign in again.' })
      }
    } finally {
      if (epoch === this.generation && this.snapshot.checking) this.update({ ...this.snapshot, checking: false })
    }
  }
  async connect(register: boolean, values: Record<string, unknown>, role?: 'fpo' | 'exporter') {
    const epoch = ++this.generation
    const mobile_number = normalizeMobile(String(values.mobile_number ?? ''))
    const result = validateAccount(await this.request(register ? '/auth/register' : '/auth/login', null, { ...values, mobile_number }))
    if (epoch !== this.generation) return
    if (role && result.role !== role) {
      await this.request('/auth/logout', result, {}).catch(() => {})
      throw new Error(`This mobile number belongs to an ${result.role === 'fpo' ? 'FPO' : 'exporter'} account. Choose that account type to sign in.`)
    }
    this.persist(null)
    this.persistPreview(null)
    this.persist(result)
    this.update({ preview: null, account: result, checking: false, error: '' })
  }
  enterDemo = (role: 'fpo' | 'exporter' = 'exporter') => {
    ++this.generation
    if (this.snapshot.preview !== role || this.snapshot.account) this.persist(null)
    this.persistPreview(role)
    this.update({ preview: role, account: null, checking: false, error: '' })
  }
  invalidate = () => {
    ++this.generation
    this.persist(null)
    this.persistPreview(null)
    this.update({ preview: null, account: null, checking: false, error: 'Your session ended. Please sign in again.' })
  }
  signOut = async () => {
    const account = this.snapshot.account
    ++this.generation
    this.persist(null)
    this.persistPreview(null)
    this.update({ preview: null, account: null, checking: false, error: '' })
    if (account) {
      try { await this.request('/auth/logout', account, {}) } catch {
        // Local identity is cleared even when the remote token cannot be revoked.
        if (!this.snapshot.account) this.update({ ...this.snapshot, error: 'Signed out on this device. The server could not confirm session revocation.' })
      }
    }
  }
}
