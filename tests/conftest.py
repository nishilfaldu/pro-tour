import json
from pathlib import Path

import pytest


@pytest.fixture
def example():
    return json.loads((Path(__file__).parents[1] / "examples/task-board.pro-tour.json").read_text())
