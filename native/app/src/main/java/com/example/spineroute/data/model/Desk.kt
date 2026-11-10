package com.example.spineroute.data.model

const val UNIT_COST_USD = 0.99

data class DeskItem(
    val isbn: String,
    val title: String,
    val offerUsd: Double,
    val demandUsd: Double,
    val lane: BookLane,
    val condition: Condition
)

data class Bin(
    val buyerId: String,
    val buyerName: String,
    val items: List<DeskItem>,
    val stagedUsd: Double,
    val thresholdUsd: Double,
    val costUsd: Double,
    val frictionUsd: Double,
    val netUsd: Double,
    val clearsThreshold: Boolean,
    val gapUsd: Double
)

data class PackHint(
    val buyerId: String,
    val buyerName: String,
    val needUsd: Double,
    val text: String
)

data class Skipped(
    val isbn: String,
    val title: String,
    val bestOfferUsd: Double,
    val why: String
)

data class PackResult(
    val bins: List<Bin>,
    val grossUsd: Double,
    val costUsd: Double,
    val frictionUsd: Double,
    val netUsd: Double,
    val skipped: List<Skipped>,
    val hints: List<PackHint>,
    val modelled: Boolean = true
)
