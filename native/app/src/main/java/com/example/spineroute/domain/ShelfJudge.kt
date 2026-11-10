package com.example.spineroute.domain

import com.example.spineroute.data.model.BookLane
import com.example.spineroute.data.model.BooksData
import com.example.spineroute.data.model.BuyerQuote
import com.example.spineroute.data.model.BuyersData
import com.example.spineroute.data.model.Condition
import com.example.spineroute.data.model.Judgement
import com.example.spineroute.data.model.QuoteBook
import com.example.spineroute.data.model.UNIT_COST_USD

object ShelfJudge {

    fun quoteBook(book: QuoteBook, stagedByBuyer: Map<String, Double> = emptyMap()): List<BuyerQuote> {
        return BuyersData.allBuyers.map { buyer ->
            val fit = if (book.lane == BookLane.TEXTBOOK) buyer.textbookFit else buyer.tradeFit
            val rawOffer = book.demandUsd * buyer.payRate * fit * book.condition.multiplier
            val offer = if (rawOffer >= buyer.floorUsd) GeoUtils.roundCents(rawOffer) else 0.0

            val currentStaged = stagedByBuyer[buyer.id] ?: 0.0
            val newStaged = currentStaged + offer
            val gap = (buyer.thresholdUsd - newStaged).coerceAtLeast(0.0)
            val net = GeoUtils.roundCents(offer - UNIT_COST_USD)

            BuyerQuote(
                buyerId = buyer.id,
                buyerName = buyer.name,
                offerUsd = offer,
                thresholdUsd = buyer.thresholdUsd,
                stagedUsd = GeoUtils.roundCents(newStaged),
                gapUsd = GeoUtils.roundCents(gap),
                netUsd = net,
                modelled = true
            )
        }
    }

    fun judgeBook(
        isbn: String,
        title: String,
        author: String,
        condition: Condition,
        leavesLeft: Int,
        stagedByBuyer: Map<String, Double> = emptyMap()
    ): Judgement {
        val cleanIsbn = GeoUtils.cleanIsbn(isbn)
        val known = BooksData.findByIsbn(cleanIsbn)

        val priorUsd = known?.expectedUsd ?: if (title.contains("Chemistry", ignoreCase = true) ||
            title.contains("Physics", ignoreCase = true) ||
            title.contains("Biology", ignoreCase = true) ||
            title.contains("Anatomy", ignoreCase = true) ||
            title.contains("Edition", ignoreCase = true)
        ) 45.0 else 6.0

        val lane = known?.lane ?: if (priorUsd > 20.0) BookLane.TEXTBOOK else BookLane.TRADE
        val quoteBook = QuoteBook(
            isbn = cleanIsbn,
            title = title.ifBlank { known?.title ?: "Book ($cleanIsbn)" },
            demandUsd = priorUsd,
            lane = lane,
            condition = condition
        )

        val quotes = quoteBook(quoteBook, stagedByBuyer)
        val bestQuote = quotes.maxByOrNull { it.offerUsd }
        val bestOffer = bestQuote?.offerUsd ?: 0.0

        val decision: String
        val reason: String

        if (leavesLeft <= 0) {
            decision = "leave"
            reason = "No replacement stock left in bag to swap honestly."
        } else if (bestOffer >= 3.0) {
            decision = "take"
            reason = "Strong bid of ${GeoUtils.formatUsd(bestOffer)} from ${bestQuote?.buyerName}; clears 99¢ unit cost."
        } else if (bestOffer >= UNIT_COST_USD + 0.50) {
            decision = "take"
            reason = "Covers cost ($0.99) and pads ${bestQuote?.buyerName} bin towards prepaid threshold."
        } else {
            decision = "leave"
            reason = "Offer (${GeoUtils.formatUsd(bestOffer)}) does not beat 99¢ replacement cost plus friction."
        }

        return Judgement(
            isbn = cleanIsbn,
            title = quoteBook.title,
            author = author.ifBlank { known?.author ?: "Unknown Author" },
            subject = known?.subject ?: if (lane == BookLane.TEXTBOOK) "Academic" else "General",
            decision = decision,
            reason = reason,
            scoreUsd = GeoUtils.roundCents(bestOffer - UNIT_COST_USD),
            heuristicUsd = priorUsd,
            priorUsd = priorUsd,
            lane = lane,
            condition = condition,
            lowUsd = known?.lowUsd ?: (priorUsd * 0.4),
            highUsd = known?.highUsd ?: (priorUsd * 1.8),
            checkOrder = known?.checkOrder ?: listOf("booksrun", "worldofbooks", "topdollar"),
            coverUrl = "https://covers.openlibrary.org/b/isbn/$cleanIsbn-M.jpg"
        )
    }
}
