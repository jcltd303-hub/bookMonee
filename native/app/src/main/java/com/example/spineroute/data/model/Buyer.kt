package com.example.spineroute.data.model

data class Buyer(
    val id: String,
    val name: String,
    val thresholdUsd: Double,
    val payRate: Double,
    val textbookFit: Double,
    val tradeFit: Double,
    val floorUsd: Double,
    val frictionUsd: Double,
    val bestAt: String,
    val prepaid: String,
    val payment: String,
    val speed: String,
    val minimum: String,
    val trust: String,
    val url: String
)

data class BuyerQuote(
    val buyerId: String,
    val buyerName: String,
    val offerUsd: Double,
    val thresholdUsd: Double,
    val stagedUsd: Double,
    val gapUsd: Double,
    val netUsd: Double,
    val modelled: Boolean = true
)

object BuyersData {
    val allBuyers = listOf(
        Buyer(
            id = "booksrun",
            name = "BooksRun",
            thresholdUsd = 7.50,
            payRate = 0.55,
            textbookFit = 1.25,
            tradeFit = 0.8,
            floorUsd = 0.25,
            frictionUsd = 2.60,
            bestAt = "Textbooks and technical books. High win rate on course editions.",
            prepaid = "Prepaid USPS label once the order clears $7.50",
            payment = "PayPal, bank transfer, or check",
            speed = "After warehouse check. PayPal is fastest.",
            minimum = "$7.50",
            trust = "Trustpilot ~4.5. Fast automated label generation.",
            url = "https://booksrun.com/"
        ),
        Buyer(
            id = "worldofbooks",
            name = "World of Books",
            thresholdUsd = 9.00,
            payRate = 0.32,
            textbookFit = 0.55,
            tradeFit = 1.2,
            floorUsd = 0.20,
            frictionUsd = 2.20,
            bestAt = "Trade nonfiction they are short on. Weak on textbooks.",
            prepaid = "Prepaid label, usually after a few books ($9 min)",
            payment = "PayPal or ACH",
            speed = "About 2–3 days after processing.",
            minimum = "Often 2–3 books (~$9)",
            trust = "Long-running high volume book merchant.",
            url = "https://sell.worldofbooks.com/"
        ),
        Buyer(
            id = "topdollar",
            name = "TopDollar4Books",
            thresholdUsd = 0.0,
            payRate = 0.24,
            textbookFit = 0.7,
            tradeFit = 1.0,
            floorUsd = 0.15,
            frictionUsd = 1.40,
            bestAt = "Small stacks that miss other minimums. No order minimum.",
            prepaid = "Prepaid label with no published order minimum",
            payment = "PayPal or check",
            speed = "Claimed within ~36 hours of drop-off inspection.",
            minimum = "None published",
            trust = "Dependable secondary desk for clearing loose stock.",
            url = "https://www.topdollar4books.com/"
        ),
        Buyer(
            id = "valore",
            name = "Valore",
            thresholdUsd = 10.00,
            payRate = 0.48,
            textbookFit = 1.35,
            tradeFit = 0.6,
            floorUsd = 0.30,
            frictionUsd = 3.00,
            bestAt = "Current-edition textbooks. Strong competitive quotes.",
            prepaid = "Prepaid label on accepted buyback orders ($10 min)",
            payment = "Direct deposit or check",
            speed = "After warehouse check.",
            minimum = "$10.00",
            trust = "Established national collegiate textbook desk.",
            url = "https://www.valore.com/"
        ),
        Buyer(
            id = "textbookrush",
            name = "TextbookRush",
            thresholdUsd = 12.00,
            payRate = 0.42,
            textbookFit = 1.3,
            tradeFit = 0.6,
            floorUsd = 0.30,
            frictionUsd = 3.00,
            bestAt = "Course books, study guides, and STEM manuals.",
            prepaid = "Prepaid label on qualifying buyback orders ($12 min)",
            payment = "PayPal or check after acceptance",
            speed = "After receipt and grade check.",
            minimum = "$12.00",
            trust = "Long-running specialist textbook buyback firm.",
            url = "https://www.textbookrush.com/"
        )
    )

    fun getById(id: String): Buyer? = allBuyers.find { it.id == id }
    fun getName(id: String): String = getById(id)?.name ?: id
    fun comparatorUrl(isbn: String): String = "https://bookscouter.com/book/$isbn"
}
