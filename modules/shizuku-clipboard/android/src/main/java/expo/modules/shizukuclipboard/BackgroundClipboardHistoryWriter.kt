package expo.modules.shizukuclipboard

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.os.ParcelFileDescriptor
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID

internal object BackgroundClipboardHistoryWriter {
    private const val TAG = "ShizukuClipboardHistory"
    private const val TABLE = "clipboard_history"

    fun persist(
        context: Context,
        snapshotJson: String,
        clipboardService: IClipboardUserService? = null
    ) {
        val snapshot = try {
            JSONObject(snapshotJson)
        } catch (_: Exception) {
            return
        }

        when (snapshot.optString("type")) {
            "text" -> persistText(context, snapshot.optString("content"))
            "image", "files" -> persistBinary(context, snapshot, clipboardService)
        }
    }

    private fun persistText(context: Context, text: String) {
        if (text.isEmpty()) return
        val hash = sha256(text.toByteArray(Charsets.UTF_8))
        if (hash.isEmpty()) return
        val persisted = upsert(
            context, hash, "Text", text, displayKind(text), null,
            text.length.toLong(), null, false
        )
        if (persisted) {
            Log.i(TAG, "Persisted background text hash=${hash.take(8)} length=${text.length}")
        }
    }

    private fun persistBinary(
        context: Context,
        snapshot: JSONObject,
        clipboardService: IClipboardUserService?
    ) {
        if (clipboardService == null) {
            Log.w(TAG, "Binary clipboard snapshot has no active Shizuku service")
            return
        }

        val mimeType = snapshot.optString("mimeType", "application/octet-stream")
        val itemType = if (snapshot.optString("type") == "image") "Image" else "File"
        val extension = extensionFor(mimeType, snapshot.optString("displayName"))
        val tempDir = File(context.cacheDir, "temp_files").apply { mkdirs() }
        val tempFile = File(tempDir, "clipboard_${UUID.randomUUID()}.$extension")

        val copied = try {
            ParcelFileDescriptor.open(
                tempFile,
                ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE or
                    ParcelFileDescriptor.MODE_READ_WRITE
            ).use { descriptor -> clipboardService.copyPrimaryClipToFile(descriptor) }
        } catch (error: Exception) {
            Log.e(TAG, "Failed to copy background $itemType payload", error)
            false
        }
        if (!copied || !tempFile.exists() || tempFile.length() == 0L) {
            Log.e(
                TAG,
                "Background $itemType payload copy failed copied=$copied bytes=${tempFile.length()}"
            )
            tempFile.delete()
            return
        }

        val hash = sha256(tempFile)
        if (hash.isEmpty()) {
            tempFile.delete()
            return
        }

        val requestedName = sanitizeFileName(snapshot.optString("displayName"))
        val dataName = if (itemType == "Image") {
            "${hash.take(16)}.$extension"
        } else {
            requestedName.ifEmpty { "${hash.take(16)}.$extension" }
        }
        val historyDir = File(context.filesDir, "clipboards/history/$itemType-$hash").apply {
            mkdirs()
        }
        val targetFile = File(historyDir, dataName)
        if (targetFile.exists()) {
            tempFile.delete()
        } else if (!tempFile.renameTo(targetFile)) {
            tempFile.copyTo(targetFile, overwrite = false)
            tempFile.delete()
        }

        val persisted = upsert(
            context, hash, itemType, dataName, itemType.lowercase(Locale.US), dataName,
            targetFile.length(), targetFile.toURI().toString(), true
        )
        if (persisted) {
            Log.i(TAG, "Persisted background $itemType hash=${hash.take(8)} bytes=${targetFile.length()}")
        }
    }

    private fun upsert(
        context: Context,
        profileHash: String,
        type: String,
        text: String,
        displayKind: String,
        dataName: String?,
        size: Long,
        fileUri: String?,
        hasData: Boolean
    ): Boolean {
        val databaseFile = File(context.filesDir, "SQLite/clipboard.db")
        if (!databaseFile.exists()) {
            Log.w(TAG, "History database is not initialized yet")
            return false
        }

        val now = System.currentTimeMillis()
        try {
            SQLiteDatabase.openDatabase(
                databaseFile.absolutePath,
                null,
                SQLiteDatabase.OPEN_READWRITE
            ).use { database ->
                database.rawQuery("PRAGMA busy_timeout = 3000", null).use { cursor ->
                    cursor.moveToFirst()
                }
                val values = ContentValues().apply {
                    put("profileHash", profileHash)
                    put("type", type)
                    put("text", text)
                    put("displayKind", displayKind)
                    if (dataName == null) putNull("dataName") else put("dataName", dataName)
                    put("size", size)
                    if (fileUri == null) putNull("fileUri") else put("fileUri", fileUri)
                    put("hasData", if (hasData) 1 else 0)
                    put("hasRemoteData", 0)
                    put("localClipboardHash", profileHash)
                    put("timestamp", now)
                    put("lastAccessed", now)
                    put("lastModified", now)
                    put("useCount", 0)
                    put("starred", 0)
                    put("pinned", 0)
                    put("isDeleted", 0)
                    put("isLocalFileReady", 1)
                    put("syncStatus", 0)
                    put("version", 0)
                }

                val inserted = database.insertWithOnConflict(
                    TABLE, null, values, SQLiteDatabase.CONFLICT_IGNORE
                )
                if (inserted == -1L) {
                    val update = ContentValues().apply {
                        put("text", text)
                        put("displayKind", displayKind)
                        if (dataName == null) putNull("dataName") else put("dataName", dataName)
                        put("size", size)
                        if (fileUri == null) putNull("fileUri") else put("fileUri", fileUri)
                        put("hasData", if (hasData) 1 else 0)
                        put("localClipboardHash", profileHash)
                        put("lastAccessed", now)
                        put("lastModified", now)
                        put("isDeleted", 0)
                        put("isLocalFileReady", 1)
                    }
                    database.update(TABLE, update, "profileHash = ?", arrayOf(profileHash))
                }
            }
            return true
        } catch (error: Exception) {
            Log.e(TAG, "Failed to persist background clipboard $type", error)
            return false
        }
    }

    private fun sha256(file: File): String {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { input ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val count = input.read(buffer)
                    if (count <= 0) break
                    digest.update(buffer, 0, count)
                }
            }
            digest.digest().toHex()
        } catch (_: Exception) {
            ""
        }
    }

    private fun sha256(bytes: ByteArray): String = try {
        MessageDigest.getInstance("SHA-256").digest(bytes).toHex()
    } catch (_: Exception) {
        ""
    }

    private fun ByteArray.toHex(): String =
        joinToString("") { "%02X".format(Locale.US, it.toInt() and 0xff) }

    private fun extensionFor(mimeType: String, displayName: String): String {
        val existing = displayName.substringAfterLast('.', "").lowercase(Locale.US)
            .filter { it.isLetterOrDigit() }
            .take(10)
        if (existing.isNotEmpty()) return existing
        return when (mimeType.lowercase(Locale.US)) {
            "image/jpeg", "image/jpg" -> "jpg"
            "image/gif" -> "gif"
            "image/webp" -> "webp"
            "image/heic", "image/heif" -> "heic"
            "application/pdf" -> "pdf"
            "text/plain" -> "txt"
            else -> if (mimeType.startsWith("image/")) "png" else "bin"
        }
    }

    private fun sanitizeFileName(value: String): String = value
        .substringAfterLast('/')
        .replace(Regex("[^A-Za-z0-9._() -]"), "_")
        .trim('.', ' ')
        .take(120)

    private fun displayKind(text: String): String {
        val trimmed = text.trim()
        if (trimmed.contains('\n')) return "text"
        return try {
            val uri = java.net.URI(trimmed)
            if ((uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrBlank()) "url"
            else "text"
        } catch (_: Exception) {
            "text"
        }
    }
}
