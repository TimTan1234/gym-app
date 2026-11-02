package app.gympal.health

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DaysTest {
    private val nov3 = LocalDate.of(2026, 11, 3)

    @Test
    fun lastDaysEndToday() {
        assertEquals(listOf(LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 2), nov3), Days.lastDays(nov3, 3))
    }

    @Test
    fun aNightBelongsToTheMorningYouWokeUp() {
        val (from, to) = Days.sleepWindow(nov3)
        assertEquals(LocalDateTime.of(2026, 11, 2, 12, 0), from)
        assertEquals(LocalDateTime.of(2026, 11, 3, 12, 0), to)
        assertEquals(nov3, Days.wakeDate(to))
    }

    @Test
    fun payloadLeavesOutEmptyDaysAndCapsSleep() {
        val days = Days.combine(
            Days.lastDays(nov3, 3),
            steps = mapOf(LocalDate.of(2026, 11, 2) to 8432L, nov3 to 120L),
            sleep = mapOf(nov3 to Duration.ofMinutes(445), LocalDate.of(2026, 11, 2) to Duration.ofHours(30)),
        )
        assertEquals(
            "{\"days\":[{\"date\":\"2026-11-02\",\"steps\":8432,\"sleepMinutes\":1440},{\"date\":\"2026-11-03\",\"steps\":120,\"sleepMinutes\":445}]}",
            Days.syncJson(days),
        )
        assertNull(Days.syncJson(Days.combine(listOf(nov3), emptyMap(), emptyMap())))
    }

    @Test
    fun zeroSleepCountsAsNoSleep() {
        assertNull(Days.combine(listOf(nov3), emptyMap(), mapOf(nov3 to Duration.ZERO)).single().sleepMinutes)
    }

    @Test
    fun onlyHttpsAddresses() {
        assertEquals("https://gym.example.com", Days.normalizeServer("  https://gym.example.com/ "))
        assertNull(Days.normalizeServer("http://192.168.1.20:3000"))
        assertNull(Days.normalizeServer("https://"))
    }

    @Test
    fun jsonStringsAreEscaped() {
        assertEquals("\"Tan's \\\"Pixel\\\" \\\\ 8\"", Days.jsonString("Tan's \"Pixel\" \\ 8"))
    }
}
