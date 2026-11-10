package com.example.spineroute.data.model

data class QAgent(
    val weights: List<Double>,
    val episodes: Int = 0,
    val steps: Int = 0,
    val avgReward: Double = 0.0,
    val eps: Double = 0.15
)

data class PolicyRow(
    val label: String,
    val action: String
)

data class Payout(
    val id: String,
    val at: Long,
    val isbn: String,
    val title: String,
    val usd: Double,
    val buyerId: String,
    val accepted: Boolean,
    val stopId: String,
    val miles: Double = 0.0
)

data class BoxMemory(
    val visits: Int = 0,
    val reward: Double = 0.0,
    val lastAt: Long = 0L
)

data class DeskCalibrationRow(
    val buyerId: String,
    val buyerName: String,
    val priorRate: Double,
    val adjustedRate: Double,
    val observations: Int
)
