import asyncio


class _DevelopmentLLM:
    def bind_tools(self, tools):
        return self

    def invoke(self, prompt):
        class Result:
            tool_calls = []
        result = Result()
        text = str(prompt)
        if "problem_definition:{goal" in text:
            result.content = '{"ready":false,"message":"确认问题","problem_definition":{"goal":"Add feature","users":["developers"],"success_criteria":["works"]},"questions":[]}'
        elif "You are the research agent" in text:
            result.content = ""
            result.tool_calls = [{"name": "github_repository_search", "args": {"query": "feature", "count": 6}}]
        elif "development kickoff planner" in text:
            result.content = '{"ready":true,"summary":"Implement feature","steps":[{"seq":1,"id":"task_01","title":"Implement","description":"Add code","status":"pending","acceptance_criteria":["Works"],"test_commands":["pytest"]}],"search_tasks":[],"verification_tasks":[{"title":"Run tests"}],"risks":[],"change_map":[{"id":"change_01","action":"create","path":"feature.py","purpose":"Add feature","acceptance_criteria":["Works"],"evidence_refs":[]}],"interfaces":[],"data_changes":[],"rollback":[],"unresolved_decisions":[]}'
        elif "Use the available tools" in text:
            result.content = ""
            result.tool_calls = [{"name": "search_web", "args": {"query": "feature"}}]
        elif "Synthesize a concise" in text:
            result.content = ""
        else:
            result.content = ""
        return result


def _mock_development_tools(monkeypatch, registry):
    class CandidateTool:
        name = "github_repository_search"

        def invoke(self, args):
            return {"candidates": [{
                "candidate_key": "demo/repo",
                "source_type": "github",
                "title": "Demo",
                "url": "https://github.com/demo/repo",
                "description": "demo",
                "license": "MIT",
                "version_or_branch": "main",
                "activity": "active",
                "evidence_refs": ["https://github.com/demo/repo"],
            }]}

    class SearchTool:
        name = "search_web"

        def invoke(self, args):
            return [{"title": "Source", "url": "https://example.com", "snippet": "Evidence"}]

    async def tools(_session, **_kwargs):
        return {"tools": [CandidateTool(), SearchTool()], "errors": []}

    monkeypatch.setattr(registry, "get_research_tools", tools)


def test_development_start_can_skip_repository_and_exports_agent_artifacts(app_home, monkeypatch):
    import app.db.session as db
    from app.db.models import Conversation, ProjectArtifact, ToolCall
    from app.engine import nodes
    from app.engine.runner import resume_research, start_research
    from app.tools import registry

    app_home.mkdir(parents=True, exist_ok=True)
    engine = db.init_db(f"sqlite:///{(app_home / 'development-workflow.db').as_posix()}")

    _mock_development_tools(monkeypatch, registry)

    with db.SessionLocal() as session:
        conversation = Conversation(title="demo")
        session.add(conversation)
        session.commit()
        run = asyncio.run(start_research(
            session, conversation_id=conversation.id, profile_id=1, user_message="Add feature",
            workflow_mode="development_start", llm_factory=lambda: _DevelopmentLLM(),
        ))
        assert run["interrupt_payload"]["kind"] == "problem_framing"
        run = asyncio.run(resume_research(session, thread_id=run["thread_id"], profile_id=1, decision={"kind":"problem_confirm","confirmed":True}, llm_factory=lambda: _DevelopmentLLM()))
        assert run["interrupt_payload"]["kind"] == "repository_selection"
        run = asyncio.run(resume_research(session, thread_id=run["thread_id"], profile_id=1, decision={"kind":"repository_selection","skip":True}, llm_factory=lambda: _DevelopmentLLM()))
        assert run["interrupt_payload"]["kind"] == "candidate_selection"
        run = asyncio.run(resume_research(session, thread_id=run["thread_id"], profile_id=1, decision={"kind":"candidate_selection","selections":[{"candidate_key":"demo/repo","decision":"adopt"}]}, llm_factory=lambda: _DevelopmentLLM()))
        assert run["interrupt_payload"]["kind"] == "plan_ready"
        run = asyncio.run(resume_research(session, thread_id=run["thread_id"], profile_id=1, decision={"kind":"execute_plan","plan_version":run["state"]["plan_version"],"output_modes":["human","ai"]}, llm_factory=lambda: _DevelopmentLLM()))
        assert run["interrupted"] is False
        artifacts = session.query(ProjectArtifact).order_by(ProjectArtifact.id).all()
        assert [item.format for item in artifacts] == ["md", "json"]
        assert artifacts[0].content_text.startswith("# STARTSPEC")
        assert '"artifact":"implementation_manifest"' in artifacts[1].content_text
        tool_calls = session.query(ToolCall).order_by(ToolCall.id).all()
        assert [item.tool_name for item in tool_calls] == ["github_repository_search", "search_web"]
        assert all(item.agent_role == "researcher" and item.task_id is not None for item in tool_calls)
    engine.dispose()


def test_development_start_scans_and_confirms_existing_repository(app_home, tmp_path, monkeypatch):
    import app.db.session as db
    from app.db.models import Conversation, RepositorySnapshot, ResearchProject
    from app.engine.runner import resume_research, start_research
    from app.tools import registry

    _mock_development_tools(monkeypatch, registry)

    repository = tmp_path / "demo-repository"
    repository.mkdir()
    (repository / "pyproject.toml").write_text('[project]\nname="demo"\ndependencies=["fastapi"]', encoding="utf-8")
    (repository / "app.py").write_text("def add_feature(): pass", encoding="utf-8")
    app_home.mkdir(parents=True, exist_ok=True)
    engine = db.init_db(f"sqlite:///{(app_home / 'repository-workflow.db').as_posix()}")
    with db.SessionLocal() as session:
        conversation = Conversation(title="demo")
        session.add(conversation)
        session.commit()
        run = asyncio.run(start_research(
            session, conversation_id=conversation.id, profile_id=1, user_message="Add feature",
            workflow_mode="development_start", llm_factory=lambda: _DevelopmentLLM(),
        ))
        run = asyncio.run(resume_research(session, thread_id=run["thread_id"], profile_id=1, decision={"kind":"problem_confirm","confirmed":True}, llm_factory=lambda: _DevelopmentLLM()))
        run = asyncio.run(resume_research(session, thread_id=run["thread_id"], profile_id=1, decision={"kind":"repository_selection","repository_path":str(repository)}, llm_factory=lambda: _DevelopmentLLM()))
        assert run["interrupt_payload"]["kind"] == "repository_review"
        assert "files" not in run["interrupt_payload"]["repository_snapshot"]
        snapshot = session.query(RepositorySnapshot).one()
        assert snapshot.snapshot_json["repository_name"] == "demo-repository"
        project = session.query(ResearchProject).one()
        assert project.repository_snapshot_id == snapshot.id
        run = asyncio.run(resume_research(session, thread_id=run["thread_id"], profile_id=1, decision={"kind":"repository_review","confirmed":True}, llm_factory=lambda: _DevelopmentLLM()))
        assert run["interrupt_payload"]["kind"] == "candidate_selection"
    engine.dispose()
