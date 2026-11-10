package com.example.spineroute.data.model

data class Region(
    val id: String,
    val name: String,
    val blurb: String,
    val neighborhoods: List<String>,
    val featured: List<String>,
    val denver: Boolean
)

object RegionsData {
    val allRegions = listOf(
        Region(
            id = "all",
            name = "All of Denver",
            blurb = "All mapped micro-exchange book boxes and mutual aid pins.",
            neighborhoods = emptyList(),
            featured = listOf("360 Franklin St", "Nancy's Book Nook", "Lowry Trail"),
            denver = true
        ),
        Region(
            id = "central",
            name = "Central & Historic",
            blurb = "The densest corridor. Book boxes built into front-yard fences and garden walls.",
            neighborhoods = listOf("capitol hill", "cheesman park", "cheeseman park", "congress park", "uptown", "city park", "city park west", "country club", "alamo placita", "speer", "whittier", "five points", "baker"),
            featured = listOf("360 Franklin St", "Nancy's Book Nook · 12th & Corona", "Little Free Library #19509 · 2351 N Ogden"),
            denver = true
        ),
        Region(
            id = "northwest",
            name = "Northwest & West",
            blurb = "Pedestrian traffic along W 32nd, W 38th, and the Santa Fe art district.",
            neighborhoods = listOf("highland", "west highland", "sunnyside", "berkeley", "jefferson park", "lincoln park", "la alma", "chaffee park", "west colfax"),
            featured = listOf("Lipan St. Little Free Library · 1435 Lipan", "Seventh Circle Community Fridge · 2935 W 7th"),
            denver = true
        ),
        Region(
            id = "southeast",
            name = "South & Southeast",
            blurb = "Suburban-urban walking grid with active neighborhood associations.",
            neighborhoods = listOf("washington park", "platt park", "rosedale", "university", "cory-merrill", "observatory park", "university hills", "virginia village"),
            featured = listOf("Williams Little Free Library · 1838 S Williams", "Platt Park Little Free Pantry · 1601 S Clarkson"),
            denver = true
        ),
        Region(
            id = "northeast",
            name = "East & Northeast",
            blurb = "Planned communities woven into greenways, pocket parks, and trail loops.",
            neighborhoods = listOf("park hill", "lowry", "central park", "stapleton", "montbello", "green valley ranch", "gateway", "northeast park hill"),
            featured = listOf("Lowry Little Free Library Trail", "Park Hill grid · 16th–26th between York and Quebec"),
            denver = true
        ),
        Region(
            id = "southwest",
            name = "Southwest",
            blurb = "Gathering spots, school zones, and mutual-aid hubs rather than lawn boxes.",
            neighborhoods = listOf("westwood", "mar lee", "harvey park", "athmar park", "valverde", "barnum", "ruby hill"),
            featured = listOf("Denver Dream Center Pantry · 2758 Welton", "Re:Vision Community Hub · 3800 Morrison"),
            denver = true
        ),
        Region(
            id = "metro",
            name = "Denver Metro",
            blurb = "Outside city/county line (Aurora, Lakewood, Golden). Kept out of default route.",
            neighborhoods = listOf("aurora", "lakewood", "westminster", "golden", "edgewater", "wheat ridge", "denver metro", "thornton", "arvada", "littleton", "englewood", "commerce city", "northglenn", "centennial", "greenwood village"),
            featured = emptyList(),
            denver = false
        )
    )

    fun regionOf(neighborhood: String): Region? {
        val key = neighborhood.trim().lowercase()
        return allRegions.find { r -> r.neighborhoods.any { n -> key.contains(n) || n.contains(key) } }
    }

    fun regionIdOf(neighborhood: String): String {
        return regionOf(neighborhood)?.id ?: "central"
    }

    fun filterStops(stops: List<Stop>, regionId: String): List<Stop> {
        if (regionId == "all") return stops
        if (regionId == "denver") return stops.filter { regionOf(it.neighborhood)?.denver != false }
        return stops.filter { regionIdOf(it.neighborhood) == regionId }
    }
}
