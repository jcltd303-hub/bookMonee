package com.example.spineroute.data.model

enum class Condition(val label: String, val multiplier: Double) {
    GOOD("Good", 1.0),
    FAIR("Fair", 0.70),
    POOR("Poor", 0.35)
}

enum class BookLane(val label: String) {
    TEXTBOOK("Textbook"),
    TRADE("Trade")
}

data class DemandBook(
    val isbn13: String,
    val title: String,
    val author: String,
    val subject: String,
    val lane: BookLane,
    val expectedUsd: Double,
    val lowUsd: Double,
    val highUsd: Double,
    val checkOrder: List<String>,
    val rank: Int = 1,
    val note: String = ""
)

data class QuoteBook(
    val isbn: String,
    val title: String,
    val demandUsd: Double,
    val lane: BookLane,
    val condition: Condition
)

data class Judgement(
    val isbn: String,
    val title: String,
    val author: String,
    val subject: String,
    val decision: String, // "take" or "leave"
    val reason: String,
    val scoreUsd: Double,
    val heuristicUsd: Double,
    val priorUsd: Double,
    val lane: BookLane,
    val condition: Condition,
    val lowUsd: Double,
    val highUsd: Double,
    val checkOrder: List<String>,
    val coverUrl: String = ""
)

object BooksData {
    val catalog = listOf(
        DemandBook(
            isbn13 = "9781119659587",
            title = "Organic Chemistry (3rd Edition)",
            author = "David R. Klein",
            subject = "Chemistry",
            lane = BookLane.TEXTBOOK,
            expectedUsd = 78.0,
            lowUsd = 30.0,
            highUsd = 160.0,
            checkOrder = listOf("booksrun", "valore", "textbookrush", "worldofbooks", "topdollar"),
            rank = 1,
            note = "High collegiate demand across Denver area universities."
        ),
        DemandBook(
            isbn13 = "9780443069529",
            title = "Gray's Anatomy for Students",
            author = "Richard L. Drake Ph.D.",
            subject = "Medicine",
            lane = BookLane.TEXTBOOK,
            expectedUsd = 70.0,
            lowUsd = 25.0,
            highUsd = 140.0,
            checkOrder = listOf("booksrun", "valore", "textbookrush", "worldofbooks", "topdollar"),
            rank = 2,
            note = "Classic medical textbook with consistent semester buyback bids."
        ),
        DemandBook(
            isbn13 = "9780134093413",
            title = "Campbell Biology (11th Edition)",
            author = "Lisa A. Urry et al.",
            subject = "Biology",
            lane = BookLane.TEXTBOOK,
            expectedUsd = 55.0,
            lowUsd = 20.0,
            highUsd = 110.0,
            checkOrder = listOf("booksrun", "valore", "textbookrush", "topdollar"),
            rank = 3,
            note = "Standard intro STEM book; high volume demand."
        ),
        DemandBook(
            isbn13 = "9780890425558",
            title = "Diagnostic and Statistical Manual (DSM-5)",
            author = "American Psychiatric Association",
            subject = "Psychology",
            lane = BookLane.TEXTBOOK,
            expectedUsd = 62.0,
            lowUsd = 22.0,
            highUsd = 125.0,
            checkOrder = listOf("booksrun", "valore", "textbookrush"),
            rank = 4,
            note = "Psychology standard reference."
        ),
        DemandBook(
            isbn13 = "9780321752949",
            title = "Physics for Scientists and Engineers",
            author = "Randall D. Knight",
            subject = "Physics",
            lane = BookLane.TEXTBOOK,
            expectedUsd = 48.0,
            lowUsd = 15.0,
            highUsd = 95.0,
            checkOrder = listOf("booksrun", "valore", "textbookrush"),
            rank = 5,
            note = "Engineering physics requirement."
        ),
        DemandBook(
            isbn13 = "9780385534246",
            title = "A Dance with Dragons",
            author = "George R. R. Martin",
            subject = "Fantasy",
            lane = BookLane.TRADE,
            expectedUsd = 6.50,
            lowUsd = 1.50,
            highUsd = 14.0,
            checkOrder = listOf("worldofbooks", "topdollar", "booksrun"),
            rank = 6,
            note = "Popular fantasy hardcover, good gap filler."
        ),
        DemandBook(
            isbn13 = "9780544003415",
            title = "The Lord of the Rings Collector's Edition",
            author = "J.R.R. Tolkien",
            subject = "Fiction",
            lane = BookLane.TRADE,
            expectedUsd = 18.0,
            lowUsd = 4.0,
            highUsd = 35.0,
            checkOrder = listOf("worldofbooks", "topdollar"),
            rank = 7,
            note = "Solid trade demand; clears packaging friction easily."
        ),
        DemandBook(
            isbn13 = "9781501110368",
            title = "It: A Novel",
            author = "Stephen King",
            subject = "Horror",
            lane = BookLane.TRADE,
            expectedUsd = 5.00,
            lowUsd = 1.00,
            highUsd = 11.0,
            checkOrder = listOf("worldofbooks", "topdollar"),
            rank = 8,
            note = "Trade fiction paperback."
        ),
        DemandBook(
            isbn13 = "9780062316097",
            title = "Sapiens: A Brief History of Humankind",
            author = "Yuval Noah Harari",
            subject = "History",
            lane = BookLane.TRADE,
            expectedUsd = 7.00,
            lowUsd = 2.00,
            highUsd = 14.0,
            checkOrder = listOf("worldofbooks", "booksrun", "topdollar"),
            rank = 9,
            note = "Trade non-fiction paperback."
        ),
        DemandBook(
            isbn13 = "9780593135204",
            title = "Project Hail Mary",
            author = "Andy Weir",
            subject = "Sci-Fi",
            lane = BookLane.TRADE,
            expectedUsd = 8.50,
            lowUsd = 2.50,
            highUsd = 16.0,
            checkOrder = listOf("worldofbooks", "topdollar", "booksrun"),
            rank = 10,
            note = "Contemporary sci-fi best seller."
        )
    )

    fun findByIsbn(isbn: String): DemandBook? {
        val clean = isbn.replace("-", "").trim()
        return catalog.find { it.isbn13.replace("-", "") == clean }
    }
}
