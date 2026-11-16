"""POC workflow checks, not evidence of agricultural validity."""
import copy
import hashlib
import json
from scripts.train_synthetic_yield import ROOT, build_outputs, generate_rows, predict, train


def test_temporal_new_farm_split_and_pre_decision_features():
    rows = generate_rows()
    groups = {key: [row for row in rows if row['split'] == key] for key in ('train', 'validation', 'test')}
    farms = {key: {row['farm_id'] for row in group} for key, group in groups.items()}
    assert not farms['train'] & farms['validation']
    assert not farms['train'] & farms['test']
    assert not farms['validation'] & farms['test']
    assert max(row['label_available_at'] for row in groups['train']) < min(row['decision_at'] for row in groups['validation'])
    assert max(row['label_available_at'] for row in groups['validation']) < min(row['decision_at'] for row in groups['test'])
    assert all(row['feature_available_at'] < row['decision_at'] < row['label_available_at'] for row in rows)
    assert all(row['synthetic'] for row in rows)
    assert any(row['yield_kg_ha'] == 0 for row in groups['train'])


def test_test_labels_cannot_change_fit_selection_or_validation_band():
    rows = generate_rows()
    original = train(rows)
    changed = copy.deepcopy(rows)
    for row in changed:
        if row['split'] == 'test':
            row['yield_kg_ha'] += 25000
    mutated = train(changed)
    assert original['model'] == mutated['model']
    assert original['validation_residual_band_kg_ha'] == mutated['validation_residual_band_kg_ha']
    assert original['test_metrics'] != mutated['test_metrics']


def test_fit_really_learns_training_labels_and_beats_toy_baseline():
    rows = generate_rows()
    original = train(rows)
    for row in rows:
        if row['split'] == 'train':
            row['yield_kg_ha'] += 1000
    assert original['model']['coefficients'] != train(rows)['model']['coefficients']
    assert original['test_metrics']['mae_kg_ha'] < original['baseline_test_metrics']['mae_kg_ha']
    assert original['production_allowed'] is False


def test_reproducibility_hash_and_exported_prediction_parity():
    for path, expected in build_outputs().items():
        assert path.read_text(encoding='utf-8') == expected
    artifact = json.loads((ROOT / 'src/data/syntheticYieldModel.json').read_text(encoding='utf-8'))
    data = (ROOT / 'public/poc/synthetic-farm-seasons.csv').read_text(encoding='utf-8').encode()
    assert hashlib.sha256(data).hexdigest() == artifact['dataset_sha256']
    for case in artifact['parity_cases']:
        assert abs(predict(artifact['model'], case['input']) - case['prediction']) < 1e-5
