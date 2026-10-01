import importlib.util
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from benchmarks import run as benchmark
from pro_tour.common import TourError

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_check', ROOT / 'scripts/check-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ValidationCleanupTests(unittest.TestCase):
    def test_wheel_requires_bundled_assets_license_and_registry_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'package.whl'
            required = ['pro_tour/configuration.py', 'pro_tour/_vendor/jev_ultrafast/snapshot.js',
                        'package.dist-info/licenses/jev-ultrafast-MIT.txt']
            for metadata, omitted, extra, valid in [
                ('Requires-Dist: browser-harness\n', None, None, True),
                ('Requires-Dist: jev @ git+https://example.test/library\n', None, None, False),
                ('', required[1], None, False), ('', required[2], None, False),
                ('', None, 'pro_tour/.env.local', False)]:
                with zipfile.ZipFile(path, 'w') as archive:
                    archive.writestr('package.dist-info/METADATA', metadata)
                    for name in required:
                        if name != omitted: archive.writestr(name, '')
                    if extra: archive.writestr(extra, '')
                if valid:
                    release.validate_wheel(path)
                else:
                    with self.assertRaises(ValueError): release.validate_wheel(path)

    def test_default_benchmark_removes_outputs_after_success_failure_and_interrupt(self):
        for failure in (None, TourError('fixture failed'), KeyboardInterrupt()):
            seen = []
            def run(args, output):
                seen.append(output)
                (output / 'test.mp4').write_bytes(b'test output')
                if failure: raise failure
                return 0
            with patch('sys.argv', ['benchmark']), patch.object(benchmark, 'benchmark', side_effect=run):
                if failure:
                    with self.assertRaises(type(failure)): benchmark.main()
                else:
                    self.assertEqual(benchmark.main(), 0)
            self.assertEqual(len(seen), 1)
            self.assertFalse(seen[0].exists())
            self.assertNotEqual(seen[0].parent, ROOT)

    def test_explicit_benchmark_output_is_retained_and_never_replaced(self):
        with tempfile.TemporaryDirectory() as tmp, redirect_stdout(StringIO()):
            output = Path(tmp) / 'keep'
            def run(args, path):
                (path / 'results.json').write_text('{}')
                return 0
            with patch('sys.argv', ['benchmark', '--output', str(output)]), patch.object(benchmark, 'benchmark', side_effect=run):
                self.assertEqual(benchmark.main(), 0)
                self.assertTrue((output / 'results.json').exists())
                with self.assertRaises(FileExistsError): benchmark.main()
                self.assertEqual((output / 'results.json').read_text(), '{}')

    def test_release_build_source_and_outputs_are_disposable_even_on_interrupt(self):
        for failure in (None, TourError('build failed'), KeyboardInterrupt()):
            seen = []
            def check(args, output, source):
                seen.extend([output, source])
                self.assertEqual((source / 'pyproject.toml').read_bytes(), (ROOT / 'pyproject.toml').read_bytes())
                self.assertTrue((source / 'src/pro_tour/cli.py').exists())
                self.assertNotEqual(source, ROOT)
                (source / 'build').mkdir()
                (output / 'wheel.whl').write_bytes(b'test output')
                if failure: raise failure
                return 0
            with patch('sys.argv', ['release']), patch.object(release, 'check', side_effect=check):
                if failure:
                    with self.assertRaises(type(failure)): release.main()
                else:
                    self.assertEqual(release.main(), 0)
            self.assertTrue(all(not path.exists() for path in seen))


if __name__ == '__main__': unittest.main()
