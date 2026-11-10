package com.example.spineroute.domain

import com.example.spineroute.data.model.LatLng
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

object GeoUtils {
    private const val EARTH_RADIUS_MILES = 3958.8

    fun distanceMiles(start: LatLng, end: LatLng): Double {
        val dLat = Math.toRadians(end.lat - start.lat)
        val dLon = Math.toRadians(end.lon - start.lon)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(start.lat)) * cos(Math.toRadians(end.lat)) *
                sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return EARTH_RADIUS_MILES * c
    }

    fun formatMiles(miles: Double): String {
        return if (miles < 0.1) "<0.1 mi" else String.format(Locale.US, "%.1f mi", miles)
    }

    fun formatUsd(amount: Double): String {
        return if (amount < 0) {
            String.format(Locale.US, "-$%.2f", -amount)
        } else {
            String.format(Locale.US, "$%.2f", amount)
        }
    }

    fun cleanIsbn(raw: String): String {
        return raw.replace("-", "").replace(" ", "").trim()
    }

    fun isValidIsbn10Or13(raw: String): Boolean {
        val clean = cleanIsbn(raw)
        return clean.length == 10 || clean.length == 13
    }

    fun walkUrl(lat: Double, lon: Double): String {
        return "https://www.google.com/maps/dir/?api=1&destination=$lat,$lon&travelmode=walking"
    }

    fun roundCents(amount: Double): Double {
        return (amount * 100.0).roundToInt() / 100.0
    }
}
