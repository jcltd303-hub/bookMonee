package com.example.spineroute.data.model

enum class StopKind {
    BOOKCASE,
    PANTRY,
    FRIDGE
}

data class LatLng(
    val lat: Double,
    val lon: Double,
    val label: String = ""
)

val CIVIC_CENTER = LatLng(39.7392, -104.9903, "Civic Center · Denver")

data class Stop(
    val id: String,
    val name: String,
    val kind: StopKind,
    val lat: Double,
    val lon: Double,
    val address: String,
    val neighborhood: String,
    val charter: String = "",
    val notes: String = "",
    val access: String = "public",
    val profitEligible: Boolean = true,
    val source: String = "openstreetmap",
    val sourceId: String = "",
    val sourceUrl: String = ""
)

data class PlannedLeg(
    val stop: Stop,
    val miles: Double,
    val heuristicUsd: Double,
    val residual: Double,
    val scoreUsd: Double,
    val features: List<Double> = emptyList()
)
