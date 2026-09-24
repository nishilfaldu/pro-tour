import importlib.util
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("run_jev_tour", Path(__file__).resolve().parents[1] / "scripts" / "run-jev-tour.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PlannedTextTests(unittest.TestCase):
    def test_only_configured_values_are_typed_in_order(self):
        provider = module.planned_text({"Task name": ["First synthetic task", "Edited synthetic task"]})
        context = {"field": {"label": "Task name"}}
        self.assertEqual(provider(context)[0], "First synthetic task")
        self.assertEqual(provider(context)[0], "Edited synthetic task")
        with self.assertRaises(ValueError):
            provider(context)
        with self.assertRaises(ValueError):
            provider({"field": {"label": "Unknown field"}})


if __name__ == "__main__":
    unittest.main()
