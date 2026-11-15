"""Run with python -m model_validation; report generation is not model approval."""
import argparse
import json
from pathlib import Path

from .contracts import DEFAULT_AS_OF
from .reporting import build_report, render_markdown


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--outcomes", type=Path, help="Explicit authorised, deidentified CSV; no automatic search for private farm files")
    parser.add_argument("--as-of", default=DEFAULT_AS_OF, help="Timezone-aware frozen evaluation cutoff")
    parser.add_argument("--check", action="store_true", help="Read-only reproducibility check against committed reports")
    args = parser.parse_args()
    try:
        report = build_report(args.repo_root, outcomes_path=args.outcomes, as_of=args.as_of)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.error(f"Cannot evaluate supplied input: {type(error).__name__}; check the contract, paths and timestamps")
    outputs = {"model_validation.json": json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
               "model_validation.md": render_markdown(report)}
    directory = args.repo_root / "reports"
    if args.check:
        stale = [name for name, content in outputs.items() if not (directory / name).exists() or (directory / name).read_text(encoding="utf-8") != content]
        if stale:
            print("Model validation reports are missing/stale: " + ", ".join(stale))
            return 1
    else:
        directory.mkdir(parents=True, exist_ok=True)
        for name, content in outputs.items():
            (directory / name).write_text(content, encoding="utf-8", newline="\n")
    print(f"Model validation {report['status']}; accepted farm outcomes={report['farm_outcomes']['accepted_rows']}; promotion_allowed=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
