"""Tests for the SenseEngine package boundaries."""

import importlib
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import BaseModel, ValidationError

import sense_engine
import sense_engine.core as core
import sense_engine.core.models as core_models
from sense_engine.core.models import ContextSnapshot as PublicContextSnapshot
from sense_engine.core.models import Intervention as PublicIntervention
from sense_engine.core.models import Outcome as PublicOutcome
from sense_engine.core.models import SignalEvent as PublicSignalEvent
from sense_engine.core.models import StateEstimate as PublicStateEstimate
from sense_engine.core.models import StateMemory as PublicStateMemory
from sense_engine.core.models.context_snapshot import (
    ActivityContext,
    CalendarContext,
    ContextSnapshot,
    EnvironmentContext,
    PeopleContext,
    PlaceContext,
)
from sense_engine.core.models.intervention import (
    ActionSpec,
    Intervention,
    Reversibility,
    RiskAssessment,
    RiskLevel,
)
from sense_engine.core.models.outcome import BehaviorProxy, Outcome, SelfReport
from sense_engine.core.models.signal_event import (
    ConsentScope,
    ExpiryAction,
    FeaturePayload,
    RetentionPolicy,
    RetentionTier,
    SignalEvent,
    SignalQuality,
    SignalSource,
)
from sense_engine.core.models.state_estimate import StateEstimate
from sense_engine.core.models.state_memory import (
    CorrectionMemory,
    DecayPolicy,
    EpisodeMemory,
    PreferenceMemory,
    ProvenanceRecord,
    RoutineMemory,
    StateMemory,
)

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
NAIVE_NOW = NOW.replace(tzinfo=None)

APPROVED_PUBLIC_NAMES = (
    "ContextSnapshot",
    "Intervention",
    "Outcome",
    "SignalEvent",
    "StateEstimate",
    "StateMemory",
)


def make_signal_event() -> SignalEvent:
    """Build a valid signal event for contract tests."""
    return SignalEvent(
        time=NOW,
        source=SignalSource(
            adapter="wearable-adapter",
            device_id="device-001",
            modality="accelerometer",
        ),
        feature=FeaturePayload(name="activity_level", value=0.72, unit="ratio"),
        quality=SignalQuality(score=0.92, completeness=0.98),
        consent_scope=ConsentScope(
            purposes=("state-computing",),
            granted_at=NOW,
        ),
        retention=RetentionPolicy(
            tier=RetentionTier.SESSION,
            on_expiry=ExpiryAction.DELETE,
        ),
    )


def make_context_snapshot() -> ContextSnapshot:
    """Build an explicit context snapshot with absent optional evidence."""
    return ContextSnapshot(
        activity=None,
        place=None,
        calendar=(),
        people=None,
        environment=None,
    )


def make_populated_context_snapshot() -> ContextSnapshot:
    """Build a representative context snapshot with every evidence type."""
    return ContextSnapshot(
        activity=ActivityContext(
            name="walking",
            confidence=0.88,
            source="wearable-adapter",
        ),
        place=PlaceContext(
            category="office",
            confidence=0.81,
            source="wifi-positioning",
        ),
        calendar=(
            CalendarContext(
                event_type="focus-session",
                starts_at=NOW,
                ends_at=NOW + timedelta(hours=1),
                busy=True,
            ),
        ),
        people=PeopleContext(
            count=2,
            relationship_categories=("colleague",),
            confidence=0.76,
        ),
        environment=EnvironmentContext(
            captured_at=NOW,
            features={
                "noise_db": 42.5,
                "lighting": {"lux": 450},
                "window_open": False,
            },
        ),
    )


def make_state_estimate() -> StateEstimate:
    """Build a valid v0.3 state estimate with explanatory evidence."""
    return StateEstimate(
        dimensions={"cognitive_load": 0.62},
        distribution={"focused": 0.55, "fatigued": 0.20},
        confidence=0.71,
        missingness={"calendar": 0.40},
        model_version="state-rules-v0.2",
        explanation=("Synthetic evidence for contract testing.",),
    )


def make_state_memory() -> StateMemory:
    """Build a valid memory aggregate with every Task 4 record type."""
    return StateMemory(
        episode=(
            EpisodeMemory(
                id="episode-001",
                occurred_at=NOW,
                state=make_state_estimate(),
                context=make_populated_context_snapshot(),
                signal_event_ids=("signal-001",),
            ),
        ),
        preference=(
            PreferenceMemory(
                id="preference-001",
                state_scope="focused",
                target="notification-mode",
                value="silent",
                confidence=0.8,
                updated_at=NOW,
            ),
        ),
        routine=(
            RoutineMemory(
                id="routine-001",
                name="weekday-focus",
                pattern={"weekday": True, "hour": 9},
                confidence=0.7,
                observed_count=3,
                updated_at=NOW,
            ),
        ),
        correction=(
            CorrectionMemory(
                id="correction-001",
                target_id="episode-001",
                corrected_at=NOW,
                original_value="fatigued",
                corrected_value="focused",
                reason=None,
            ),
        ),
        decay=DecayPolicy(
            policy_name="recency-v1",
            weight=0.9,
            evaluated_at=NOW,
        ),
        provenance=(
            ProvenanceRecord(
                source_type="signal-event",
                source_id="signal-001",
                recorded_at=NOW,
                actor="sense-engine",
            ),
        ),
    )


def make_intervention() -> Intervention:
    """Build a declarative intervention contract without executing it."""
    return Intervention(
        objective="reduce-interruption",
        action=ActionSpec(
            type="notification-adjustment",
            channel="system-notification",
            parameters={"mode": "silent"},
        ),
        risk=RiskAssessment(
            level=RiskLevel.LOW,
            rationale="user-can-immediately-restore",
        ),
        reversibility=Reversibility(
            is_reversible=True,
            method="restore-previous-mode",
            recovery_seconds=0.0,
        ),
        expected_effect={"cognitive_load": -0.15},
    )


def make_outcome() -> Outcome:
    """Build an outcome with distinct self-report and authorized proxy evidence."""
    return Outcome(
        accepted=True,
        adjusted=False,
        rejected=False,
        self_report=SelfReport(
            reported_at=NOW,
            dimensions={"cognitive_load": 0.4},
            note=None,
        ),
        behavior_proxy=(
            BehaviorProxy(
                name="notification-dismissals",
                observed_at=NOW,
                value={"count": 0},
                authorization_reference="consent-outcome-proxy-001",
            ),
        ),
    )


def iter_declared_schema_fields(
    node: object,
    path: str = "root",
) -> Iterator[tuple[str, object]]:
    """Yield every field declared by a root or nested JSON Schema object."""
    if isinstance(node, dict):
        properties = node.get("properties")
        if isinstance(properties, dict):
            for field_name, field_schema in properties.items():
                yield f"{path}.{field_name}", field_schema

        for key, value in node.items():
            yield from iter_declared_schema_fields(value, f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from iter_declared_schema_fields(value, f"{path}[{index}]")


@pytest.mark.parametrize(
    ("public_type", "implementation_type"),
    [
        (PublicContextSnapshot, ContextSnapshot),
        (PublicIntervention, Intervention),
        (PublicOutcome, Outcome),
        (PublicSignalEvent, SignalEvent),
        (PublicStateEstimate, StateEstimate),
        (PublicStateMemory, StateMemory),
    ],
    ids=APPROVED_PUBLIC_NAMES,
)
def test_public_contract_exports_are_canonical_model_classes(
    public_type: type[BaseModel],
    implementation_type: type[BaseModel],
) -> None:
    """The supported import path resolves to each canonical contract class."""
    assert public_type is implementation_type
    assert getattr(core_models, public_type.__name__) is public_type
    assert getattr(core, public_type.__name__) is public_type


def test_public_contract_all_declarations_are_exact() -> None:
    """Only the six top-level contracts are advertised by public core modules."""
    assert tuple(core_models.__all__) == APPROVED_PUBLIC_NAMES
    assert tuple(core.__all__) == APPROVED_PUBLIC_NAMES


def test_root_package_does_not_reexport_public_contracts() -> None:
    """The root package stays outside the approved public contract import paths."""
    for public_name in APPROVED_PUBLIC_NAMES:
        assert not hasattr(sense_engine, public_name)

    root_all = getattr(sense_engine, "__all__", ())
    assert set(APPROVED_PUBLIC_NAMES).isdisjoint(root_all)


@pytest.mark.parametrize(
    "model_type",
    [
        PublicContextSnapshot,
        PublicIntervention,
        PublicOutcome,
        PublicSignalEvent,
        PublicStateEstimate,
        PublicStateMemory,
    ],
    ids=APPROVED_PUBLIC_NAMES,
)
def test_public_contract_schema_fields_have_chinese_descriptions(
    model_type: type[BaseModel],
) -> None:
    """Every root and recursively declared nested field has Chinese documentation."""
    declared_fields = tuple(iter_declared_schema_fields(model_type.model_json_schema()))

    assert declared_fields
    for field_path, field_schema in declared_fields:
        assert isinstance(field_schema, dict), field_path
        description = field_schema.get("description")
        assert isinstance(description, str), field_path
        assert description.strip(), field_path
        assert any("\u4e00" <= character <= "\u9fff" for character in description), field_path


@pytest.mark.parametrize(
    ("model_type", "model"),
    [
        (PublicContextSnapshot, make_populated_context_snapshot()),
        (PublicIntervention, make_intervention()),
        (PublicOutcome, make_outcome()),
        (PublicSignalEvent, make_signal_event()),
        (PublicStateEstimate, make_state_estimate()),
        (PublicStateMemory, make_state_memory()),
    ],
    ids=APPROVED_PUBLIC_NAMES,
)
def test_public_contract_json_round_trip(
    model_type: type[BaseModel],
    model: BaseModel,
) -> None:
    """Every supported top-level contract round-trips through JSON unchanged."""
    encoded = model.model_dump_json()

    assert model_type.model_validate_json(encoded) == model


@pytest.mark.parametrize(
    "module_name",
    [
        "sense_engine.core",
        "sense_engine.adapters",
        "sense_engine.memory",
        "sense_engine.policy",
        "sense_engine.api",
    ],
)
def test_boundary_module_is_importable(module_name: str) -> None:
    """Each documented package boundary is importable."""
    importlib.import_module(module_name)


def test_signal_event_has_exact_v02_fields() -> None:
    """SignalEvent exposes only the approved v0.2 contract fields."""
    assert set(SignalEvent.model_fields) == {
        "time",
        "source",
        "feature",
        "quality",
        "consent_scope",
        "retention",
    }


def test_nested_models_have_exact_v02_fields() -> None:
    """Nested contracts expose only their approved v0.2 fields."""
    assert set(SignalSource.model_fields) == {"adapter", "device_id", "modality"}
    assert set(FeaturePayload.model_fields) == {"name", "value", "unit"}
    assert set(SignalQuality.model_fields) == {"score", "completeness", "reason"}
    assert set(ConsentScope.model_fields) == {"purposes", "granted_at", "expires_at"}
    assert set(RetentionPolicy.model_fields) == {"tier", "expires_at", "on_expiry"}


def test_context_snapshot_has_exact_v02_fields() -> None:
    """ContextSnapshot exposes only the Appendix A.1 contract fields."""
    assert set(ContextSnapshot.model_fields) == {
        "activity",
        "place",
        "calendar",
        "people",
        "environment",
    }


def test_context_nested_models_have_exact_v02_fields() -> None:
    """Context evidence contracts expose only the Appendix A.1 fields."""
    assert set(ActivityContext.model_fields) == {"name", "confidence", "source"}
    assert set(PlaceContext.model_fields) == {"category", "confidence", "source"}
    assert set(CalendarContext.model_fields) == {
        "event_type",
        "starts_at",
        "ends_at",
        "busy",
    }
    assert set(PeopleContext.model_fields) == {
        "count",
        "relationship_categories",
        "confidence",
    }
    assert set(EnvironmentContext.model_fields) == {"captured_at", "features"}


def test_state_estimate_has_exact_v03_fields() -> None:
    """StateEstimate v0.3 adds an explainability field to Appendix A.1."""
    assert set(StateEstimate.model_fields) == {
        "dimensions",
        "distribution",
        "confidence",
        "missingness",
        "model_version",
        "explanation",
    }


def test_state_estimate_requires_explanation() -> None:
    """Every v0.3 estimate must include explicit explanatory evidence."""
    payload = make_state_estimate().model_dump()
    payload.pop("explanation")

    with pytest.raises(ValidationError) as error:
        StateEstimate.model_validate(payload)

    assert any(item["loc"] == ("explanation",) for item in error.value.errors())


@pytest.mark.parametrize(
    ("explanation", "expected_error_type"),
    [
        ((), "too_short"),
        (("   ",), "string_too_short"),
    ],
)
def test_state_estimate_rejects_empty_explanations(
    explanation: tuple[str, ...],
    expected_error_type: str,
) -> None:
    """Explanation tuples and their individual messages cannot be empty."""
    payload = make_state_estimate().model_dump()
    payload["explanation"] = explanation

    with pytest.raises(ValidationError) as error:
        StateEstimate.model_validate(payload)

    assert any(item["type"] == expected_error_type for item in error.value.errors())


def test_state_estimate_explanation_has_chinese_schema_description() -> None:
    """Explainability semantics remain visible in generated API schemas."""
    description = StateEstimate.model_fields["explanation"].description

    assert description is not None
    assert "解释" in description
    assert "证据" in description


def test_explicit_context_snapshot_is_valid() -> None:
    """Required nullable evidence can be explicitly absent."""
    snapshot = make_context_snapshot()

    assert snapshot.activity is None
    assert snapshot.place is None
    assert snapshot.calendar == ()
    assert snapshot.people is None
    assert snapshot.environment is None


def test_state_estimate_preserves_non_normalized_distribution() -> None:
    """Candidate probabilities preserve uncertainty without forced normalization."""
    estimate = make_state_estimate()

    assert estimate.distribution == {"focused": 0.55, "fatigued": 0.20}


def test_device_id_schema_description_documents_privacy_guidance() -> None:
    """Device provenance records caller claims without verifying de-identification."""
    description = SignalSource.model_fields["device_id"].description

    assert description is not None
    assert "调用方声明" in description
    assert "匿名或假名化" in description
    assert "本模型仅记录" in description
    assert "不验证" in description
    assert "原始硬件标识" in description


@pytest.mark.parametrize(
    ("model_type", "field_name", "required_phrases"),
    [
        (
            FeaturePayload,
            "value",
            ("调用方声明", "有限 JSON", "不进行语义检查", "不识别或拒绝原始媒体"),
        ),
        (
            ConsentScope,
            "purposes",
            ("调用方声明", "不验证同意有效性", "适用范围", "用户身份"),
        ),
        (
            RetentionPolicy,
            "on_expiry",
            ("调用方声明", "不执行删除", "匿名化", "保留策略"),
        ),
        (
            SignalEvent,
            "feature",
            ("调用方声明", "不检查或拒绝原始媒体"),
        ),
        (
            SignalEvent,
            "consent_scope",
            ("调用方声明", "不验证同意"),
        ),
        (
            SignalEvent,
            "retention",
            ("调用方声明", "不执行保留", "删除或匿名化"),
        ),
    ],
    ids=[
        "feature-value",
        "consent-purposes",
        "retention-expiry-action",
        "event-feature",
        "event-consent",
        "event-retention",
    ],
)
def test_signal_metadata_schema_descriptions_disclaim_enforcement(
    model_type: type[BaseModel],
    field_name: str,
    required_phrases: tuple[str, ...],
) -> None:
    """Signal metadata schemas distinguish caller declarations from enforcement."""
    description = model_type.model_fields[field_name].description

    assert description is not None
    for phrase in required_phrases:
        assert phrase in description


@pytest.mark.parametrize(
    "invalid_value",
    [float("nan"), float("inf"), float("-inf")],
    ids=["nan", "positive-infinity", "negative-infinity"],
)
def test_feature_payload_rejects_direct_nonfinite_json(
    invalid_value: float,
) -> None:
    """A feature payload cannot silently serialize a non-finite scalar to null."""
    with pytest.raises(ValidationError):
        FeaturePayload(name="temperature", value=invalid_value, unit="celsius")


@pytest.mark.parametrize(
    "invalid_value",
    [float("nan"), float("inf"), float("-inf")],
    ids=["nan", "positive-infinity", "negative-infinity"],
)
def test_environment_context_rejects_deeply_nested_nonfinite_json(
    invalid_value: float,
) -> None:
    """Finite JSON validation reaches values nested through objects and arrays."""
    with pytest.raises(ValidationError):
        EnvironmentContext(
            captured_at=NOW,
            features={"zones": [{"sensors": [{"reading": invalid_value}]}]},
        )


@pytest.mark.parametrize(
    "invalid_value",
    [float("nan"), float("inf"), float("-inf")],
    ids=["nan", "positive-infinity", "negative-infinity"],
)
def test_memory_json_value_rejects_deeply_nested_nonfinite_json(
    invalid_value: float,
) -> None:
    """Memory JSON scalars use the same recursive finite-number constraint."""
    payload = make_state_memory().preference[0].model_dump()
    payload["value"] = {"history": [{"scores": [0.4, invalid_value]}]}

    with pytest.raises(ValidationError):
        PreferenceMemory.model_validate(payload)


@pytest.mark.parametrize(
    "invalid_value",
    [float("nan"), float("inf"), float("-inf")],
    ids=["nan", "positive-infinity", "negative-infinity"],
)
def test_outcome_json_value_rejects_deeply_nested_nonfinite_json(
    invalid_value: float,
) -> None:
    """Outcome proxy JSON rejects non-finite numbers at arbitrary depth."""
    payload = make_outcome().behavior_proxy[0].model_dump()
    payload["value"] = {"samples": [{"reading": invalid_value}]}

    with pytest.raises(ValidationError):
        BehaviorProxy.model_validate(payload)


@pytest.mark.parametrize(
    "model",
    [
        FeaturePayload(
            name="environment-summary",
            value={"zones": [{"noise_db": 42.5, "occupied": True}, None]},
            unit=None,
        ),
        EnvironmentContext(
            captured_at=NOW,
            features={"zones": [{"noise_db": 42.5, "samples": [0, 1.25]}]},
        ),
        BehaviorProxy(
            name="interaction-summary",
            observed_at=NOW,
            value={"events": [{"duration": 1.25, "accepted": True}]},
            authorization_reference="consent-outcome-proxy-001",
        ),
    ],
    ids=["scalar-field", "json-object", "outcome-field"],
)
def test_nested_finite_json_round_trips(model: BaseModel) -> None:
    """Valid recursive JSON keeps every finite value through serialization."""
    encoded = model.model_dump_json()

    assert type(model).model_validate_json(encoded) == model


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    [
        (
            SignalEvent,
            {**make_signal_event().model_dump(), "time": NAIVE_NOW},
            "time",
        ),
        (
            ConsentScope,
            {"purposes": ("state-computing",), "granted_at": NAIVE_NOW},
            "granted_at",
        ),
        (
            ConsentScope,
            {
                "purposes": ("state-computing",),
                "granted_at": NOW,
                "expires_at": NAIVE_NOW,
            },
            "expires_at",
        ),
        (
            RetentionPolicy,
            {
                "tier": RetentionTier.SESSION,
                "expires_at": NAIVE_NOW,
                "on_expiry": ExpiryAction.DELETE,
            },
            "expires_at",
        ),
    ],
    ids=[
        "event-time",
        "consent-granted-at",
        "consent-expires-at",
        "retention-expires-at",
    ],
)
def test_aware_datetime_fields_reject_naive_values(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
) -> None:
    """Every datetime in the signal contract must carry timezone information."""
    with pytest.raises(ValidationError) as exc_info:
        model_type.model_validate(payload)

    assert any(
        error["type"] == "timezone_aware" and error["loc"] == (field_name,)
        for error in exc_info.value.errors()
    )


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    [
        (
            CalendarContext,
            {
                "event_type": "focus-session",
                "starts_at": NAIVE_NOW,
                "ends_at": NOW,
                "busy": True,
            },
            "starts_at",
        ),
        (
            CalendarContext,
            {
                "event_type": "focus-session",
                "starts_at": NOW,
                "ends_at": NAIVE_NOW,
                "busy": True,
            },
            "ends_at",
        ),
        (
            EnvironmentContext,
            {"captured_at": NAIVE_NOW, "features": {"noise_db": 42.0}},
            "captured_at",
        ),
    ],
    ids=["calendar-start", "calendar-end", "environment-captured-at"],
)
def test_context_aware_datetime_fields_reject_naive_values(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
) -> None:
    """Every datetime in context evidence must carry timezone information."""
    with pytest.raises(ValidationError) as exc_info:
        model_type.model_validate(payload)

    assert any(
        error["type"] == "timezone_aware" and error["loc"] == (field_name,)
        for error in exc_info.value.errors()
    )


def test_signal_event_rejects_unknown_top_level_field() -> None:
    """Unknown top-level keys are outside the approved event contract."""
    payload = make_signal_event().model_dump()
    payload["unexpected_field"] = True

    with pytest.raises(ValidationError):
        SignalEvent.model_validate(payload)


def test_signal_event_rejects_unknown_nested_field() -> None:
    """Unknown keys are also forbidden inside nested contract models."""
    payload = make_signal_event().model_dump()
    payload["source"] = {
        **make_signal_event().source.model_dump(),
        "unexpected_field": True,
    }

    with pytest.raises(ValidationError):
        SignalEvent.model_validate(payload)


def test_context_snapshot_rejects_unknown_top_level_field() -> None:
    """Unknown top-level keys are outside the approved context contract."""
    payload = make_context_snapshot().model_dump()
    payload["unexpected_field"] = True

    with pytest.raises(ValidationError):
        ContextSnapshot.model_validate(payload)


@pytest.mark.parametrize(
    ("model_type", "payload"),
    [
        (
            ActivityContext,
            {"name": "walking", "confidence": 0.8, "source": "wearable"},
        ),
        (
            PlaceContext,
            {"category": "office", "confidence": 0.7, "source": "wifi"},
        ),
        (
            CalendarContext,
            {
                "event_type": "focus-session",
                "starts_at": NOW,
                "ends_at": NOW,
                "busy": True,
            },
        ),
        (
            PeopleContext,
            {
                "count": 1,
                "relationship_categories": ("colleague",),
                "confidence": 0.6,
            },
        ),
        (
            EnvironmentContext,
            {"captured_at": NOW, "features": {"noise_db": 42.0}},
        ),
    ],
    ids=["activity", "place", "calendar", "people", "environment"],
)
def test_context_nested_models_reject_unknown_fields(
    model_type: type[BaseModel],
    payload: dict[str, object],
) -> None:
    """Unknown keys are forbidden in every nested context contract."""
    payload["unexpected_field"] = True

    with pytest.raises(ValidationError):
        model_type.model_validate(payload)


def test_people_context_rejects_negative_count() -> None:
    """Observed people counts cannot be negative."""
    with pytest.raises(ValidationError):
        PeopleContext(
            count=-1,
            relationship_categories=("colleague",),
            confidence=0.6,
        )


@pytest.mark.parametrize("field_name", ["score", "completeness"])
@pytest.mark.parametrize("boundary", [0.0, 1.0])
def test_signal_quality_accepts_probability_boundaries(
    field_name: str,
    boundary: float,
) -> None:
    """Both probability fields include zero and one."""
    payload = {"score": 0.5, "completeness": 0.5}
    payload[field_name] = boundary

    quality = SignalQuality.model_validate(payload)

    assert getattr(quality, field_name) == boundary


@pytest.mark.parametrize("field_name", ["score", "completeness"])
@pytest.mark.parametrize(
    "invalid_value",
    [-0.01, 1.01, float("nan"), float("inf")],
    ids=["negative", "above-one", "nan", "positive-infinity"],
)
def test_signal_quality_rejects_invalid_probabilities(
    field_name: str,
    invalid_value: float,
) -> None:
    """Both probability fields reject invalid and non-finite values."""
    payload = {"score": 0.5, "completeness": 0.5}
    payload[field_name] = invalid_value

    with pytest.raises(ValidationError):
        SignalQuality.model_validate(payload)


def test_signal_quality_rejects_string_score() -> None:
    """Strict probability validation does not coerce strings."""
    with pytest.raises(ValidationError):
        SignalQuality(score="0.92", completeness=0.98)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("model_type", "payload"),
    [
        (
            ActivityContext,
            {"name": "walking", "confidence": 0.5, "source": "wearable"},
        ),
        (
            PlaceContext,
            {"category": "office", "confidence": 0.5, "source": "wifi"},
        ),
        (
            PeopleContext,
            {
                "count": 1,
                "relationship_categories": ("colleague",),
                "confidence": 0.5,
            },
        ),
        (
            StateEstimate,
            make_state_estimate().model_dump(),
        ),
    ],
    ids=["activity", "place", "people", "state-estimate"],
)
@pytest.mark.parametrize(
    "invalid_value",
    [-0.01, 1.01, float("nan"), float("inf")],
    ids=["negative", "above-one", "nan", "positive-infinity"],
)
def test_new_confidence_fields_reject_invalid_probabilities(
    model_type: type[BaseModel],
    payload: dict[str, object],
    invalid_value: float,
) -> None:
    """Every new confidence field rejects out-of-range and non-finite values."""
    payload["confidence"] = invalid_value

    with pytest.raises(ValidationError):
        model_type.model_validate(payload)


@pytest.mark.parametrize(
    ("field_name", "entry_name"),
    [("distribution", "focused"), ("missingness", "calendar")],
)
@pytest.mark.parametrize(
    "invalid_value",
    [-0.01, 1.01, float("nan"), float("inf")],
    ids=["negative", "above-one", "nan", "positive-infinity"],
)
def test_state_estimate_probability_maps_reject_invalid_values(
    field_name: str,
    entry_name: str,
    invalid_value: float,
) -> None:
    """Distribution and missingness values are bounded finite probabilities."""
    payload = make_state_estimate().model_dump()
    payload[field_name] = {entry_name: invalid_value}

    with pytest.raises(ValidationError):
        StateEstimate.model_validate(payload)


@pytest.mark.parametrize("invalid_value", [float("nan"), float("inf"), float("-inf")])
def test_state_estimate_dimensions_reject_non_finite_values(
    invalid_value: float,
) -> None:
    """Continuous state dimensions must remain finite."""
    payload = make_state_estimate().model_dump()
    payload["dimensions"] = {"cognitive_load": invalid_value}

    with pytest.raises(ValidationError):
        StateEstimate.model_validate(payload)


@pytest.mark.parametrize("field_name", ["dimensions", "distribution"])
def test_state_estimate_required_maps_reject_empty_values(field_name: str) -> None:
    """Dimensions and distribution each require at least one entry."""
    payload = make_state_estimate().model_dump()
    payload[field_name] = {}

    with pytest.raises(ValidationError):
        StateEstimate.model_validate(payload)


def test_activity_context_rejects_string_confidence() -> None:
    """Strict probability validation does not coerce strings in new models."""
    with pytest.raises(ValidationError):
        ActivityContext(
            name="walking",
            confidence="0.8",  # type: ignore[arg-type]
            source="wearable",
        )


def test_signal_event_rejects_field_rebinding() -> None:
    """Validated contract fields cannot be rebound after construction."""
    event = make_signal_event()

    with pytest.raises(ValidationError):
        event.time = NOW  # type: ignore[misc]


def task4_auxiliary_payloads() -> tuple[
    tuple[type[BaseModel], dict[str, object]], ...
]:
    """Return valid payloads for every Task 4 auxiliary contract."""
    memory = make_state_memory()
    return (
        (EpisodeMemory, memory.episode[0].model_dump()),
        (PreferenceMemory, memory.preference[0].model_dump()),
        (RoutineMemory, memory.routine[0].model_dump()),
        (CorrectionMemory, memory.correction[0].model_dump()),
        (DecayPolicy, memory.decay.model_dump()),
        (ProvenanceRecord, memory.provenance[0].model_dump()),
    )


def test_state_memory_has_exact_v02_fields() -> None:
    """StateMemory exposes exactly the six Appendix A.1 aggregate fields."""
    assert set(StateMemory.model_fields) == {
        "episode",
        "preference",
        "routine",
        "correction",
        "decay",
        "provenance",
    }
    assert all(field.is_required() for field in StateMemory.model_fields.values())


@pytest.mark.parametrize(
    ("model_type", "expected_fields"),
    [
        (
            EpisodeMemory,
            {"id", "occurred_at", "state", "context", "signal_event_ids"},
        ),
        (
            PreferenceMemory,
            {"id", "state_scope", "target", "value", "confidence", "updated_at"},
        ),
        (
            RoutineMemory,
            {
                "id",
                "name",
                "pattern",
                "confidence",
                "observed_count",
                "updated_at",
            },
        ),
        (
            CorrectionMemory,
            {
                "id",
                "target_id",
                "corrected_at",
                "original_value",
                "corrected_value",
                "reason",
            },
        ),
        (DecayPolicy, {"policy_name", "weight", "evaluated_at"}),
        (
            ProvenanceRecord,
            {"source_type", "source_id", "recorded_at", "actor"},
        ),
    ],
    ids=["episode", "preference", "routine", "correction", "decay", "provenance"],
)
def test_state_memory_auxiliary_models_have_exact_v02_fields(
    model_type: type[BaseModel],
    expected_fields: set[str],
) -> None:
    """Every Task 4 nested contract exposes only its approved fields."""
    assert set(model_type.model_fields) == expected_fields


def test_state_memory_preserves_valid_nested_records() -> None:
    """The aggregate retains typed memory records without adding behavior."""
    memory = make_state_memory()

    assert memory.episode[0].state == make_state_estimate()
    assert memory.episode[0].context == make_populated_context_snapshot()
    assert memory.preference[0].value == "silent"
    assert memory.routine[0].observed_count == 3
    assert memory.correction[0].reason is None
    assert memory.decay.policy_name == "recency-v1"
    assert memory.provenance[0].actor == "sense-engine"


def test_state_memory_accepts_empty_record_tuples() -> None:
    """Each collection may be empty while the decay metadata remains required."""
    memory = StateMemory(
        episode=(),
        preference=(),
        routine=(),
        correction=(),
        decay=DecayPolicy(
            policy_name="recency-v1",
            weight=1.0,
            evaluated_at=NOW,
        ),
        provenance=(),
    )

    assert memory.episode == ()
    assert memory.preference == ()
    assert memory.routine == ()
    assert memory.correction == ()
    assert memory.provenance == ()


def test_episode_context_is_required_but_nullable() -> None:
    """Missing context must be explicit so absence remains meaningful evidence."""
    payload = make_state_memory().episode[0].model_dump()
    payload["context"] = None

    assert EpisodeMemory.model_validate(payload).context is None

    del payload["context"]
    with pytest.raises(ValidationError) as exc_info:
        EpisodeMemory.model_validate(payload)

    assert any(
        error["type"] == "missing" and error["loc"] == ("context",)
        for error in exc_info.value.errors()
    )


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    [
        (EpisodeMemory, task4_auxiliary_payloads()[0][1], "occurred_at"),
        (PreferenceMemory, task4_auxiliary_payloads()[1][1], "updated_at"),
        (RoutineMemory, task4_auxiliary_payloads()[2][1], "updated_at"),
        (CorrectionMemory, task4_auxiliary_payloads()[3][1], "corrected_at"),
        (DecayPolicy, task4_auxiliary_payloads()[4][1], "evaluated_at"),
        (ProvenanceRecord, task4_auxiliary_payloads()[5][1], "recorded_at"),
    ],
    ids=["episode", "preference", "routine", "correction", "decay", "provenance"],
)
def test_state_memory_aware_datetime_fields_reject_naive_values(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
) -> None:
    """Every Task 4 timestamp must carry timezone information."""
    payload[field_name] = NAIVE_NOW

    with pytest.raises(ValidationError) as exc_info:
        model_type.model_validate(payload)

    assert any(
        error["type"] == "timezone_aware" and error["loc"] == (field_name,)
        for error in exc_info.value.errors()
    )


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    [
        (PreferenceMemory, task4_auxiliary_payloads()[1][1], "confidence"),
        (RoutineMemory, task4_auxiliary_payloads()[2][1], "confidence"),
        (DecayPolicy, task4_auxiliary_payloads()[4][1], "weight"),
    ],
    ids=["preference-confidence", "routine-confidence", "decay-weight"],
)
@pytest.mark.parametrize("boundary", [0.0, 1.0])
def test_state_memory_probabilities_accept_boundaries(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
    boundary: float,
) -> None:
    """Task 4 probabilities include both zero and one."""
    payload[field_name] = boundary

    validated = model_type.model_validate(payload)

    assert getattr(validated, field_name) == boundary


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    [
        (PreferenceMemory, task4_auxiliary_payloads()[1][1], "confidence"),
        (RoutineMemory, task4_auxiliary_payloads()[2][1], "confidence"),
        (DecayPolicy, task4_auxiliary_payloads()[4][1], "weight"),
    ],
    ids=["preference-confidence", "routine-confidence", "decay-weight"],
)
@pytest.mark.parametrize(
    "invalid_value",
    [-0.01, 1.01, float("nan"), float("inf"), float("-inf"), "0.5"],
    ids=["negative", "above-one", "nan", "positive-infinity", "negative-infinity", "string"],
)
def test_state_memory_probabilities_reject_invalid_values(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
    invalid_value: object,
) -> None:
    """Task 4 probabilities reject out-of-range, non-finite, and coerced values."""
    payload[field_name] = invalid_value

    with pytest.raises(ValidationError):
        model_type.model_validate(payload)


@pytest.mark.parametrize("invalid_value", [0, -1, 1.0, "1"])
def test_routine_observed_count_rejects_invalid_values(invalid_value: object) -> None:
    """Observed routine counts are strict positive integers."""
    payload = make_state_memory().routine[0].model_dump()
    payload["observed_count"] = invalid_value

    with pytest.raises(ValidationError):
        RoutineMemory.model_validate(payload)


def test_routine_observed_count_accepts_one() -> None:
    """One observation is the minimum valid routine count."""
    payload = make_state_memory().routine[0].model_dump()
    payload["observed_count"] = 1

    assert RoutineMemory.model_validate(payload).observed_count == 1


def test_state_memory_rejects_unknown_top_level_field() -> None:
    """Unknown aggregate keys are outside the Appendix A.1 contract."""
    payload = make_state_memory().model_dump()
    payload["unexpected_field"] = True

    with pytest.raises(ValidationError):
        StateMemory.model_validate(payload)


def test_state_memory_rejects_unknown_nested_field() -> None:
    """Unknown keys are forbidden within Task 4 nested records."""
    payload = make_state_memory().model_dump()
    payload["episode"][0]["unexpected_field"] = True

    with pytest.raises(ValidationError) as exc_info:
        StateMemory.model_validate(payload)

    assert any(
        error["type"] == "extra_forbidden"
        and error["loc"] == ("episode", 0, "unexpected_field")
        for error in exc_info.value.errors()
    )


def test_state_memory_rejects_field_rebinding_but_remains_shallow_frozen() -> None:
    """Aggregate fields are frozen while nested JSON remains read-only by convention."""
    memory = make_state_memory()

    with pytest.raises(ValidationError):
        memory.episode = ()  # type: ignore[misc]

    memory.routine[0].pattern["hour"] = 10
    assert memory.routine[0].pattern["hour"] == 10


@pytest.mark.parametrize(
    "model_type",
    [
        StateMemory,
        EpisodeMemory,
        PreferenceMemory,
        RoutineMemory,
        CorrectionMemory,
        DecayPolicy,
        ProvenanceRecord,
    ],
)
def test_state_memory_schema_fields_have_chinese_descriptions(
    model_type: type[BaseModel],
) -> None:
    """Top-level and nested Task 4 schema fields document State Computing semantics."""
    schema = StateMemory.model_json_schema()
    model_schema = (
        schema if model_type is StateMemory else schema["$defs"][model_type.__name__]
    )

    for field_name, field_schema in model_schema["properties"].items():
        description = field_schema.get("description")
        assert isinstance(description, str), field_name
        assert description.strip(), field_name
        assert any("\u4e00" <= character <= "\u9fff" for character in description), field_name


@pytest.mark.parametrize(
    ("model_type", "required_fields", "defaults"),
    [
        (
            EpisodeMemory,
            {"id", "occurred_at", "state", "context", "signal_event_ids"},
            {},
        ),
        (
            PreferenceMemory,
            {"id", "state_scope", "target", "value", "confidence", "updated_at"},
            {},
        ),
        (
            RoutineMemory,
            {"id", "name", "pattern", "confidence", "observed_count", "updated_at"},
            {},
        ),
        (
            CorrectionMemory,
            {
                "id",
                "target_id",
                "corrected_at",
                "original_value",
                "corrected_value",
            },
            {"reason": None},
        ),
        (DecayPolicy, {"policy_name", "weight", "evaluated_at"}, {}),
        (
            ProvenanceRecord,
            {"source_type", "source_id", "recorded_at", "actor"},
            {},
        ),
    ],
    ids=["episode", "preference", "routine", "correction", "decay", "provenance"],
)
def test_state_memory_auxiliary_required_and_default_matrix(
    model_type: type[BaseModel],
    required_fields: set[str],
    defaults: dict[str, object],
) -> None:
    """Task 4 auxiliaries keep intentional required and default semantics."""
    assert {
        name for name, field in model_type.model_fields.items() if field.is_required()
    } == required_fields
    assert {
        name: field.get_default()
        for name, field in model_type.model_fields.items()
        if not field.is_required()
    } == defaults


def test_intervention_has_exact_appendix_fields() -> None:
    """Intervention exposes exactly the five declarative Appendix A.1 fields."""
    assert set(Intervention.model_fields) == {
        "objective",
        "action",
        "risk",
        "reversibility",
        "expected_effect",
    }
    assert all(field.is_required() for field in Intervention.model_fields.values())


@pytest.mark.parametrize(
    ("model_type", "expected_fields"),
    [
        (ActionSpec, {"type", "channel", "parameters"}),
        (RiskAssessment, {"level", "rationale"}),
        (Reversibility, {"is_reversible", "method", "recovery_seconds"}),
        (SelfReport, {"reported_at", "dimensions", "note"}),
        (
            BehaviorProxy,
            {"name", "observed_at", "value", "authorization_reference"},
        ),
    ],
    ids=["action", "risk", "reversibility", "self-report", "behavior-proxy"],
)
def test_intervention_and_outcome_auxiliaries_have_exact_fields(
    model_type: type[BaseModel],
    expected_fields: set[str],
) -> None:
    """Every Task 5 auxiliary exposes only its approved data fields."""
    assert set(model_type.model_fields) == expected_fields


@pytest.mark.parametrize(
    ("model_type", "required_fields", "defaults"),
    [
        (ActionSpec, {"type", "channel", "parameters"}, {}),
        (RiskAssessment, {"level", "rationale"}, {}),
        (
            Reversibility,
            {"is_reversible"},
            {"method": None, "recovery_seconds": None},
        ),
        (SelfReport, {"reported_at", "dimensions"}, {"note": None}),
        (
            BehaviorProxy,
            {"name", "observed_at", "value", "authorization_reference"},
            {},
        ),
    ],
    ids=["action", "risk", "reversibility", "self-report", "behavior-proxy"],
)
def test_task5_auxiliary_required_and_default_matrix(
    model_type: type[BaseModel],
    required_fields: set[str],
    defaults: dict[str, object],
) -> None:
    """Task 5 auxiliaries keep intentional required and default semantics."""
    assert {
        name for name, field in model_type.model_fields.items() if field.is_required()
    } == required_fields
    assert {
        name: field.get_default()
        for name, field in model_type.model_fields.items()
        if not field.is_required()
    } == defaults


def test_outcome_has_exact_appendix_fields() -> None:
    """Outcome exposes exactly the five Appendix A.1 collection fields."""
    assert set(Outcome.model_fields) == {
        "accepted",
        "adjusted",
        "rejected",
        "self_report",
        "behavior_proxy",
    }


def test_risk_level_has_exact_values() -> None:
    """RiskLevel contains only the whitepaper risk labels."""
    assert {level.value for level in RiskLevel} == {"low", "medium", "high"}


def test_valid_intervention_is_declarative_data() -> None:
    """Constructing an intervention only preserves the declared action data."""
    intervention = make_intervention()

    assert intervention.action.parameters == {"mode": "silent"}
    assert intervention.risk.level is RiskLevel.LOW
    assert intervention.expected_effect == {"cognitive_load": -0.15}


def test_valid_outcome_keeps_evidence_sources_distinct() -> None:
    """Self-report and authorization-referenced proxies remain separate evidence."""
    outcome = make_outcome()

    assert outcome.self_report is not None
    assert outcome.self_report.dimensions == {"cognitive_load": 0.4}
    assert outcome.behavior_proxy[0].authorization_reference == (
        "consent-outcome-proxy-001"
    )


def test_behavior_proxy_schema_does_not_claim_authorization_verification() -> None:
    """Proxy schemas assign authorization claims and validation to the caller."""
    descriptions = (
        BehaviorProxy.model_fields["authorization_reference"].description,
        Outcome.model_fields["behavior_proxy"].description,
    )

    for description in descriptions:
        assert description is not None
        assert "调用方声明" in description
        assert "本模型不验证授权范围、有效性或采集许可" in description


def task5_nonempty_payloads() -> tuple[
    tuple[type[BaseModel], dict[str, object], str], ...
]:
    """Return valid payloads and string fields constrained to be non-empty."""
    intervention = make_intervention()
    outcome = make_outcome()
    assert outcome.self_report is not None
    return (
        (ActionSpec, intervention.action.model_dump(), "type"),
        (ActionSpec, intervention.action.model_dump(), "channel"),
        (RiskAssessment, intervention.risk.model_dump(), "rationale"),
        (Reversibility, intervention.reversibility.model_dump(), "method"),
        (Intervention, intervention.model_dump(), "objective"),
        (SelfReport, outcome.self_report.model_dump(), "note"),
        (BehaviorProxy, outcome.behavior_proxy[0].model_dump(), "name"),
        (
            BehaviorProxy,
            outcome.behavior_proxy[0].model_dump(),
            "authorization_reference",
        ),
    )


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    task5_nonempty_payloads(),
    ids=[
        "action-type",
        "action-channel",
        "risk-rationale",
        "reversibility-method",
        "intervention-objective",
        "self-report-note",
        "proxy-name",
        "proxy-authorization",
    ],
)
def test_task5_nonempty_strings_reject_whitespace(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
) -> None:
    """Task 5 semantic identifiers and explanations cannot be blank."""
    payload[field_name] = "   "

    with pytest.raises(ValidationError):
        model_type.model_validate(payload)


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    [
        (Intervention, make_intervention().model_dump(), "expected_effect"),
        (
            SelfReport,
            make_outcome().self_report.model_dump(),  # type: ignore[union-attr]
            "dimensions",
        ),
    ],
    ids=["expected-effect", "self-report-dimensions"],
)
def test_task5_dimension_keys_reject_whitespace(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
) -> None:
    """Named dimension maps require non-empty semantic keys."""
    payload[field_name] = {"   ": 0.1}

    with pytest.raises(ValidationError):
        model_type.model_validate(payload)


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    [
        (
            Reversibility,
            make_intervention().reversibility.model_dump(),
            "is_reversible",
        ),
        (Outcome, make_outcome().model_dump(), "accepted"),
        (Outcome, make_outcome().model_dump(), "adjusted"),
        (Outcome, make_outcome().model_dump(), "rejected"),
    ],
    ids=["is-reversible", "accepted", "adjusted", "rejected"],
)
@pytest.mark.parametrize(
    "invalid_value",
    [1, "true"],
    ids=["integer", "string"],
)
def test_task5_booleans_are_strict(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
    invalid_value: object,
) -> None:
    """Boolean flags do not coerce numeric or string values."""
    payload[field_name] = invalid_value

    with pytest.raises(ValidationError) as exc_info:
        model_type.model_validate(payload)

    assert any(error["loc"] == (field_name,) for error in exc_info.value.errors())


def test_recovery_seconds_accepts_zero() -> None:
    """Immediate recovery is represented by zero seconds."""
    reversibility = Reversibility(
        is_reversible=True,
        method="restore",
        recovery_seconds=0.0,
    )

    assert reversibility.recovery_seconds == 0.0


@pytest.mark.parametrize(
    "invalid_value",
    [-0.01, float("nan"), float("inf"), float("-inf"), "1.0"],
    ids=["negative", "nan", "positive-infinity", "negative-infinity", "string"],
)
def test_recovery_seconds_rejects_invalid_values(invalid_value: object) -> None:
    """Recovery duration is strict, finite, and non-negative when provided."""
    payload = make_intervention().reversibility.model_dump()
    payload["recovery_seconds"] = invalid_value

    with pytest.raises(ValidationError):
        Reversibility.model_validate(payload)


@pytest.mark.parametrize(
    "invalid_value",
    [float("nan"), float("inf"), float("-inf"), "0.1"],
    ids=["nan", "positive-infinity", "negative-infinity", "string"],
)
def test_expected_effect_rejects_nonfinite_or_coerced_values(
    invalid_value: object,
) -> None:
    """Expected effects preserve only strict finite numeric declarations."""
    payload = make_intervention().model_dump()
    payload["expected_effect"] = {"cognitive_load": invalid_value}

    with pytest.raises(ValidationError):
        Intervention.model_validate(payload)


@pytest.mark.parametrize(
    ("model_type", "payload", "field_name"),
    [
        (
            SelfReport,
            make_outcome().self_report.model_dump(),  # type: ignore[union-attr]
            "reported_at",
        ),
        (
            BehaviorProxy,
            make_outcome().behavior_proxy[0].model_dump(),
            "observed_at",
        ),
    ],
    ids=["self-report", "behavior-proxy"],
)
def test_outcome_evidence_timestamps_reject_naive_values(
    model_type: type[BaseModel],
    payload: dict[str, object],
    field_name: str,
) -> None:
    """Every Task 5 evidence timestamp must carry timezone information."""
    payload[field_name] = NAIVE_NOW

    with pytest.raises(ValidationError) as exc_info:
        model_type.model_validate(payload)

    assert any(
        error["type"] == "timezone_aware" and error["loc"] == (field_name,)
        for error in exc_info.value.errors()
    )


@pytest.mark.parametrize(
    ("model_type", "payload"),
    [
        (Intervention, make_intervention().model_dump()),
        (Outcome, make_outcome().model_dump()),
    ],
    ids=["intervention", "outcome"],
)
def test_task5_top_level_models_reject_unknown_fields(
    model_type: type[BaseModel],
    payload: dict[str, object],
) -> None:
    """Unknown top-level keys are outside the Appendix A.1 contracts."""
    payload["unexpected_field"] = True

    with pytest.raises(ValidationError):
        model_type.model_validate(payload)


def test_intervention_rejects_unknown_nested_field() -> None:
    """Unknown keys are forbidden within intervention declarations."""
    payload = make_intervention().model_dump()
    payload["action"]["unexpected_field"] = True

    with pytest.raises(ValidationError) as exc_info:
        Intervention.model_validate(payload)

    assert any(
        error["type"] == "extra_forbidden"
        and error["loc"] == ("action", "unexpected_field")
        for error in exc_info.value.errors()
    )


def test_outcome_rejects_unknown_nested_field() -> None:
    """Unknown keys are forbidden within collected outcome evidence."""
    payload = make_outcome().model_dump()
    payload["behavior_proxy"][0]["unexpected_field"] = True

    with pytest.raises(ValidationError) as exc_info:
        Outcome.model_validate(payload)

    assert any(
        error["type"] == "extra_forbidden"
        and error["loc"] == ("behavior_proxy", 0, "unexpected_field")
        for error in exc_info.value.errors()
    )


@pytest.mark.parametrize("field_name", ["accepted", "adjusted", "rejected"])
def test_outcome_decision_flags_are_required(field_name: str) -> None:
    """Collection protocol must explicitly provide every decision flag."""
    payload = make_outcome().model_dump()
    del payload[field_name]

    with pytest.raises(ValidationError) as exc_info:
        Outcome.model_validate(payload)

    assert any(
        error["type"] == "missing" and error["loc"] == (field_name,)
        for error in exc_info.value.errors()
    )


@pytest.mark.parametrize(
    ("accepted", "adjusted", "rejected"),
    [(False, False, False), (True, True, False), (True, True, True)],
    ids=["all-false", "multiple-true", "all-true"],
)
def test_outcome_decision_flags_remain_data_only(
    accepted: bool,
    adjusted: bool,
    rejected: bool,
) -> None:
    """Mutual-exclusion policy remains outside this declarative model."""
    payload = make_outcome().model_dump()
    payload.update(
        accepted=accepted,
        adjusted=adjusted,
        rejected=rejected,
    )

    outcome = Outcome.model_validate(payload)

    assert (outcome.accepted, outcome.adjusted, outcome.rejected) == (
        accepted,
        adjusted,
        rejected,
    )


def test_outcome_self_report_is_required_but_nullable() -> None:
    """Explicit absence distinguishes no report from an omitted contract field."""
    payload = make_outcome().model_dump()
    payload["self_report"] = None
    assert Outcome.model_validate(payload).self_report is None

    del payload["self_report"]
    with pytest.raises(ValidationError) as exc_info:
        Outcome.model_validate(payload)

    assert any(
        error["type"] == "missing" and error["loc"] == ("self_report",)
        for error in exc_info.value.errors()
    )


def test_outcome_behavior_proxy_is_required_and_may_be_empty() -> None:
    """An empty tuple records that no authorization-referenced proxy was collected."""
    payload = make_outcome().model_dump()
    payload["behavior_proxy"] = ()
    assert Outcome.model_validate(payload).behavior_proxy == ()

    del payload["behavior_proxy"]
    with pytest.raises(ValidationError) as exc_info:
        Outcome.model_validate(payload)

    assert any(
        error["type"] == "missing" and error["loc"] == ("behavior_proxy",)
        for error in exc_info.value.errors()
    )


def test_task5_models_reject_field_rebinding() -> None:
    """Task 5 top-level and auxiliary records use shallow-frozen contracts."""
    outcome = make_outcome()
    assert outcome.self_report is not None
    cases: tuple[tuple[BaseModel, str, object], ...] = (
        (make_intervention(), "objective", "new-objective"),
        (make_intervention().action, "channel", "new-channel"),
        (make_intervention().risk, "rationale", "new-rationale"),
        (make_intervention().reversibility, "method", None),
        (outcome, "accepted", False),
        (outcome.self_report, "note", "new-note"),
        (outcome.behavior_proxy[0], "name", "new-proxy"),
    )

    for model, field_name, value in cases:
        with pytest.raises(ValidationError):
            setattr(model, field_name, value)


@pytest.mark.parametrize(
    "model_type",
    [
        Intervention,
        ActionSpec,
        RiskAssessment,
        Reversibility,
        Outcome,
        SelfReport,
        BehaviorProxy,
    ],
)
def test_task5_schema_fields_have_chinese_descriptions(
    model_type: type[BaseModel],
) -> None:
    """Every Task 5 field documents its State Computing data semantics."""
    properties = model_type.model_json_schema()["properties"]

    for field_name, field_schema in properties.items():
        description = field_schema.get("description")
        assert isinstance(description, str), field_name
        assert description.strip(), field_name
        assert any("\u4e00" <= character <= "\u9fff" for character in description), field_name
