import importlib
import pytest


@pytest.fixture()
def app_home(tmp_path, monkeypatch):
    """Point SEARCHAGENT_HOME at a temp dir so tests never touch the real home."""
    home = tmp_path / "searchagent_home"
    monkeypatch.setenv("SEARCHAGENT_HOME", str(home))

    # Reload path-dependent modules so cached module-level state is reset.
    import app.core.paths as paths
    importlib.reload(paths)

    return home
