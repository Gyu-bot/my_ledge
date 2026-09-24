import importlib.util
import json
from pathlib import Path
import subprocess
from types import ModuleType
from unittest.mock import Mock

import pytest


PRIVATE_VALUE = "fake-private-value-never-print"


@pytest.fixture
def item() -> dict:
    return {
        "id": "item123",
        "vault": {"id": "vault123", "name": "Personal"},
        "fields": [
            {"id": "credential", "label": "자격 증명", "value": PRIVATE_VALUE},
            {"id": "secret456", "label": "Secret Key", "value": PRIVATE_VALUE},
        ],
    }


@pytest.fixture
def helper(monkeypatch: pytest.MonkeyPatch, item: dict) -> ModuleType:
    path = Path(__file__).resolve().parents[2] / "scripts/toss-1password-refs.py"
    spec = importlib.util.spec_from_file_location("toss_1password_refs_test", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for key in (
        "TOSS_CLIENT_ID",
        "TOSS_CLIENT_SECRET",
        "TOSS_CLIENT_ID_REF",
        "TOSS_CLIENT_SECRET_REF",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("PRESERVED_TEST_ENV", "existing-value")
    monkeypatch.setattr(module.shutil, "which", Mock(return_value="/mock/op"))
    monkeypatch.setattr(module.sys, "argv", [str(path), "backend-command"])
    monkeypatch.setattr(
        module.subprocess,
        "run",
        Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps(item), "")),
    )
    monkeypatch.setattr(module.os, "execve", Mock())
    return module


def test_default_unicode_labels_resolve_to_ascii_ids_without_secret_output(
    helper: ModuleType, capsys: pytest.CaptureFixture[str]
) -> None:
    assert helper.main() == 0
    helper.subprocess.run.assert_called_once_with(
        [
            "/mock/op",
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
    executable, arguments, env = helper.os.execve.call_args.args
    assert executable == "/mock/op"
    assert arguments == ["/mock/op", "run", "--", "backend-command"]
    assert env["TOSS_CLIENT_ID"] == "op://vault123/item123/credential"
    assert env["TOSS_CLIENT_SECRET"] == "op://vault123/item123/secret456"
    assert env["PRESERVED_TEST_ENV"] == "existing-value"
    assert PRIVATE_VALUE not in str(arguments) + str(env)
    captured = capsys.readouterr()
    assert captured.out == captured.err == ""


def test_both_custom_refs_skip_item_read_and_preserve_literal_argv(
    helper: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TOSS_CLIENT_ID_REF", "op://custom/item/client")
    monkeypatch.setenv("TOSS_CLIENT_SECRET_REF", "op://custom/item/secret")
    arguments = ["command", "argument with spaces", "$(must-not-run)", "; echo secret"]
    monkeypatch.setattr(helper.sys, "argv", ["helper", *arguments])
    assert helper.main() == 0
    helper.subprocess.run.assert_not_called()
    _, forwarded, env = helper.os.execve.call_args.args
    assert forwarded == ["/mock/op", "run", "--", *arguments]
    assert env["TOSS_CLIENT_ID"] == "op://custom/item/client"
    assert env["TOSS_CLIENT_SECRET"] == "op://custom/item/secret"


@pytest.mark.parametrize("custom_key", ["TOSS_CLIENT_ID", "TOSS_CLIENT_SECRET"])
def test_partial_override_preserves_custom_reference(
    helper: ModuleType, monkeypatch: pytest.MonkeyPatch, custom_key: str
) -> None:
    monkeypatch.setenv(f"{custom_key}_REF", "op://custom/item/field")
    assert helper.main() == 0
    helper.subprocess.run.assert_called_once()
    env = helper.os.execve.call_args.args[2]
    assert env[custom_key] == "op://custom/item/field"
    if custom_key == "TOSS_CLIENT_ID":
        assert env["TOSS_CLIENT_SECRET"] == "op://vault123/item123/secret456"
    else:
        assert env["TOSS_CLIENT_ID"] == "op://vault123/item123/credential"


@pytest.mark.parametrize(
    "failure",
    ["duplicate", "missing", "unicode_id", "no_vault", "invalid_json", "op_error"],
)
def test_bad_item_response_fails_closed_without_raw_output(
    helper: ModuleType,
    item: dict,
    capsys: pytest.CaptureFixture[str],
    failure: str,
) -> None:
    if failure == "duplicate":
        item["fields"].append(item["fields"][0].copy())
    elif failure == "missing":
        item["fields"][0]["label"] = "다른 필드"
    elif failure == "unicode_id":
        item["fields"][0]["id"] = "한글ID"
    elif failure == "no_vault":
        item.pop("vault")
    stdout = PRIVATE_VALUE if failure == "invalid_json" else json.dumps(item)
    returncode = 1 if failure == "op_error" else 0
    helper.subprocess.run.return_value = subprocess.CompletedProcess(
        [], returncode, stdout, PRIVATE_VALUE
    )
    assert helper.main() == 1
    helper.os.execve.assert_not_called()
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err
    assert PRIVATE_VALUE not in captured.err
    assert "Traceback" not in captured.err


@pytest.mark.parametrize("operation", ["read", "exec"])
def test_os_errors_do_not_expose_exception_details(
    helper: ModuleType, capsys: pytest.CaptureFixture[str], operation: str
) -> None:
    target = helper.subprocess.run if operation == "read" else helper.os.execve
    target.side_effect = OSError(PRIVATE_VALUE)
    assert helper.main() == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == "Could not execute the 1Password CLI.\n"


def test_unicode_custom_reference_fails_before_reading_vault(
    helper: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("TOSS_CLIENT_ID_REF", "op://Personal/토스증권 API/자격 증명")
    assert helper.main() == 1
    helper.subprocess.run.assert_not_called()
    helper.os.execve.assert_not_called()
    captured = capsys.readouterr()
    assert "ASCII" in captured.err
    assert "토스증권 API" not in captured.err
