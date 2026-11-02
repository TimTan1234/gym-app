package app.gympal.health

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/** One day as GymPal keeps it: the phone's local date, that day's steps, and the sleep you woke up from. */
data class DayTotals(val date: LocalDate, val steps: Long?, val sleepMinutes: Long?)

/** Pure date and payload rules, kept apart from Health Connect so they can be unit-tested. */
object Days {
    /** Sleep is counted noon to noon: a night from Sunday 23:00 to Monday 07:00 belongs to Monday. */
    private val SLEEP_DAY_START: LocalTime = LocalTime.NOON

    /** The last [count] days ending [today], oldest first. */
    fun lastDays(today: LocalDate, count: Int): List<LocalDate> = (count - 1 downTo 0).map { today.minusDays(it.toLong()) }

    /** From noon the day before [date] to noon on [date]: the night you woke up from on [date]. */
    fun sleepWindow(date: LocalDate): Pair<LocalDateTime, LocalDateTime> =
        date.minusDays(1).atTime(SLEEP_DAY_START) to date.atTime(SLEEP_DAY_START)

    /** The day a noon-to-noon slice is counted on: the morning it ends. */
    fun wakeDate(sliceEnd: LocalDateTime): LocalDate = sliceEnd.toLocalDate()

    fun combine(dates: List<LocalDate>, steps: Map<LocalDate, Long>, sleep: Map<LocalDate, Duration>): List<DayTotals> =
        dates.map { d -> DayTotals(d, steps[d], sleep[d]?.toMinutes()?.takeIf { it > 0 }) }

    /** The body of POST /api/device/sync. Days with neither steps nor sleep are left out. */
    fun syncJson(days: List<DayTotals>): String? {
        val sent = days.filter { it.steps != null || it.sleepMinutes != null }
        if (sent.isEmpty()) return null
        return sent.joinToString(",", prefix = "{\"days\":[", postfix = "]}") { d ->
            buildString {
                append("{\"date\":\"").append(d.date).append('"')
                d.steps?.let { append(",\"steps\":").append(it) }
                // A night longer than a day is a recording mistake; the server takes up to 24 h.
                d.sleepMinutes?.let { append(",\"sleepMinutes\":").append(it.coerceAtMost(24 * 60)) }
                append('}')
            }
        }
    }

    /** A JSON string literal. */
    fun jsonString(s: String): String = buildString {
        append('"')
        for (c in s) {
            when {
                c == '"' -> append("\\\"")
                c == '\\' -> append("\\\\")
                c < ' ' -> append(String.format("\\u%04x", c.code))
                else -> append(c)
            }
        }
        append('"')
    }

    /** What the person typed as the server address, or null if it isn't an https:// address. */
    fun normalizeServer(input: String): String? {
        val s = input.trim().trimEnd('/')
        return if (s.startsWith("https://", ignoreCase = true) && s.length > "https://".length) s else null
    }
}
