package com.example.spineroute.domain

import com.example.spineroute.data.model.BoxMemory
import com.example.spineroute.data.model.LatLng
import com.example.spineroute.data.model.PlannedLeg
import com.example.spineroute.data.model.Stop

object RoutePlanner {
    private const val COST_PER_MILE = 0.25
    private const val BASE_EXPECTED_USD_PER_BOX = 4.20

    fun nearestStops(from: LatLng, limit: Int, pool: List<Stop>): List<PlannedLeg> {
        return pool.map { stop ->
            val dist = GeoUtils.distanceMiles(from, LatLng(stop.lat, stop.lon))
            PlannedLeg(
                stop = stop,
                miles = GeoUtils.roundCents(dist),
                heuristicUsd = BASE_EXPECTED_USD_PER_BOX,
                residual = 0.0,
                scoreUsd = GeoUtils.roundCents(BASE_EXPECTED_USD_PER_BOX - dist * COST_PER_MILE)
            )
        }.sortedBy { it.miles }.take(limit)
    }

    fun planLoop(
        start: LatLng,
        maxStops: Int,
        mileBudget: Double,
        memory: Map<String, BoxMemory>,
        pool: List<Stop>
    ): List<PlannedLeg> {
        val eligible = pool.filter { it.profitEligible }
        if (eligible.isEmpty()) return emptyList()

        val route = mutableListOf<PlannedLeg>()
        var currentPoint = start
        var accumulatedMiles = 0.0
        val remaining = eligible.toMutableList()

        while (route.size < maxStops && remaining.isNotEmpty()) {
            val candidates = remaining.map { stop ->
                val dist = GeoUtils.distanceMiles(currentPoint, LatLng(stop.lat, stop.lon))
                val returnDist = GeoUtils.distanceMiles(LatLng(stop.lat, stop.lon), start)
                val totalIfAdded = accumulatedMiles + dist + returnDist
                val pastMemory = memory[stop.id]
                val pastBonus = if (pastMemory != null && pastMemory.visits > 0) {
                    (pastMemory.reward / pastMemory.visits).coerceIn(0.0, 5.0)
                } else 0.0

                val expectedValue = BASE_EXPECTED_USD_PER_BOX + pastBonus
                val netScore = expectedValue - (dist * COST_PER_MILE)

                Triple(stop, dist, netScore) to totalIfAdded
            }

            // Filter by budget
            val viable = candidates.filter { it.second <= mileBudget }
            if (viable.isEmpty()) break

            // Pick highest net score
            val best = viable.maxByOrNull { it.first.third } ?: break
            val chosenStop = best.first.first
            val hopDist = best.first.second
            val netScore = best.first.third

            route.add(
                PlannedLeg(
                    stop = chosenStop,
                    miles = GeoUtils.roundCents(hopDist),
                    heuristicUsd = BASE_EXPECTED_USD_PER_BOX,
                    residual = 0.0,
                    scoreUsd = GeoUtils.roundCents(netScore),
                    features = listOf(hopDist, netScore)
                )
            )

            accumulatedMiles += hopDist
            currentPoint = LatLng(chosenStop.lat, chosenStop.lon)
            remaining.remove(chosenStop)
        }

        return route
    }
}
