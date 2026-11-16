from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.domain import allocate, money


def test_integer_money_and_largest_remainder():
    assert money(1, 500) == 1  # exactly half a paise rounds up
    assert allocate(10, {"b": 1, "a": 1, "c": 1}) == [
        {"member_id": "a", "contribution_g": 1, "amount_paise": 4},
        {"member_id": "b", "contribution_g": 1, "amount_paise": 3},
        {"member_id": "c", "contribution_g": 1, "amount_paise": 3},
    ]


@pytest.fixture
def api(tmp_path):
    time = [datetime(2026, 11, 16, 10, tzinfo=timezone.utc)]
    app = create_app(database_url=f"sqlite:///{tmp_path / 'trade.db'}", demo_enabled=True, clock=lambda: time[0])
    with TestClient(app) as client:
        yield client, app, time


def auth(client, name):
    response = client.post('/api/trade/dev/sessions', json={"principal_id": name})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def requirement_body(quantity_g=100000):
    return dict(crop='okra', variety='okra', grade='A', quantity_g=quantity_g,
        maximum_price_paise_per_kg=50000, proposal_deadline='2026-11-17T12:00:00Z',
        handover='Synthetic demo destination', grade_protocol='export-v1',
        payment_terms='Synthetic net terms', shortfall_liability='seller', cancellation_terms='Recorded reason',
        production_risk='FPO bears pre-harvest risk', dispute_procedure='Documented review',
        delivery_start='2026-11-17T00:00:00Z', delivery_end='2026-11-18T00:00:00Z',
        payment_due_days=7, downgrade_bps=0, fee_paise=0,
        quality_specification=[dict(attribute='pod length', unit='cm', minimum='8', maximum='12', required=True, notes='Buyer-specific sample')])


def test_identity_idempotency_and_held_lot(api):
    client, _, time = api
    fpo = auth(client, 'fpo-a')
    body = dict(crop='okra', variety='okra', grade='A', quantity_g=10000,
                harvest_date='2026-11-16', pickup_deadline='2026-11-20T10:00:00Z',
                member_contributions=[dict(member_id='m1', quantity_g=10000)])
    headers = {**fpo, 'Idempotency-Key': 'lot-1'}
    first = client.post('/api/trade/lots', json=body, headers=headers)
    assert first.status_code == 200, first.text
    assert client.post('/api/trade/lots', json=body, headers=headers).json() == first.json()
    body['grade'] = 'B'
    assert client.post('/api/trade/lots', json=body, headers=headers).status_code == 409
    assert client.get('/api/trade/lots/' + first.json()['id'], headers=auth(client, 'fpo-b')).status_code == 404
    assert client.get('/api/trade/workspace', headers={'X-Organisation-Id': 'fpo-a'}).status_code == 401
    assert client.post('/api/trade/auctions', json=dict(mode='spot', lot_id=first.json()['id']),
                       headers={**fpo, 'Idempotency-Key': 'auction-held'}).status_code in (409, 422)


def test_requirement_proposals_manual_award_and_contract(api):
    client, _, _ = api
    exporter = auth(client, 'exporter-a')
    fpo_a = auth(client, 'fpo-a')
    fpo_b = auth(client, 'fpo-b')
    requirement = client.post('/api/trade/requirements', json=requirement_body(), headers={**exporter, 'Idempotency-Key': 'req-draft'}).json()
    assert requirement['status'] == 'draft'
    published = client.post(f"/api/trade/requirements/{requirement['id']}/publish", json={'expected_version': requirement['version']}, headers={**exporter, 'Idempotency-Key': 'req-publish'}).json()
    assert published['status'] == 'published'
    assert client.get('/api/trade/requirements', headers=fpo_a).json()['items'][0]['status'] == 'published'
    proposal_body = dict(quantity_g=100000, grade='A', expected_availability='2026-11-17T08:00:00Z', evidence_reference='synthetic://qc/sample', notes='Synthetic delivery note')
    low = client.post(f"/api/trade/requirements/{requirement['id']}/proposals", json={**proposal_body, 'price_paise_per_kg': 10000, 'capacity_id': 'capacity-a'}, headers={**fpo_a, 'Idempotency-Key': 'proposal-a'})
    high = client.post(f"/api/trade/requirements/{requirement['id']}/proposals", json={**proposal_body, 'price_paise_per_kg': 20000, 'capacity_id': 'capacity-b'}, headers={**fpo_b, 'Idempotency-Key': 'proposal-b'})
    assert low.status_code == high.status_code == 200, (low.text, high.text)
    proposals = client.get('/api/trade/proposals', headers=exporter).json()['items']
    assert {p['supplier_org'] for p in proposals} == {'fpo-a', 'fpo-b'}
    current = client.get('/api/trade/requirements/' + requirement['id'], headers=exporter).json()
    award = client.post(f"/api/trade/requirements/{requirement['id']}/award", json={'expected_version': current['version'], 'proposal_id': high.json()['id']}, headers={**exporter, 'Idempotency-Key': 'manual-award'})
    assert award.status_code == 200, award.text
    result = award.json()
    assert result['proposal']['supplier_org'] == 'fpo-b'  # Human selection, not cheapest-price automation.
    assert result['contract']['requirement_id'] == requirement['id']
    assert client.get('/api/trade/proposals/' + low.json()['id'], headers=fpo_a).json()['status'] == 'not_selected'
    assert client.get('/api/trade/capacities/capacity-a', headers=fpo_a).json()['available_g'] == 1000000
    contract = result['contract']
    for token in (exporter, fpo_b):
        response = client.post(f"/api/trade/contracts/{contract['id']}/confirm", json={'expected_version': contract['version'], 'terms_version': 1}, headers={**token, 'Idempotency-Key': 'confirm-' + token['Authorization'][-8:]})
        assert response.status_code == 200, response.text
        contract = response.json()
    assert contract['status'] == 'confirmed'


def test_requirement_proposal_cannot_exceed_capacity_or_duplicate(api):
    client, _, _ = api
    exporter, fpo = auth(client, 'exporter-a'), auth(client, 'fpo-a')
    body = requirement_body(quantity_g=2000000)
    requirement = client.post('/api/trade/requirements', json=body, headers={**exporter, 'Idempotency-Key': 'req-capacity'}).json()
    client.post(f"/api/trade/requirements/{requirement['id']}/publish", json={'expected_version': requirement['version']}, headers={**exporter, 'Idempotency-Key': 'req-capacity-publish'})
    proposal = dict(quantity_g=2000000, price_paise_per_kg=10000, grade='A', expected_availability='2026-11-17T08:00:00Z', capacity_id='capacity-a')
    rejected = client.post(f"/api/trade/requirements/{requirement['id']}/proposals", json=proposal, headers={**fpo, 'Idempotency-Key': 'too-much'})
    assert rejected.status_code == 409, rejected.text
    second = client.post('/api/trade/requirements', json=requirement_body(quantity_g=100000), headers={**exporter, 'Idempotency-Key': 'req-duplicate'}).json()
    client.post(f"/api/trade/requirements/{second['id']}/publish", json={'expected_version': second['version']}, headers={**exporter, 'Idempotency-Key': 'req-duplicate-publish'})
    proposal['quantity_g'] = 100000
    accepted = client.post(f"/api/trade/requirements/{second['id']}/proposals", json=proposal, headers={**fpo, 'Idempotency-Key': 'one-proposal'})
    assert accepted.status_code == 200
    duplicate = client.post(f"/api/trade/requirements/{second['id']}/proposals", json=proposal, headers={**fpo, 'Idempotency-Key': 'duplicate-proposal'})
    assert duplicate.status_code == 409


def test_requirement_worker_expires_proposals_and_releases_capacity(api):
    client, app, time = api
    exporter, fpo = auth(client, 'exporter-a'), auth(client, 'fpo-a')
    body = requirement_body()
    body['proposal_deadline'] = '2026-11-16T11:00:00Z'
    body['delivery_start'] = '2026-11-16T10:30:00Z'
    body['delivery_end'] = '2026-11-17T12:00:00Z'
    requirement = client.post('/api/trade/requirements', json=body, headers={**exporter, 'Idempotency-Key': 'req-expiry'}).json()
    client.post(f"/api/trade/requirements/{requirement['id']}/publish", json={'expected_version': requirement['version']}, headers={**exporter, 'Idempotency-Key': 'req-expiry-publish'})
    proposal = dict(quantity_g=100000, price_paise_per_kg=10000, grade='A', expected_availability='2026-11-16T10:45:00Z', capacity_id='capacity-a')
    created = client.post(f"/api/trade/requirements/{requirement['id']}/proposals", json=proposal, headers={**fpo, 'Idempotency-Key': 'proposal-expiry'})
    assert created.status_code == 200, created.text
    time[0] = datetime(2026, 11, 16, 11, 1, tzinfo=timezone.utc)
    assert app.state.service.tick()['expired_requirements'] == 1
    assert client.get('/api/trade/proposals/' + created.json()['id'], headers=fpo).json()['status'] == 'expired'
    assert client.get('/api/trade/capacities/capacity-a', headers=fpo).json()['available_g'] == 1000000


def published_requirement(client, exporter, tag, **changes):
    body = {**requirement_body(), **changes}
    created = client.post('/api/trade/requirements', json=body, headers={**exporter, 'Idempotency-Key': tag})
    assert created.status_code == 200, created.text
    requirement = created.json()
    published = client.post(f"/api/trade/requirements/{requirement['id']}/publish", json={'expected_version': requirement['version']}, headers={**exporter, 'Idempotency-Key': tag + '-publish'})
    assert published.status_code == 200, published.text
    return published.json()


def partial_proposal(client, requirement, fpo, capacity_id, quantity_g, tag):
    body = dict(quantity_g=quantity_g, grade='A', price_paise_per_kg=10000,
        expected_availability='2026-11-17T08:00:00Z', capacity_id=capacity_id)
    response = client.post(f"/api/trade/requirements/{requirement['id']}/proposals", json=body, headers={**fpo, 'Idempotency-Key': tag})
    assert response.status_code == 200, response.text
    return response.json()


def manual_award(client, requirement, proposal, exporter, tag):
    current = client.get('/api/trade/requirements/' + requirement['id'], headers=exporter).json()
    response = client.post(f"/api/trade/requirements/{requirement['id']}/award", json={'expected_version': current['version'], 'proposal_id': proposal['id']}, headers={**exporter, 'Idempotency-Key': tag})
    assert response.status_code == 200, response.text
    return response.json()


def test_collective_requirement_sixty_forty_awards_and_confirmation(api):
    client, app, time = api
    exporter, fpo_a, fpo_b = (auth(client, name) for name in ('exporter-a', 'fpo-a', 'fpo-b'))
    # Procurement closes before produce is available; both dates are intentional.
    requirement = published_requirement(client, exporter, 'collective', proposal_deadline='2026-11-16T11:00:00Z')
    assert requirement['proposal_deadline'] < requirement['terms']['delivery_start']
    assert (requirement['allocated_g'], requirement['remaining_g']) == (0, 100000)
    proposal_a = partial_proposal(client, requirement, fpo_a, 'capacity-a', 60000, 'collective-a')
    proposal_b = partial_proposal(client, requirement, fpo_b, 'capacity-b', 40000, 'collective-b')
    before = client.get('/api/trade/requirements/' + requirement['id'], headers=exporter).json()
    first = manual_award(client, requirement, proposal_a, exporter, 'collective-award-a')
    allocated = first['requirement']
    assert (allocated['status'], allocated['allocation_status'], allocated['allocated_g'], allocated['remaining_g']) == ('published', 'partially_awarded', 60000, 40000)
    # A partial award does not release a competing FPO's unselected proposal.
    assert client.get('/api/trade/proposals/' + proposal_b['id'], headers=fpo_b).json()['status'] == 'submitted'
    assert client.get('/api/trade/capacities/capacity-b', headers=fpo_b).json()['reserved_g'] == 40000
    replay = client.post(f"/api/trade/requirements/{requirement['id']}/award", json={'expected_version': before['version'], 'proposal_id': proposal_a['id']}, headers={**exporter, 'Idempotency-Key': 'collective-award-a'})
    assert replay.status_code == 200 and replay.json() == first
    stale = client.post(f"/api/trade/requirements/{requirement['id']}/award", json={'expected_version': before['version'], 'proposal_id': proposal_b['id']}, headers={**exporter, 'Idempotency-Key': 'collective-stale'})
    assert stale.status_code == 409
    duplicate = client.post(f"/api/trade/requirements/{requirement['id']}/award", json={'expected_version': allocated['version'], 'proposal_id': proposal_a['id']}, headers={**exporter, 'Idempotency-Key': 'collective-duplicate'})
    assert duplicate.status_code == 409
    oversized = client.post(f"/api/trade/requirements/{requirement['id']}/proposals", json=dict(quantity_g=40001, grade='A', price_paise_per_kg=10000, expected_availability='2026-11-17T08:00:00Z', capacity_id='capacity-a'), headers={**fpo_a, 'Idempotency-Key': 'collective-too-large'})
    assert oversized.status_code == 422
    second = manual_award(client, requirement, proposal_b, exporter, 'collective-award-b')
    fully = second['requirement']
    assert (fully['status'], fully['allocation_status'], fully['allocated_g'], fully['remaining_g']) == ('awarded', 'fully_awarded', 100000, 0)
    assert set(fully['contract_ids']) == {first['contract']['id'], second['contract']['id']}
    assert set(fully['awarded_proposal_ids']) == {proposal_a['id'], proposal_b['id']}
    for result, supplier in ((first, fpo_a), (second, fpo_b)):
        contract = result['contract']
        for index, token in enumerate((exporter, supplier)):
            confirmation = client.post(f"/api/trade/contracts/{contract['id']}/confirm", json={'expected_version': contract['version'], 'terms_version': 1}, headers={**token, 'Idempotency-Key': contract['id'] + '-confirm-' + str(index)})
            assert confirmation.status_code == 200, confirmation.text
            contract = confirmation.json()
        assert contract['status'] == 'confirmed'
    time[0] = datetime(2026, 11, 16, 11, 1, tzinfo=timezone.utc)
    assert app.state.service.tick()['expired'] == 0
    for token, capacity_id, quantity in ((fpo_a, 'capacity-a', 60000), (fpo_b, 'capacity-b', 40000)):
        capacity = client.get('/api/trade/capacities/' + capacity_id, headers=token).json()
        assert (capacity['reserved_g'], capacity['committed_g'], capacity['available_g']) == (0, quantity, 1000000 - quantity)


def test_competing_partial_proposals_cannot_overallocate(api):
    client, _, _ = api
    exporter, fpo_a, fpo_b = (auth(client, name) for name in ('exporter-a', 'fpo-a', 'fpo-b'))
    requirement = published_requirement(client, exporter, 'competing')
    proposal_a = partial_proposal(client, requirement, fpo_a, 'capacity-a', 60000, 'competing-a')
    proposal_b = partial_proposal(client, requirement, fpo_b, 'capacity-b', 60000, 'competing-b')
    first = manual_award(client, requirement, proposal_a, exporter, 'competing-award-a')
    rejected = client.post(f"/api/trade/requirements/{requirement['id']}/award", json={'expected_version': first['requirement']['version'], 'proposal_id': proposal_b['id']}, headers={**exporter, 'Idempotency-Key': 'competing-too-large'})
    assert rejected.status_code == 409 and 'remaining' in rejected.json()['detail']
    current = client.get('/api/trade/requirements/' + requirement['id'], headers=exporter).json()
    assert (current['allocated_g'], current['remaining_g'], len(current['contract_ids'])) == (60000, 40000, 1)
    assert client.get('/api/trade/capacities/capacity-b', headers=fpo_b).json()['reserved_g'] == 60000
    withdrawal = client.post('/api/trade/proposals/' + proposal_b['id'] + '/withdraw', json={'expected_version': proposal_b['version']}, headers={**fpo_b, 'Idempotency-Key': 'competing-withdraw'})
    assert withdrawal.status_code == 200, withdrawal.text
    smaller = partial_proposal(client, requirement, fpo_b, 'capacity-b', 40000, 'competing-smaller')
    second = manual_award(client, requirement, smaller, exporter, 'competing-award-smaller')
    assert second['requirement']['remaining_g'] == 0


def test_cancelled_partial_award_restores_budget_without_selecting_other_fpo(api):
    client, _, _ = api
    exporter, fpo_a, fpo_b = (auth(client, name) for name in ('exporter-a', 'fpo-a', 'fpo-b'))
    requirement = published_requirement(client, exporter, 'cancel-partial')
    proposal_a = partial_proposal(client, requirement, fpo_a, 'capacity-a', 60000, 'cancel-a')
    proposal_b = partial_proposal(client, requirement, fpo_b, 'capacity-b', 40000, 'cancel-b')
    first = manual_award(client, requirement, proposal_a, exporter, 'cancel-award-a')
    contract = first['contract']
    cancelled = client.post('/api/trade/contracts/' + contract['id'] + '/cancel', json={'expected_version': contract['version'], 'reason': 'Synthetic supplier unable to deliver'}, headers={**exporter, 'Idempotency-Key': 'cancel-contract'})
    assert cancelled.status_code == 200, cancelled.text
    current = client.get('/api/trade/requirements/' + requirement['id'], headers=exporter).json()
    assert (current['status'], current['allocation_status'], current['allocated_g'], current['remaining_g']) == ('published', 'unallocated', 0, 100000)
    assert client.get('/api/trade/capacities/capacity-a', headers=fpo_a).json()['available_g'] == 1000000
    assert client.get('/api/trade/proposals/' + proposal_b['id'], headers=fpo_b).json()['status'] == 'submitted'
    assert client.get('/api/trade/capacities/capacity-b', headers=fpo_b).json()['reserved_g'] == 40000
    second = manual_award(client, requirement, proposal_b, exporter, 'cancel-award-b')
    assert (second['requirement']['allocated_g'], second['requirement']['remaining_g']) == (40000, 60000)


@pytest.mark.parametrize('tick_at_deadline', [False, True])
def test_worker_partial_requirement_expiry_releases_each_reservation_once(api, tick_at_deadline):
    client, app, time = api
    exporter, fpo_a, fpo_b = (auth(client, name) for name in ('exporter-a', 'fpo-a', 'fpo-b'))
    requirement = published_requirement(client, exporter, 'partial-expiry', proposal_deadline='2026-11-16T11:00:00Z')
    proposal_a = partial_proposal(client, requirement, fpo_a, 'capacity-a', 60000, 'partial-expiry-a')
    proposal_b = partial_proposal(client, requirement, fpo_b, 'capacity-b', 40000, 'partial-expiry-b')
    first = manual_award(client, requirement, proposal_a, exporter, 'partial-expiry-award')
    if tick_at_deadline:
        time[0] = datetime(2026, 11, 16, 11, 1, tzinfo=timezone.utc)
        assert app.state.service.tick()['expired_requirements'] == 1
        capacity = client.get('/api/trade/capacities/capacity-a', headers=fpo_a).json()
        assert (capacity['reserved_g'], capacity['available_g']) == (60000, 940000)
        assert client.get('/api/trade/capacities/capacity-b', headers=fpo_b).json()['available_g'] == 1000000
    # This also covers an infrequent worker that first runs after both deadlines.
    time[0] = datetime(2026, 11, 17, 10, 1, tzinfo=timezone.utc)
    assert app.state.service.tick()['expired'] == 1
    assert client.get('/api/trade/contracts/' + first['contract']['id'], headers=exporter).json()['status'] == 'expired'
    current = client.get('/api/trade/requirements/' + requirement['id'], headers=exporter).json()
    assert (current['status'], current['allocated_g'], current['remaining_g']) == ('expired', 0, 100000)
    assert client.get('/api/trade/proposals/' + proposal_b['id'], headers=fpo_b).json()['status'] == 'expired'
    assert app.state.service.tick()['expired'] == 0
    for token, capacity_id in ((fpo_a, 'capacity-a'), (fpo_b, 'capacity-b')):
        capacity = client.get('/api/trade/capacities/' + capacity_id, headers=token).json()
        assert (capacity['available_g'], capacity['reserved_g'], capacity['committed_g']) == (1000000, 0, 0)


@pytest.mark.parametrize('environment', ['staging', 'production'])
def test_non_development_refuses_development_sessions(tmp_path, environment):
    app = create_app(database_url=f"sqlite:///{tmp_path / (environment + '.db')}", demo_enabled=True, environment=environment)
    with TestClient(app) as client:
        assert client.post('/api/trade/dev/sessions', json={'principal_id': 'fpo-a'}).status_code == 404
        assert client.get('/api/trade/health').json()['production_ready'] is False
