package com.example.spineroute.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.spineroute.data.model.BookLane
import com.example.spineroute.data.model.BooksData
import com.example.spineroute.data.model.BoxMemory
import com.example.spineroute.data.model.BuyerQuote
import com.example.spineroute.data.model.BuyersData
import com.example.spineroute.data.model.CIVIC_CENTER
import com.example.spineroute.data.model.Condition
import com.example.spineroute.data.model.DeskCalibrationRow
import com.example.spineroute.data.model.DeskItem
import com.example.spineroute.data.model.Judgement
import com.example.spineroute.data.model.LatLng
import com.example.spineroute.data.model.LibrariesData
import com.example.spineroute.data.model.PackResult
import com.example.spineroute.data.model.Payout
import com.example.spineroute.data.model.PlannedLeg
import com.example.spineroute.data.model.QAgent
import com.example.spineroute.data.model.QuoteBook
import com.example.spineroute.data.model.Region
import com.example.spineroute.data.model.RegionsData
import com.example.spineroute.data.model.Stop
import com.example.spineroute.data.model.StopKind
import com.example.spineroute.domain.BinPacker
import com.example.spineroute.domain.GeoUtils
import com.example.spineroute.domain.QTrader
import com.example.spineroute.domain.RoutePlanner
import com.example.spineroute.domain.ShelfJudge
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AppTab(val title: String) {
    ROUTE("Route"),
    SCAN("Scan"),
    DESK("Desk"),
    REPLACE("Replace"),
    TRAIN("Train")
}

data class UiState(
    val currentTab: AppTab = AppTab.ROUTE,
    val selectedRegionId: String = "denver",
    val maxStops: Int = 4,
    val mileBudget: Double = 6.0,
    val leaveCount: Int = 2,
    val boxTakes: Int = 0,
    val showMutualAid: Boolean = true,
    val startPoint: LatLng = CIVIC_CENTER,
    val startLabel: String = "Civic Center",
    val route: List<PlannedLeg> = emptyList(),
    val activeStopId: String = "",
    val picks: List<Judgement> = emptyList(),
    val currentQuotes: List<BuyerQuote> = emptyList(),
    val desk: Map<String, List<DeskItem>> = emptyMap(),
    val packResult: PackResult = PackResult(emptyList(), 0.0, 0.0, 0.0, 0.0, emptyList(), emptyList()),
    val qAgent: QAgent = QTrader.defaultAgent(),
    val isTraining: Boolean = false,
    val trainingProgress: Int = 0,
    val memory: Map<String, BoxMemory> = emptyMap(),
    val payouts: List<Payout> = emptyList(),
    val calibration: List<DeskCalibrationRow> = BuyersData.allBuyers.map {
        DeskCalibrationRow(it.id, it.name, it.payRate, it.payRate, 0)
    },
    val scannerCondition: Condition = Condition.GOOD,
    val scanErrorMessage: String? = null
)

class MainViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        // Initial route plan from Civic Center
        planRoute()
        // Pre-populate with a demo pick from high demand catalog
        val initialBook = BooksData.catalog.first()
        val pick = ShelfJudge.judgeBook(
            isbn = initialBook.isbn13,
            title = initialBook.title,
            author = initialBook.author,
            condition = Condition.GOOD,
            leavesLeft = 2
        )
        _uiState.update { state ->
            val picks = listOf(pick)
            val quotes = ShelfJudge.quoteBook(
                QuoteBook(pick.isbn, pick.title, pick.priorUsd, pick.lane, pick.condition)
            )
            state.copy(picks = picks, currentQuotes = quotes)
        }
    }

    fun setTab(tab: AppTab) {
        _uiState.update { it.copy(currentTab = tab) }
    }

    fun setRegion(regionId: String) {
        _uiState.update { it.copy(selectedRegionId = regionId) }
        planRoute()
    }

    fun setMaxStops(count: Int) {
        _uiState.update { it.copy(maxStops = count.coerceIn(1, 8)) }
        planRoute()
    }

    fun setMileBudget(budget: Double) {
        _uiState.update { it.copy(mileBudget = budget.coerceIn(1.0, 15.0)) }
        planRoute()
    }

    fun setLeaveCount(count: Int) {
        _uiState.update { it.copy(leaveCount = count.coerceIn(0, 10)) }
    }

    fun setShowMutualAid(show: Boolean) {
        _uiState.update { it.copy(showMutualAid = show) }
    }

    fun setStartPoint(latLng: LatLng, label: String = "Dropped pin") {
        _uiState.update { it.copy(startPoint = latLng, startLabel = label) }
        planRoute()
    }

    fun selectStop(stopId: String) {
        _uiState.update { it.copy(activeStopId = stopId) }
    }

    fun planRoute() {
        val state = _uiState.value
        val pool = RegionsData.filterStops(LibrariesData.bookcases, state.selectedRegionId)
        val legs = RoutePlanner.planLoop(
            start = state.startPoint,
            maxStops = state.maxStops,
            mileBudget = state.mileBudget,
            memory = state.memory,
            pool = pool
        )
        _uiState.update {
            it.copy(
                route = legs,
                activeStopId = legs.firstOrNull()?.stop?.id ?: (pool.firstOrNull()?.id ?: "")
            )
        }
    }

    fun setCondition(condition: Condition) {
        _uiState.update { it.copy(scannerCondition = condition) }
    }

    fun scanIsbn(isbn: String, manualTitle: String = "", manualAuthor: String = "") {
        val clean = GeoUtils.cleanIsbn(isbn)
        if (!GeoUtils.isValidIsbn10Or13(clean)) {
            _uiState.update { it.copy(scanErrorMessage = "Enter a valid 10 or 13-digit ISBN.") }
            return
        }

        val state = _uiState.value
        val leavesLeft = (state.leaveCount - state.boxTakes).coerceAtLeast(0)
        val stagedByBuyer = state.desk.mapValues { entry -> entry.value.sumOf { it.offerUsd } }

        val judgement = ShelfJudge.judgeBook(
            isbn = clean,
            title = manualTitle,
            author = manualAuthor,
            condition = state.scannerCondition,
            leavesLeft = leavesLeft,
            stagedByBuyer = stagedByBuyer
        )

        val quotes = ShelfJudge.quoteBook(
            QuoteBook(judgement.isbn, judgement.title, judgement.priorUsd, judgement.lane, judgement.condition),
            stagedByBuyer
        )

        _uiState.update { s ->
            val nextPicks = (listOf(judgement) + s.picks.filter { it.isbn != clean }).take(20)
            val nextTakes = if (judgement.decision == "take") s.boxTakes + 1 else s.boxTakes
            s.copy(
                picks = nextPicks,
                currentQuotes = quotes,
                boxTakes = nextTakes,
                scanErrorMessage = null
            )
        }
    }

    fun stagePick(buyerId: String, pick: Judgement) {
        val deskItem = DeskItem(
            isbn = pick.isbn,
            title = pick.title,
            offerUsd = uiState.value.currentQuotes.find { it.buyerId == buyerId }?.offerUsd ?: 2.50,
            demandUsd = pick.priorUsd,
            lane = pick.lane,
            condition = pick.condition
        )
        stageItem(buyerId, deskItem)
    }

    fun stageItem(buyerId: String, item: DeskItem) {
        _uiState.update { state ->
            val currentList = state.desk[buyerId] ?: emptyList()
            if (currentList.any { it.isbn == item.isbn }) return@update state
            val nextDesk = state.desk + (buyerId to (currentList + item))
            val packed = BinPacker.packBins(nextDesk)
            state.copy(desk = nextDesk, packResult = packed)
        }
    }

    fun unstageItem(buyerId: String, isbn: String) {
        _uiState.update { state ->
            val currentList = state.desk[buyerId] ?: emptyList()
            val nextList = currentList.filter { it.isbn != isbn }
            val nextDesk = if (nextList.isEmpty()) {
                state.desk - buyerId
            } else {
                state.desk + (buyerId to nextList)
            }
            val packed = BinPacker.packBins(nextDesk)
            state.copy(desk = nextDesk, packResult = packed)
        }
    }

    fun clearAllBins() {
        _uiState.update {
            it.copy(desk = emptyMap(), packResult = BinPacker.packBins(emptyMap()))
        }
    }

    fun shipBin(buyerId: String) {
        val state = _uiState.value
        val items = state.desk[buyerId] ?: return
        if (items.isEmpty()) return

        val buyer = BuyersData.getById(buyerId)
        val stagedUsd = GeoUtils.roundCents(items.sumOf { it.offerUsd })
        val threshold = buyer?.thresholdUsd ?: 0.0
        val clears = stagedUsd >= threshold
        val cost = GeoUtils.roundCents(items.size * 0.99)
        val friction = if (clears) buyer?.frictionUsd ?: 0.0 else 0.0
        val net = GeoUtils.roundCents(stagedUsd - cost - friction)

        val payout = Payout(
            id = System.currentTimeMillis().toString(),
            at = System.currentTimeMillis(),
            isbn = items.joinToString(",") { it.isbn },
            title = "${items.size} books to ${buyer?.name ?: buyerId}",
            usd = if (clears) stagedUsd else 0.0,
            buyerId = buyerId,
            accepted = clears,
            stopId = state.activeStopId,
            miles = 0.0
        )

        val pastMemory = state.memory[state.activeStopId]
        val nextMemory = if (state.activeStopId.isNotBlank()) {
            state.memory + (state.activeStopId to BoxMemory(
                visits = (pastMemory?.visits ?: 0) + 1,
                reward = GeoUtils.roundCents((pastMemory?.reward ?: 0.0) + net),
                lastAt = System.currentTimeMillis()
            ))
        } else state.memory

        // Also trigger simulated training step for agent
        val nextAgent = QTrader.trainSimulated(state.qAgent, 20)

        _uiState.update { s ->
            val nextDesk = s.desk - buyerId
            s.copy(
                desk = nextDesk,
                packResult = BinPacker.packBins(nextDesk),
                payouts = listOf(payout) + s.payouts,
                memory = nextMemory,
                qAgent = nextAgent
            )
        }
    }

    fun trainAgent(episodes: Int) {
        if (_uiState.value.isTraining) return
        _uiState.update { it.copy(isTraining = true, trainingProgress = 0) }

        viewModelScope.launch {
            for (step in 1..10) {
                delay(80)
                _uiState.update { it.copy(trainingProgress = step * 10) }
            }
            val trained = QTrader.trainSimulated(_uiState.value.qAgent, episodes)
            _uiState.update {
                it.copy(
                    qAgent = trained,
                    isTraining = false,
                    trainingProgress = 100
                )
            }
        }
    }

    fun logPayout(isbn: String, title: String, usd: Double, buyerId: String, accepted: Boolean) {
        val state = _uiState.value
        val payout = Payout(
            id = System.currentTimeMillis().toString(),
            at = System.currentTimeMillis(),
            isbn = isbn,
            title = title.ifBlank { "Book $isbn" },
            usd = if (accepted) usd else 0.0,
            buyerId = buyerId,
            accepted = accepted,
            stopId = state.activeStopId,
            miles = 0.0
        )

        // Adjust calibration for that buyer
        val updatedCalibration = state.calibration.map { row ->
            if (row.buyerId == buyerId && accepted && usd > 0) {
                val newObs = row.observations + 1
                // Weighted blend toward observation
                val blended = GeoUtils.roundCents((row.adjustedRate * 10.0 + (usd / 40.0).coerceIn(0.2, 0.9)) / 11.0)
                row.copy(adjustedRate = blended, observations = newObs)
            } else row
        }

        val pastMemory = state.memory[state.activeStopId]
        val nextMemory = if (state.activeStopId.isNotBlank()) {
            state.memory + (state.activeStopId to BoxMemory(
                visits = (pastMemory?.visits ?: 0) + 1,
                reward = GeoUtils.roundCents((pastMemory?.reward ?: 0.0) + (if (accepted) usd else 0.0)),
                lastAt = System.currentTimeMillis()
            ))
        } else state.memory

        _uiState.update { s ->
            s.copy(
                payouts = listOf(payout) + s.payouts,
                calibration = updatedCalibration,
                memory = nextMemory
            )
        }
    }

    fun resetCalibration() {
        _uiState.update { s ->
            s.copy(
                calibration = BuyersData.allBuyers.map {
                    DeskCalibrationRow(it.id, it.name, it.payRate, it.payRate, 0)
                }
            )
        }
    }
}
