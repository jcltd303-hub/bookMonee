package com.example.spineroute.domain

import com.example.spineroute.data.model.BuyersData
import com.example.spineroute.data.model.PolicyRow
import com.example.spineroute.data.model.QAgent
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/**
 * On-device Q-learning trading agent.
 *
 * This replaces a stub: the previous version returned hardcoded weights, applied the same
 * decay to every weight regardless of which action was taken, and answered the policy table
 * from a fixed list of strings — so the Train screen was reporting numbers no training had
 * produced.
 *
 * It is a port of the web app's agent (`src/lib/agents/`), which is unit tested there. Three
 * actions over seven state features, trained against a simulated market because one real
 * shelf a day is far too little signal to learn from.
 *
 * The one rule worth stating: shipping is only legal once a bin has cleared its prepaid
 * label. Without that the agent finds a no-op ship is free, inherits the credit of the good
 * books that preceded it, and collapses to "ship" in every state — measured at 84,000
 * simulated shelves in the web app.
 */
object QTrader {
    const val ACTION_SKIP = 0
    const val ACTION_STAGE = 1
    const val ACTION_SHIP = 2
    const val ACTION_COUNT = 3
    const val FEATURE_COUNT = 7

    /** Bumped when the action semantics or features change, so old weights are discarded. */
    const val VERSION = 2

    private const val UNIT_COST = 0.99
    private const val FLUSH_PENALTY = 2.5
    private const val EMPTY_SHIP_PENALTY = 0.25
    private const val GAMMA = 0.9
    private const val ALPHA_START = 0.08
    private const val ALPHA_FLOOR = 0.02
    private const val EPS_START = 0.9
    private const val EPS_FLOOR = 0.03
    private const val STEPS_PER_EPISODE = 24

    private val LABELS = arrayOf("Skip", "Stage to the best desk", "Ship the ready bin")

    private class SimEnv(
        val bins: DoubleArray,
        val counts: IntArray,
        val thresholds: DoubleArray,
        val friction: DoubleArray,
    )

    private class SimBook(val offers: DoubleArray)

    /** An ignorant agent. Training is what makes it useful; nothing is pre-baked. */
    fun defaultAgent(): QAgent = QAgent(
        weights = List(ACTION_COUNT * FEATURE_COUNT) { 0.0 },
        episodes = 0,
        steps = 0,
        avgReward = 0.0,
        eps = EPS_START,
        version = VERSION,
    )

    /**
     * A warm start, so the policy table says something on first launch instead of four
     * identical rows from all-zero weights. Same 400 shelves the web app uses.
     */
    fun pretrained(episodes: Int = 400): QAgent = trainSimulated(defaultAgent(), episodes)

    /** Weights from an older action model are not reusable. */
    fun isCompatible(agent: QAgent): Boolean =
        agent.version == VERSION && agent.weights.size == ACTION_COUNT * FEATURE_COUNT

    /**
     * Staging a copy that cannot clear its own acquisition cost is a guaranteed loss, so it
     * is not offered — the same reasoning as shipping an uncleared bin. Without it the agent
     * learns "close the gap" as a general policy and stages worthless books: measured on the
     * bad-book probe, Q(stage) 48 against Q(skip) 18.
     */
    fun legalActions(hasReady: Boolean, canStage: Boolean = true): BooleanArray =
        booleanArrayOf(true, canStage, hasReady)

    private fun newEnv(): SimEnv {
        val buyers = BuyersData.allBuyers
        return SimEnv(
            bins = DoubleArray(buyers.size),
            counts = IntArray(buyers.size),
            thresholds = DoubleArray(buyers.size) { buyers[it].thresholdUsd },
            friction = DoubleArray(buyers.size) { buyers[it].frictionUsd },
        )
    }

    private fun drawBook(rnd: Random): SimBook {
        val buyers = BuyersData.allBuyers
        val fat = rnd.nextDouble() < 0.18
        val offers = DoubleArray(buyers.size) { i ->
            val base = if (fat) 6.0 + rnd.nextDouble() * 34.0 else rnd.nextDouble() * 4.5
            val tilt = if (rnd.nextDouble() < 0.5) buyers[i].textbookFit else buyers[i].tradeFit
            val value = base * (0.6 + 0.5 * tilt) * (0.7 + rnd.nextDouble() * 0.6)
            GeoUtils.roundCents(max(0.0, value))
        }
        return SimBook(offers)
    }

    private fun bestOffer(book: SimBook): Pair<Int, Double> {
        var index = 0
        for (i in 1 until book.offers.size) if (book.offers[i] > book.offers[index]) index = i
        return index to book.offers[index]
    }

    private fun shipTarget(env: SimEnv): Int {
        var cleared = -1
        var fullest = 0
        for (i in env.bins.indices) {
            if (env.bins[i] <= 0.0) continue
            if (env.bins[i] >= env.thresholds[i] && (cleared < 0 || env.bins[i] > env.bins[cleared])) cleared = i
            if (env.bins[i] > env.bins[fullest]) fullest = i
        }
        return if (cleared >= 0) cleared else fullest
    }

    private fun anyReady(env: SimEnv): Boolean =
        env.bins.indices.any { env.bins[it] > 0.0 && env.bins[it] >= env.thresholds[it] }

    private fun featuresOf(book: SimBook, env: SimEnv): DoubleArray {
        val (bestIndex, bestUsd) = bestOffer(book)
        var progress = 0.0
        var nearestGap = 0.0
        var nearestThreshold = 0.0
        for (i in env.bins.indices) {
            val limit = env.thresholds[i]
            val ratio = if (limit > 0) env.bins[i] / limit else if (env.bins[i] > 0) 1.5 else 0.0
            if (ratio > progress) {
                progress = ratio
                nearestGap = max(0.0, limit - env.bins[i])
                nearestThreshold = limit
            }
        }
        return doubleArrayOf(
            min(bestUsd / 25.0, 2.0),
            max(-0.5, min((bestUsd - UNIT_COST) / 10.0, 2.0)),
            min(progress, 1.5),
            min(env.counts[bestIndex] / 8.0, 1.0),
            min(env.bins.maxOrNull()?.coerceAtLeast(0.0)?.div(20.0) ?: 0.0, 1.0),
            if (nearestThreshold > 0) min(max(0.0, nearestGap - bestUsd) / nearestThreshold, 1.0) else 0.0,
            if (anyReady(env)) 1.0 else 0.0,
        )
    }

    private fun qValues(weights: List<Double>, x: DoubleArray): DoubleArray =
        DoubleArray(ACTION_COUNT) { a ->
            var sum = 0.0
            for (f in 0 until FEATURE_COUNT) sum += weights[a * FEATURE_COUNT + f] * x[f]
            sum
        }

    private fun greedy(weights: List<Double>, x: DoubleArray, allowed: BooleanArray): Int {
        val values = qValues(weights, x)
        var best = -1
        for (a in 0 until ACTION_COUNT) {
            if (!allowed[a]) continue
            if (best < 0 || values[a] > values[best]) best = a
        }
        return if (best < 0) ACTION_SKIP else best
    }

    private fun step(env: SimEnv, book: SimBook, action: Int): Double {
        if (action == ACTION_SKIP) return 0.0
        if (action == ACTION_STAGE) {
            val (index, offer) = bestOffer(book)
            if (offer <= 0.0) return 0.0
            env.bins[index] += offer
            env.counts[index] += 1
            return -UNIT_COST
        }
        val target = shipTarget(env)
        val staged = env.bins[target]
        if (staged <= 0.0) return -EMPTY_SHIP_PENALTY
        env.bins[target] = 0.0
        env.counts[target] = 0
        return if (staged >= env.thresholds[target]) staged - env.friction[target] else -FLUSH_PENALTY
    }

    /**
     * Train against a simulated market. Epsilon and alpha both decay with the episode count,
     * because a fixed learning rate lets the weights drift long after the policy is settled.
     */
    fun trainSimulated(agent: QAgent, additionalEpisodes: Int): QAgent {
        val base = if (isCompatible(agent)) agent else defaultAgent()
        val weights = base.weights.toMutableList()
        val rnd = Random(System.currentTimeMillis())
        var avg = base.avgReward
        var episodes = base.episodes

        for (episode in 0 until additionalEpisodes) {
            val env = newEnv()
            var book = drawBook(rnd)
            var x = featuresOf(book, env)
            var allowed = legalActions(anyReady(env), bestOffer(book).second > UNIT_COST)
            var total = 0.0
            val alpha = max(ALPHA_FLOOR, ALPHA_START * (1.0 / (1.0 + episodes / 3000.0)))
            val eps = max(EPS_FLOOR, EPS_START * kotlin.math.exp(-episodes / 900.0))

            repeat(STEPS_PER_EPISODE) {
                val action = if (rnd.nextDouble() < eps) {
                    val options = (0 until ACTION_COUNT).filter { allowed[it] }
                    options[rnd.nextInt(options.size)]
                } else {
                    greedy(weights, x, allowed)
                }
                val reward = step(env, book, action)
                total += reward
                book = drawBook(rnd)
                val nextX = featuresOf(book, env)
                val nextAllowed = legalActions(anyReady(env), bestOffer(book).second > UNIT_COST)

                val current = qValues(weights, x)[action]
                val nextValues = qValues(weights, nextX)
                var nextBest = Double.NEGATIVE_INFINITY
                for (a in 0 until ACTION_COUNT) {
                    if (!nextAllowed[a]) continue
                    if (nextValues[a] > nextBest) nextBest = nextValues[a]
                }
                if (!nextBest.isFinite()) nextBest = 0.0
                val target = reward + GAMMA * nextBest
                for (f in 0 until FEATURE_COUNT) {
                    weights[action * FEATURE_COUNT + f] += alpha * (target - current) * x[f]
                }
                x = nextX
                allowed = nextAllowed
            }
            episodes += 1
            avg = avg * 0.95 + total * 0.05
        }

        return QAgent(
            weights = weights,
            episodes = episodes,
            steps = base.steps + additionalEpisodes * STEPS_PER_EPISODE,
            avgReward = GeoUtils.roundCents(avg),
            eps = max(EPS_FLOOR, EPS_START * kotlin.math.exp(-episodes / 900.0)),
            version = VERSION,
        )
    }

    /**
     * What the policy actually prefers, read off the weights.
     *
     * The previous implementation returned a fixed list, so it looked the same whether the
     * agent had trained or not.
     */
    fun evaluatePolicy(agent: QAgent): List<PolicyRow> {
        val safe = if (isCompatible(agent)) agent else defaultAgent()
        // ready = a bin has cleared its label; stageable = the book clears its own 99c cost.
        data class Probe(val label: String, val x: DoubleArray, val ready: Boolean, val stageable: Boolean)
        val probes = listOf(
            Probe("Good book, bins empty", doubleArrayOf(0.6, 1.4, 0.0, 0.0, 0.0, 0.8, 0.0), false, true),
            Probe("Good book, label nearly clear", doubleArrayOf(0.5, 1.2, 0.85, 0.7, 0.6, 0.1, 0.0), false, true),
            Probe("Thin book, label already clear", doubleArrayOf(0.08, -0.2, 1.0, 0.8, 1.0, 0.0, 1.0), true, true),
            Probe("Bad book, bins empty", doubleArrayOf(0.02, -0.6, 0.0, 0.0, 0.0, 0.9, 0.0), false, false),
        )
        return probes.map { probe ->
            PolicyRow(
                label = probe.label,
                action = LABELS[greedy(safe.weights, probe.x, legalActions(probe.ready, probe.stageable))],
            )
        }
    }
}
