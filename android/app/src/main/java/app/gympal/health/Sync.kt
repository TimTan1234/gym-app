package app.gympal.health

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.LocalDate
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

sealed interface SyncResult {
    data class Sent(val days: Int) : SyncResult
    data object NothingNew : SyncResult
    data object NotLinked : SyncResult
    data object NoAccess : SyncResult
    data object Unlinked : SyncResult
    data object ReadFailed : SyncResult
    data class Failed(val error: ApiException) : SyncResult
}

object Sync {
    private const val WORK = "sync"

    /** Reads the last week from Health Connect and sends it. Used by the background worker and the Sync now button. */
    suspend fun run(context: Context): SyncResult {
        val store = Store(context)
        val server = store.server
        val token = store.token
        if (server == null || token == null) return SyncResult.NotLinked
        val reader = HealthReader.from(context) ?: return SyncResult.NoAccess
        val days = try {
            if (!reader.canRead()) return SyncResult.NoAccess
            reader.read(LocalDate.now())
        } catch (e: SecurityException) {
            // Closed app without background reading: wait until it's opened.
            return SyncResult.NoAccess
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Health Connect busy, over its read quota, or restarting.
            return SyncResult.ReadFailed
        }
        val json = Days.syncJson(days) ?: return SyncResult.NothingNew
        return try {
            val saved = withContext(Dispatchers.IO) { Api.sync(server, token, json) }
            store.markSynced(System.currentTimeMillis())
            SyncResult.Sent(saved)
        } catch (e: ApiException) {
            if (e.kind == ApiException.Kind.Unauthorized) {
                // Unlinked in GymPal: forget the token and stop trying.
                store.clearLink()
                stop(context)
                SyncResult.Unlinked
            } else {
                SyncResult.Failed(e)
            }
        }
    }

    /** About every 3 hours, when there's a network; only where Health Connect allows background reads. */
    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(3, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun stop(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result =
        when (Sync.run(applicationContext)) {
            is SyncResult.Failed, SyncResult.ReadFailed -> Result.retry()
            else -> Result.success()
        }
}
