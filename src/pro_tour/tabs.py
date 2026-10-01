"""Select an app tab in the connected Chrome without replacing its document."""
from urllib.parse import urlsplit

from .common import TourError
from .repository import local_url


def origin(url):
    try:
        parsed = urlsplit(url)
        if parsed.username or parsed.password or parsed.scheme not in {'http', 'https'}:
            return None
        return parsed.scheme, parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80)
    except ValueError:
        return None


def select_app_tab(url, tab_id=None, *, expected_window=None):
    from browser_harness.helpers import cdp
    local_url(url)
    try:
        targets = cdp('Target.getTargets')['targetInfos']
        matches = [target for target in targets if target['type'] == 'page' and origin(target['url']) == origin(url)]
        if tab_id:
            matches = [target for target in matches if target['targetId'] == tab_id]
            if not matches:
                raise TourError('Selected app tab was closed or no longer matches --url; rerun the recording')
        else:
            exact = [target for target in matches if urlsplit(target['url']).path.rstrip('/') == urlsplit(url).path.rstrip('/')]
            matches = exact or matches
        if len(matches) > 1:
            ids = ', '.join(target['targetId'] for target in matches)
            raise TourError('Multiple app tabs match --url. Select one with --tab-id. Matching tab IDs: ' + ids)
        created = not matches
        if created:
            # Chrome opens a tab in its existing window, never a new window or browser.
            target_id = cdp('Target.createTarget', url=url, newWindow=False, background=False)['targetId']
        else:
            target_id = matches[0]['targetId']
        window_id = cdp('Browser.getWindowForTarget', targetId=target_id)['windowId']
        if expected_window is not None and window_id != expected_window:
            raise TourError('Selected app tab moved to another window; rerun the recording')
        return {'id': target_id, 'window_id': window_id, 'created': created}
    except TourError:
        raise
    except (RuntimeError, KeyError, ValueError) as exc:
        raise TourError('Could not select the app tab in the connected Chrome; check the browser connection') from exc
