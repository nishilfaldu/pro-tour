"""Regression tests for the independently installed model resolvers."""

import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = sorted(p for p in (ROOT / ".agents/skills").iterdir() if p.is_dir() and (p / "scripts/resolve_models.py").exists())
HELPER = SKILLS[0] / "scripts/resolve_models.py"
spec = importlib.util.spec_from_file_location("models", HELPER)
models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)


class ModelsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.project = self.root / "project"
        self.project.mkdir()
        self.user = self.root / "user/models.yaml"
        self.local = self.project / ".diffusion/skills/models.yaml"

    def write(self, path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def resolve(self, name="df-easy-loop-e2e"):
        return models.resolve(ROOT / ".agents/skills" / name, self.project, self.user)["roles"]

    def test_all_seven_defaults_and_installed_copies(self):
        self.assertEqual(len(SKILLS), 7)
        for mirror in (".agents", ".claude"):
            for skill in SKILLS:
                with self.subTest(mirror=mirror, skill=skill.name):
                    source = ROOT / mirror / "skills" / skill.name
                    installed = self.root / mirror / skill.name
                    shutil.copytree(source, installed)
                    self.assertEqual((installed / "scripts/resolve_models.py").read_bytes(), HELPER.read_bytes())
                    result = subprocess.run(
                        [sys.executable, str(installed / "scripts/resolve_models.py"),
                         "--project-dir", str(self.project), "--user-config", str(self.user)],
                        capture_output=True, text=True, check=True)
                    roles = json.loads(result.stdout)["roles"]
                    self.assertEqual(roles["main"]["model"], "inherit")
                    for role, value in roles.items():
                        if value["cli"] == "claude":
                            self.assertEqual(value["model"], "claude-fable-5-1")
                        elif value["cli"] == "codex":
                            self.assertEqual(value["model"], "gpt-6-astra")
                        if skill.name.startswith("df-easy-loop-") and role != "main":
                            self.assertEqual(value["reasoning_effort"], "high")

    def test_field_precedence_and_sources(self):
        self.write(self.user, "skills:\n  df-easy-loop-e2e:\n    coding:\n      model: gpt-user\n      reasoning_effort: medium\n    review:\n      model: claude-user\n")
        self.write(self.local, "skills:\n  df-easy-loop-e2e:\n    coding:\n      model: gpt-project\n")
        roles = self.resolve()
        self.assertEqual(roles["coding"]["model"], "gpt-project")
        self.assertEqual(roles["coding"]["reasoning_effort"], "medium")
        self.assertEqual(roles["coding"]["sources"], {"model": str(self.local), "reasoning_effort": str(self.user)})
        self.assertEqual(roles["review"]["model"], "claude-user")
        self.assertEqual(roles["plan"]["model"], "claude-fable-5-1")

    def test_defaults_work_without_pyyaml_for_every_skill(self):
        for mirror in (".agents", ".claude"):
            for skill in SKILLS:
                with self.subTest(mirror=mirror, skill=skill.name):
                    helper = ROOT / mirror / "skills" / skill.name / "scripts/resolve_models.py"
                    # -S excludes site-packages, including PyYAML in this test venv.
                    cp = subprocess.run([sys.executable, "-S", str(helper),
                                         "--project-dir", str(self.project),
                                         "--user-config", str(self.user)],
                                        text=True, capture_output=True, check=True)
                    self.assertEqual(json.loads(cp.stdout)["roles"], self.resolve(skill.name))

    def test_overrides_without_pyyaml_fail_with_install_guidance(self):
        self.write(self.local, "skills: {}")
        cp = subprocess.run([sys.executable, "-S", str(HELPER), "--project-dir", str(self.project),
                             "--user-config", str(self.user)], text=True, capture_output=True)
        self.assertEqual(cp.returncode, 2)
        self.assertIn("requires PyYAML", cp.stderr)
        self.assertNotIn("Traceback", cp.stderr)

    def test_malformed_workflow_reports_configuration_error(self):
        skill = self.root / "broken-skill"
        skill.mkdir()
        text = "---\nname: df-easy-loop-e2e\n---\n```yaml\nagents:\n  coding:\n    model: gpt-6-astra\n```\n"
        (skill / "SKILL.md").write_text(text)
        with self.assertRaisesRegex(models.ConfigError, "top_level_agent"):
            models.defaults(skill)
        with self.assertRaisesRegex(models.ConfigError, "top_level_agent"):
            models.plain_defaults("agents:\n  coding:\n    model: gpt-6-astra\n")

    def test_every_role_can_be_overridden_independently(self):
        for skill in SKILLS:
            for role in self.resolve(skill.name):
                with self.subTest(skill=skill.name, role=role):
                    model = "gemini-test" if role == "gemini" else "claude-test" if role == "claude" else "gpt-test"
                    self.write(self.local, f"skills:\n  {skill.name}:\n    {role}:\n      model: {model}\n")
                    self.assertEqual(self.resolve(skill.name)[role]["model"], model)
                    self.local.unlink()

    def test_cross_provider_override_routes_cli_and_effort(self):
        self.write(self.local, "skills:\n  df-easy-loop-e2e:\n    coding:\n      model: claude-fable-5-1\n")
        role = self.resolve()["coding"]
        self.assertEqual(role["cli"], "claude")
        self.assertEqual(role["model_args"], ["--model", "claude-fable-5-1", "--effort", "high"])

    def test_cursor_grok_effort_routes_to_available_model_id(self):
        self.write(self.local, "skills:\n  df-easy-loop-e2e:\n    plan-critique:\n"
                               "      model: grok-4.7\n      reasoning_effort: xhigh\n")
        role = self.resolve()["plan-critique"]
        self.assertEqual(role["cli"], "cursor")
        self.assertEqual(role["model_args"], ["--model", "grok-4.7-xhigh"])
        with self.assertRaises(models.ConfigError):
            models.invocation("df-easy-loop-e2e", "coding",
                              {"model": "grok-4.7", "reasoning_effort": "max"})

    def test_null_removes_effort(self):
        self.write(self.local, "skills:\n  df-easy-loop-e2e:\n    coding:\n      reasoning_effort: null\n")
        self.assertEqual(self.resolve()["coding"]["model_args"], ["--model", "gpt-6-astra"])

    def test_other_skill_does_not_override_current_skill(self):
        self.write(self.local, "skills:\n  df-easy-loop-simple:\n    coding:\n      model: gpt-other\n")
        self.assertEqual(self.resolve()["coding"]["model"], "gpt-6-astra")

    def test_empty_mapping_noop(self):
        self.write(self.user, "{}\n")
        self.write(self.local, "skills: {}\n")
        self.assertEqual(self.resolve()["coding"]["model"], "gpt-6-astra")

    def test_blank_and_comment_only_files_are_noop_without_pyyaml(self):
        self.write(self.user, "")
        self.write(self.local, "# Configure models here when needed.\n\n")
        self.assertEqual(self.resolve()["coding"]["model"], "gpt-6-astra")
        cp = subprocess.run([sys.executable, "-S", str(HELPER), "--project-dir", str(self.project),
                             "--user-config", str(self.user)], text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(cp.stdout)["roles"]["main"]["model"], "inherit")

    def test_invalid_config_fails_before_output(self):
        cases = ["skills: [", "[]", "skills: null", "skills: {}\nskills: {}",
                 "models: {}", "skills:\n  df-easy-loop-e2e: []",
                 "skills:\n  df-easy-loop-e2e:\n    typo: {}",
                 "skills:\n  df-easy-loop-e2e:\n    coding:\n      unknown: true",
                 "skills:\n  df-easy-loop-e2e:\n    coding:\n      model: null",
                 "skills:\n  df-easy-loop-e2e:\n    coding:\n      model: gpt-unsafe; touch /tmp/oops",
                 "skills:\n  df-easy-loop-e2e:\n    coding:\n      reasoning_effort: nonsense"]
        for content in cases:
            with self.subTest(content=content):
                self.write(self.local, content)
                with self.assertRaises(models.ConfigError):
                    self.resolve()

    def test_gemini_default_omits_model_flag(self):
        self.assertEqual(self.resolve("df-sprint-plan")["gemini"]["model_args"], [])
        self.write(self.local, "skills:\n  df-sprint-plan:\n    gemini:\n      model: gemini-3.8-flash-high\n")
        self.assertEqual(self.resolve("df-sprint-plan")["gemini"]["model_args"], ["--model", "gemini-3.8-flash-high"])

    def test_sprint_provider_lane_cannot_switch(self):
        self.write(self.local, "skills:\n  df-sprint-execute:\n    claude:\n      model: gpt-6-astra\n")
        with self.assertRaises(models.ConfigError):
            self.resolve("df-sprint-execute")

    def test_unsupported_cli_and_sentinel_combinations(self):
        for model, effort in [("inherit", None), ("cli-default", None),
                              ("gemini-3.8-flash-high", "high"), ("unknown-model", None),
                              ("claude-fable-5-1", "minimal")]:
            with self.subTest(model=model, effort=effort):
                with self.assertRaises(models.ConfigError):
                    models.invocation("df-easy-loop-e2e", "coding", {"model": model, "reasoning_effort": effort})
        with self.assertRaises(models.ConfigError):
            models.invocation("df-chapter-create", "main", {"model": "inherit", "reasoning_effort": "high"})

    def test_nested_git_project_discovery(self):
        subprocess.run(["git", "init", "-q", str(self.project)], check=True)
        nested = self.project / "src/nested"
        nested.mkdir(parents=True)
        self.assertEqual(models.project_root(nested), self.project)
        self.assertEqual(models.project_root(self.root), self.root)

    def test_explicit_project_beats_install_directory(self):
        self.write(self.local, "skills:\n  df-chapter-create:\n    main:\n      model: gpt-6-astra\n")
        result = subprocess.run([sys.executable, str(HELPER), "--project-dir", str(self.project),
                                 "--user-config", str(self.user)], cwd=ROOT,
                                capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout)["roles"]["main"]["cli"], "codex")

    def test_cli_error_is_nonzero_and_no_json(self):
        self.write(self.local, "skills: []")
        result = subprocess.run([sys.executable, str(HELPER), "--project-dir", str(self.project),
                                 "--user-config", str(self.user)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "")
        self.assertIn("Model configuration error", result.stderr)


if __name__ == "__main__":
    unittest.main()
