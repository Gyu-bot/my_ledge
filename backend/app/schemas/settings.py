from pydantic import BaseModel, Field


class SpendingAnomaliesSettings(BaseModel):
    min_delta_amount: int
    anomaly_threshold: float
    baseline_months: int


class SpendingAnomaliesSavedSettings(BaseModel):
    min_delta_amount: int | None
    anomaly_threshold: float | None
    baseline_months: int | None


class AnalyticsSettingsSection(BaseModel):
    spending_anomalies: SpendingAnomaliesSettings


class AnalyticsSavedSettingsSection(BaseModel):
    spending_anomalies: SpendingAnomaliesSavedSettings


class AnalyticsSettingsResponse(BaseModel):
    defaults: AnalyticsSettingsSection
    saved: AnalyticsSavedSettingsSection
    effective: AnalyticsSettingsSection


class SpendingAnomaliesSettingsPatch(BaseModel):
    min_delta_amount: int | None = Field(default=None, ge=0)
    anomaly_threshold: float | None = Field(default=None, ge=0.0)
    baseline_months: int | None = Field(default=None, ge=1, le=12)


class AnalyticsSettingsPatchRequest(BaseModel):
    spending_anomalies: SpendingAnomaliesSettingsPatch = Field(
        default_factory=SpendingAnomaliesSettingsPatch,
    )
