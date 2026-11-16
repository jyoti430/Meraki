"""Explicit synthetic demo through the API. Never run against a production service."""
import argparse
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    password = os.getenv("MERAKI_DEMO_PASSWORD", "")
    if len(password) < 10: parser.error("Set MERAKI_DEMO_PASSWORD (10+ characters); do not use a real password")
    with httpx.Client(base_url=args.base_url, timeout=20) as client:
        health = client.get("/api/v1/health"); health.raise_for_status()
        if health.json()["environment"] != "development": parser.error("Synthetic seeding requires a development API")
        for name, role in [("demo.fpo", "fpo"), ("demo.exporter", "exporter")]:
            r = client.post("/api/v1/auth/register", json={"username":name, "password":password, "display_name":name,
                "organisation_name":"Synthetic demo " + role, "role":role})
            if r.status_code == 409:
                r = client.post("/api/v1/auth/login", json={"username":name, "password":password})
            r.raise_for_status(); account=r.json()
            print(name, "organisation:", account["organisation_id"])
            if role != "fpo": continue
            headers={"Authorization":"Bearer "+account["access_token"], "X-Organisation-ID":account["organisation_id"]}
            now=datetime.now(timezone.utc); start=(now+timedelta(days=7)).date().isoformat(); end=(now+timedelta(days=14)).date().isoformat()
            def post(path, body):
                r=client.post("/api/v1"+path, json=body, headers={**headers,"Idempotency-Key":uuid4().hex}); r.raise_for_status(); return r.json()
            common={"crop":"Okra", "variety":"Hybrid", "grade":"A", "week_start":start,"week_end":end,
                "quantity_g":100000, "consent_status":"opted-in"}
            projection=post("/projections", {**common,"source_id":"synthetic-plan-"+uuid4().hex,"version":1,
                "source_rule_version":"synthetic-v1","as_of":now.isoformat(),"stale_after":(now+timedelta(days=7)).isoformat(),
                "evidence_refs":[{"type":"synthetic","reference":"demo-only"}],"caveats":["Synthetic; no farmer consent or real supply asserted"]})["projection"]
            for source_type, sid in [("harvested_lot", "synthetic-lot-"+uuid4().hex),("projection",projection["id"])]:
                cap=post("/dev/auction-lots" if source_type == "harvested_lot" else "/capacities",{**common,"source_type":source_type,"source_id":sid})
                if source_type == "projection":
                    post(f'/capacities/{cap["id"]}/review',{"decision":"approve","reason":"Synthetic demonstration only","evidence_reference":"synthetic-demo-v1"})
                print("Synthetic",source_type,"capacity:",cap["id"],"100 kg",start,"to",end)
        print("Sign in with demo.fpo or demo.exporter using MERAKI_DEMO_PASSWORD. No emails sent.")


if __name__ == "__main__": main()
