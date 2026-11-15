"""Regression cases from independent review; fixtures are synthetic ledger facts."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from server.app import create_app


@pytest.fixture
def trade(tmp_path):
    now = datetime(2026, 11, 16, 12, tzinfo=timezone.utc)
    app = create_app(database_url=f"sqlite:///{tmp_path / 'review.db'}", demo_enabled=True, clock=lambda: now)
    with TestClient(app) as client:
        headers = {}
        for actor in ('fpo-a', 'exporter-a', 'qc-a'):
            token = client.post('/api/trade/dev/sessions', json={'principal_id': actor}).json()['token']
            headers[actor] = {'Authorization': 'Bearer ' + token}

        def post(path, body, actor='fpo-a'):
            return client.post('/api/trade' + path, json=body,
                               headers={**headers[actor], 'Idempotency-Key': uuid4().hex})

        yield app, client, post, headers, now


def receipt_fixture(app, *, accepted=0, downgraded=0, rejected=10000, shortfall=0, fee=0, price=1000, downgrade_bps=5000):
    service = app.state.service
    quantity = accepted + downgraded + rejected + shortfall
    with app.state.database.transaction() as session:
        lot = service.create(session, 'lots', dict(seller_org='fpo-a', quantity_g=quantity,
            member_contributions=[{'member_id': 'member-a', 'quantity_g': quantity}]))
        contract = service.create(session, 'contracts', dict(seller_org='fpo-a', buyer_org='exporter-a',
            lot_id=lot['id'], quantity_g=quantity, price_paise_per_kg=price, status='confirmed',
            terms=dict(downgrade_bps=downgrade_bps, shortfall_liability='seller', fee_paise=fee, payment_due_days=7)))
        service.create(session, 'shipments', dict(contract_id=contract['id'], quantity_g=quantity, status='received'))
        receipt = service.create(session, 'receipts', dict(seller_org='fpo-a', buyer_org='exporter-a',
            contract_id=contract['id'], quantity_g=quantity, accepted_g=accepted, downgraded_g=downgraded,
            rejected_g=rejected, transit_shortfall_g=shortfall, received_at='2026-11-16T12:00:00Z'))
    return contract, receipt


@pytest.mark.parametrize('part_quantity,price,expected', [(1, 500, 2), (50072, 1007, 100846)])
def test_partial_receipt_line_rounding_does_not_block_valid_settlement(trade, part_quantity, price, expected):
    app, _, post, _, _ = trade
    service = app.state.service
    contract, first = receipt_fixture(app, accepted=part_quantity, rejected=0, price=price)
    with app.state.database.transaction() as session:
        contract = service.get(session, 'contracts', contract['id'])
        contract['quantity_g'] = part_quantity * 2
        service.save(session, contract)
        lot = service.get(session, 'lots', contract['lot_id'])
        lot.update(quantity_g=part_quantity * 2,
                   member_contributions=[dict(member_id='member-a', quantity_g=part_quantity * 2)])
        service.save(session, lot)
        service.create(session, 'shipments', dict(contract_id=contract['id'], quantity_g=part_quantity, status='received'))
        service.create(session, 'receipts', {key: value for key, value in first.items()
            if key not in ('id', 'version', 'created_at', 'updated_at')})
    response = post('/settlements', {'contract_id': contract['id']})
    assert response.status_code == 200, response.text
    value = response.json()
    assert value['gross_paise'] == value['invoice_paise'] == value['original_obligation_paise'] == expected


def test_full_price_component_lines_share_the_same_rounding_ceiling(trade):
    app, _, post, _, _ = trade
    contract, _ = receipt_fixture(app, accepted=1, downgraded=1, rejected=0, price=500, downgrade_bps=10000)
    response = post('/settlements', {'contract_id': contract['id']})
    assert response.status_code == 200, response.text
    value = response.json()
    assert value['gross_paise'] == value['invoice_paise'] == value['original_obligation_paise'] == 2


def test_rounding_does_not_allow_credit_above_unpaid_component_recovery(trade):
    app, _, post, _, _ = trade
    contract, receipt = receipt_fixture(app, accepted=1, rejected=1, price=500)
    assert post('/claims', claim_body(receipt, amount=2, weight=1)).status_code == 409
    claim = post('/claims', claim_body(receipt, amount=1, weight=1))
    assert claim.status_code == 200, claim.text
    resolve(post, claim.json(), 1)
    response = post('/settlements', {'contract_id': contract['id']})
    assert response.status_code == 200, response.text
    assert response.json()['invoice_paise'] == response.json()['original_obligation_paise'] == 2


def claim_body(receipt, amount=10000, weight=10000, direction='seller_credit'):
    return dict(receipt_id=receipt['id'], affected_g=weight, amount_paise=amount, direction=direction,
                reason='Seller disputes receiving decision', evidence_reference='synthetic://counter-inspection')


def resolve(post, claim, amount):
    response = post('/claims/' + claim['id'] + '/propose', dict(expected_version=claim['version'],
                    adjustment_paise=amount, reason='Agreed compensation for disputed rejection'))
    assert response.status_code == 200, response.text
    claim = response.json()
    for actor in ('fpo-a', 'exporter-a'):
        response = post('/claims/' + claim['id'] + '/agree', dict(expected_version=claim['version'],
                        resolution_version=claim['proposal']['version']), actor)
        assert response.status_code == 200, response.text
        claim = response.json()
    return claim


def test_all_rejected_receipt_can_be_disputed_and_bilateral_credit_restores_invoice(trade):
    app, client, post, headers, _ = trade
    contract, receipt = receipt_fixture(app)
    response = post('/claims', claim_body(receipt))
    assert response.status_code == 200, response.text
    claim = response.json()
    assert claim['direction'] == 'seller_credit'
    assert post('/settlements', {'contract_id': contract['id']}).status_code == 409
    resolve(post, claim, 7500)
    statement = post('/settlements', {'contract_id': contract['id']})
    assert statement.status_code == 200, statement.text
    value = statement.json()
    assert (value['gross_paise'], value['deductions_paise'], value['credits_paise']) == (0, 0, 7500)
    assert value['invoice_paise'] == value['net_paise'] == 7500
    assert sum(a['amount_paise'] for a in value['allocations']) == 7500
    original = client.get('/api/trade/receipts/' + receipt['id'], headers=headers['fpo-a']).json()
    assert original['accepted_g'] == 0 and original['rejected_g'] == 10000


def test_credit_cannot_duplicate_recognised_weight_or_exceed_original_obligation(trade):
    app, _, post, _, _ = trade
    _, full = receipt_fixture(app, accepted=10000, rejected=0)
    assert post('/claims', claim_body(full, amount=1)).status_code == 409
    _, downgraded = receipt_fixture(app, downgraded=10000, rejected=0)
    assert post('/claims', claim_body(downgraded, amount=1001, weight=2000)).status_code == 409
    first = post('/claims', claim_body(downgraded, amount=1000, weight=2000))
    assert first.status_code == 200, first.text
    assert post('/claims', claim_body(downgraded, amount=4001, weight=8000)).status_code == 409


def test_claim_direction_is_immutable_in_resolution(trade):
    app, _, post, _, _ = trade
    _, receipt = receipt_fixture(app)
    response = post('/claims', claim_body(receipt))
    assert response.status_code == 200, response.text
    claim = response.json()
    assert post('/claims/' + claim['id'] + '/propose', dict(expected_version=claim['version'],
        adjustment_paise=100, direction='seller_deduction', reason='Attempt to reverse claim')).status_code == 422


@pytest.mark.parametrize('safe_hour,expected', [(10, 409), (10.5, 409), (11, 200)])
def test_safe_report_must_postdate_every_prior_safety_hold(trade, safe_hour, expected):
    _, _, post, _, now = trade
    response = post('/lots', dict(crop='okra', variety='okra', grade='A', quantity_g=10000,
        harvest_date='2026-11-16', pickup_deadline='2026-11-20T12:00:00Z',
        member_contributions=[dict(member_id='member-a', quantity_g=10000)]))
    assert response.status_code == 200, response.text
    lot = response.json()
    hold_ids = []
    for hour, hold in ((10, True), (10.5, True), (safe_hour, False)):
        observed = now.replace(hour=0) + timedelta(hours=hour)
        response = post('/lots/' + lot['id'] + '/inspections', dict(expected_version=lot['version'],
            sample_id=uuid4().hex, protocol='export-v1', protocol_version='1', inspected_weight_g=10000,
            sample_count=1, observed_grade='A', defects='Recorded sample observations',
            report_reference='synthetic://lab/' + uuid4().hex, issuer='Synthetic laboratory',
            inspected_at=observed.isoformat(), safety_hold=hold))
        assert response.status_code == 200, response.text
        lot = response.json()
        if hold:
            hold_ids.append(lot['inspections'][-1]['id'])
    response = post('/lots/' + lot['id'] + '/reviews', dict(expected_version=lot['version'],
                    decision='release', reason='Explicitly reviewed all earlier safety holds'), 'qc-a')
    assert response.status_code == expected, response.text
    if expected == 200:
        assert response.json()['reviews'][-1]['superseded_safety_hold_ids'] == hold_ids
