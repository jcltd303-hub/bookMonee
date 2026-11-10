package com.example.spineroute.data.model

enum class DealKind(val label: String) {
    REPLACEMENT("Replacement stock"),
    MAP("Directory maps"),
    BOARD("Marketplace boards")
}

data class Deal(
    val title: String,
    val url: String,
    val source: String,
    val note: String,
    val kind: DealKind
)

object DealsData {
    val standingDeals = listOf(
        Deal(
            title = "BookGive Denver",
            url = "https://littlefreelibrary.org/book-resource/request-books-in-denver/",
            source = "Little Free Library",
            note = "Free replacement stock for Denver boxes. Keep boxes honest by replenishing what you trade.",
            kind = DealKind.REPLACEMENT
        ),
        Deal(
            title = "Official Charter Map",
            url = "https://littlefreelibrary.org/map/",
            source = "Little Free Library",
            note = "Search Denver ZIPs 80202–80249 for registered boxes that are not yet on OpenStreetMap.",
            kind = DealKind.MAP
        ),
        Deal(
            title = "Little Free Pantry Map",
            url = "https://mapping.littlefreepantry.org/",
            source = "Little Free Pantry",
            note = "Grassroots food and pantry boxes. Mutual aid hubs for sharing essential non-perishables.",
            kind = DealKind.MAP
        ),
        Deal(
            title = "Denver Community Fridges",
            url = "https://denvercommunityfridges.com/locations/",
            source = "Denver Community Fridges",
            note = "Public-access community fridges and mutual-aid pantries operating 24/7 across the metro.",
            kind = DealKind.MAP
        ),
        Deal(
            title = "Denver Craigslist Books",
            url = "https://denver.craigslist.org/search/bks",
            source = "Craigslist Denver",
            note = "Library sales, estate box lots, and bulk paperbacks for maintaining box inventory.",
            kind = DealKind.BOARD
        ),
        Deal(
            title = "BookScouter Comparison",
            url = "https://bookscouter.com/",
            source = "BookScouter",
            note = "Multi-vendor quote comparator. Always verify real quotes before dropping off buyback packages.",
            kind = DealKind.BOARD
        )
    )

    fun getByKind(kind: DealKind): List<Deal> = standingDeals.filter { it.kind == kind }
}
