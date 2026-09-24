"""Resolve field IDs without displaying item contents, then execute op run."""

import json
import os
import re
import shutil
import subprocess
import sys


class ReferenceError(Exception):
    pass


def ascii_id(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ReferenceError("1Password returned an invalid item or field identifier.")
    return value


def field_reference(item: dict, label: str) -> str:
    fields = item.get("fields")
    if not isinstance(fields, list):
        raise ReferenceError("1Password item fields are missing.")
    matches = [
        field
        for field in fields
        if isinstance(field, dict) and field.get("label") == label
    ]
    if len(matches) != 1:
        raise ReferenceError("The required 1Password field is missing or ambiguous.")
    vault = item.get("vault")
    if not isinstance(vault, dict):
        raise ReferenceError("1Password vault metadata is missing.")
    return "op://{}/{}/{}".format(
        ascii_id(vault.get("id")),
        ascii_id(item.get("id")),
        ascii_id(matches[0].get("id")),
    )


def validate_reference(value: str) -> str:
    parts = value.split("/")
    if (
        not value.isascii()
        or len(parts) != 5
        or parts[:2] != ["op:", ""]
        or not all(parts[2:])
        or any(char in value for char in "\r\n\x00")
    ):
        raise ReferenceError(
            "Custom 1Password references must use ASCII vault, item and field names or IDs."
        )
    return value


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "Usage: scripts/toss-with-1password.sh COMMAND [ARG ...]", file=sys.stderr
        )
        return 2
    op = shutil.which("op")
    if op is None:
        print("1Password CLI (op) is required.", file=sys.stderr)
        return 127
    references = {
        "TOSS_CLIENT_ID": os.environ.get("TOSS_CLIENT_ID_REF", ""),
        "TOSS_CLIENT_SECRET": os.environ.get("TOSS_CLIENT_SECRET_REF", ""),
    }
    try:
        for key, value in references.items():
            if value:
                references[key] = validate_reference(value)
        if not all(references.values()):
            result = subprocess.run(
                [
                    op,
                    "item",
                    "get",
                    "토스증권 API",
                    "--vault",
                    "Personal",
                    "--format=json",
                ],
                capture_output=True,
                check=False,
            )
            if result.returncode != 0:
                raise ReferenceError(
                    "Could not read the 1Password item. Check CLI access and vault permissions."
                )
            try:
                item = json.loads(result.stdout)
            except (ValueError, UnicodeError):
                raise ReferenceError(
                    "1Password returned an unreadable item response."
                ) from None
            if not isinstance(item, dict):
                raise ReferenceError("1Password returned an invalid item response.")
            for key, label in (
                ("TOSS_CLIENT_ID", "자격 증명"),
                ("TOSS_CLIENT_SECRET", "Secret Key"),
            ):
                if not references[key]:
                    references[key] = field_reference(item, label)
            # Item output can contain secrets. Never print, persist, or forward it.
            del item, result
        env = os.environ.copy()
        env.update(references)
        os.execve(op, [op, "run", "--", *sys.argv[1:]], env)
    except ReferenceError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except OSError:
        print("Could not execute the 1Password CLI.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
