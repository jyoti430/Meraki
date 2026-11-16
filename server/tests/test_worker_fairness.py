"""Independent deadline queues and captured production policy must agree."""
import pytest
from sqlalchemy.orm import sessionmaker

from server.meraki.database import make_engine
from server.meraki.models import Base, Job
from server.meraki.worker import run_once


@pytest.fixture
def sessions(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'worker.sqlite3'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory.begin() as db:
        db.add(Job(id="ordinary-expiry", kind="expire_listing", payload={"listing_id": "already-removed-listing"}))
    yield factory
    engine.dispose()


def completed(sessions):
    with sessions() as db:
        job = db.get(Job, "ordinary-expiry")
        return job.status == "completed" and job.attempts == 1


def test_due_auctions_do_not_starve_ordinary_expiry(sessions, monkeypatch):
    calls = []
    def busy_auction_queue(_):
        calls.append(True)
        return True
    monkeypatch.setattr("server.meraki.auctions.tick_auction", busy_auction_queue)
    assert run_once(sessions, allow_auction_work=True) is True
    assert calls == [True]
    assert completed(sessions)


def test_one_broken_auction_does_not_starve_expiry_and_remains_visible(sessions, monkeypatch):
    def broken_auction(_):
        raise RuntimeError("synthetic auction failure")
    monkeypatch.setattr("server.meraki.auctions.tick_auction", broken_auction)
    with pytest.raises(RuntimeError, match="synthetic auction failure"):
        run_once(sessions, allow_auction_work=True)
    assert completed(sessions)


@pytest.mark.parametrize("environment", ["production", "staging"])
def test_unverified_auction_worker_is_disabled_outside_development(sessions, monkeypatch, environment):
    monkeypatch.setenv("MERAKI_ENV", environment)
    def prohibited_auction(_):
        raise AssertionError("An unverified auction must not close in this environment")
    monkeypatch.setattr("server.meraki.auctions.tick_auction", prohibited_auction)
    assert run_once(sessions) is True
    assert completed(sessions)
    assert run_once(sessions) is False


def test_captured_production_policy_survives_later_environment_changes(sessions, monkeypatch):
    monkeypatch.setenv("MERAKI_ENV", "development")
    def prohibited_auction(_):
        raise AssertionError("A captured production worker must stay disabled")
    monkeypatch.setattr("server.meraki.auctions.tick_auction", prohibited_auction)
    assert run_once(sessions, allow_auction_work=False) is True
    assert completed(sessions)
