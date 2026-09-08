from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ChangeItem(BaseModel):
    id: str
    action: Literal["create", "modify", "delete"]
    path: str
    path_status: Literal["observed", "proposed", "uncertain"]
    symbols: list[str] = Field(default_factory=list)
    purpose: str
    affected_components: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    risk: str | None = None
    evidence_refs: list[str] = Field(default_factory=list)


class ImplementationTask(BaseModel):
    id: str
    title: str
    depends_on: list[str] = Field(default_factory=list)
    change_ids: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(min_length=1)
    test_commands: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    rollback: list[str] = Field(default_factory=list)
    status: Literal["pending"] = "pending"


class ImplementationManifest(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    artifact: Literal["implementation_manifest"] = "implementation_manifest"
    workflow: Literal["development_start"] = "development_start"
    problem: dict = Field(default_factory=dict)
    repository: dict = Field(default_factory=dict)
    decisions: list[dict] = Field(default_factory=list)
    change_map: list[ChangeItem] = Field(default_factory=list)
    interfaces: list[dict] = Field(default_factory=list)
    data_changes: list[dict] = Field(default_factory=list)
    tasks: list[ImplementationTask] = Field(default_factory=list)
    validation: list[dict] = Field(default_factory=list)
    rollback: list[str] = Field(default_factory=list)
    unresolved_decisions: list[dict] = Field(default_factory=list)
    evidence: list[dict] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_references_and_dag(self):
        change_ids = {item.id for item in self.change_map}
        evidence_ids = {str(item.get("id")) for item in self.evidence if item.get("id")}
        task_ids = {item.id for item in self.tasks}
        if len(task_ids) != len(self.tasks):
            raise ValueError("task ids must be unique")
        if len(change_ids) != len(self.change_map):
            raise ValueError("change ids must be unique")
        for change in self.change_map:
            missing = set(change.evidence_refs) - evidence_ids
            if missing:
                raise ValueError(f"unknown evidence refs: {sorted(missing)}")
        graph: dict[str, list[str]] = {}
        for task in self.tasks:
            if set(task.depends_on) - task_ids:
                raise ValueError(f"unknown task dependency for {task.id}")
            if set(task.change_ids) - change_ids:
                raise ValueError(f"unknown change ref for {task.id}")
            if set(task.evidence_refs) - evidence_ids:
                raise ValueError(f"unknown evidence ref for {task.id}")
            if task.risks and not task.rollback:
                raise ValueError(f"risk task {task.id} requires rollback guidance")
            graph[task.id] = task.depends_on
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(task_id: str) -> None:
            if task_id in visiting:
                raise ValueError("task dependencies contain a cycle")
            if task_id in visited:
                return
            visiting.add(task_id)
            for dependency in graph.get(task_id, []):
                visit(dependency)
            visiting.remove(task_id)
            visited.add(task_id)

        for task_id in graph:
            visit(task_id)
        return self


class ProjectArtifactRead(BaseModel):
    id: int
    project_id: int
    plan_version: int
    artifact_kind: str
    schema_version: str
    format: str
    content_text: str
    file_path: str | None
    created_at: object

    model_config = {"from_attributes": True}
