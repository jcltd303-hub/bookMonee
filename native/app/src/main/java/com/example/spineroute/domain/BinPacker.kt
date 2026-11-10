package com.example.spineroute.domain

import com.example.spineroute.data.model.Bin
import com.example.spineroute.data.model.BuyersData
import com.example.spineroute.data.model.DeskItem
import com.example.spineroute.data.model.PackHint
import com.example.spineroute.data.model.PackResult
import com.example.spineroute.data.model.UNIT_COST_USD

object BinPacker {

    fun packBins(stagedMap: Map<String, List<DeskItem>>): PackResult {
        val bins = mutableListOf<Bin>()
        var grossTotal = 0.0
        var costTotal = 0.0
        var frictionTotal = 0.0
        val hints = mutableListOf<PackHint>()

        for (buyer in BuyersData.allBuyers) {
            val items = stagedMap[buyer.id] ?: emptyList()
            if (items.isEmpty()) continue

            val stagedUsd = GeoUtils.roundCents(items.sumOf { it.offerUsd })
            val clearsThreshold = stagedUsd >= buyer.thresholdUsd
            val costUsd = GeoUtils.roundCents(items.size * UNIT_COST_USD)
            val frictionUsd = if (clearsThreshold) buyer.frictionUsd else 0.0
            val netUsd = GeoUtils.roundCents(stagedUsd - costUsd - frictionUsd)
            val gapUsd = GeoUtils.roundCents((buyer.thresholdUsd - stagedUsd).coerceAtLeast(0.0))

            val bin = Bin(
                buyerId = buyer.id,
                buyerName = buyer.name,
                items = items,
                stagedUsd = stagedUsd,
                thresholdUsd = buyer.thresholdUsd,
                costUsd = costUsd,
                frictionUsd = frictionUsd,
                netUsd = netUsd,
                clearsThreshold = clearsThreshold,
                gapUsd = gapUsd
            )
            bins.add(bin)

            grossTotal += stagedUsd
            costTotal += costUsd
            frictionTotal += frictionUsd

            if (!clearsThreshold && gapUsd > 0) {
                hints.add(
                    PackHint(
                        buyerId = buyer.id,
                        buyerName = buyer.name,
                        needUsd = gapUsd,
                        text = "Need ${GeoUtils.formatUsd(gapUsd)} more to clear ${buyer.name} prepaid USPS label ($${buyer.thresholdUsd} min)"
                    )
                )
            }
        }

        val netTotal = GeoUtils.roundCents(grossTotal - costTotal - frictionTotal)

        return PackResult(
            bins = bins,
            grossUsd = GeoUtils.roundCents(grossTotal),
            costUsd = GeoUtils.roundCents(costTotal),
            frictionUsd = GeoUtils.roundCents(frictionTotal),
            netUsd = netTotal,
            skipped = emptyList(),
            hints = hints
        )
    }
}
