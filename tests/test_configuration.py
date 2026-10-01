import getpass
import json
import os
import tempfile
import unittest
import warnings
from argparse import Namespace
from contextlib import ExitStack, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from pro_tour.cli import parser, record
from pro_tour.common import TourError
from pro_tour.configuration import configured_model, private_write, setup
from pro_tour.repository import credential_file


class ConfigurationTests(unittest.TestCase):
    def context(self, root, answers, secrets):
        stack = ExitStack()
        stack.enter_context(patch('pathlib.Path.home', return_value=root))
        stack.enter_context(patch.dict(os.environ, {}, clear=True))
        stack.enter_context(patch('pro_tour.configuration.interactive_terminal', return_value=True))
        stack.enter_context(patch('builtins.input', side_effect=answers))
        stack.enter_context(patch('pro_tour.configuration.getpass.getpass', side_effect=secrets))
        stack.enter_context(patch('pro_tour.health.check_setup', return_value={'status': 'ready', 'checks': []}))
        return stack

    def test_setup_saves_hidden_keys_and_model_privately_without_losing_unrelated_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            credentials = root / '.env.local'
            credentials.write_text('# keep this\nCURSOR_API_KEY=unrelated-secret\nexport TYPESAFE_API_KEY=previous-synthetic-key\n')
            output = StringIO()
            with self.context(root, ['gpt-6-sol', 'yes'], ['synthetic-typesafe', 'synthetic-media']), redirect_stdout(output):
                self.assertEqual(setup(Namespace(secrets_file=credentials)), 0)
                self.assertEqual(configured_model(), 'gpt-6-sol')
            self.assertEqual(credential_file(credentials), {'TYPESAFE_API_KEY': 'synthetic-typesafe', 'GH_MEDIA_TOKEN': 'synthetic-media'})
            self.assertIn('# keep this\nCURSOR_API_KEY=unrelated-secret\n', credentials.read_text())
            for path in (credentials, root / '.config/pro-tour/config.json'):
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            for value in ('synthetic-typesafe', 'synthetic-media', 'unrelated-secret', 'previous-synthetic-key'):
                self.assertNotIn(value, output.getvalue())

    def test_enter_preserves_existing_keys_and_default_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            credentials = root / '.env.local'
            credentials.write_text('TYPESAFE_API_KEY=retained-typesafe\nGH_MEDIA_TOKEN=retained-media\n')
            with self.context(root, ['', ''], ['', '']), redirect_stdout(StringIO()):
                setup(Namespace(secrets_file=credentials))
                self.assertEqual(configured_model(), 'gpt-6-luna')
            self.assertEqual(credential_file(credentials), {'TYPESAFE_API_KEY': 'retained-typesafe', 'GH_MEDIA_TOKEN': 'retained-media'})

    def test_environment_credentials_are_used_without_being_copied_to_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            credentials = root / '.env.local'
            with self.context(root, ['', 'yes'], []) as stack, redirect_stdout(StringIO()) as output:
                stack.enter_context(patch.dict(os.environ, TYPESAFE_API_KEY='environment-typesafe', GH_MEDIA_TOKEN='environment-media'))
                setup(Namespace(secrets_file=credentials))
            self.assertFalse(credentials.exists())
            self.assertNotIn('environment-typesafe', output.getvalue())
            self.assertNotIn('environment-media', output.getvalue())

    def test_interruption_or_eof_before_save_leaves_original_configuration_untouched(self):
        for interruption in (EOFError(), KeyboardInterrupt()):
            with self.subTest(interruption=type(interruption).__name__), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                credentials = root / '.env.local'
                credentials.write_text('TYPESAFE_API_KEY=original\n')
                with self.context(root, ['', interruption], ['replacement']), redirect_stdout(StringIO()):
                    with self.assertRaises((TourError, KeyboardInterrupt)):
                        setup(Namespace(secrets_file=credentials))
                self.assertEqual(credentials.read_text(), 'TYPESAFE_API_KEY=original\n')
                self.assertFalse((root / '.config').exists())

    def test_noninteractive_or_unhidden_input_is_rejected_without_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            args = Namespace(secrets_file=root / '.env.local')
            with self.context(root, [''], []), redirect_stdout(StringIO()):
                with patch('pro_tour.configuration.interactive_terminal', return_value=False):
                    with self.assertRaisesRegex(TourError, 'interactive terminal'):
                        setup(args)
                def no_echo(prompt):
                    warnings.warn('Cannot hide input', getpass.GetPassWarning)
                with patch('pro_tour.configuration.getpass.getpass', side_effect=no_echo):
                    with self.assertRaisesRegex(TourError, 'Cannot hide credential input'):
                        setup(args)
            self.assertFalse(args.secrets_file.exists())

    def test_invalid_answers_retry_and_missing_prerequisites_keep_saved_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.context(root, ['bad model', '', 'maybe', 'no'], ['', 'injected\nKEY=value', 'valid-key']) as stack, redirect_stdout(StringIO()):
                stack.enter_context(patch('pro_tour.health.check_setup', return_value={'status': 'failure', 'checks': [{'check': 'ffmpeg', 'status': 'failure', 'detail': 'Install ffmpeg'}]}))
                self.assertEqual(setup(Namespace(secrets_file=root / '.env.local')), 1)
            self.assertEqual(credential_file(root / '.env.local'), {'TYPESAFE_API_KEY': 'valid-key'})

    def test_symlinks_are_rejected_and_atomic_failure_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = root / 'original'
            original.write_text('private-original')
            link = root / 'link'
            link.symlink_to(original)
            with self.assertRaisesRegex(TourError, 'symlinks'):
                private_write(link, 'replacement')
            with patch('pro_tour.configuration.os.replace', side_effect=OSError('disk failure')):
                with self.assertRaises(OSError):
                    private_write(original, 'replacement')
            self.assertEqual(original.read_text(), 'private-original')
            self.assertEqual(set(root.iterdir()), {original, link})

    def test_corrupt_settings_can_be_repaired_and_explicit_model_overrides_preference(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = root / '.config/pro-tour/config.json'
            settings.parent.mkdir(parents=True)
            settings.write_text('invalid-json')
            with self.context(root, ['gpt-6-sol', 'no'], ['valid-key']), redirect_stdout(StringIO()):
                with self.assertRaisesRegex(TourError, 'pro-tour setup'):
                    configured_model()
                setup(Namespace(secrets_file=root / '.env.local'))
                self.assertEqual(configured_model(), 'gpt-6-sol')
                args = parser().parse_args(['record', '--url', 'https://invalid.test', '--goal', 'Test'])
                with self.assertRaises(TourError): record(args, {})
                self.assertEqual(args.model, 'gpt-6-sol')
                args = parser().parse_args(['record', '--url', 'https://invalid.test', '--goal', 'Test', '--model', 'gpt-6-luna'])
                with patch('pro_tour.cli.configured_model', side_effect=AssertionError('Must not load preference')):
                    with self.assertRaises(TourError): record(args, {})
                self.assertEqual(args.model, 'gpt-6-luna')


if __name__ == '__main__':
    unittest.main()
