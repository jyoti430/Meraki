"""Durable close/expiry worker. Start independently of the browser and API."""
import argparse
import json
import os
import threading

from .db import Database
from .service import TradeService


def run_once(database, clock=None, demo_enabled=True, environment='development'):
    return TradeService(database, demo_enabled, environment, clock).tick()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--interval', type=float, default=5)
    args = parser.parse_args()
    if args.interval < .1:
        parser.error('--interval must be at least 0.1 seconds')
    database = Database(os.getenv('TRADE_DATABASE_URL', 'sqlite:///./server/trade-dev.sqlite3'))
    database.migrate()
    enabled = os.getenv('TRADE_DEMO_MODE') == '1'
    environment = os.getenv('TRADE_ENV', 'development')
    while True:
        print(json.dumps(run_once(database, demo_enabled=enabled, environment=environment)), flush=True)
        if args.once:
            return
        threading.Event().wait(args.interval)


if __name__ == '__main__':
    main()
