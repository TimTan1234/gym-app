package app.gympal.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.LocalDate
import java.time.Period

/** Reads daily totals from Health Connect. Aggregates, not raw records, so a phone and a watch aren't counted twice. */
class HealthReader(private val client: HealthConnectClient) {
    companion object {
        val READ = setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(SleepSessionRecord::class),
        )
        const val BACKGROUND = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

        /** The reader, or null when Health Connect is missing or needs an update. */
        fun from(context: Context): HealthReader? =
            if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) HealthReader(HealthConnectClient.getOrCreate(context)) else null
    }

    /** Whether this Health Connect version lets the app read while it's closed. */
    val backgroundAvailable: Boolean
        get() = client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) ==
            HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    suspend fun granted(): Set<String> = client.permissionController.getGrantedPermissions()

    suspend fun canRead(): Boolean = granted().containsAll(READ)

    /** Steps and sleep for the last [count] days ending [today], in the phone's time zone. */
    suspend fun read(today: LocalDate, count: Int = 7): List<DayTotals> {
        val dates = Days.lastDays(today, count)
        val steps = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(dates.first().atStartOfDay(), today.plusDays(1).atStartOfDay()),
                timeRangeSlicer = Period.ofDays(1),
            ),
        ).mapNotNull { slice -> slice.result[StepsRecord.COUNT_TOTAL]?.let { slice.startTime.toLocalDate() to it } }.toMap()
        // One noon-to-noon slice per night, counted on the morning it ends.
        val sleep = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(Days.sleepWindow(dates.first()).first, Days.sleepWindow(today).second),
                timeRangeSlicer = Period.ofDays(1),
            ),
        ).mapNotNull { slice -> slice.result[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.let { Days.wakeDate(slice.endTime) to it } }.toMap()
        return Days.combine(dates, steps, sleep)
    }
}
