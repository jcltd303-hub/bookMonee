package com.example.spineroute.domain

import com.example.spineroute.data.model.PolicyRow
import com.example.spineroute.data.model.QAgent
import kotlin.random.Random

object QTrader {
    const val ACTION_SKIP = 0
    const val ACTION_STAGE = 1
    const val ACTION_SHIP = 2

    fun defaultAgent(): QAgent {
        return QAgent(
            weights = listOf(0.45, 0.82, -0.65, 0.38, 0.75, 0.52),
            episodes = 400,
            steps = 1200,
            avgReward = 2.45,
            eps = 0.08
        )
    }

    fun trainSimulated(agent: QAgent, additionalEpisodes: Int): QAgent {
        val newWeights = agent.weights.toMutableList()
        var currentAvg = agent.avgReward
        val rnd = Random(System.currentTimeMillis())

        for (i in 0 until additionalEpisodes) {
            val margin = rnd.nextDouble(0.5, 12.0)
            val thresholdGap = rnd.nextDouble(0.0, 10.0)
            val reward = if (margin > 3.0 && thresholdGap < 4.0) {
                margin - 0.99
            } else if (margin > 1.2) {
                0.50
            } else {
                -0.20
            }

            // Simple gradient step simulation
            for (w in newWeights.indices) {
                newWeights[w] += (reward * 0.001) - (newWeights[w] * 0.0001)
            }
            currentAvg = currentAvg * 0.95 + reward * 0.05
        }

        val totalEpisodes = agent.episodes + additionalEpisodes
        val newEps = (agent.eps * 0.98).coerceAtLeast(0.02)

        return QAgent(
            weights = newWeights,
            episodes = totalEpisodes,
            steps = agent.steps + (additionalEpisodes * 3),
            avgReward = GeoUtils.roundCents(currentAvg),
            eps = newEps
        )
    }

    fun evaluatePolicy(agent: QAgent): List<PolicyRow> {
        return listOf(
            PolicyRow(
                label = "High margin textbook ($30+), empty bin",
                action = "STAGE (clear unit cost, anchor new bin)"
            ),
            PolicyRow(
                label = "Trade book ($2.50), bin needs $1.80 to label",
                action = "STAGE (closes prepaid USPS threshold)"
            ),
            PolicyRow(
                label = "Trade book ($1.20), bin already cleared",
                action = "STAGE (pure margin, adds to shipment)"
            ),
            PolicyRow(
                label = "Low bid ($0.60), below 99¢ unit cost",
                action = "SKIP (never stage negative margin)"
            ),
            PolicyRow(
                label = "Bin reaches $10.00+ label threshold",
                action = "SHIP (lock in prepaid label & payout)"
            )
        )
    }
}
