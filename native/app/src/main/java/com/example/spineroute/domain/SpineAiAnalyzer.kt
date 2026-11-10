package com.example.spineroute.domain

import com.example.spineroute.data.model.BookLane
import com.example.spineroute.data.model.BooksData
import com.example.spineroute.data.model.BuyersData
import com.example.spineroute.data.model.Condition
import com.example.spineroute.data.model.DemandBook
import com.example.spineroute.data.model.DetectedSpine
import com.example.spineroute.data.model.NormalizedRect
import com.example.spineroute.data.model.QuoteBook
import java.util.Locale
import kotlin.math.max

object SpineAiAnalyzer {

    fun matchCatalogBook(text: String): Pair<DemandBook?, Float> {
        val normalized = text.uppercase(Locale.US)
        var bestBook: DemandBook? = null
        var highestScore = 0f

        for (book in BooksData.catalog) {
            val titleTokens = book.title.uppercase(Locale.US).split(" ", ":", "(", ")", "-").filter { it.length > 2 }
            val authorTokens = book.author.uppercase(Locale.US).split(" ", ",", ".").filter { it.length > 2 }

            var matchedTokens = 0
            for (token in titleTokens) {
                if (normalized.contains(token)) {
                    matchedTokens += 2
                }
            }
            for (token in authorTokens) {
                if (normalized.contains(token)) {
                    matchedTokens += 1
                }
            }

            val maxPossible = (titleTokens.size * 2) + authorTokens.size
            val score = if (maxPossible > 0) (matchedTokens.toFloat() / maxPossible).coerceIn(0f, 1f) else 0f

            if (score > highestScore && score >= 0.32f) {
                highestScore = score
                bestBook = book
            }
        }

        return Pair(bestBook, highestScore)
    }

    private fun detectCategory(title: String, author: String, lane: BookLane): String {
        val t = title.uppercase(Locale.US)
        return when {
            t.contains("CHEMISTRY") || t.contains("BIOLOGY") || t.contains("PHYSICS") || t.contains("DSM") || t.contains("ANATOMY") -> "STEM & Academic"
            t.contains("COLORADO") || t.contains("DENVER") || t.contains("ROCKY MOUNTAIN") || t.contains("WEST") -> "CO Regional History"
            t.contains("DUNE") || t.contains("TOLKIEN") || t.contains("RINGS") || t.contains("DRAGONS") || t.contains("HAIL MARY") || t.contains("FOUNDATION") -> "Sci-Fi & Fantasy"
            t.contains("PRIDE") || t.contains("GATSBY") || t.contains("ORWELL") || t.contains("KING") || t.contains("HEMINGWAY") -> "Collectible Fiction"
            lane == BookLane.TEXTBOOK -> "Higher Ed & Reference"
            else -> "Contemporary Trade"
        }
    }

    fun analyzeExtractedText(
        rawText: String,
        rect: NormalizedRect,
        condition: Condition = Condition.GOOD
    ): DetectedSpine {
        val lines = rawText.lines().map { it.trim() }.filter { it.isNotBlank() }
        val candidateTitle = lines.firstOrNull { it.length > 3 } ?: rawText.take(30)
        val (matchedBook, confidence) = matchCatalogBook(rawText)

        val title = matchedBook?.title ?: candidateTitle.replace("\n", " ")
        val author = matchedBook?.author ?: lines.getOrNull(1) ?: "Unknown"
        val isbn = matchedBook?.isbn13 ?: "978" + (1000000000L..9999999999L).random()
        val lane = matchedBook?.lane ?: if (title.contains("Chemistry", true) ||
            title.contains("Biology", true) ||
            title.contains("Manual", true) ||
            title.contains("Science", true) ||
            title.contains("Anatomy", true)
        ) BookLane.TEXTBOOK else BookLane.TRADE

        val priorUsd = matchedBook?.expectedUsd ?: if (lane == BookLane.TEXTBOOK) 45.0 else 6.50
        val quoteBook = QuoteBook(isbn, title, priorUsd, lane, condition)
        val quotes = ShelfJudge.quoteBook(quoteBook)
        val bestQuote = quotes.maxByOrNull { it.offerUsd }
        val bestOffer = bestQuote?.offerUsd ?: 0.0
        val bestBuyerName = BuyersData.getById(bestQuote?.buyerId ?: "")?.name ?: "Market Desk"
        val category = detectCategory(title, author, lane)

        // Swap optimization: if book has > $8 offer, suggest swapping out an inexpensive trade paperback
        val swapRecommended = bestOffer >= 8.0
        val swapSuggestion = if (swapRecommended) "Leave: 'Standard Mass Market PB' (~$1.00) -> Take: '$title' (+$${"%.2f".format(bestOffer)})" else ""

        return DetectedSpine(
            id = "spine_${isbn}_${System.currentTimeMillis() % 10000}",
            rawText = rawText,
            cleanedTitle = title,
            matchedAuthor = author,
            matchedIsbn = isbn,
            confidence = if (matchedBook != null) max(confidence, 0.78f) else 0.55f,
            boundingBox = rect,
            estimatedValue = bestOffer,
            lane = lane,
            condition = condition,
            quotes = quotes,
            isCatalogMatch = matchedBook != null,
            bestBuyerId = bestQuote?.buyerId ?: "booksrun",
            bestBuyerName = bestBuyerName,
            categoryTag = category,
            swapRecommended = swapRecommended,
            swapSuggestedTitle = swapSuggestion
        )
    }

    /**
     * Preset simulated shelf captures with real photographic coordinates
     * covering University STEM, Denver Regional/Sci-Fi, and Neighborhood LFL Lawn Boxes.
     */
    fun getPresetShelf(shelfId: Int, condition: Condition = Condition.GOOD): List<DetectedSpine> {
        return when (shelfId) {
            1 -> listOf(
                // STEM University Shelf
                analyzeExtractedText(
                    rawText = "ORGANIC CHEMISTRY THIRD EDITION DAVID R. KLEIN WILEY",
                    rect = NormalizedRect(0.08f, 0.15f, 0.22f, 0.82f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "GRAY'S ANATOMY FOR STUDENTS DRAKE VOGL MITCHELL ELSEVIER",
                    rect = NormalizedRect(0.24f, 0.12f, 0.40f, 0.85f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "CAMPBELL BIOLOGY ELEVENTH EDITION URRY CAIN WASSERMAN PEARSON",
                    rect = NormalizedRect(0.42f, 0.10f, 0.60f, 0.88f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "DIAGNOSTIC AND STATISTICAL MANUAL OF MENTAL DISORDERS DSM-5 APA",
                    rect = NormalizedRect(0.62f, 0.18f, 0.78f, 0.80f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "PHYSICS FOR SCIENTISTS AND ENGINEERS KNIGHT 4TH ED",
                    rect = NormalizedRect(0.80f, 0.16f, 0.94f, 0.83f),
                    condition = condition
                )
            )
            2 -> listOf(
                // Fiction & Popular Literature Shelf
                analyzeExtractedText(
                    rawText = "THE LORD OF THE RINGS J.R.R. TOLKIEN COLLECTOR'S HARDCOVER",
                    rect = NormalizedRect(0.10f, 0.18f, 0.28f, 0.82f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "A DANCE WITH DRAGONS GEORGE R. R. MARTIN BANTAM",
                    rect = NormalizedRect(0.30f, 0.20f, 0.48f, 0.80f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "SAPIENS A BRIEF HISTORY OF HUMANKIND YUVAL NOAH HARARI",
                    rect = NormalizedRect(0.50f, 0.22f, 0.68f, 0.78f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "PROJECT HAIL MARY ANDY WEIR BALLANTINE",
                    rect = NormalizedRect(0.70f, 0.21f, 0.88f, 0.79f),
                    condition = condition
                )
            )
            3 -> listOf(
                // Denver Regional & Rocky Mountain Classics
                analyzeExtractedText(
                    rawText = "DENVER A MILE HIGH HISTORY COLORADO MOUNTAIN CLUB",
                    rect = NormalizedRect(0.10f, 0.18f, 0.26f, 0.82f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "PRIDE AND PREJUDICE JANE AUSTEN PENGUIN CLASSICS",
                    rect = NormalizedRect(0.28f, 0.16f, 0.44f, 0.84f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "THE GREAT GATSBY F. SCOTT FITZGERALD SCRIBNER",
                    rect = NormalizedRect(0.46f, 0.19f, 0.64f, 0.81f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "ORGANIC CHEMISTRY DAVID KLEIN WILEY",
                    rect = NormalizedRect(0.66f, 0.14f, 0.88f, 0.86f),
                    condition = condition
                )
            )
            else -> listOf(
                // Mixed Neighborhood Lawn Box Shelf
                analyzeExtractedText(
                    rawText = "IT STEPHEN KING SCRIBNER FICTION",
                    rect = NormalizedRect(0.12f, 0.20f, 0.32f, 0.80f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "ORGANIC CHEMISTRY KLEIN",
                    rect = NormalizedRect(0.34f, 0.15f, 0.52f, 0.84f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "THE HOBBIT TOLKIEN",
                    rect = NormalizedRect(0.54f, 0.22f, 0.72f, 0.78f),
                    condition = condition
                ),
                analyzeExtractedText(
                    rawText = "WHERE THE CRAWDADS SING DELIA OWENS",
                    rect = NormalizedRect(0.74f, 0.20f, 0.90f, 0.80f),
                    condition = condition
                )
            )
        }
    }
}
