"""Typed context evidence contracts for State Computing inputs."""

from pydantic import AwareDatetime, Field

from sense_engine.core.models.base import ContractModel
from sense_engine.core.models.common import (
    JsonObject,
    NonEmptyStr,
    NonNegativeInt,
    Probability,
)


class ActivityContext(ContractModel):
    """Describe externally observed activity context evidence."""

    name: NonEmptyStr = Field(
        description="外部活动证据的标准名称，作为 State Computing 的上下文输入；该证据不等同于用户的心理或认知状态。"
    )
    confidence: Probability = Field(
        description="活动识别结果的证据可信度，用于控制该上下文对状态估计的影响，而非心理状态本身的概率。"
    )
    source: NonEmptyStr = Field(
        description="活动上下文证据的采集或推断来源，用于 State Computing 追溯输入及解释其可靠性。"
    )


class PlaceContext(ContractModel):
    """Describe externally inferred place context evidence."""

    category: NonEmptyStr = Field(
        description="外部地点证据的语义类别，作为 State Computing 的环境上下文输入；地点类别不等同于用户心理状态。"
    )
    confidence: Probability = Field(
        description="地点类别识别的证据可信度，用于衡量该上下文输入的不确定性，而非候选心理状态的概率。"
    )
    source: NonEmptyStr = Field(
        description="地点上下文证据的采集或推断来源，用于 State Computing 追溯证据并判断适用范围。"
    )


class CalendarContext(ContractModel):
    """Describe one calendar-derived context evidence item."""

    event_type: NonEmptyStr = Field(
        description="日历事件的语义类型，为 State Computing 提供时间安排证据；事件标签本身不代表用户心理状态。"
    )
    starts_at: AwareDatetime = Field(
        description="日历事件开始的带时区时间，用于将外部安排证据对齐到状态计算时间轴。"
    )
    ends_at: AwareDatetime = Field(
        description="日历事件结束的带时区时间，用于界定外部安排证据在状态计算中的时间范围。"
    )
    busy: bool = Field(
        description="日历是否将该时段标记为忙碌，为 State Computing 提供安排占用证据而非心理状态结论。"
    )


class PeopleContext(ContractModel):
    """Describe nearby or interacting people context evidence."""

    count: NonNegativeInt = Field(
        description="上下文中观测到或推断出的人数，用于 State Computing 表达社交环境规模，不用于直接断定心理状态。"
    )
    relationship_categories: tuple[NonEmptyStr, ...] = Field(
        description="相关人员关系类别的上下文集合，用于区分社交环境性质；这些类别仅是外部证据。"
    )
    confidence: Probability = Field(
        description="人员数量与关系上下文的综合证据可信度，用于表达输入不确定性，而非心理状态概率。"
    )


class EnvironmentContext(ContractModel):
    """Describe environmental features captured for context evidence."""

    captured_at: AwareDatetime = Field(
        description="环境特征采集的带时区时间，用于将外部环境证据对齐到 State Computing 的估计时刻。"
    )
    features: JsonObject = Field(
        description="环境传感或派生特征的 JSON 对象，作为状态计算的外部上下文证据，不等同于心理状态表征。"
    )


class ContextSnapshot(ContractModel):
    """Group context evidence available for one State Computing estimate."""

    activity: ActivityContext | None = Field(
        description="估计时可用的活动上下文证据；为空表示缺少该输入，活动证据不等同于心理状态。"
    )
    place: PlaceContext | None = Field(
        description="估计时可用的地点上下文证据；为空表示缺少该输入，地点证据不等同于心理状态。"
    )
    calendar: tuple[CalendarContext, ...] = Field(
        description="与估计时间相关的日历上下文证据集合；空集合表示没有可用事件，不据此直接推断心理状态。"
    )
    people: PeopleContext | None = Field(
        description="估计时可用的人员上下文证据；为空表示缺少该输入，社交环境证据不等同于心理状态。"
    )
    environment: EnvironmentContext | None = Field(
        description="估计时可用的环境特征证据；为空表示缺少该输入，环境证据不等同于心理状态。"
    )
