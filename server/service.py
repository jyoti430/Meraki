"""Trade aggregates. All mutating methods run inside Database.transaction().

The resources keep immutable bid/inspection/payment histories; only service
commands can change current state. The global lock makes cross-resource stock
and capacity checks atomic for the initial, deliberately small deployment.
"""
import copy
import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from .db import Command, PrincipalSession, Resource, canonical_hash
from .domain import allocate, contributions, fail, integer, iso, money, require, string, terms_from, timestamp


PRINCIPALS = {
    'fpo-a': dict(id='fpo-a', display_name='Synthetic FPO A', organisation_id='fpo-a', role='fpo'),
    'fpo-b': dict(id='fpo-b', display_name='Synthetic FPO B', organisation_id='fpo-b', role='fpo'),
    'exporter-a': dict(id='exporter-a', display_name='Synthetic Exporter A', organisation_id='exporter-a', role='exporter'),
    'exporter-b': dict(id='exporter-b', display_name='Synthetic Exporter B', organisation_id='exporter-b', role='exporter'),
    'qc-a': dict(id='qc-a', display_name='Synthetic QC reviewer A', organisation_id='fpo-a', role='qc_reviewer'),
    'qc-b': dict(id='qc-b', display_name='Synthetic QC reviewer B', organisation_id='fpo-b', role='qc_reviewer'),
    'finance-a': dict(id='finance-a', display_name='Synthetic Finance reviewer A', organisation_id='fpo-a', role='finance_reviewer'),
    'finance-b': dict(id='finance-b', display_name='Synthetic Finance reviewer B', organisation_id='fpo-b', role='finance_reviewer'),
}
COLLECTIONS = ('lots', 'capacities', 'auctions', 'contracts', 'shipments', 'receipts', 'claims', 'settlements')
BLOCKERS = ['Part 2 verified identity adapter is not installed', 'Part 2 authoritative capacity adapter is not installed',
            'Production PostgreSQL, operational, legal and payment-provider acceptance remain external gates']


def utcnow():
    return datetime.now(timezone.utc)


class TradeService:
    def __init__(self, database, demo_enabled=False, environment='development', clock=None):
        self.database = database
        self.environment = environment
        self.demo_enabled = bool(demo_enabled and environment != 'production')
        self.clock = clock or utcnow

    def now(self):
        result = self.clock()
        require(isinstance(result, datetime) and result.tzinfo is not None, 'Server clock must be timezone aware', 500)
        return result.astimezone(timezone.utc)

    def health(self):
        return dict(status='ok', mode=self.environment, synthetic=self.demo_enabled, production_ready=False,
                    blockers=BLOCKERS, server_time=iso(self.now()))

    def seed(self):
        if not self.demo_enabled:
            return
        with self.database.transaction() as session:
            for suffix in ('a', 'b'):
                key = 'capacity-' + suffix
                if session.get(Resource, key) is None:
                    self.create(session, 'capacities', dict(organisation_id='fpo-' + suffix, crop='okra', variety='okra',
                        grade='A', grade_protocol='export-v1', quantity_g=1000000, reserved_g=0, committed_g=0,
                        converted_g=0, available_g=1000000, consented=True, reviewed=True,
                        delivery_start='2020-01-01T00:00:00Z', delivery_end='2100-01-01T00:00:00Z',
                        evidence_reference='synthetic://capacity/' + suffix, reservations=[], synthetic=True), key)

    def create_session(self, principal_id):
        require(self.demo_enabled, 'Development sessions unavailable', 404)
        require(isinstance(principal_id, str), 'principal_id must be a string', 422)
        require(principal_id in PRINCIPALS, 'Unknown development principal', 422)
        token = secrets.token_urlsafe(40)
        with self.database.transaction() as session:
            session.add(PrincipalSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), principal_id=principal_id,
                                         expires_at=iso(utcnow() + timedelta(hours=12))))
        return dict(token=token, principal=PRINCIPALS[principal_id], synthetic=True)

    def authenticate(self, authorization):
        require(self.demo_enabled, 'Verified Part 2 identity integration required; live trading disabled', 503)
        require(isinstance(authorization, str) and authorization.startswith('Bearer '), 'Bearer session required', 401)
        token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
        with self.database.sessions() as session:
            record = session.get(PrincipalSession, token_hash)
            # Authentication lifetime follows real server time. The injected
            # domain clock accelerates synthetic auction/expiry tests only.
            require(record is not None and timestamp(record.expires_at) > utcnow(), 'Invalid or expired session', 401)
            return copy.deepcopy(PRINCIPALS[record.principal_id])

    def create(self, session, kind, fields, key=None):
        key = key or kind.rstrip('s') + '-' + uuid4().hex
        value = dict(id=key, version=1, created_at=iso(self.now()), updated_at=iso(self.now()), **copy.deepcopy(fields))
        session.add(Resource(id=key, kind=kind, document=value))
        session.flush()
        return value

    def get(self, session, kind, key):
        require(isinstance(key, str) and 0 < len(key) <= 80, 'Resource id must be a string (maximum 80 characters)', 422)
        resource = session.get(Resource, key)
        require(resource is not None and resource.kind == kind, 'Resource not found', 404)
        return copy.deepcopy(resource.document)

    def all(self, session, kind):
        return [copy.deepcopy(row.document) for row in session.scalars(select(Resource).where(Resource.kind == kind).order_by(Resource.id))]

    def save(self, session, value):
        value['version'] += 1
        value['updated_at'] = iso(self.now())
        session.get(Resource, value['id']).document = copy.deepcopy(value)
        session.flush()
        return value

    def audit(self, session, principal, action, resource, details=None):
        self.create(session, 'audit_events', dict(actor_id=principal['id'], organisation_id=principal['organisation_id'],
            action=action, resource_id=resource['id'], resource_version=resource['version'],
            parties=[x for x in (resource.get('seller_org'), resource.get('buyer_org'), resource.get('owner_org'),
                                resource.get('organisation_id')) if x], details=details or {}))

    def visible(self, value, kind, principal):
        org = principal['organisation_id']
        if kind == 'auctions':
            return True
        if kind == 'lots':
            return value['seller_org'] == org or value.get('buyer_org') == org
        if kind == 'capacities':
            return value['organisation_id'] == org
        if kind == 'audit_events':
            return org in value.get('parties', [])
        return org in (value.get('seller_org'), value.get('buyer_org'))

    def project(self, value, kind, principal):
        value = copy.deepcopy(value)
        if kind == 'auctions':
            if value['status'] == 'scheduled' and timestamp(value['opens_at']) <= self.now():
                value['status'] = 'open'
            # Only owner sees all counterpart offers; other organisations see
            # their own bid receipts and the publicly disclosed leading price.
            if principal['organisation_id'] != value['owner_org']:
                value['bids'] = [bid for bid in value['bids'] if bid['organisation_id'] == principal['organisation_id']]
        if kind == 'lots' and principal['organisation_id'] != value['seller_org']:
            value.pop('member_contributions', None)
        if kind == 'settlements' and principal['organisation_id'] != value['seller_org']:
            for field in ('allocations', 'disbursals', 'payments'):
                value.pop(field, None)
        return value

    def read(self, kind, principal, key=None, limit=200):
        require(kind in COLLECTIONS, 'Unknown resource collection', 404)
        with self.database.sessions() as session:
            if key:
                value = self.get(session, kind, key)
                require(self.visible(value, kind, principal), 'Resource not found', 404)
                return self.project(value, kind, principal)
            items = [self.project(v, kind, principal) for v in self.all(session, kind) if self.visible(v, kind, principal)]
            return {'items': items[:limit]}

    def workspace(self, principal):
        # One read transaction produces a consistent PostgreSQL snapshot only
        # when serialised with commands as below; avoids torn cross-ledger views.
        with self.database.transaction() as session:
            result = dict(server_time=iso(self.now()), synthetic=self.demo_enabled, principal=principal,
                          production_ready=False, blockers=BLOCKERS)
            for kind in (*COLLECTIONS, 'audit_events'):
                values = self.all(session, kind)
                result[kind] = [self.project(v, kind, principal) for v in values if self.visible(v, kind, principal)][-200:]
            return result

    def role(self, principal, role):
        require(principal['role'] == role, f'{role} permission required', 403)

    def own(self, value, principal, field='seller_org'):
        require(value.get(field) == principal['organisation_id'], 'Resource not found', 404)

    def party(self, value, principal):
        require(principal['organisation_id'] in (value['seller_org'], value['buyer_org']), 'Resource not found', 404)
        require(principal['role'] in ('fpo', 'exporter'), 'Trading party permission required', 403)

    def version(self, value, body):
        require(type(body.get('expected_version')) is int, 'expected_version is required', 422)
        require(value['version'] == body['expected_version'], 'Resource changed; refresh and retry with a new idempotency key')

    def execute(self, principal, key, path, body, operation):
        require(self.demo_enabled, 'Live trading requires real identity and capacity adapters', 503)
        key = string(key, 'Idempotency-Key')
        require(len(key) <= 200, 'Idempotency-Key exceeds 200 characters', 422)
        fingerprint = canonical_hash(dict(path=path, body=body))
        command_id = canonical_hash([principal['id'], key])
        with self.database.transaction() as session:
            previous = session.get(Command, command_id)
            if previous:
                require(previous.fingerprint == fingerprint, 'Idempotency key reused with a different command')
                return copy.deepcopy(previous.response)
            result = operation(session)
            session.add(Command(id=command_id, fingerprint=fingerprint, response=copy.deepcopy(result)))
            return result

    def create_lot(self, session, principal, body):
        self.role(principal, 'fpo')
        quantity = integer(body.get('quantity_g'), 'quantity_g', 1)
        try:
            harvest_date = date.fromisoformat(body.get('harvest_date'))
        except (ValueError, TypeError):
            fail('harvest_date must be YYYY-MM-DD', 422)
        pickup = timestamp(body.get('pickup_deadline'), 'pickup_deadline')
        require(pickup > self.now(), 'Pickup deadline has passed')
        require(harvest_date <= self.now().date(), 'Future harvest is planned capacity, not an actual harvested lot', 422)
        require(pickup.date() >= harvest_date, 'Pickup cannot precede harvest', 422)
        fields = dict(seller_org=principal['organisation_id'], buyer_org=None,
            crop=string(body.get('crop'), 'crop'), variety=string(body.get('variety'), 'variety'), grade=string(body.get('grade'), 'grade'),
            quantity_g=quantity, harvest_date=harvest_date.isoformat(), pickup_deadline=iso(pickup),
            member_contributions=contributions(body.get('member_contributions'), quantity), status='held', qc_status='pending',
            reserved_g=0, shipped_g=0, inspections=[], reviews=[], forward_contract_id=None, sale_auction_id=None)
        lot = self.create(session, 'lots', fields)
        self.audit(session, principal, 'lot.created', lot)
        return lot

    def inspect_lot(self, session, principal, key, body):
        self.role(principal, 'fpo')
        lot = self.get(session, 'lots', key)
        self.own(lot, principal)
        self.version(lot, body)
        # New observations append history and may hold pending dispatches. They
        # never rewrite the evidence attached to an already moved shipment.
        inspection = {field: string(body.get(field), field) for field in ('sample_id', 'protocol', 'protocol_version',
            'observed_grade', 'defects', 'report_reference', 'issuer')}
        inspection['inspected_weight_g'] = integer(body.get('inspected_weight_g'), 'inspected_weight_g', 1, lot['quantity_g'])
        inspection['sample_count'] = integer(body.get('sample_count'), 'sample_count', 1, 1000000)
        inspection['inspected_at'] = iso(timestamp(body.get('inspected_at'), 'inspected_at'))
        require(timestamp(inspection['inspected_at']) <= self.now(), 'Inspection date cannot be in the future', 422)
        require(timestamp(inspection['inspected_at']).date() >= date.fromisoformat(lot['harvest_date']), 'Inspection cannot precede actual harvest', 422)
        require(type(body.get('safety_hold')) is bool, 'safety_hold must be a boolean', 422)
        inspection.update(id='inspection-' + uuid4().hex, safety_hold=body['safety_hold'], recorded_at=iso(self.now()), actor_id=principal['id'])
        lot['inspections'].append(inspection)
        lot.update(qc_status='pending', status='held')
        self.save(session, lot)
        self.audit(session, principal, 'lot.inspected', lot)
        return lot

    def review_lot(self, session, principal, key, body):
        self.role(principal, 'qc_reviewer')
        lot = self.get(session, 'lots', key)
        self.own(lot, principal)
        self.version(lot, body)
        decision = body.get('decision')
        require(decision in ('release', 'hold'), 'decision must be release or hold', 422)
        reason = string(body.get('reason'), 'reason')
        if decision == 'release':
            require(lot['inspections'], 'Inspection evidence required before release')
            require(not lot['inspections'][-1]['safety_hold'], 'Unresolved safety hold prevents release')
            require(lot['inspections'][-1]['observed_grade'] == lot['grade'], 'Observed grade differs from declared lot grade')
        lot['reviews'].append(dict(id='review-' + uuid4().hex, decision=decision, reason=reason,
                                   actor_id=principal['id'], reviewed_at=iso(self.now()), inspection_id=lot['inspections'][-1]['id'] if lot['inspections'] else None))
        lot.update(qc_status='released' if decision == 'release' else 'held', status='available' if decision == 'release' else 'held')
        self.save(session, lot)
        self.audit(session, principal, 'lot.' + decision, lot)
        return lot

    def create_auction(self, session, principal, body):
        mode = body.get('mode')
        require(mode in ('spot', 'forward'), 'mode must be spot or forward', 422)
        self.role(principal, 'fpo' if mode == 'spot' else 'exporter')
        opens = timestamp(body['opens_at'], 'opens_at') if body.get('opens_at') else self.now()
        closes = timestamp(body['closes_at'], 'closes_at') if body.get('closes_at') else opens + timedelta(hours=2)
        require(closes > opens and closes > self.now(), 'Auction close must follow opening and current server time', 422)
        terms = terms_from(body)
        require(timestamp(terms['delivery_end']) >= closes, 'Delivery window ends before auction closes', 422)
        fields = dict(mode=mode, owner_org=principal['organisation_id'], seller_org=None, lot_id=None, status='scheduled',
            opens_at=iso(opens), closes_at=iso(closes), original_closes_at=iso(closes), extension_seconds=0,
            extension_window_seconds=120 if mode == 'spot' else 0, max_extension_seconds=600 if mode == 'spot' else 0,
            bids=[], leading_price_paise_per_kg=None, contract_id=None, terms=terms, **terms)
        if mode == 'spot':
            lot = self.get(session, 'lots', body.get('lot_id'))
            self.own(lot, principal)
            require(lot['qc_status'] == 'released', 'Lot must have QC release before auction')
            require(lot['inspections'][-1]['protocol'] == terms['grade_protocol'], 'QC evidence does not cover auction grade protocol')
            require(lot['reserved_g'] == 0 and lot['shipped_g'] == 0 and not lot['sale_auction_id'], 'Lot already committed or offered')
            require(not lot['forward_contract_id'], 'Forward committed lot cannot enter a spot auction')
            require(timestamp(lot['pickup_deadline']) >= timestamp(terms['delivery_end']), 'Delivery exceeds pickup deadline', 422)
            fields.update(lot_id=lot['id'], seller_org=lot['seller_org'], crop=lot['crop'], variety=lot['variety'],
                          grade=lot['grade'], quantity_g=lot['quantity_g'],
                          reserve_price_paise_per_kg=integer(body.get('reserve_price_paise_per_kg'), 'reserve_price_paise_per_kg', 1),
                          increment_paise_per_kg=integer(body.get('increment_paise_per_kg'), 'increment_paise_per_kg', 1))
        else:
            fields.update(crop=string(body.get('crop'), 'crop'), variety=string(body.get('variety'), 'variety'), grade=string(body.get('grade'), 'grade'),
                          quantity_g=integer(body.get('quantity_g'), 'quantity_g', 1),
                          maximum_price_paise_per_kg=integer(body.get('maximum_price_paise_per_kg'), 'maximum_price_paise_per_kg', 1))
        money(fields['quantity_g'], fields['reserve_price_paise_per_kg'] if mode == 'spot' else fields['maximum_price_paise_per_kg'])
        auction = self.create(session, 'auctions', fields)
        if mode == 'spot':
            lot.update(reserved_g=lot['quantity_g'], sale_auction_id=auction['id'])
            self.save(session, lot)
        self.audit(session, principal, 'auction.created', auction)
        return auction

    def capacity_reserve(self, session, principal, auction, capacity_id):
        capacity = self.get(session, 'capacities', capacity_id)
        self.own(capacity, principal, 'organisation_id')
        require(capacity['consented'] and capacity['reviewed'], 'Capacity requires consent and reviewed evidence')
        require(all(capacity[field] == auction[field] for field in ('crop', 'variety', 'grade', 'grade_protocol')), 'Capacity crop, variety, grade or protocol mismatch')
        require(timestamp(capacity['delivery_start']) <= timestamp(auction['delivery_start']) and
                timestamp(capacity['delivery_end']) >= timestamp(auction['delivery_end']), 'Capacity does not cover delivery window')
        require(capacity['available_g'] >= auction['quantity_g'], 'Insufficient uncommitted capacity')
        reservation = dict(id='reservation-' + uuid4().hex, auction_id=auction['id'], quantity_g=auction['quantity_g'],
                           status='reserved', reserved_at=iso(self.now()), expires_at=iso(timestamp(auction['closes_at']) + timedelta(hours=24)))
        capacity['reservations'].append(reservation)
        capacity['available_g'] -= auction['quantity_g']
        capacity['reserved_g'] += auction['quantity_g']
        self.save(session, capacity)
        return reservation['id']

    def capacity_transition(self, session, capacity_id, reservation_id, target):
        capacity = self.get(session, 'capacities', capacity_id)
        reservation = next((r for r in capacity['reservations'] if r['id'] == reservation_id), None)
        require(reservation is not None, 'Capacity reservation missing', 500)
        old = reservation['status']
        if old == target:
            return
        allowed = {'reserved': ('committed', 'released'), 'committed': ('converted', 'released')}
        require(target in allowed.get(old, ()), 'Illegal capacity reservation transition')
        capacity[old + '_g'] -= reservation['quantity_g']
        if target == 'released':
            capacity['available_g'] += reservation['quantity_g']
        else:
            capacity[target + '_g'] += reservation['quantity_g']
        reservation.update(status=target, updated_at=iso(self.now()))
        self.save(session, capacity)

    def bid(self, session, principal, key, body):
        auction = self.get(session, 'auctions', key)
        self.role(principal, 'exporter' if auction['mode'] == 'spot' else 'fpo')
        self.version(auction, body)
        require(principal['organisation_id'] != auction['owner_org'], 'Self or linked organisation bids prohibited', 403)
        require(auction['status'] in ('scheduled', 'open') and timestamp(auction['opens_at']) <= self.now() < timestamp(auction['closes_at']), 'Auction is not accepting bids')
        price = integer(body.get('price_paise_per_kg'), 'price_paise_per_kg', 1)
        money(auction['quantity_g'], price)  # Reject totals unsafe for JSON/JS consumers.
        bid = dict(id='bid-' + uuid4().hex, organisation_id=principal['organisation_id'], price_paise_per_kg=price,
                   accepted_at=iso(self.now()), sequence=len(auction['bids']) + 1, status='active')
        if auction['mode'] == 'spot':
            require(price >= auction['reserve_price_paise_per_kg'], 'Price is below reserve')
            leader = auction['leading_price_paise_per_kg']
            require(leader is None or price >= leader + auction['increment_paise_per_kg'], 'Spot bid must improve leading price by published increment')
            if timestamp(auction['closes_at']) - self.now() <= timedelta(seconds=120):
                new_close = min(self.now() + timedelta(seconds=120), timestamp(auction['original_closes_at']) + timedelta(seconds=600))
                auction['closes_at'] = iso(max(new_close, timestamp(auction['closes_at'])))
                auction['extension_seconds'] = int((timestamp(auction['closes_at']) - timestamp(auction['original_closes_at'])).total_seconds())
        else:
            require(price <= auction['maximum_price_paise_per_kg'], 'Offer exceeds maximum price')
            previous = next((b for b in reversed(auction['bids']) if b['organisation_id'] == principal['organisation_id'] and b['status'] == 'active'), None)
            if previous:
                require(price < previous['price_paise_per_kg'], 'Replacement offer must lower your previous price')
                self.capacity_transition(session, previous['capacity_id'], previous['reservation_id'], 'released')
                previous['status'] = 'superseded'
            bid['capacity_id'] = string(body.get('capacity_id'), 'capacity_id')
            bid['reservation_id'] = self.capacity_reserve(session, principal, auction, bid['capacity_id'])
        auction['bids'].append(bid)
        active = [b for b in auction['bids'] if b['status'] == 'active']
        auction['leading_price_paise_per_kg'] = (max if auction['mode'] == 'spot' else min)(b['price_paise_per_kg'] for b in active)
        self.save(session, auction)
        self.audit(session, principal, 'auction.bid_accepted', auction, dict(bid_id=bid['id'], sequence=bid['sequence']))
        return self.project(auction, 'auctions', principal)

    def release_auction(self, session, auction):
        if auction['mode'] == 'spot':
            lot = self.get(session, 'lots', auction['lot_id'])
            lot.update(reserved_g=0, sale_auction_id=None)
            self.save(session, lot)
        else:
            for bid in auction['bids']:
                if bid['status'] == 'active':
                    self.capacity_transition(session, bid['capacity_id'], bid['reservation_id'], 'released')
                    bid['status'] = 'released'

    def close_auction(self, session, auction, principal):
        if auction['status'] in ('awarded', 'no_sale', 'cancelled'):
            return auction
        require(self.now() >= timestamp(auction['closes_at']), 'Auction has not reached its effective close')
        bids = [bid for bid in auction['bids'] if bid['status'] == 'active']
        if not bids:
            self.release_auction(session, auction)
            auction['status'] = 'no_sale'
        else:
            winner = sorted(bids, key=lambda b: ((-1 if auction['mode'] == 'spot' else 1) * b['price_paise_per_kg'], b['sequence']))[0]
            seller = auction['seller_org'] if auction['mode'] == 'spot' else winner['organisation_id']
            buyer = winner['organisation_id'] if auction['mode'] == 'spot' else auction['owner_org']
            for bid in bids:
                bid['status'] = 'won' if bid['id'] == winner['id'] else 'lost'
                if auction['mode'] == 'forward' and bid['id'] != winner['id']:
                    self.capacity_transition(session, bid['capacity_id'], bid['reservation_id'], 'released')
            contract = self.create(session, 'contracts', dict(auction_id=auction['id'], seller_org=seller, buyer_org=buyer,
                mode=auction['mode'], crop=auction['crop'], variety=auction['variety'], grade=auction['grade'],
                lot_id=auction['lot_id'], capacity_id=winner.get('capacity_id'), reservation_id=winner.get('reservation_id'),
                quantity_g=auction['quantity_g'], price_paise_per_kg=winner['price_paise_per_kg'], status='provisional',
                terms_version=1, terms=copy.deepcopy(auction['terms']), confirmations=[],
                expires_at=iso(timestamp(auction['closes_at']) + timedelta(hours=24)), shipped_g=0, amendment_history=[]))
            auction.update(status='awarded', contract_id=contract['id'])
            if auction['mode'] == 'spot':
                lot = self.get(session, 'lots', auction['lot_id'])
                lot['buyer_org'] = buyer
                self.save(session, lot)
            self.audit(session, principal, 'contract.provisional', contract)
            if timestamp(contract['expires_at']) <= self.now():
                self.expire_contract(session, contract, principal)
        self.save(session, auction)
        self.audit(session, principal, 'auction.closed', auction)
        return auction

    def auction_action(self, session, principal, key, action, body):
        auction = self.get(session, 'auctions', key)
        self.own(auction, principal, 'owner_org')
        self.role(principal, 'fpo' if auction['mode'] == 'spot' else 'exporter')
        self.version(auction, body)
        if action == 'close':
            return self.close_auction(session, auction, principal)
        require(auction['status'] in ('scheduled', 'open'), 'Only unawarded auction can be cancelled')
        reason = string(body.get('reason'), 'reason')
        self.release_auction(session, auction)
        auction.update(status='cancelled', cancellation_reason=reason)
        self.save(session, auction)
        self.audit(session, principal, 'auction.cancelled', auction, dict(reason=reason))
        return auction

    def release_contract(self, session, contract):
        if contract['lot_id']:
            lot = self.get(session, 'lots', contract['lot_id'])
            lot.update(reserved_g=0, sale_auction_id=None, forward_contract_id=None, buyer_org=None)
            self.save(session, lot)
        if contract['capacity_id'] and not contract['lot_id']:
            self.capacity_transition(session, contract['capacity_id'], contract['reservation_id'], 'released')

    def expire_contract(self, session, contract, principal):
        if contract['status'] != 'provisional' or timestamp(contract['expires_at']) > self.now():
            return False
        self.release_contract(session, contract)
        contract['status'] = 'expired'
        self.save(session, contract)
        self.audit(session, principal, 'contract.expired', contract)
        return True

    def contract_action(self, session, principal, key, action, body):
        contract = self.get(session, 'contracts', key)
        self.party(contract, principal)
        self.version(contract, body)
        require(contract['status'] in ('provisional', 'confirmed'), 'Contract is not active')
        require(not (contract['status'] == 'provisional' and timestamp(contract['expires_at']) <= self.now()), 'Provisional award has expired')
        if action == 'confirm':
            require(contract['status'] == 'provisional', 'Contract already confirmed')
            require(type(body.get('terms_version')) is int and body['terms_version'] == contract['terms_version'], 'Terms version changed')
            org = principal['organisation_id']
            require(not any(c['organisation_id'] == org for c in contract['confirmations']), 'Organisation already confirmed current terms')
            contract['confirmations'].append(dict(organisation_id=org, terms_version=contract['terms_version'], confirmed_at=iso(self.now()), actor_id=principal['id']))
            if len(contract['confirmations']) == 2:
                contract['status'] = 'confirmed'
                if contract['capacity_id'] and not contract['lot_id']:
                    self.capacity_transition(session, contract['capacity_id'], contract['reservation_id'], 'committed')
        elif action == 'amend':
            require(contract['shipped_g'] == 0, 'Terms cannot change after a shipment exists')
            new_terms = terms_from(body.get('terms') or {})
            require(new_terms != contract['terms'], 'Terms are unchanged')
            if contract['capacity_id']:
                capacity = self.get(session, 'capacities', contract['capacity_id'])
                require(new_terms['grade_protocol'] == capacity['grade_protocol'] and timestamp(new_terms['delivery_start']) >= timestamp(capacity['delivery_start']) and timestamp(new_terms['delivery_end']) <= timestamp(capacity['delivery_end']), 'Amended terms exceed qualified capacity')
            if contract['lot_id']:
                lot = self.get(session, 'lots', contract['lot_id'])
                require(timestamp(new_terms['delivery_end']) <= timestamp(lot['pickup_deadline']), 'Amended delivery exceeds lot pickup deadline')
            contract['amendment_history'].append(dict(terms_version=contract['terms_version'], terms=contract['terms'], confirmations=contract['confirmations'], amended_by=principal['id'], amended_at=iso(self.now())))
            contract.update(terms=new_terms, terms_version=contract['terms_version'] + 1, confirmations=[], status='provisional', expires_at=iso(self.now() + timedelta(hours=24)))
        elif action in ('cancel', 'default'):
            require(contract['shipped_g'] == 0, 'Cannot erase obligations after a shipment exists; use claims')
            contract.update(status='cancelled' if action == 'cancel' else 'defaulted', reason=string(body.get('reason'), 'reason'), ended_by=principal['id'])
            self.release_contract(session, contract)
        else:
            fail('Unknown contract action', 404)
        self.save(session, contract)
        self.audit(session, principal, 'contract.' + action, contract)
        return contract

    def harvest(self, session, principal, key, body):
        self.role(principal, 'fpo')
        contract = self.get(session, 'contracts', key)
        self.own(contract, principal)
        self.version(contract, body)
        require(contract['mode'] == 'forward' and contract['status'] == 'confirmed' and not contract['lot_id'], 'Only unconverted confirmed forward contracts can harvest')
        require(body.get('quantity_g') == contract['quantity_g'], 'Initial conversion must cover entire contract quantity')
        lot = self.create_lot(session, principal, dict(body, crop=contract['crop'], variety=contract['variety'], grade=contract['grade']))
        require(timestamp(lot['pickup_deadline']) >= timestamp(contract['terms']['delivery_end']), 'Harvest pickup deadline must cover contracted delivery')
        self.capacity_transition(session, contract['capacity_id'], contract['reservation_id'], 'converted')
        lot.update(forward_contract_id=contract['id'], buyer_org=contract['buyer_org'], reserved_g=contract['quantity_g'])
        self.save(session, lot)
        contract['lot_id'] = lot['id']
        self.save(session, contract)
        self.audit(session, principal, 'contract.harvest_converted', contract, dict(lot_id=lot['id']))
        return lot

    def create_shipment(self, session, principal, body):
        self.role(principal, 'fpo')
        contract = self.get(session, 'contracts', body.get('contract_id'))
        self.own(contract, principal)
        require(contract['status'] == 'confirmed', 'Both parties must confirm contract before shipment')
        lot = self.get(session, 'lots', body.get('lot_id'))
        self.own(lot, principal)
        require(lot['id'] == contract['lot_id'] and lot['buyer_org'] == contract['buyer_org'], 'Lot does not belong to this contract')
        require(lot['qc_status'] == 'released', 'QC hold prevents shipment')
        require(lot['inspections'][-1]['protocol'] == contract['terms']['grade_protocol'], 'QC evidence does not cover contracted grade protocol')
        quantity = integer(body.get('quantity_g'), 'quantity_g', 1)
        require(contract['shipped_g'] + quantity <= contract['quantity_g'] and lot['shipped_g'] + quantity <= lot['quantity_g'], 'Shipment exceeds remaining contracted stock')
        pickup = timestamp(body.get('pickup_at'), 'pickup_at')
        delivery = timestamp(body.get('delivery_at'), 'delivery_at')
        require(pickup <= delivery and pickup <= timestamp(lot['pickup_deadline']), 'Invalid pickup or delivery dates', 422)
        require(timestamp(contract['terms']['delivery_start']) <= delivery <= timestamp(contract['terms']['delivery_end']), 'Delivery outside agreed window', 422)
        shipment = self.create(session, 'shipments', dict(contract_id=contract['id'], lot_id=lot['id'], quantity_g=quantity,
            pickup_at=iso(pickup), delivery_at=iso(delivery), packing=string(body.get('packing'), 'packing'),
            handover_reference=string(body.get('handover_reference'), 'handover_reference'), status='draft',
            seller_org=contract['seller_org'], buyer_org=contract['buyer_org'], dispatched_at=None, receipt_id=None))
        lot['shipped_g'] += quantity
        contract['shipped_g'] += quantity
        self.save(session, lot)
        self.save(session, contract)
        self.audit(session, principal, 'shipment.created', shipment)
        return shipment

    def shipment_action(self, session, principal, key, action, body):
        shipment = self.get(session, 'shipments', key)
        self.own(shipment, principal, 'seller_org' if action == 'dispatch' else 'buyer_org')
        self.version(shipment, body)
        if action == 'dispatch':
            self.role(principal, 'fpo')
            self.own(shipment, principal)
            require(shipment['status'] == 'draft', 'Only draft shipment can dispatch')
            lot = self.get(session, 'lots', shipment['lot_id'])
            contract = self.get(session, 'contracts', shipment['contract_id'])
            require(lot['qc_status'] == 'released' and contract['status'] == 'confirmed', 'QC hold or unconfirmed contract prevents dispatch')
            require(lot['inspections'][-1]['protocol'] == contract['terms']['grade_protocol'], 'QC evidence does not cover contracted grade protocol')
            require(self.now() <= timestamp(lot['pickup_deadline']), 'Lot pickup deadline passed')
            require(self.now() <= timestamp(contract['terms']['delivery_end']), 'Contract delivery window has ended')
            shipment.update(status='dispatched', dispatched_at=iso(self.now()), dispatched_by=principal['id'],
                            qc_inspection_id=lot['inspections'][-1]['id'], qc_review_id=lot['reviews'][-1]['id'])
            self.save(session, shipment)
            self.audit(session, principal, 'shipment.dispatched', shipment)
            return shipment
        self.role(principal, 'exporter')
        self.own(shipment, principal, 'buyer_org')
        require(shipment['status'] == 'dispatched', 'Only dispatched shipment can receive')
        weights = {key: integer(body.get(key), key) for key in ('received_g', 'accepted_g', 'downgraded_g', 'rejected_g')}
        require(weights['received_g'] <= shipment['quantity_g'], 'Received weight exceeds dispatched weight', 422)
        require(sum(weights[k] for k in ('accepted_g', 'downgraded_g', 'rejected_g')) == weights['received_g'], 'Received partitions do not reconcile', 422)
        shortfall = shipment['quantity_g'] - weights['received_g']
        reason = string(body.get('reason'), 'reason') if shortfall or weights['downgraded_g'] or weights['rejected_g'] else str(body.get('reason') or 'Accepted in full')
        receipt = self.create(session, 'receipts', dict(shipment_id=shipment['id'], contract_id=shipment['contract_id'],
            seller_org=shipment['seller_org'], buyer_org=shipment['buyer_org'], quantity_g=shipment['quantity_g'],
            **weights, transit_shortfall_g=shortfall, reason=reason,
            evidence_reference=string(body.get('evidence_reference'), 'evidence_reference'), received_at=iso(self.now()), received_by=principal['id']))
        shipment.update(status='received', receipt_id=receipt['id'], received_at=iso(self.now()))
        self.save(session, shipment)
        self.audit(session, principal, 'shipment.received', shipment, dict(receipt_id=receipt['id']))
        return receipt

    def receipt_gross(self, receipt, contract):
        amount = money(receipt['accepted_g'], contract['price_paise_per_kg']) + money(receipt['downgraded_g'], contract['price_paise_per_kg'], contract['terms']['downgrade_bps'])
        if contract['terms']['shortfall_liability'] == 'buyer':
            amount += money(receipt['transit_shortfall_g'], contract['price_paise_per_kg'])
        return amount

    def create_claim(self, session, principal, body):
        receipt = self.get(session, 'receipts', body.get('receipt_id'))
        self.party(receipt, principal)
        contract = self.get(session, 'contracts', receipt['contract_id'])
        require(not any(s['contract_id'] == contract['id'] for s in self.all(session, 'settlements')), 'Final statement already issued; claim amendment requires external review')
        amount = integer(body.get('amount_paise'), 'amount_paise', 1)
        weight = integer(body.get('affected_g'), 'affected_g', 1, receipt['quantity_g'])
        previous = [c for c in self.all(session, 'claims') if c['receipt_id'] == receipt['id']]
        require(sum(c['amount_paise'] for c in previous) + amount <= self.receipt_gross(receipt, contract), 'Claims exceed attributable receipt obligation')
        require(sum(c['affected_g'] for c in previous) + weight <= receipt['quantity_g'], 'Claims overlap or exceed attributable receipt weight')
        claim = self.create(session, 'claims', dict(receipt_id=receipt['id'], contract_id=contract['id'], seller_org=contract['seller_org'],
            buyer_org=contract['buyer_org'], amount_paise=amount, affected_g=weight, reason=string(body.get('reason'), 'reason'),
            evidence_reference=string(body.get('evidence_reference'), 'evidence_reference'), status='open', proposal=None,
            approvals=[], resolution_history=[], requested_by=principal['id']))
        self.audit(session, principal, 'claim.opened', claim)
        return claim

    def claim_action(self, session, principal, key, action, body):
        claim = self.get(session, 'claims', key)
        self.party(claim, principal)
        self.version(claim, body)
        require(claim['status'] == 'open', 'Claim already resolved')
        if action == 'propose':
            if claim['proposal']:
                claim['resolution_history'].append(dict(proposal=claim['proposal'], approvals=claim['approvals']))
            version = 1 if claim['proposal'] is None else claim['proposal']['version'] + 1
            claim['proposal'] = dict(version=version, adjustment_paise=integer(body.get('adjustment_paise'), 'adjustment_paise', 0, claim['amount_paise']),
                                     reason=string(body.get('reason'), 'reason'), proposed_by=principal['id'], proposed_at=iso(self.now()))
            claim['approvals'] = []
        else:
            require(claim['proposal'] is not None and type(body.get('resolution_version')) is int and body['resolution_version'] == claim['proposal']['version'], 'Resolution version missing or changed')
            org = principal['organisation_id']
            require(not any(a['organisation_id'] == org for a in claim['approvals']), 'Organisation already approved resolution')
            claim['approvals'].append(dict(organisation_id=org, resolution_version=body['resolution_version'], approved_at=iso(self.now()), actor_id=principal['id']))
            if len(claim['approvals']) == 2:
                claim.update(status='resolved', resolved_at=iso(self.now()))
        self.save(session, claim)
        self.audit(session, principal, 'claim.' + action, claim)
        return claim

    def create_settlement(self, session, principal, body):
        self.role(principal, 'fpo')
        contract = self.get(session, 'contracts', body.get('contract_id'))
        self.own(contract, principal)
        require(contract['status'] == 'confirmed', 'Confirmed contract required')
        require(not any(s['contract_id'] == contract['id'] for s in self.all(session, 'settlements')), 'Settlement already exists')
        shipments = [s for s in self.all(session, 'shipments') if s['contract_id'] == contract['id']]
        require(shipments and all(s['status'] == 'received' for s in shipments) and sum(s['quantity_g'] for s in shipments) == contract['quantity_g'], 'All contracted quantity must be received before final settlement')
        receipts = [r for r in self.all(session, 'receipts') if r['contract_id'] == contract['id']]
        claims = [c for c in self.all(session, 'claims') if c['contract_id'] == contract['id']]
        require(all(c['status'] == 'resolved' for c in claims), 'Open claim holds final settlement')
        gross = sum(self.receipt_gross(r, contract) for r in receipts)
        integer(gross, 'Settlement gross', 0, 2**53 - 1)
        adjustments = sum(c['proposal']['adjustment_paise'] for c in claims)
        fee = contract['terms']['fee_paise']
        net = gross - adjustments - fee
        require(net >= 0, 'Agreed adjustments and fee exceed proceeds')
        lot = self.get(session, 'lots', contract['lot_id'])
        weights = {member['member_id']: member['quantity_g'] for member in lot['member_contributions']}
        settlement = self.create(session, 'settlements', dict(contract_id=contract['id'], seller_org=contract['seller_org'], buyer_org=contract['buyer_org'],
            currency='INR', gross_paise=gross, adjustments_paise=adjustments, fee_paise=fee, net_paise=net,
            invoice_paise=gross - adjustments, allocations=allocate(net, weights), payment_status='unverified',
            verified_receipt_paise=0, disbursed_paise=0, payments=[], disbursals=[], receipt_ids=[r['id'] for r in receipts], claim_ids=[c['id'] for c in claims],
            payment_due_at=iso(self.now() + timedelta(days=contract['terms']['payment_due_days']))))
        self.audit(session, principal, 'settlement.issued', settlement)
        return settlement

    def settlement_action(self, session, principal, key, action, body):
        self.role(principal, 'finance_reviewer')
        settlement = self.get(session, 'settlements', key)
        self.own(settlement, principal)
        self.version(settlement, body)
        amount = integer(body.get('amount_paise'), 'amount_paise', 1)
        record = dict(id='reconciliation-' + uuid4().hex, amount_paise=amount,
                      evidence_reference=string(body.get('evidence_reference'), 'evidence_reference'),
                      verification_basis=string(body.get('verification_basis'), 'verification_basis'),
                      verified_by=principal['id'], verified_at=iso(self.now()))
        if action == 'payments':
            require(settlement['verified_receipt_paise'] + amount <= settlement['invoice_paise'], 'Verified receipt exceeds invoice obligation')
            settlement['payments'].append(record)
            settlement['verified_receipt_paise'] += amount
            settlement['payment_status'] = 'paid' if settlement['verified_receipt_paise'] == settlement['invoice_paise'] else 'part_paid'
        else:
            member = string(body.get('member_id'), 'member_id')
            allocation = next((a for a in settlement['allocations'] if a['member_id'] == member), None)
            require(allocation is not None, 'Unknown member allocation', 422)
            already = sum(d['amount_paise'] for d in settlement['disbursals'] if d['member_id'] == member)
            require(already + amount <= allocation['amount_paise'], 'Member disbursal exceeds allocation')
            require(settlement['disbursed_paise'] + amount + settlement['fee_paise'] <= settlement['verified_receipt_paise'], 'Member disbursal exceeds verified FPO receipts after fee')
            record['member_id'] = member
            settlement['disbursals'].append(record)
            settlement['disbursed_paise'] += amount
        self.save(session, settlement)
        self.audit(session, principal, 'settlement.' + action, settlement, dict(reconciliation_id=record['id']))
        return settlement

    def tick(self):
        # Worker-only principal is not an HTTP development session.
        require(self.demo_enabled, 'Worker disabled until real adapters are installed', 503)
        principal = dict(id='server-worker', organisation_id='system', role='worker')
        closed = expired = 0
        with self.database.transaction() as session:
            for auction in self.all(session, 'auctions'):
                if auction['status'] in ('scheduled', 'open') and timestamp(auction['closes_at']) <= self.now():
                    self.close_auction(session, auction, principal)
                    closed += 1
            for contract in self.all(session, 'contracts'):
                expired += int(self.expire_contract(session, contract, principal))
        return dict(closed=closed, expired=expired, server_time=iso(self.now()))
