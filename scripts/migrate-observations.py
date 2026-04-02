#!/usr/bin/env python3
"""
Migrate cross-observations to self-observations (or vice versa).

When switching from directional → unified observation mode, conclusions
stored as (observer=aiPeer, observed=user) need to be copied to
(observer=user, observed=user) so the unified-mode queries can find them.

Supports the reverse direction too (unified → directional) for users
who want to switch the other way.

Usage:
  # Dry run — see what would be migrated
  python migrate-observations.py \
    --workspace agents \
    --from-observer claude \
    --user ajspig \
    --dry-run

  # Execute migration
  python migrate-observations.py \
    --workspace agents \
    --from-observer claude \
    --user ajspig

  # Execute and delete source conclusions after migration
  python migrate-observations.py \
    --workspace agents \
    --from-observer claude \
    --user ajspig \
    --delete-source

  # Reverse: migrate self-observations to a directional collection
  python migrate-observations.py \
    --workspace agents \
    --from-observer ajspig \
    --to-observer claude \
    --user ajspig

Requirements:
  pip install honcho-ai httpx

Environment:
  HONCHO_API_KEY   — required (or pass --api-key)
  HONCHO_BASE_URL  — optional (default: https://api.honcho.dev)
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import time


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migrate Honcho observations between observer/observed collections.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--workspace", "-w", required=True,
        help="Workspace ID",
    )
    parser.add_argument(
        "--from-observer", required=True,
        help="Source observer peer (e.g., 'claude' for directional→unified)",
    )
    parser.add_argument(
        "--to-observer",
        help="Destination observer peer. Defaults to --user (self-observations).",
    )
    parser.add_argument(
        "--user", "-u", required=True,
        help="User peer name (the 'observed' in both source and destination)",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("HONCHO_API_KEY", ""),
        help="Honcho API key (default: $HONCHO_API_KEY)",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("HONCHO_BASE_URL", "https://api.honcho.dev"),
        help="Honcho API base URL (default: $HONCHO_BASE_URL or https://api.honcho.dev)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be migrated without making changes",
    )
    parser.add_argument(
        "--delete-source", action="store_true",
        help="Delete source conclusions after successful migration",
    )
    parser.add_argument(
        "--batch-size", type=int, default=50,
        help="Conclusions per API batch (default: 50, max: 100)",
    )
    parser.add_argument(
        "--skip-dedup", action="store_true",
        help="Skip content deduplication (faster, but may create duplicates)",
    )
    return parser.parse_args()


def content_hash(text: str) -> str:
    """Deterministic hash for deduplication."""
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:16]


def with_retry(fn, max_retries=5, base_delay=1.0):
    """Call fn() with exponential backoff on rate limit errors."""
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            if "rate limit" in str(e).lower() or "429" in str(e):
                delay = base_delay * (2 ** attempt)
                print(f"  Rate limited, retrying in {delay:.1f}s...", file=sys.stderr)
                time.sleep(delay)
            else:
                raise
    return fn()  # final attempt, let it raise


def main() -> None:
    args = parse_args()

    if not args.api_key:
        print("ERROR: No API key. Set HONCHO_API_KEY or pass --api-key.", file=sys.stderr)
        sys.exit(1)

    to_observer = args.to_observer or args.user
    if args.from_observer == to_observer:
        print(f"ERROR: --from-observer and --to-observer are both '{to_observer}'. Nothing to migrate.", file=sys.stderr)
        sys.exit(1)

    try:
        from honcho import Honcho
    except ImportError:
        print("ERROR: honcho SDK not installed. Run: pip install honcho-ai", file=sys.stderr)
        sys.exit(1)

    # ── Connect ──────────────────────────────────────────────────────────
    client = Honcho(
        api_key=args.api_key,
        base_url=args.base_url,
        workspace_id=args.workspace,
    )

    source_peer = client.peer(args.from_observer)
    dest_peer = client.peer(to_observer)

    source_scope = source_peer.conclusions_of(args.user)
    dest_scope = dest_peer.conclusions_of(args.user)

    print(f"Migration plan:")
    print(f"  workspace:   {args.workspace}")
    print(f"  source:      observer={args.from_observer}, observed={args.user}")
    print(f"  destination: observer={to_observer}, observed={args.user}")
    print(f"  dry-run:     {args.dry_run}")
    print(f"  delete-src:  {args.delete_source}")
    print(f"  dedup:       {not args.skip_dedup}")
    print()

    # ── Phase 1: Read source conclusions ─────────────────────────────────
    print("Phase 1: Reading source conclusions...")
    source_conclusions = []
    page_num = 1
    while True:
        page = with_retry(lambda p=page_num: source_scope.list(page=p, size=50))
        source_conclusions.extend(page.items)
        if page_num >= page.pages:
            break
        page_num += 1

    print(f"  Found {len(source_conclusions)} source conclusions")

    if not source_conclusions:
        print("\nNothing to migrate.")
        return

    # ── Phase 2: Build dedup set from destination ────────────────────────
    existing_hashes: set[str] = set()
    skipped_dedup = 0

    if not args.skip_dedup:
        print("Phase 2: Reading destination for deduplication...")
        page_num = 1
        dest_count = 0
        while True:
            page = with_retry(lambda p=page_num: dest_scope.list(page=p, size=50))
            for c in page.items:
                existing_hashes.add(content_hash(c.content))
                dest_count += 1
            if page_num >= page.pages:
                break
            page_num += 1
        print(f"  Found {dest_count} existing destination conclusions ({len(existing_hashes)} unique hashes)")
    else:
        print("Phase 2: Skipping deduplication (--skip-dedup)")

    # ── Phase 3: Filter and prepare ──────────────────────────────────────
    print("Phase 3: Preparing migration batch...")
    to_migrate: list[dict] = []
    for c in source_conclusions:
        h = content_hash(c.content)
        if h in existing_hashes:
            skipped_dedup += 1
            continue
        existing_hashes.add(h)  # prevent self-duplication within batch
        to_migrate.append({
            "content": c.content,
            "session_id": c.session_id,
            "source_id": c.id,
        })

    print(f"  To migrate:     {len(to_migrate)}")
    print(f"  Skipped (dedup): {skipped_dedup}")
    print()

    if not to_migrate:
        print("All source conclusions already exist in destination. Nothing to do.")
        return

    # ── Phase 4: Migrate ─────────────────────────────────────────────────
    if args.dry_run:
        print("DRY RUN — would migrate these conclusions:\n")
        for i, item in enumerate(to_migrate[:20], 1):
            preview = item["content"][:120].replace("\n", " ")
            print(f"  {i:4d}. [{item['source_id'][:12]}] {preview}")
        if len(to_migrate) > 20:
            print(f"  ... and {len(to_migrate) - 20} more")
        print(f"\nTotal: {len(to_migrate)} conclusions would be created")
        if args.delete_source:
            print(f"       {len(source_conclusions)} source conclusions would be deleted")
        return

    print(f"Phase 4: Creating {len(to_migrate)} conclusions in destination...")
    batch_size = min(args.batch_size, 100)
    created = 0
    errors = 0

    for i in range(0, len(to_migrate), batch_size):
        batch = to_migrate[i : i + batch_size]
        batch_params = []
        for item in batch:
            params = {"content": item["content"]}
            if item["session_id"]:
                params["session_id"] = item["session_id"]
            batch_params.append(params)

        try:
            with_retry(lambda bp=batch_params: dest_scope.create(bp))
            created += len(batch)
            pct = int(created / len(to_migrate) * 100)
            print(f"  [{pct:3d}%] Created {created}/{len(to_migrate)}")
        except Exception as e:
            errors += len(batch)
            print(f"  ERROR creating batch at offset {i}: {e}", file=sys.stderr)
            # Continue with next batch rather than aborting

        # Brief pause to avoid rate limiting
        if i + batch_size < len(to_migrate):
            time.sleep(0.2)

    print(f"\n  Created: {created}")
    if errors:
        print(f"  Errors:  {errors}")

    # ── Phase 5: Optionally delete source ────────────────────────────────
    if args.delete_source and created == len(source_conclusions) and errors == 0:
        print(f"\nPhase 5: Deleting {len(source_conclusions)} source conclusions...")
    elif args.delete_source and created > 0:
        print(
            f"\nPhase 5: Skipping deletion — only {created}/{len(source_conclusions)} "
            f"conclusions created with {errors} error(s). Resolve failures and re-run."
        )
    if args.delete_source and created == len(source_conclusions) and errors == 0:
        deleted = 0
        delete_errors = 0

        for c in source_conclusions:
            try:
                with_retry(lambda cid=c.id: source_scope.delete(cid))
                deleted += 1
                if deleted % 50 == 0:
                    pct = int(deleted / len(source_conclusions) * 100)
                    print(f"  [{pct:3d}%] Deleted {deleted}/{len(source_conclusions)}")
            except Exception as e:
                delete_errors += 1
                print(f"  ERROR deleting {c.id}: {e}", file=sys.stderr)

            # Brief pause to avoid rate limiting
            if deleted % 10 == 0:
                time.sleep(0.1)

        print(f"\n  Deleted: {deleted}")
        if delete_errors:
            print(f"  Errors:  {delete_errors}")
    elif args.delete_source and created == 0:
        print("\nSkipping source deletion — no conclusions were created.")

    # ── Summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 50)
    print("Migration complete.")
    print(f"  Source ({args.from_observer} → {args.user}): {len(source_conclusions)} conclusions")
    print(f"  Migrated to ({to_observer} → {args.user}): {created} new, {skipped_dedup} skipped (dedup)")
    if args.delete_source:
        print(f"  Source cleaned up: {deleted if 'deleted' in dir() else 0} deleted")
    else:
        print(f"  Source preserved (use --delete-source to clean up)")

    if errors:
        print(f"\n  ⚠ {errors} errors occurred during migration. Re-run to retry failed items.")
        sys.exit(1)


if __name__ == "__main__":
    main()
