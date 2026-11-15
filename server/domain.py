from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException


def fail(message, status=409):
    raise HTTPException(status_code=status, detail=message)


def require(condition, message, status=409):
    if not condition:
        fail(message, status)


def integer(value, name, minimum=0, maximum=10**15):
    require(type(value) is int and minimum <= value <= maximum, f'{name} must be an integer between {minimum} and {maximum}', 422)
    return value


def string(value, name):
    require(isinstance(value, str) and 0 < len(value.strip()) <= 2000, f'{name} is required (maximum 2000 characters)', 422)
    return value.strip()


def timestamp(value, name='timestamp'):
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(result.tzinfo is not None, f'{name} must include timezone', 422)
        return result.astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        fail(f'{name} must be an ISO timestamp with timezone', 422)


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def money(weight_g, price_paise_per_kg, bps=10000):
    result = int((Decimal(weight_g) * Decimal(price_paise_per_kg) * Decimal(bps) / Decimal(1000 * 10000)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    return integer(result, 'Calculated money', 0, 2**53 - 1)


def allocate(total, weights):
    integer(total, 'Allocation total', 0, 2**53 - 1)
    denominator = sum(weights.values())
    require(denominator > 0, 'Member contribution weight must be positive')
    amounts = {key: total * value // denominator for key, value in weights.items()}
    remaining = total - sum(amounts.values())
    order = sorted(weights, key=lambda key: (-(total * weights[key] % denominator), key))
    for key in order[:remaining]:
        amounts[key] += 1
    return [dict(member_id=key, contribution_g=weights[key], amount_paise=amounts[key]) for key in sorted(weights)]


def contributions(value, quantity):
    require(isinstance(value, list) and 0 < len(value) <= 1000, 'Member contributions required', 422)
    seen = set()
    for item in value:
        require(isinstance(item, dict), 'Each member contribution must be an object', 422)
        member = string(item.get('member_id'), 'member_id')
        require(member not in seen, 'Duplicate member_id', 422)
        seen.add(member)
        item['member_id'] = member
        integer(item.get('quantity_g'), 'member quantity_g', 1)
    require(sum(item['quantity_g'] for item in value) == quantity, 'Member contributions must equal lot quantity', 422)
    return value


COMMERCIAL_STRINGS = ('handover', 'grade_protocol', 'payment_terms', 'shortfall_liability',
                      'cancellation_terms', 'production_risk', 'dispute_procedure')


def terms_from(body):
    require(isinstance(body, dict), 'terms must be an object', 422)
    terms = {key: string(body.get(key), key) for key in COMMERCIAL_STRINGS}
    require(terms['shortfall_liability'] in ('seller', 'buyer'), 'shortfall_liability must be seller or buyer', 422)
    terms['delivery_start'] = iso(timestamp(body.get('delivery_start'), 'delivery_start'))
    terms['delivery_end'] = iso(timestamp(body.get('delivery_end'), 'delivery_end'))
    require(timestamp(terms['delivery_start']) <= timestamp(terms['delivery_end']), 'Delivery window is inverted', 422)
    terms['payment_due_days'] = integer(body.get('payment_due_days'), 'payment_due_days', 0, 365)
    terms['downgrade_bps'] = integer(body.get('downgrade_bps'), 'downgrade_bps', 0, 10000)
    terms['fee_paise'] = integer(body.get('fee_paise'), 'fee_paise')
    return terms
