package com.example.spineroute.data.model

data class NormalizedRect(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float
) {
    val width: Float get() = (right - left).coerceAtLeast(0.01f)
    val height: Float get() = (bottom - top).coerceAtLeast(0.01f)
    val centerX: Float get() = (left + right) / 2f
    val centerY: Float get() = (top + bottom) / 2f
}

data class DetectedSpine(
    val id: String,
    val rawText: String,
    val cleanedTitle: String,
    val matchedAuthor: String,
    val matchedIsbn: String,
    val confidence: Float,
    val boundingBox: NormalizedRect,
    val estimatedValue: Double,
    val lane: BookLane,
    val condition: Condition = Condition.GOOD,
    val quotes: List<BuyerQuote> = emptyList(),
    val isCatalogMatch: Boolean = false,
    val isStaged: Boolean = false,
    val timestamp: Long = System.currentTimeMillis(),
    val bestBuyerId: String = "",
    val bestBuyerName: String = "",
    val categoryTag: String = "General Trade",
    val swapRecommended: Boolean = false,
    val swapSuggestedTitle: String = ""
)
