"""네트워크 및 실제 API 키 없이 수집 실패와 재시도를 검증합니다."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch


sdk = types.ModuleType("google")
sdk.genai = types.SimpleNamespace(Client=Mock())
spec = importlib.util.spec_from_file_location("importer", Path(__file__).parents[1] / "importer.py")
importer = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"google": sdk}), patch.dict(os.environ, {"GEMINI_API_KEY": "test-only"}):
    spec.loader.exec_module(importer)


class ImporterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.content = patch.object(importer, "CONTENT_DIR", Path(self.temp.name))
        self.content.start()
        self.addCleanup(self.content.stop)

    def test_transient_error_recovers_and_counts_attempts(self):
        budget = importer.Budget(3)
        with patch.object(importer.client.models, "generate_content", side_effect=[
            Exception("503 UNAVAILABLE"), types.SimpleNamespace(text="result")
        ]) as call, patch.object(importer.time, "sleep") as sleep:
            self.assertEqual(importer.ask("prompt", budget), "result")
        self.assertEqual(call.call_count, 2)
        self.assertEqual(budget.used, 2)
        sleep.assert_called_once_with(20)

    def test_persistent_error_stops_after_three_attempts(self):
        with patch.object(importer.client.models, "generate_content", side_effect=Exception("503 UNAVAILABLE")) as call, patch.object(importer.time, "sleep"):
            with self.assertRaisesRegex(Exception, "503"):
                importer.ask("prompt", importer.Budget(18))
        self.assertEqual(call.call_count, 3)

    def test_budget_limits_retries(self):
        with patch.object(importer.client.models, "generate_content", side_effect=Exception("503 UNAVAILABLE")) as call, patch.object(importer.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "BUDGET"):
                importer.ask("prompt", importer.Budget(1))
        self.assertEqual(call.call_count, 1)

    def test_auth_error_is_not_retried(self):
        with patch.object(importer.client.models, "generate_content", side_effect=Exception("401 UNAUTHENTICATED")) as call:
            with self.assertRaisesRegex(Exception, "401"):
                importer.ask("prompt", importer.Budget(18))
        self.assertEqual(call.call_count, 1)

    def test_incomplete_response_does_not_overwrite_existing_content(self):
        original = importer.save("tozer", "2026-09-15", "한국어\n===LANG:EN===\nEnglish", True)
        for response in ["", "한국어만", "===LANG:EN===English"]:
            with self.assertRaises(ValueError):
                importer.save("tozer", "2026-09-15", response, True)
        self.assertEqual(original[0].read_text(), "한국어\n")
        self.assertEqual(original[1].read_text(), "English\n")

    def run_main(self, source, *args):
        with patch.object(importer, "SOURCES", {"email": source}), patch.object(sys, "argv", ["importer.py", "--collection", "tozer", *args]):
            return importer.main()

    def test_collection_error_returns_failure(self):
        self.assertEqual(self.run_main(Mock(side_effect=Exception("503 UNAVAILABLE"))), 1)

    def test_quota_returns_failure(self):
        self.assertEqual(self.run_main(Mock(side_effect=RuntimeError("QUOTA"))), 1)

    def test_missing_today_returns_failure(self):
        self.assertEqual(self.run_main(Mock(return_value=0), "--require-today"), 1)

    def test_existing_today_is_success_without_new_content(self):
        today = importer.datetime.now(importer.TZ).strftime("%Y-%m-%d")
        importer.save("tozer", today, "한국어\n===LANG:EN===\nEnglish", True)
        self.assertEqual(self.run_main(Mock(return_value=0), "--require-today"), 0)

    def test_imap_search_failure_returns_failure(self):
        mail = Mock()
        mail.select.return_value = ("OK", [])
        mail.search.return_value = ("NO", [])
        with patch.object(importer.imaplib, "IMAP4_SSL", return_value=mail), patch.dict(os.environ, {"EMAIL_USER": "test", "EMAIL_PASS": "test"}):
            with self.assertRaisesRegex(ValueError, "IMAP 검색 실패"):
                importer.from_email("tozer", {}, True, 2, 3, importer.Budget(18))
        mail.logout.assert_called_once()


if __name__ == "__main__":
    unittest.main()
