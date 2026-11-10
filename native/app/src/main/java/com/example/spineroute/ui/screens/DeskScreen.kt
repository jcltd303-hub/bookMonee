package com.example.spineroute.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.spineroute.data.model.Bin
import com.example.spineroute.domain.GeoUtils
import com.example.spineroute.ui.theme.AccentSage
import com.example.spineroute.ui.theme.BgDark
import com.example.spineroute.ui.theme.BorderDark
import com.example.spineroute.ui.theme.CardHighlight
import com.example.spineroute.ui.theme.FgDark
import com.example.spineroute.ui.theme.MutedDark
import com.example.spineroute.ui.theme.PrimaryAmber
import com.example.spineroute.ui.theme.PrimaryAmberFg
import com.example.spineroute.ui.theme.Surface2Dark
import com.example.spineroute.ui.theme.SurfaceDark
import com.example.spineroute.ui.viewmodel.UiState

@Composable
fun DeskScreen(
    state: UiState,
    onUnstage: (String, String) -> Unit,
    onShipBin: (String) -> Unit,
    onClearAll: () -> Unit
) {
    val pack = state.packResult
    val activeBins = pack.bins

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Summary Header Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Inventory2, contentDescription = null, tint = PrimaryAmber, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("The Desk & Packing Engine", style = MaterialTheme.typography.titleLarge, color = FgDark)
                    }

                    Text(
                        "Books are worth nothing until a prepaid label clears. The packer sorts scanned copies into the highest-bidding desks to solve for prepaid thresholds.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MutedDark
                    )

                    // 3-Column Metrics
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Surface2Dark)
                            .padding(vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceAround
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("GROSS STAGED", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text(GeoUtils.formatUsd(pack.grossUsd), style = MaterialTheme.typography.titleMedium, color = FgDark, fontWeight = FontWeight.Bold)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("NET PROFIT", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text(GeoUtils.formatUsd(pack.netUsd), style = MaterialTheme.typography.titleMedium, color = PrimaryAmber, fontWeight = FontWeight.Bold)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("ACTIVE BINS", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text("${activeBins.size}", style = MaterialTheme.typography.titleMedium, color = FgDark, fontWeight = FontWeight.Bold)
                        }
                    }

                    if (activeBins.isNotEmpty()) {
                        OutlinedButton(
                            onClick = onClearAll,
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth().height(42.dp)
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = null, tint = MutedDark, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Empty Every Bin", color = MutedDark, fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        // Hints & Threshold Alerts
        if (pack.hints.isNotEmpty()) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = CardHighlight),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, PrimaryAmber.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Lightbulb, contentDescription = null, tint = PrimaryAmber, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Packing Hints", style = MaterialTheme.typography.titleMedium, color = FgDark, fontSize = 14.sp)
                        }
                        pack.hints.forEach { hint ->
                            Text("• ${hint.text}", style = MaterialTheme.typography.bodyMedium, color = MutedDark, fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        // Bins List
        if (activeBins.isEmpty()) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(16.dp))
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.Inventory2, contentDescription = null, tint = MutedDark, modifier = Modifier.size(48.dp))
                        Text("No Books Staged Yet", style = MaterialTheme.typography.titleMedium, color = FgDark)
                        Text(
                            "Scan book spines on the Scan tab and tap 'Stage' on quote cards to start filling buyback bins.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MutedDark,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        } else {
            item {
                Text(
                    text = "Bins Waiting on a Label (${activeBins.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = FgDark
                )
            }

            items(activeBins) { bin ->
                BinCard(
                    bin = bin,
                    onUnstage = { isbn -> onUnstage(bin.buyerId, isbn) },
                    onShip = { onShipBin(bin.buyerId) }
                )
            }
        }

        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}

@Composable
fun BinCard(
    bin: Bin,
    onUnstage: (String) -> Unit,
    onShip: () -> Unit
) {
    val progress = if (bin.thresholdUsd > 0) {
        (bin.stagedUsd / bin.thresholdUsd).toFloat().coerceIn(0f, 1f)
    } else 1f

    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().border(1.dp, if (bin.clearsThreshold) AccentSage else BorderDark, RoundedCornerShape(14.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(bin.buyerName, style = MaterialTheme.typography.titleMedium, color = FgDark, fontWeight = FontWeight.Bold)
                    Text(
                        if (bin.thresholdUsd > 0) "Prepaid minimum: $${bin.thresholdUsd}" else "No minimum threshold",
                        fontSize = 11.sp,
                        color = MutedDark
                    )
                }

                Box(
                    modifier = Modifier
                        .background(if (bin.clearsThreshold) AccentSage else Color(0x33FFA726), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        if (bin.clearsThreshold) "LABEL CLEARED" else "NEED ${GeoUtils.formatUsd(bin.gapUsd)}",
                        fontWeight = FontWeight.Bold,
                        color = if (bin.clearsThreshold) BgDark else PrimaryAmber,
                        fontSize = 11.sp
                    )
                }
            }

            // Progress bar to threshold
            if (bin.thresholdUsd > 0) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                        color = if (bin.clearsThreshold) AccentSage else PrimaryAmber,
                        trackColor = Surface2Dark,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("${GeoUtils.formatUsd(bin.stagedUsd)} staged", fontSize = 11.sp, color = MutedDark)
                        Text("${(progress * 100).toInt()}% of threshold", fontSize = 11.sp, color = MutedDark)
                    }
                }
            }

            // Items in bin
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                bin.items.forEach { item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Surface2Dark)
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.title, style = MaterialTheme.typography.bodyMedium, color = FgDark, maxLines = 1)
                            Text(
                                "ISBN: ${item.isbn} · ${item.condition.label} · ${item.lane.label}",
                                fontSize = 10.sp,
                                color = MutedDark
                            )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(GeoUtils.formatUsd(item.offerUsd), fontWeight = FontWeight.Bold, color = PrimaryAmber, fontSize = 13.sp)
                            IconButton(onClick = { onUnstage(item.isbn) }, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Remove", tint = MutedDark, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }

            // Financial Breakdown & Ship Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Net Payout: ${GeoUtils.formatUsd(bin.netUsd)}", fontWeight = FontWeight.Bold, color = FgDark, fontSize = 13.sp)
                    Text("Acquisition: -$${GeoUtils.formatUsd(bin.costUsd)} · Friction: -$${GeoUtils.formatUsd(bin.frictionUsd)}", fontSize = 10.sp, color = MutedDark)
                }

                Button(
                    onClick = onShip,
                    enabled = bin.clearsThreshold,
                    colors = ButtonDefaults.buttonColors(containerColor = AccentSage, contentColor = BgDark),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.height(38.dp).testTag("ship_bin_${bin.buyerId}")
                ) {
                    Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Ship Bin", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
