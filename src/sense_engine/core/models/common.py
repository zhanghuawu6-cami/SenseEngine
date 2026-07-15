"""Reusable constrained types for SenseEngine data contracts."""

from types import NoneType
from typing import TYPE_CHECKING, Annotated, TypeAlias

from pydantic import Field, StrictBool, StrictInt, StrictStr, StringConstraints
from typing_extensions import TypeAliasType

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Probability = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
NonNegativeInt = Annotated[int, Field(ge=0)]
if TYPE_CHECKING:
    FiniteJsonValue: TypeAlias = (
        None
        | StrictBool
        | StrictInt
        | StrictStr
        | FiniteFloat
        | list["FiniteJsonValue"]
        | dict[str, "FiniteJsonValue"]
    )
else:
    FiniteJsonValue = TypeAliasType(
        "FiniteJsonValue",
        NoneType
        | StrictBool
        | StrictInt
        | StrictStr
        | FiniteFloat
        | list["FiniteJsonValue"]
        | dict[str, "FiniteJsonValue"],
    )
JsonObject: TypeAlias = dict[str, FiniteJsonValue]
